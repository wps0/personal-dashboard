import {TOAST_MS, TOAST_WITH_UNDO_MS, UNDO_STEPS} from './config';
import {create} from 'zustand';
import type {AppData} from './model/types';
import {useStore} from './store';

interface Toast {
  id: number;
  message: string;
  action?: {label: string; run(): void};
  /** Its action undoes a change: on touch screens the undo bar offers that. */
  undo?: boolean;
}

interface ToastState {
  toasts: Toast[];
  push(t: Omit<Toast, 'id'>): void;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>()((set, get) => ({
  toasts: [],
  push: t => {
    const id = nextId++;
    // Keep the stack short: newest three.
    set({toasts: [...get().toasts.slice(-2), {...t, id}]});
    window.setTimeout(
      () => get().dismiss(id),
      t.action ? TOAST_WITH_UNDO_MS : TOAST_MS,
    );
  },
  dismiss: id => set({toasts: get().toasts.filter(t => t.id !== id)}),
}));

export function toast(message: string, action?: Toast['action']) {
  useToasts.getState().push({message, action});
}

/** One undoable step: the data just before and just after it. */
export interface Step {
  message: string;
  before: AppData;
  after: AppData;
}

const history: Step[] = [];

/**
 * The latest undoable step, quiet ones too, for the undo bar on touch screens
 * (components/undo_bar.tsx): there's no Ctrl+Z there. Null once it's undone
 * or dismissed.
 */
export const useLastStep = create<{step: Step | null}>()(() => ({step: null}));

export function dismissLastStep() {
  useLastStep.setState({step: null});
}

/** Undoes `step`, which must still be the latest one. */
export function undoStep(step: Step) {
  if (history[history.length - 1] !== step) {
    dismissLastStep();
    toast('Can’t undo: something changed since');
    return;
  }
  history.pop();
  restore(step);
}

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
  dismissLastStep();
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
export function withUndo(
  message: string,
  change: () => void,
  {quiet = false} = {},
) {
  const before = useStore.getState().data;
  change();
  const after = useStore.getState().data;
  if (before === after) return;
  const step = {message, before, after};
  history.push(step);
  if (history.length > UNDO_STEPS) history.shift();
  useLastStep.setState({step});
  if (quiet) return;
  useToasts.getState().push({
    message,
    undo: true,
    // The toast undoes its own step, which must still be the latest one.
    action: {label: 'Undo', run: () => undoStep(step)},
  });
}

/** For tests. */
export function clearHistory() {
  history.length = 0;
  dismissLastStep();
}
