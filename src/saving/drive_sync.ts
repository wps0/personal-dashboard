/**
 * @fileoverview One sync of an app's data with its file on Google Drive,
 * for any app in this repository: each passes its data model (how to
 * encode, read, merge and compare it) and its Drive operations.
 */

import type {DriveFile} from '../google/drive';
import type {SyncBase} from './local_store';
import type {Conflict} from './merge3';

/** How an app's data is stored, merged and compared, for its sync. */
export interface SyncModel<T> {
  encode(data: T): Uint8Array<ArrayBuffer>;
  /** Reads stored bytes; throws if they aren't data this version can read. */
  read(bytes: Uint8Array): T;
  /** The read-only copy for people. */
  readable(data: T): string;
  merge(base: T, local: T, remote: T): {data: T; conflicts: Conflict[]};
  same(a: T, b: T): boolean;
  /** Nothing worth keeping yet: a fresh install. */
  isBlank(data: T): boolean;
  empty(): T;
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

export type SyncResult<T> =
  | {
      kind: 'up-to-date' | 'pushed' | 'pulled' | 'merged' | 'created';
      /** This device's data after the sync. */
      data: T;
      base: SyncBase<T>;
      /** Values both sides changed differently (this device's was kept). */
      conflicts: Conflict[];
    }
  | {kind: 'choose'; file: DriveFile; remote: T};

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
export async function syncOnce<T>(
  m: SyncModel<T>,
  local: T,
  base: SyncBase<T> | null,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult<T>> {
  const files = (await drive.listFiles()).sort(older);
  const dup = await dedupe(m, files, drive);
  const res = await syncWith(
    m,
    local,
    base,
    dup?.file ?? files[0],
    drive,
    choice,
  );
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
async function dedupe<T>(
  m: SyncModel<T>,
  files: DriveFile[],
  drive: Remote,
): Promise<{file: DriveFile; conflicts: Conflict[]} | null> {
  if (files.length < 2) return null;
  const contents: T[] = [];
  for (const f of files) {
    const bytes = await drive.download(f.id);
    try {
      contents.push(m.read(bytes));
    } catch {
      return null; // never touch what we can't read
    }
  }
  const [first, ...others] = contents;
  let data = first;
  const conflicts: Conflict[] = [];
  for (const other of others) {
    const merged = m.merge(m.empty(), data, other);
    data = merged.data;
    conflicts.push(...merged.conflicts);
  }
  let file = files[0];
  if (!m.same(data, first)) {
    file = await drive.updateFile(file.id, m.encode(data));
    await writeCopy(m, data, drive);
  }
  for (const f of files.slice(1)) {
    // Changed since it was read: merged again next time.
    if ((await drive.fileInfo(f.id))?.version !== f.version) continue;
    await drive.trash(f.id, file.id);
  }
  return {file, conflicts};
}

async function syncWith<T>(
  m: SyncModel<T>,
  local: T,
  base: SyncBase<T> | null,
  canonical: DriveFile | undefined,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult<T>> {
  if (!base) {
    if (!canonical) return create(m, local, drive);
    return unrelated(m, local, canonical, drive, choice);
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
  if (!info) return create(m, local, drive);
  // A different file (another Google account's, or one a device made after
  // the deletion) has nothing in common with the base.
  if (info.id !== base.fileId) return unrelated(m, local, info, drive, choice);
  const localChanged = !m.same(local, base.data);
  const remoteChanged = info.version !== base.version;

  if (!remoteChanged) {
    if (!localChanged) return done('up-to-date', local, base);
    return push(m, 'pushed', local, info.id, drive);
  }
  // The version is read before the content, so the content is at least as
  // new; a newer one shows up as a change again next time, which is harmless.
  const remote = await read(m, drive, info.id);
  if (!localChanged) return done('pulled', remote, at(info, remote));
  const {data, conflicts} = m.merge(base.data, local, remote);
  if (m.same(data, remote)) return done('merged', data, at(info, remote));
  return push(m, 'merged', data, info.id, drive, conflicts);
}

/**
 * Syncs with a file that shares no history with this device's data: takes
 * it if the data is the same or there's nothing here yet, else asks.
 */
async function unrelated<T>(
  m: SyncModel<T>,
  local: T,
  file: DriveFile,
  drive: Remote,
  choice?: FirstSyncChoice,
): Promise<SyncResult<T>> {
  const remote = await read(m, drive, file.id);
  if (m.same(local, remote) || m.isBlank(local) || choice === 'drive')
    return done('pulled', remote, at(file, remote));
  if (!choice) return {kind: 'choose', file, remote};
  // Nothing in common to compare against: keep everything from both.
  const {data, conflicts} = m.merge(m.empty(), local, remote);
  return push(m, 'merged', data, file.id, drive, conflicts);
}

async function read<T>(m: SyncModel<T>, drive: Remote, id: string): Promise<T> {
  const bytes = await drive.download(id);
  try {
    return m.read(bytes);
  } catch (e) {
    // Never overwrite what we can't read (e.g. saved by a newer version of the app).
    throw new Error(
      `The data in Google Drive can’t be read, so sync is paused: ${(e as Error).message}`,
      {cause: e},
    );
  }
}

async function create<T>(
  m: SyncModel<T>,
  local: T,
  drive: Remote,
): Promise<SyncResult<T>> {
  const file = await drive.createFile(m.encode(local));
  await writeCopy(m, local, drive);
  return done('created', local, at(file, local));
}

async function push<T>(
  m: SyncModel<T>,
  kind: 'pushed' | 'merged',
  data: T,
  fileId: string,
  drive: Remote,
  conflicts: Conflict[] = [],
): Promise<SyncResult<T>> {
  const file = await drive.updateFile(fileId, m.encode(data));
  await writeCopy(m, data, drive);
  return done(kind, data, at(file, data), conflicts);
}

/** Updates the readable copy for the user; the sync doesn't depend on it. */
async function writeCopy<T>(
  m: SyncModel<T>,
  data: T,
  drive: Remote,
): Promise<void> {
  try {
    await drive.writeCopy(m.readable(data));
  } catch {
    // The next upload writes it again.
  }
}

function at<T>(file: DriveFile, data: T): SyncBase<T> {
  return {
    fileId: file.id,
    version: file.version,
    data,
  };
}

function done<T>(
  kind: Exclude<SyncResult<T>['kind'], 'choose'>,
  data: T,
  base: SyncBase<T>,
  conflicts: Conflict[] = [],
): SyncResult<T> {
  return {kind, data, base, conflicts};
}
