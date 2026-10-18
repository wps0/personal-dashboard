import {del, get, set, setMany} from 'idb-keyval';
import type {AppData, UsosSettings, UsosSource} from '../model/types';
import {CAL_VIEWS, emptyData} from '../model/types';
import {migrateStatus} from '../model/selectors';
import {defaultRules, rulesFromLegacyHours} from '../model/capacity';
import type {SyncBase} from '../sync/sync';

/**
 * Persistence boundary. The data lives in IndexedDB on every device; Google
 * Drive sync (sync/) works on top of it, so the app works offline.
 */
interface Storage {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

const KEY = 'personal-dashboard/data';
const BASE_KEY = 'personal-dashboard/sync-base';

export class IndexedDbStorage implements Storage {
  async load(): Promise<AppData | null> {
    const raw = await get<unknown>(KEY);
    return raw == null ? null : parseAppData(raw);
  }

  async save(data: AppData): Promise<void> {
    await set(KEY, data);
  }

  /** What this device and Drive agreed on at the last sync. */
  async loadSyncBase(): Promise<SyncBase | null> {
    const raw = await get<SyncBase>(BASE_KEY);
    return raw ? {...raw, data: parseAppData(raw.data)} : null;
  }

  /**
   * Saves synced data with its base in one transaction. Saved apart, a crash
   * in between could make an old local copy look like a fresh edit, and the
   * next sync would upload it over newer data.
   */
  async saveSynced(data: AppData, base: SyncBase): Promise<void> {
    await setMany([
      [KEY, data],
      [BASE_KEY, base],
    ]);
  }

  async clearSyncBase(): Promise<void> {
    await del(BASE_KEY);
  }
}

/** Validates and normalizes data from storage or an imported file. Throws on garbage. */
export function parseAppData(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null)
    throw new Error('Not a dashboard data object');
  const r = raw as Partial<AppData>;
  if (r.version !== 1)
    throw new Error(`Unsupported data version: ${String(r.version)}`);
  for (const key of ['areas', 'projects', 'items', 'allocations'] as const) {
    if (!Array.isArray(r[key])) throw new Error(`Missing or invalid "${key}"`);
  }
  const base = emptyData();
  return {
    ...base,
    ...r,
    items: r.items!.map(i => ({
      ...i,
      // 'lecture' became 'class' (lectures, labs, tutorials, seminars).
      kind: (i.kind as string) === 'lecture' ? 'class' : i.kind,
      status: migrateStatus(i.status),
    })),
    events: Array.isArray(r.events) ? r.events : [],
    dayNotes: r.dayNotes ?? {},
    monthNotes: r.monthNotes ?? {},
    settings: parseSettings(r.settings),
  } as AppData;
}

function parseSettings(raw: unknown): AppData['settings'] {
  const s = (raw ?? {}) as Partial<AppData['settings']> & {capacity?: number[]};
  const capacityRules =
    Array.isArray(s.capacityRules) && s.capacityRules.length
      ? s.capacityRules
      : Array.isArray(s.capacity) && s.capacity.length === 7
        ? rulesFromLegacyHours(s.capacity) // before planning windows existed
        : defaultRules();
  const minutes = Number(s.defaultEventMinutes);
  const defaultEventMinutes =
    Number.isFinite(minutes) && minutes >= 15 && minutes <= 480
      ? Math.round(minutes / 15) * 15
      : 60;
  const defaultCalendarView = (CAL_VIEWS as readonly string[]).includes(
    s.defaultCalendarView as string,
  )
    ? s.defaultCalendarView!
    : 'week';
  return {
    capacityRules,
    dayCapacity: s.dayCapacity ?? {},
    defaultEventMinutes,
    defaultCalendarView,
    usos: parseUsos(s.usos),
  };
}

function parseUsos(raw: unknown): UsosSettings {
  const u = (raw ?? {}) as Partial<UsosSettings>;
  const src = u.source as Partial<UsosSource> | undefined;
  const source: UsosSource | undefined =
    src?.kind === 'google' && typeof src.calendarId === 'string'
      ? {kind: 'google', calendarId: src.calendarId}
      : src?.kind === 'ical' && typeof src.url === 'string'
        ? {kind: 'ical', url: src.url}
        : undefined;
  const handled = Array.isArray(u.handled)
    ? u.handled.filter((k): k is string => typeof k === 'string')
    : [];
  return {source, handled};
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}

/** Saves the data as a JSON file (the browser's download). */
export function downloadJson(data: AppData) {
  const blob = new Blob([exportJson(data)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
