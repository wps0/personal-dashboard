/**
 * @fileoverview One tab at a time. Every tab keeps the whole data in memory,
 * autosaves all of it and syncs from its own base, so a second tab would save
 * its stale copy over the first one's edits, and the next sync would upload
 * the difference as deletions.
 */

const LOCK = 'personal-dashboard';

/**
 * Takes the lock that lets this tab use the data, held until the page is
 * closed. False when another tab or window has it. Without Web Locks (very
 * old browsers), or if the request fails, the tab goes ahead.
 */
export function claimSingleTab(
  locks: LockManager | undefined = navigator.locks,
): Promise<boolean> {
  if (!locks) return Promise.resolve(true);
  return new Promise(resolve => {
    locks
      .request(LOCK, {ifAvailable: true}, lock => {
        resolve(lock !== null);
        // Never settles, so the lock is held for the page's lifetime.
        return lock && new Promise<never>(() => {});
      })
      .catch(() => resolve(true));
  });
}
