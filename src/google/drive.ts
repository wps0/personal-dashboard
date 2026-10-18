export {DRIVE_SCOPE} from './auth';
import {GoogleApiError} from './errors';
import {googleFetch} from './request';

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
const FILE_NAME = 'personal-dashboard.binpb';
const MIME_TYPE = 'application/octet-stream';
/** Marks the sync file (protobuf binary), so it's found even if renamed. */
const MARK = {key: 'personalDashboard', value: 'binpb'};
const FIELDS = 'id,version,modifiedTime';

/** The sync file's identity and revision. `version` grows with every change. */
export interface DriveFile {
  id: string;
  version: string;
  modifiedTime: string;
}

const json = async <T>(res: Promise<Response>) =>
  (await res).json() as Promise<T>;

/** The most recently changed sync file, or null if there is none yet. */
export async function findFile(): Promise<DriveFile | null> {
  const params = new URLSearchParams({
    q: `appProperties has { key='${MARK.key}' and value='${MARK.value}' } and trashed = false`,
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
  const boundary = `pd-${crypto.randomUUID()}`;
  const metadata = {
    name: FILE_NAME,
    mimeType: MIME_TYPE,
    appProperties: {[MARK.key]: MARK.value},
  };
  const body = new Blob([
    [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      JSON.stringify(metadata),
      `--${boundary}`,
      `Content-Type: ${MIME_TYPE}`,
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

/** Replaces the file's content; returns its new revision. */
export async function updateFile(
  id: string,
  content: Uint8Array<ArrayBuffer>,
): Promise<DriveFile> {
  return json<DriveFile>(
    googleFetch(
      'drive',
      `${UPLOAD}/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`,
      {
        method: 'PATCH',
        headers: {'Content-Type': MIME_TYPE},
        body: content,
      },
    ),
  );
}
