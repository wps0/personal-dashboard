import { create } from 'zustand';
import type { AppData } from './model/types';
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

/** One undoable step: the data just before and just after it. */
interface Step {
  message: string;
  before: AppData;
  after: AppData;
}

const MAX_STEPS = 50;
const history: Step[] = [];

/**
 * Undoes the most recent step (Ctrl+Z). A step is only undone while the data is
 * exactly what it left behind, so undo can never drop a later edit. Undoing
 * several steps in a row works because each undo restores the previous step's
 * "after".
 */
export function undoLast(): boolean {
  const step = history.pop();
  if (!step) {
    toast('Nothing to undo');
    return false;
  }
  return restore(step);
}

function restore(step: Step): boolean {
  if (useStore.getState().data !== step.after) {
    history.length = 0; // older steps are stale too
    toast('Can’t undo: something changed since');
    return false;
  }
  useStore.getState().replaceAll(step.before);
  toast(`Undone: ${step.message}`);
  return true;
}

/**
 * Runs a change and makes it undoable, with Ctrl+Z or the toast's Undo button.
 * `quiet` records it without a toast, for frequent direct manipulation (drag,
 * resize, ticking off) where the result is already visible.
 */
export function withUndo(message: string, change: () => void, { quiet = false } = {}) {
  const before = useStore.getState().data;
  change();
  const after = useStore.getState().data;
  if (before === after) return;
  const step = { message, before, after };
  history.push(step);
  if (history.length > MAX_STEPS) history.shift();
  if (quiet) return;
  toast(message, {
    label: 'Undo',
    run: () => {
      // The toast undoes its own step, which must still be the latest one.
      if (history[history.length - 1] !== step) {
        toast('Can’t undo: something changed since');
        return;
      }
      history.pop();
      restore(step);
    },
  });
}

/** For tests. */
export function clearHistory() {
  history.length = 0;
}
