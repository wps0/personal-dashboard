/**
 * @fileoverview Autosave for any app in this repository: saves the data a
 * moment after each change, and at once when the tab is hidden or closed.
 */

export interface AutosaveOptions<T> {
  /** Calls `listener` after every change of the data. */
  subscribe(listener: () => void): void;
  /** The data now. */
  current(): T;
  save(data: T): Promise<void>;
  /** How long after a change to save, in ms. */
  delayMs: number;
  /**
   * A save failed (storage full, IndexedDB blocked); the data stays unsaved,
   * so the next change or flush tries again.
   */
  onError(e: unknown): void;
}

export function autosave<T>(options: AutosaveOptions<T>) {
  const {subscribe, current, save, delayMs, onError} = options;
  let timer: number | undefined;
  let dirty = false;
  const flush = async () => {
    window.clearTimeout(timer);
    timer = undefined;
    if (!dirty) return;
    dirty = false;
    try {
      await save(current());
    } catch (e) {
      dirty = true;
      onError(e);
    }
  };
  subscribe(() => {
    dirty = true;
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void flush(), delayMs);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void flush();
  });
  window.addEventListener('pagehide', () => void flush());
}
