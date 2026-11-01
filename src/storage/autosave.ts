import {AUTOSAVE_DELAY_MS} from '../config';
import {useStore} from '../store';
import {toast, useToasts} from '../toast';
import {downloadJson, type IndexedDbStorage} from './storage';

/**
 * Saves the data a moment after each change, and at once when the tab is
 * hidden or closed. A failed save (storage full, IndexedDB blocked) shows a
 * toast and leaves the data unsaved, so the next change or flush tries again.
 */
export function setUpAutosave(storage: Pick<IndexedDbStorage, 'save'>) {
  let timer: number | undefined;
  let dirty = false;
  const flush = async () => {
    window.clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    try {
      await storage.save(useStore.getState().data);
    } catch (e) {
      dirty = true;
      saveFailed(e);
    }
  };
  useStore.subscribe((s, prev) => {
    if (s.data === prev.data) return;
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}

function saveFailed(e: unknown) {
  const message = `Changes can’t be saved on this device; export the data to keep them. ${String((e as Error)?.message ?? e)}`;
  // Once at a time, while edits keep failing.
  if (useToasts.getState().toasts.some(t => t.message === message)) return;
  toast(message, {
    label: 'Export',
    run: () => downloadJson(useStore.getState().data),
  });
}
