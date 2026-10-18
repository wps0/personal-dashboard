import type {DriveFile} from '../google/drive';
import {emptyData, type AppData} from '../model/types';
import {encode} from '../storage/codec';
import {readStored} from '../storage/storage';
import {mergeData, same, type Conflict} from './merge';

/** Where this device stands with Drive: the file, and its version and content at the last sync. */
export interface SyncBase {
  fileId: string;
  version: string;
  data: AppData;
}

/** The Drive operations a sync needs (google/drive.ts; a fake in tests). */
export interface Remote {
  findFile(): Promise<DriveFile | null>;
  fileInfo(id: string): Promise<DriveFile | null>;
  download(id: string): Promise<Uint8Array>;
  createFile(content: Uint8Array<ArrayBuffer>): Promise<DriveFile>;
  updateFile(id: string, content: Uint8Array<ArrayBuffer>): Promise<DriveFile>;
}

/**
 * First sync on a device whose data differs from what Drive already has:
 * use Drive's data (this device's is replaced), or merge both.
 */
export type FirstSyncChoice = 'drive' | 'merge';

export type SyncResult =
  | {
      kind: 'up-to-date' | 'pushed' | 'pulled' | 'merged' | 'created';
      /** This device's data after the sync. */
      data: AppData;
      base: SyncBase;
      /** Values both sides changed differently (this device's was kept). */
      conflicts: Conflict[];
    }
  | {kind: 'choose'; file: DriveFile; remote: AppData};

/** Nothing worth keeping yet: a fresh install (settings aside). */
const isBlank = (d: AppData) =>
  !d.areas.length &&
  !d.projects.length &&
  !d.items.length &&
  !d.events.length &&
  !Object.keys(d.dayNotes).length &&
  !Object.keys(d.monthNotes).length;

/**
 * One sync of `local` with the Drive file:
 * - only this device changed since the last sync → upload;
 * - only Drive changed → take Drive's data;
 * - both → merge (see merge.ts) and upload the result.
 *
 * Drive has no conditional writes, so a write from another device between
 * our version check and our upload (a fraction of a second) would be
 * overwritten; Drive's revision history keeps it.
 */
export async function syncOnce(
  local: AppData,
  base: SyncBase | null,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult> {
  if (!base) return firstSync(local, drive, choice);

  let info = await drive.fileInfo(base.fileId);
  if (!info) {
    // The file was deleted: another device may have made a new one.
    info = await drive.findFile();
    if (!info) return create(local, drive);
  }
  const localChanged = !same(local, base.data);
  const remoteChanged =
    info.id !== base.fileId || info.version !== base.version;

  if (!remoteChanged) {
    if (!localChanged) return done('up-to-date', local, base);
    return push('pushed', local, info.id, drive);
  }
  // The version is read before the content, so the content is at least as
  // new; a newer one shows up as a change again next time, which is harmless.
  const remote = await read(drive, info.id);
  if (!localChanged) return done('pulled', remote, at(info, remote));
  const {data, conflicts} = mergeData(base.data, local, remote);
  if (same(data, remote)) return done('merged', data, at(info, remote));
  return push('merged', data, info.id, drive, conflicts);
}

async function firstSync(
  local: AppData,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult> {
  const file = await drive.findFile();
  if (!file) return create(local, drive);
  const remote = await read(drive, file.id);
  if (same(local, remote) || isBlank(local) || choice === 'drive')
    return done('pulled', remote, at(file, remote));
  if (!choice) return {kind: 'choose', file, remote};
  // Nothing in common to compare against: keep everything from both.
  const {data, conflicts} = mergeData(emptyData(), local, remote);
  return push('merged', data, file.id, drive, conflicts);
}

async function read(drive: Remote, id: string): Promise<AppData> {
  const bytes = await drive.download(id);
  try {
    return readStored(bytes);
  } catch (e) {
    // Never overwrite what we can't read (e.g. saved by a newer version of the app).
    throw new Error(
      `The data in Google Drive can’t be read, so sync is paused: ${(e as Error).message}`,
    );
  }
}

async function create(local: AppData, drive: Remote): Promise<SyncResult> {
  const file = await drive.createFile(encode(local));
  return done('created', local, at(file, local));
}

async function push(
  kind: 'pushed' | 'merged',
  data: AppData,
  fileId: string,
  drive: Remote,
  conflicts: Conflict[] = [],
): Promise<SyncResult> {
  const file = await drive.updateFile(fileId, encode(data));
  return done(kind, data, at(file, data), conflicts);
}

const at = (file: DriveFile, data: AppData): SyncBase => ({
  fileId: file.id,
  version: file.version,
  data,
});

const done = (
  kind: Exclude<SyncResult['kind'], 'choose'>,
  data: AppData,
  base: SyncBase,
  conflicts: Conflict[] = [],
): SyncResult => ({kind, data, base, conflicts});
