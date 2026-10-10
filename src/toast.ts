import { create } from 'zustand';
import { useStore } from './store';

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run(): void };
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = nextId++;
    // Keep the stack short: newest three.
    set({ toasts: [...get().toasts.slice(-2), { ...t, id }] });
    window.setTimeout(() => get().dismiss(id), t.action ? 6000 : 3000);
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = (message: string, action?: Toast['action']) => useToasts.getState().push({ message, action });

/**
 * Runs a change and offers Undo, which restores the data from just before it.
 * Undo only applies while nothing else has changed, so it can never drop later edits.
 */
export function withUndo(message: string, change: () => void) {
  const before = useStore.getState().data;
  change();
  const after = useStore.getState().data;
  if (before === after) return;
  toast(message, {
    label: 'Undo',
    run: () => {
      if (useStore.getState().data !== after) {
        toast('Can’t undo: something changed since');
        return;
      }
      useStore.getState().replaceAll(before);
    },
  });
}
