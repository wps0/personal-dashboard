import type {DriveFile} from '../google/drive';
import {emptyData, type AppData} from '../model/types';
import {encode, toReadableJson} from '../storage/codec';
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
  /** All sync files; normally one. */
  listFiles(): Promise<DriveFile[]>;
  fileInfo(id: string): Promise<DriveFile | null>;
  /** Trashes a duplicate, noting the file it was merged into. Gone is fine. */
  trash(id: string, into: string): Promise<void>;
  /** The file a trashed duplicate was merged into, else null. */
  mergedInto(id: string): Promise<string | null>;
  download(id: string): Promise<Uint8Array>;
  createFile(content: Uint8Array<ArrayBuffer>): Promise<DriveFile>;
  updateFile(id: string, content: Uint8Array<ArrayBuffer>): Promise<DriveFile>;
  /** Writes the readable copy of the data (never read back). */
  writeCopy(text: string): Promise<void>;
}

/**
 * First sync on a device, or with a file it hasn't synced with before, when
 * its data differs from Drive's: use Drive's data (this device's is
 * replaced), or merge both.
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

/**
 * One sync of `local` with the Drive file:
 * - only this device changed since the last sync → upload;
 * - only Drive changed → take Drive's data;
 * - both → merge (see merge.ts) and upload the result.
 * First, more than one sync file is made into one (see dedupe).
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
  const files = (await drive.listFiles()).sort(older);
  const dup = await dedupe(files, drive);
  const res = await syncWith(local, base, dup?.file ?? files[0], drive, choice);
  if (dup?.conflicts.length && res.kind !== 'choose')
    res.conflicts = [...dup.conflicts, ...res.conflicts];
  return res;
}

/** The canonical file comes first: the oldest, then the lowest id. */
function older(a: DriveFile, b: DriveFile) {
  if (a.createdTime !== b.createdTime)
    return a.createdTime < b.createdTime ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/**
 * More than one sync file (two first syncs at once, a search lagging behind
 * a new file, a lost create response): merges them all into the canonical
 * one (files[0]), which every device picks alike, and trashes the others.
 * With no shared history this is the first sync's 'merge', so nothing is
 * lost. Skipped while any of them can't be read. Two devices doing it at
 * once upload the same merge to the same file.
 */
async function dedupe(
  files: DriveFile[],
  drive: Remote,
): Promise<{file: DriveFile; conflicts: Conflict[]} | null> {
  if (files.length < 2) return null;
  const contents: AppData[] = [];
  for (const f of files) {
    const bytes = await drive.download(f.id);
    try {
      contents.push(readStored(bytes));
    } catch {
      return null; // never touch what we can't read
    }
  }
  const [first, ...others] = contents;
  let data = first;
  const conflicts: Conflict[] = [];
  for (const other of others) {
    const m = mergeData(emptyData(), data, other);
    data = m.data;
    conflicts.push(...m.conflicts);
  }
  let file = files[0];
  if (!same(data, first)) {
    file = await drive.updateFile(file.id, encode(data));
    await writeCopy(data, drive);
  }
  for (const f of files.slice(1)) {
    // Changed since it was read: merged again next time.
    if ((await drive.fileInfo(f.id))?.version !== f.version) continue;
    await drive.trash(f.id, file.id);
  }
  return {file, conflicts};
}

async function syncWith(
  local: AppData,
  base: SyncBase | null,
  canonical: DriveFile | undefined,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult> {
  if (!base) {
    if (!canonical) return create(local, drive);
    return unrelated(local, canonical, drive, choice);
  }

  let info = await drive.fileInfo(base.fileId);
  if (!info && canonical) {
    if ((await drive.mergedInto(base.fileId)) === canonical.id) {
      // The base's file was a duplicate, merged into the canonical one (here
      // or on another device) as it was at least at the base's version. So
      // base.data is a common ancestor of this device's data and the
      // canonical file's, as if the base had been on it all along: the
      // three-way merge below keeps this device's edits (deletions too)
      // since the base. The version never matches, so it's read.
      base = {...base, fileId: canonical.id, version: ''};
    }
    // Else the file was deleted: another device may have made a new one.
    info = canonical;
  }
  if (!info) return create(local, drive);
  // A different file (another Google account's, or one a device made after
  // the deletion) has nothing in common with the base.
  if (info.id !== base.fileId) return unrelated(local, info, drive, choice);
  const localChanged = !same(local, base.data);
  const remoteChanged = info.version !== base.version;

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

/**
 * Syncs with a file that shares no history with this device's data: takes
 * it if the data is the same or there's nothing here yet, else asks.
 */
async function unrelated(
  local: AppData,
  file: DriveFile,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult> {
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
  await writeCopy(local, drive);
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
  await writeCopy(data, drive);
  return done(kind, data, at(file, data), conflicts);
}

/** Updates the readable copy for the user; the sync doesn't depend on it. */
async function writeCopy(data: AppData, drive: Remote): Promise<void> {
  try {
    await drive.writeCopy(toReadableJson(data));
  } catch {
    // The next upload writes it again.
  }
}

function at(file: DriveFile, data: AppData): SyncBase {
  return {
    fileId: file.id,
    version: file.version,
    data,
  };
}

function done(
  kind: Exclude<SyncResult['kind'], 'choose'>,
  data: AppData,
  base: SyncBase,
  conflicts: Conflict[] = [],
): SyncResult {
  return {kind, data, base, conflicts};
}
