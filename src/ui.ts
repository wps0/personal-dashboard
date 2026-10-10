import { create } from 'zustand';
import { todayISO } from './model/dates';
import { fromMinutes } from './model/time';
import type { ISODate } from './model/types';
import { useStore } from './store';

/** An event being created: shown as a ghost block with a floating editor. */
export interface Draft {
  date: ISODate;
  start: string;
  end: string;
  allDay: boolean;
  title: string;
  notes: string;
}

const HIDDEN_KEY = 'personal-dashboard/hidden-calendars';

function loadHidden(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HIDDEN_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Transient UI state that is not part of the synced data. */
interface UiState {
  /** Item shown in the task overlay. */
  openItemId: string | null;
  /** Existing event whose floating editor is open. */
  openEventId: string | null;
  draft: Draft | null;
  /** Calendar layers switched off in the sidebar: 'events' or an area id. Per device. */
  hidden: string[];
  /** Keyboard dialogs: shortcut help, or go-to-date. */
  dialog: 'help' | 'goto' | null;
  setDialog(d: UiState['dialog']): void;
  openItem(id: string | null): void;
  openEvent(id: string | null): void;
  setDraft(d: Draft | null): void;
  patchDraft(p: Partial<Draft>): void;
  toggleHidden(key: string): void;
}

export const useUi = create<UiState>()((set, get) => ({
  openItemId: null,
  openEventId: null,
  draft: null,
  hidden: loadHidden(),
  dialog: null,
  setDialog: (dialog) => set({ dialog }),
  openItem: (id) => set({ openItemId: id, openEventId: null, draft: null }),
  openEvent: (id) => set({ openEventId: id, openItemId: null, draft: null }),
  setDraft: (draft) => set({ draft, openEventId: null, openItemId: null }),
  patchDraft: (p) => {
    const d = get().draft;
    if (d) set({ draft: { ...d, ...p } });
  },
  toggleHidden: (key) => {
    const hidden = get().hidden.includes(key) ? get().hidden.filter((k) => k !== key) : [...get().hidden, key];
    set({ hidden });
    try {
      localStorage.setItem(HIDDEN_KEY, JSON.stringify(hidden));
    } catch {
      // Not persisted; fine.
    }
  },
}));

/** A draft for `date` from `start` minutes; the end defaults to start + 1 h. */
export function draftAt(date: ISODate, start: number, end?: number, allDay = false): Draft {
  return { date, start: fromMinutes(start), end: fromMinutes(end ?? start + 60), allDay, title: '', notes: '' };
}

/** A draft starting at the next full hour (today by default), with the default event length. */
export function nextHourDraft(date: ISODate = todayISO()): Draft {
  const start = Math.min(new Date().getHours() + 1, 22) * 60;
  return draftAt(date, start, Math.min(start + useStore.getState().data.settings.defaultEventMinutes, 24 * 60 - 1));
}
