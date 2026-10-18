import {hasDriveAccess, useGoogle} from '../google/auth';
import * as drive from '../google/drive';
import {navigate} from '../router';
import type {IndexedDbStorage} from '../storage/storage';
import {useStore} from '../store';
import {toast} from '../toast';
import {useUi} from '../ui';
import {addConflicts, clearConflicts} from './pending';
import {SyncRunner, useSync} from './runner';
import type {FirstSyncChoice} from './sync';

/** Upload this long after the last edit. */
const AFTER_EDIT_MS = 3000;
/** While the tab is visible, look for changes from other devices this often. */
const POLL_MS = 2 * 60_000;
/** Coming back to the tab syncs, but not more often than this. */
const FOCUS_MIN_MS = 15_000;

let runner: SyncRunner | undefined;

/** Syncs now, or answers the first-sync question. */
export function syncNow(choice?: FirstSyncChoice) {
  return runner?.sync(choice);
}

/**
 * Drive sync while it's on (Settings → Google Drive sync): after edits, when
 * coming back to the tab or back online, and every few minutes. Without a
 * token with Drive access it waits for the next sign-in.
 */
export function setUpSync(storage: IndexedDbStorage) {
  const r = new SyncRunner({
    remote: drive,
    getData: () => useStore.getState().data,
    setData: d => useStore.getState().replaceAll(d),
    canSync: () => hasDriveAccess(useGoogle.getState().token),
    loadBase: () => storage.loadSyncBase(),
    saveSynced: (data, base) => storage.saveSynced(data, base),
    clearBase: () => storage.clearSyncBase(),
    onConflicts: conflicts => {
      addConflicts(conflicts);
      const n = conflicts.length;
      toast(
        `Synced with Google Drive. ${n === 1 ? 'One value was' : `${n} values were`} changed on another device too; this device’s ${n === 1 ? 'was' : 'were'} kept.`,
        {label: 'Review', run: () => useUi.getState().setDialog('conflicts')},
      );
    },
  });
  runner = r;
  const on = () => useGoogle.getState().driveSync;
  let lastSync = 0;
  const sync = () => {
    if (!on()) return;
    lastSync = Date.now();
    void r.sync();
  };

  let editTimer: number | undefined;
  useStore.subscribe((s, prev) => {
    if (s.data === prev.data) return;
    // The sync's own result isn't an edit.
    if (r.isOwnChange(s.data) || !on()) return;
    window.clearTimeout(editTimer);
    editTimer = window.setTimeout(sync, AFTER_EDIT_MS);
  });

  useSync.subscribe((s, prev) => {
    // Also asked by background syncs (e.g. after switching Google accounts).
    if (s.status.kind === 'choose' && prev.status.kind !== 'choose')
      toast('Sync is paused: Google Drive has different data.', {
        label: 'Choose',
        run: () => navigate({name: 'settings'}),
      });
  });

  useGoogle.subscribe((s, prev) => {
    if (s.driveSync !== prev.driveSync) {
      if (s.driveSync) sync();
      else {
        clearConflicts();
        void r.stop();
      }
    } else if (s.token !== prev.token && hasDriveAccess(s.token)) sync();
  });

  const onReturn = () => {
    if (
      document.visibilityState === 'visible' &&
      Date.now() - lastSync > FOCUS_MIN_MS
    )
      sync();
  };
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  window.addEventListener('online', sync);
  window.setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, POLL_MS);

  if (on()) sync();
  else useSync.setState({status: {kind: 'off'}});
}
