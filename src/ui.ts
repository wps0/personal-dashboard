import { create } from 'zustand';
import type { ISODate } from './model/types';

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
