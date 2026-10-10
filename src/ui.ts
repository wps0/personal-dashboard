import { create } from 'zustand';
import type { CalendarEvent } from './model/types';

/** Transient UI state that is not persisted. */
interface UiState {
  /** Item shown in the task overlay. */
  openItemId: string | null;
  /** Event shown in the event overlay: an existing id, or a draft to create. */
  openEvent: { id: string } | { draft: Omit<CalendarEvent, 'id'> } | null;
  openItem(id: string | null): void;
  setOpenEvent(e: UiState['openEvent']): void;
}

export const useUi = create<UiState>()((set) => ({
  openItemId: null,
  openEvent: null,
  openItem: (id) => set({ openItemId: id, openEvent: null }),
  setOpenEvent: (openEvent) => set({ openEvent, openItemId: null }),
}));
