/**
 * @fileoverview The dashboard's Drive sync: the shared algorithm
 * (saving/drive_sync.ts) with the dashboard's data model.
 */

import {emptyData, type AppData} from '../model/types';
import {
  syncOnce as syncWith,
  type FirstSyncChoice,
  type Remote,
  type SyncModel,
  type SyncResult as Result,
} from '../saving/drive_sync';
import type {SyncBase as Base} from '../saving/local_store';
import {encode, toReadableJson} from '../storage/codec';
import {readStored} from '../storage/storage';
import {mergeData, same} from './merge';

export type {FirstSyncChoice, Remote};

/** Where this device stands with Drive: the file, and its version and content at the last sync. */
export type SyncBase = Base<AppData>;

export type SyncResult = Result<AppData>;

/**
 * Nothing worth keeping yet: a fresh install (settings aside). A cleared
 * note stays as '', which is nothing too.
 */
function isBlank(d: AppData) {
  return (
    !d.areas.length &&
    !d.projects.length &&
    !d.items.length &&
    !d.events.length &&
    !Object.values(d.dayNotes).some(Boolean) &&
    !Object.values(d.monthNotes).some(Boolean)
  );
}

const MODEL: SyncModel<AppData> = {
  encode,
  read: readStored,
  readable: toReadableJson,
  merge: mergeData,
  same,
  isBlank,
  empty: emptyData,
};

/** One sync of the dashboard's data with its Drive file (see saving/drive_sync.ts). */
export function syncOnce(
  local: AppData,
  base: SyncBase | null,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult> {
  return syncWith(MODEL, local, base, drive, choice);
}
