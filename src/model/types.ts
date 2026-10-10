/** ISO calendar date in local time, `YYYY-MM-DD`. */
export type ISODate = string;

export interface Area {
  id: string;
  name: string;
  color: string;
}

export type ProgressMode = 'checklist' | 'hours' | 'manual';

export interface LogEntry {
  id: string;
  /** Full ISO timestamp. */
  at: string;
  text: string;
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
}

export type ItemKind = 'lecture' | 'assignment' | 'exam' | 'task';

export const LECTURE_STATUSES = ['todo', 'watched', 'notes', 'revised'] as const;
export const GENERIC_STATUSES = ['todo', 'doing', 'done'] as const;
export type ItemStatus = (typeof LECTURE_STATUSES)[number] | (typeof GENERIC_STATUSES)[number];

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
  createdAt: string;
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
}

export interface Settings {
  /** Planning capacity in hours, indexed Mon=0 … Sun=6. */
  capacity: number[];
}

export interface AppData {
  version: 1;
  areas: Area[];
  projects: Project[];
  items: Item[];
  allocations: Allocation[];
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
    dayNotes: {},
    monthNotes: {},
    settings: { capacity: [2, 2, 2, 2, 2, 5, 5] },
  };
}
