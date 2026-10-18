export {DRIVE_SCOPE} from './auth';
import {GoogleApiError} from './errors';
import {googleFetch} from './request';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
/** Marks the app's files, so they're found even if renamed. */
const MARK_KEY = 'personalDashboard';
const FIELDS = 'id,version,modifiedTime';

/** A file the app keeps in Drive. */
interface FileKind {
  name: string;
  mimeType: string;
  /** The value of its marker. */
  mark: string;
  description?: string;
}

/** The sync file: the data as protobuf binary. */
const DATA: FileKind = {
  name: 'personal-dashboard.binpb',
  mimeType: 'application/octet-stream',
  mark: 'binpb',
};

/** The data as readable JSON, for the user. The app never reads it. */
const COPY: FileKind = {
  name: 'personal-dashboard.json',
  mimeType: 'application/json',
  mark: 'json-copy',
  description:
    'A read-only copy of your Personal Dashboard data, written by the app ' +
    'after every sync. The app never reads it: changes made here are lost.',
};

/** The sync file's identity and revision. `version` grows with every change. */
export interface DriveFile {
  id: string;
  version: string;
  modifiedTime: string;
}

async function json<T>(res: Promise<Response>) {
  return (await res).json() as Promise<T>;
}

/** The most recently changed sync file, or null if there is none yet. */
export async function findFile(): Promise<DriveFile | null> {
  return find(DATA);
}

/** The file's current revision, or null if it was deleted or trashed. */
export async function fileInfo(id: string): Promise<DriveFile | null> {
  try {
    const f = await json<DriveFile & {trashed?: boolean}>(
      googleFetch(
        'drive',
        `${API}/${encodeURIComponent(id)}?fields=${FIELDS},trashed`,
      ),
    );
    return f.trashed
      ? null
      : {id: f.id, version: f.version, modifiedTime: f.modifiedTime};
  } catch (e) {
    if (e instanceof GoogleApiError && e.kind === 'not-found') return null;
    throw e;
  }
}

export async function download(id: string): Promise<Uint8Array> {
  const res = await googleFetch(
    'drive',
    `${API}/${encodeURIComponent(id)}?alt=media`,
  );
  return new Uint8Array(await res.arrayBuffer());
}

/** Creates the sync file with this content. */
export async function createFile(
  content: Uint8Array<ArrayBuffer>,
): Promise<DriveFile> {
  return create(DATA, content);
}

/** Replaces the file's content; returns its new revision. */
export async function updateFile(
  id: string,
  content: Uint8Array<ArrayBuffer>,
): Promise<DriveFile> {
  return replace(DATA, id, content);
}

/** Writes the read-only copy of the data, making the file if needed. */
export async function writeCopy(text: string): Promise<void> {
  const copy = await find(COPY);
  if (copy) await replace(COPY, copy.id, text);
  else await create(COPY, text);
}

async function find(kind: FileKind): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    q: `appProperties has { key='${MARK_KEY}' and value='${kind.mark}' } and trashed = false`,
    spaces: 'drive',
    orderBy: 'modifiedTime desc',
    pageSize: '10',
    fields: `files(${FIELDS})`,
  });
  const {files} = await json<{files?: DriveFile[]}>(
    googleFetch('drive', `${API}?${params}`),
  );
  return files?.[0] ?? null;
}

async function create(
  kind: FileKind,
  content: Uint8Array<ArrayBuffer> | string,
): Promise<DriveFile> {
  const boundary = `pd-${crypto.randomUUID()}`;
  const metadata = {
    name: kind.name,
    mimeType: kind.mimeType,
    description: kind.description,
    appProperties: {[MARK_KEY]: kind.mark},
  };
  const body = new Blob([
    [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${kind.mimeType}`,
      '',
      '',
    ].join('\r\n'),
    content,
    `\r\n--${boundary}--\r\n`,
  ]);
  return json<DriveFile>(
    googleFetch('drive', `${UPLOAD}?uploadType=multipart&fields=${FIELDS}`, {
      method: 'POST',
      headers: {'Content-Type': `multipart/related; boundary=${boundary}`},
      body,
    }),
  );
}

async function replace(
  kind: FileKind,
  id: string,
  content: Uint8Array<ArrayBuffer> | string,
): Promise<DriveFile> {
  return json<DriveFile>(
    googleFetch(
      'drive',
      `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`,
      {
        method: 'PATCH',
        headers: {'Content-Type': kind.mimeType},
        body: content,
      },
    ),
  );
}
