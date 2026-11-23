/**
 * @fileoverview The climbing log's Drive sync, while it's on (Settings →
 * Data): after edits, when coming back to the tab or back online, and every
 * few minutes; the shared algorithm (saving/drive_sync.ts) with the log's
 * data and files. Unlike the dashboard, a first sync with different data on
 * Drive merges both: climbs have their own ids, so nothing is lost or
 * doubled.
 */

import {create} from 'zustand';
import {
  SYNC_AFTER_EDIT_MS,
  SYNC_ON_RETURN_MIN_MS,
  SYNC_POLL_MS,
} from '../config';
import {GoogleApiError} from '../google/errors';
import {syncOnce, type SyncModel} from '../saving/drive_sync';
import type {LocalStore, SyncBase} from '../saving/local_store';
import {climbDrive} from './drive';
import {hasToken, useDrive} from './google';
import type {ClimbData} from './model/data';
import {emptyData, isBlank, mergeClimbData, same} from './model/merge';
import {codec, readStored} from './storage';
import {setNotice, syncedData, useClimb} from './store';

const MODEL: SyncModel<ClimbData> = {
  encode: codec.encode,
  read: readStored,
  readable: codec.toReadableJson,
  merge: mergeClimbData,
  same,
  isBlank,
  empty: emptyData,
};

export type SyncStatus =
  'off' | 'idle' | 'syncing' | 'signed-out' | 'offline' | 'error';

export const useSyncStatus = create<{
  status: SyncStatus;
  error?: string;
  lastSynced?: number;
}>()(() => ({status: 'off'}));

let running: Promise<void> | null = null;
let again = false;
let base: SyncBase<ClimbData> | null | undefined;
/** The data the last sync put into the store, until the store changes. */
let applied: ClimbData | undefined;
let storage: LocalStore<ClimbData>;

async function once(): Promise<boolean> {
  if (!hasToken()) {
    useSyncStatus.setState({status: 'signed-out'});
    return false;
  }
  useSyncStatus.setState({status: 'syncing', error: undefined});
  try {
    base ??= await storage.loadSyncBase();
    const local = useClimb.getState().data;
    const res = await syncOnce(MODEL, local, base, climbDrive, 'merge');
    if (res.kind === 'choose') return false; // never with 'merge'
    // Edits made while the sync ran are merged in as this device's.
    const now = useClimb.getState().data;
    const late = now === local ? null : mergeClimbData(local, now, res.data);
    const data = late ? late.data : res.data;
    if (data !== now) {
      applied = data;
      syncedData(data);
    }
    await storage.saveSynced(data, res.base);
    base = res.base;
    if (data !== res.data) again = true;
    const n = res.conflicts.length + (late?.conflicts.length ?? 0);
    if (n)
      setNotice(
        `Synced with Google Drive. ${n === 1 ? 'One value was' : `${n} values were`} changed on another device too; this device’s ${n === 1 ? 'was' : 'were'} kept.`,
      );
    useSyncStatus.setState({status: 'idle', lastSynced: Date.now()});
    return true;
  } catch (e) {
    if (e instanceof GoogleApiError && e.kind === 'expired')
      useSyncStatus.setState({status: 'signed-out'});
    else if (e instanceof GoogleApiError && e.kind === 'offline')
      useSyncStatus.setState({status: 'offline'});
    else
      useSyncStatus.setState({
        status: 'error',
        error: String((e as Error).message ?? e),
      });
    return false;
  }
}

/** Syncs now; a sync asked for while one runs runs again right after it. */
export function syncNow(): Promise<void> {
  if (!useDrive.getState().on) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      if (!(await once())) return;
    } while (again);
  })().finally(() => (running = null));
  return running;
}

/** Turns sync off on this device; turning it on again starts afresh with Drive. */
async function stop() {
  await running;
  base = null;
  await storage.clearSyncBase();
  useSyncStatus.setState({
    status: 'off',
    lastSynced: undefined,
    error: undefined,
  });
}

export function setUpClimbSync(store: LocalStore<ClimbData>) {
  storage = store;
  let lastSync = 0;
  const sync = () => {
    if (!useDrive.getState().on) return;
    lastSync = Date.now();
    void syncNow();
  };
  let editTimer: number | undefined;
  useClimb.subscribe((s, prev) => {
    if (s.data === prev.data) return;
    // The sync's own result isn't an edit.
    const own = s.data === applied;
    applied = undefined;
    if (own || !useDrive.getState().on) return;
    window.clearTimeout(editTimer);
    editTimer = window.setTimeout(sync, SYNC_AFTER_EDIT_MS);
  });
  useDrive.subscribe((s, prev) => {
    if (s.on !== prev.on) {
      if (s.on) sync();
      else void stop();
    } else if (s.token !== prev.token && s.token) sync();
  });
  const onReturn = () => {
    if (
      document.visibilityState === 'visible' &&
      Date.now() - lastSync > SYNC_ON_RETURN_MIN_MS
    )
      sync();
  };
  document.addEventListener('visibilitychange', onReturn);
  window.addEventListener('focus', onReturn);
  window.addEventListener('online', sync);
  window.setInterval(() => {
    if (document.visibilityState === 'visible') sync();
  }, SYNC_POLL_MS);
  if (useDrive.getState().on) sync();
}
