import {create} from 'zustand';
import {todayISO} from './model/dates';
import {fromMinutes} from './model/time';
import {EventColor, type ISODate} from './model/types';
import {useStore} from './store';

/**
 * An event being created, a task's time block ('task' mode) or reserved
 * time for that day ('reserved' mode, labelled by `title`): shown as a ghost
 * block with a floating editor.
 */
export interface Draft {
  mode: 'event' | 'task' | 'reserved';
  date: ISODate;
  start: string;
  end: string;
  allDay: boolean;
  title: string;
  notes: string;
  color: EventColor;
  /** The task to plan, in 'task' mode. */
  itemId?: string;
}

const HIDDEN_KEY = 'personal-dashboard/hidden-calendars';
const ALL_DAY_KEY = 'personal-dashboard/all-day-collapsed';
const GROUPS_KEY = 'personal-dashboard/collapsed-groups';
const DESCRIPTION_KEY = 'personal-dashboard/description-collapsed';

function loadList(key: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '[]');
  } catch {
    return [];
  }
}

function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not persisted; fine.
  }
}

/** Transient UI state that is not part of the synced data. */
interface UiState {
  /** Item shown in the task overlay. */
  openItemId: string | null;
  /** Existing event whose floating editor is open. */
  openEventId: string | null;
  /** Google event (piece key) whose read-only card is open. */
  openGoogleKey: string | null;
  draft: Draft | null;
  /** Calendar layers switched off in the sidebar: 'events' or an area id. Per device. */
  hidden: string[];
  /** The calendar's all-day row shows only a couple of items per day. Per device. */
  allDayCollapsed: boolean;
  /** The project description above the items is collapsed (narrow panels). Per device. */
  descriptionCollapsed: boolean;
  /** Dialogs: shortcut help, go-to-date, reviewing new USOS classes, importing a curriculum, or reviewing sync conflicts. */
  dialog: 'help' | 'goto' | 'usos' | 'curriculum' | 'conflicts' | null;
  setDialog(d: UiState['dialog']): void;
  /** The project whose USOS classes are under review; all projects if null. */
  usosProjectId: string | null;
  reviewUsos(projectId?: string): void;
  /** The project a curriculum is being imported into. */
  curriculumProjectId: string | null;
  importCurriculum(projectId: string): void;
  openItem(id: string | null): void;
  openEvent(id: string | null): void;
  openGoogle(key: string | null): void;
  setDraft(d: Draft | null): void;
  patchDraft(p: Partial<Draft>): void;
  toggleHidden(key: string): void;
  setAllDayCollapsed(collapsed: boolean): void;
  setDescriptionCollapsed(collapsed: boolean): void;
}

export const useUi = create<UiState>()((set, get) => ({
  openItemId: null,
  openEventId: null,
  openGoogleKey: null,
  draft: null,
  hidden: loadList(HIDDEN_KEY),
  descriptionCollapsed: (() => {
    try {
      return localStorage.getItem(DESCRIPTION_KEY) === 'true';
    } catch {
      return false;
    }
  })(),
  allDayCollapsed: (() => {
    try {
      return localStorage.getItem(ALL_DAY_KEY) === 'true';
    } catch {
      return false;
    }
  })(),
  dialog: null,
  setDialog: dialog => set({dialog}),
  usosProjectId: null,
  reviewUsos: projectId =>
    set({dialog: 'usos', usosProjectId: projectId ?? null}),
  curriculumProjectId: null,
  importCurriculum: projectId =>
    set({dialog: 'curriculum', curriculumProjectId: projectId}),
  openItem: id =>
    set({openItemId: id, openEventId: null, openGoogleKey: null, draft: null}),
  openEvent: id =>
    set({openEventId: id, openItemId: null, openGoogleKey: null, draft: null}),
  openGoogle: key =>
    set({openGoogleKey: key, openEventId: null, openItemId: null, draft: null}),
  setDraft: draft =>
    set({draft, openEventId: null, openItemId: null, openGoogleKey: null}),
  patchDraft: p => {
    const d = get().draft;
    if (d) set({draft: {...d, ...p}});
  },
  toggleHidden: key => {
    const hidden = get().hidden.includes(key)
      ? get().hidden.filter(k => k !== key)
      : [...get().hidden, key];
    set({hidden});
    save(HIDDEN_KEY, hidden);
  },
  setAllDayCollapsed: allDayCollapsed => {
    set({allDayCollapsed});
    save(ALL_DAY_KEY, allDayCollapsed);
  },
  setDescriptionCollapsed: descriptionCollapsed => {
    set({descriptionCollapsed});
    save(DESCRIPTION_KEY, descriptionCollapsed);
  },
}));

/** A draft for `date` from `start` minutes; the end defaults to start + 1 h. */
export function draftAt(
  date: ISODate,
  start: number,
  end?: number,
  allDay = false,
): Draft {
  return {
    mode: 'event',
    date,
    start: fromMinutes(start),
    end: fromMinutes(end ?? start + 60),
    allDay,
    title: '',
    notes: '',
    color: EventColor.UNSPECIFIED,
  };
}

/** A draft starting at the next full hour (today by default), with the default event length. */
export function nextHourDraft(date: ISODate = todayISO()): Draft {
  const start = Math.min(new Date().getHours() + 1, 22) * 60;
  return draftAt(
    date,
    start,
    Math.min(
      start + useStore.getState().data.settings.defaultEventMinutes,
      24 * 60 - 1,
    ),
  );
}

/**
 * Folded groups used to be kept per device, by group id (and
 * `<project id>:none` for "No group"). They're in the data now, so they sync:
 * this moves them there once.
 */
export function adoptFoldedGroups() {
  const keys = new Set(loadList(GROUPS_KEY));
  if (!keys.size) return;
  const {data, setGroupCollapsed} = useStore.getState();
  for (const p of data.projects) {
    if (keys.has(`${p.id}:none`)) setGroupCollapsed(p.id, null, true);
    for (const g of p.groups)
      if (keys.has(g.id)) setGroupCollapsed(p.id, g.id, true);
  }
  try {
    localStorage.removeItem(GROUPS_KEY);
  } catch {
    // Tried again next time.
  }
}
