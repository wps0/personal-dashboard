import {defaultRules, type CapacityRule, type DayCapacity} from './capacity';

/** ISO calendar date in local time, `YYYY-MM-DD`. */
export type ISODate = string;

export interface Area {
  id: string;
  name: string;
  color: string;
}

export const CAL_VIEWS = ['day', '3day', 'week', 'month'] as const;
export type CalView = (typeof CAL_VIEWS)[number];

export type ProgressMode = 'checklist' | 'hours' | 'manual';

export interface LogEntry {
  id: string;
  /** Full ISO timestamp. */
  at: string;
  text: string;
  editedAt?: string;
}

export interface Project {
  id: string;
  areaId: string;
  name: string;
  progressMode: ProgressMode;
  /** 0–100, used when progressMode is 'manual'. */
  manualProgress: number;
  dueDate?: ISODate;
  /** Markdown: goals, links, decisions. */
  overviewDoc: string;
  log: LogEntry[];
  archived: boolean;
  createdAt: string;
  /**
   * For a university course: a regular expression (case-insensitive) on the
   * course title of USOS classes, e.g. "systemów operacyjnych". Matching
   * classes are offered as tasks of this project (SPEC 4.2).
   */
  coursePattern?: string;
}

/** 'class': a class meeting to attend or catch up on (lecture, lab, tutorial, seminar). */
export type ItemKind = 'class' | 'assignment' | 'exam' | 'task';

export const STATUSES = ['todo', 'doing', 'done'] as const;
export type ItemStatus = (typeof STATUSES)[number];

export interface Item {
  id: string;
  projectId: string;
  kind: ItemKind;
  title: string;
  status: ItemStatus;
  dueDate?: ISODate;
  /** When the class took place (lectures); not a deadline. */
  heldOn?: ISODate;
  estimateHours?: number;
  /** Markdown notes: details, links, where you stopped. */
  notes?: string;
  createdAt: string;
  /** The USOS class meeting this task was imported from. */
  source?: {kind: 'usos'; key: string};
}

/** A slice of an item planned on a given day. One item may have many. */
export interface Allocation {
  id: string;
  itemId: string;
  date: ISODate;
  plannedHours: number;
  done: boolean;
  /** Hours actually spent; set to plannedHours when checked off, editable. */
  actualHours?: number;
  /** Optional start time `HH:MM`; makes the slice a time block on the calendar. */
  start?: string;
}

/**
 * A calendar event. Local-only in v1; shaped so v2 can sync it with Google Calendar.
 */
export interface CalendarEvent {
  id: string;
  title: string;
  date: ISODate;
  /** All-day events show in the all-day row; start/end are kept but ignored. */
  allDay?: boolean;
  /** `HH:MM`, local time. */
  start: string;
  end: string;
  notes?: string;
}

/** Where the USOS timetable comes from. */
export type UsosSource =
  {kind: 'google'; calendarId: string} | {kind: 'ical'; url: string};

export interface UsosSettings {
  source?: UsosSource;
  /** Class meetings already imported or skipped (keys); never offered again. */
  handled: string[];
}

export interface Settings {
  /** Planning windows and global adjustment, versioned by effective date. */
  capacityRules: CapacityRule[];
  /** Per-day capacity tweaks. */
  dayCapacity: Record<ISODate, DayCapacity>;
  /** Length of an event created by clicking the calendar. */
  defaultEventMinutes: number;
  /** View the calendar opens in when you navigate to it. */
  defaultCalendarView: CalView;
  usos: UsosSettings;
}

export interface AppData {
  version: 1;
  areas: Area[];
  projects: Project[];
  items: Item[];
  allocations: Allocation[];
  events: CalendarEvent[];
  /** Freeform text per day. */
  dayNotes: Record<ISODate, string>;
  /** Freeform text per month, keyed `YYYY-MM`. */
  monthNotes: Record<string, string>;
  settings: Settings;
}

export const AREA_COLORS = [
  '#60a5fa', // blue
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#94a3b8', // slate
];

export function emptyData(): AppData {
  return {
    version: 1,
    areas: [],
    projects: [],
    items: [],
    allocations: [],
    events: [],
    dayNotes: {},
    monthNotes: {},
    settings: {
      capacityRules: defaultRules(),
      dayCapacity: {},
      defaultEventMinutes: 60,
      defaultCalendarView: 'week',
      usos: {handled: []},
    },
  };
}
