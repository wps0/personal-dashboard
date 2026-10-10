import { get, set } from 'idb-keyval';
import type { AppData } from '../model/types';
import { emptyData } from '../model/types';
import { migrateStatus } from '../model/selectors';
import { defaultRules, rulesFromLegacyHours } from '../model/capacity';

/**
 * Persistence boundary. v1 keeps data in IndexedDB; v2 adds a Google Drive
 * implementation behind the same interface.
 */
export interface Storage {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

const KEY = 'personal-dashboard/data';

export class IndexedDbStorage implements Storage {
  async load(): Promise<AppData | null> {
    const raw = await get<unknown>(KEY);
    return raw == null ? null : parseAppData(raw);
  }

  async save(data: AppData): Promise<void> {
    await set(KEY, data);
  }
}

/** Validates and normalizes data from storage or an imported file. Throws on garbage. */
export function parseAppData(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null) throw new Error('Not a dashboard data object');
  const r = raw as Partial<AppData>;
  if (r.version !== 1) throw new Error(`Unsupported data version: ${String(r.version)}`);
  for (const key of ['areas', 'projects', 'items', 'allocations'] as const) {
    if (!Array.isArray(r[key])) throw new Error(`Missing or invalid "${key}"`);
  }
  const base = emptyData();
  return {
    ...base,
    ...r,
    items: r.items!.map((i) => ({ ...i, status: migrateStatus(i.status) })),
    events: Array.isArray(r.events) ? r.events : [],
    dayNotes: r.dayNotes ?? {},
    monthNotes: r.monthNotes ?? {},
    settings: parseSettings(r.settings),
  } as AppData;
}

function parseSettings(raw: unknown): AppData['settings'] {
  const s = (raw ?? {}) as Partial<AppData['settings']> & { capacity?: number[] };
  const capacityRules = Array.isArray(s.capacityRules) && s.capacityRules.length
    ? s.capacityRules
    : Array.isArray(s.capacity) && s.capacity.length === 7
      ? rulesFromLegacyHours(s.capacity) // before planning windows existed
      : defaultRules();
  return { capacityRules, dayCapacity: s.dayCapacity ?? {} };
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
}
