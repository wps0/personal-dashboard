/**
 * @fileoverview Reads data in the first stored format (plain JSON,
 * `version: 1`): validates it, fills in missing sections and migrates old
 * values.
 */

import {defaultRules, rulesFromLegacyHours} from '../model/capacity';
import {migrateStatus} from '../model/selectors';
import type {AppData, UsosSettings, UsosSource} from '../model/types';
import {CAL_VIEWS, emptyData} from '../model/types';

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
