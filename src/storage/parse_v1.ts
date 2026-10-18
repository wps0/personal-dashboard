/**
 * @fileoverview Reads data in the first stored format (plain JSON,
 * `version: 1`): validates it, fills in missing sections and migrates old
 * values.
 */

import {defaultRules, rulesFromLegacyHours} from '../model/capacity';
import {
  CalendarView,
  ItemKind,
  ItemStatus,
  ProgressMode,
  emptyData,
  type AppData,
  type UsosSettings,
  type UsosSource,
} from '../model/types';

const ITEM_KINDS: Record<string, ItemKind> = {
  // 'lecture' became 'class' (lectures, labs, tutorials, seminars).
  lecture: ItemKind.CLASS,
  class: ItemKind.CLASS,
  assignment: ItemKind.ASSIGNMENT,
  exam: ItemKind.EXAM,
  task: ItemKind.TASK,
};

const ITEM_STATUSES: Record<string, ItemStatus> = {
  todo: ItemStatus.TODO,
  doing: ItemStatus.DOING,
  done: ItemStatus.DONE,
  // Older lecture stages.
  watched: ItemStatus.DOING,
  notes: ItemStatus.DONE,
  revised: ItemStatus.DONE,
};

const PROGRESS_MODES: Record<string, ProgressMode> = {
  checklist: ProgressMode.CHECKLIST,
  hours: ProgressMode.HOURS,
  manual: ProgressMode.MANUAL,
};

const CALENDAR_VIEWS: Record<string, CalendarView> = {
  day: CalendarView.DAY,
  '3day': CalendarView.THREE_DAY,
  week: CalendarView.WEEK,
  month: CalendarView.MONTH,
};

/** v1 JSON as stored: the enums are strings. */
interface StoredV1 {
  version?: unknown;
  items?: Array<{kind?: string; status?: string}>;
  projects?: Array<{progressMode?: string}>;
  settings?: unknown;
}

/** Validates and normalizes data from storage or an imported file. Throws on garbage. */
export function parseAppData(raw: unknown): AppData {
  if (typeof raw !== 'object' || raw === null)
    throw new Error('Not a dashboard data object');
  const r = raw as StoredV1 & Partial<Omit<AppData, keyof StoredV1>>;
  if (r.version !== 1)
    throw new Error(`Unsupported data version: ${String(r.version)}`);
  for (const key of ['areas', 'projects', 'items', 'allocations'] as const) {
    if (!Array.isArray(r[key])) throw new Error(`Missing or invalid "${key}"`);
  }
  const base = emptyData();
  return {
    ...base,
    ...r,
    projects: r.projects!.map(p => ({
      ...p,
      progressMode:
        PROGRESS_MODES[p.progressMode ?? ''] ?? ProgressMode.CHECKLIST,
    })),
    items: r.items!.map(i => ({
      ...i,
      kind: ITEM_KINDS[i.kind ?? ''] ?? ItemKind.TASK,
      status: ITEM_STATUSES[i.status ?? ''] ?? ItemStatus.TODO,
    })),
    events: Array.isArray(r.events) ? r.events : [],
    dayNotes: r.dayNotes ?? {},
    monthNotes: r.monthNotes ?? {},
    settings: parseSettings(r.settings),
  } as AppData;
}

function parseSettings(raw: unknown): AppData['settings'] {
  const s = (raw ?? {}) as Partial<
    Omit<AppData['settings'], 'defaultCalendarView'>
  > & {capacity?: number[]; defaultCalendarView?: string};
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
  const defaultCalendarView =
    CALENDAR_VIEWS[String(s.defaultCalendarView)] ?? CalendarView.WEEK;
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
