import {beforeEach, describe, expect, it, vi} from 'vitest';

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};
vi.stubGlobal('localStorage', storage);
vi.stubGlobal('sessionStorage', storage);
vi.stubGlobal('window', {addEventListener: () => {}, setTimeout: () => 0});

const {
  DRIVE_SCOPE,
  createFile,
  download,
  fileInfo,
  findFile,
  updateFile,
  writeCopy,
} = await import('./drive');
const {retryPolicy} = await import('./request');
retryPolicy.baseMs = 1;
const {SCOPES, useGoogle} = await import('./auth');

const ok = (body: unknown) => new Response(JSON.stringify(body), {status: 200});
const file = {id: 'f1', version: '7', modifiedTime: '2026-10-13T10:00:00Z'};

describe('Drive access', () => {
  it('is limited to the files the app creates', () => {
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
    // Requested only when sync is turned on, never with the calendar scopes.
    expect(SCOPES).not.toContain(DRIVE_SCOPE);
  });
});

describe('Drive client', () => {
  const fetchMock = vi.fn<typeof fetch>();
  const call = (i = 0) => {
    const [url, init] = fetchMock.mock.calls[i];
    return {url: String(url), init: init ?? {}};
  };
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    useGoogle.setState({
      status: 'signed-in',
      token: {value: 'tok', expiresAt: Date.now() + 3600_000},
    });
  });

  it('finds the newest sync file by its app property, skipping the trash', async () => {
    fetchMock.mockResolvedValueOnce(ok({files: [file]}));
    expect(await findFile()).toEqual(file);
    const q = new URL(call().url).searchParams.get('q');
    expect(q).toBe(
      "appProperties has { key='personalDashboard' and value='binpb' } and trashed = false",
    );
    expect(new URL(call().url).searchParams.get('orderBy')).toBe(
      'modifiedTime desc',
    );
    expect((call().init.headers as Record<string, string>).Authorization).toBe(
      'Bearer tok',
    );

    fetchMock.mockResolvedValueOnce(ok({files: []}));
    expect(await findFile()).toBeNull();
  });

  it('reads the revision, treating a deleted or trashed file as gone', async () => {
    fetchMock.mockResolvedValueOnce(ok({...file, trashed: false}));
    expect(await fileInfo('f1')).toEqual(file);
    fetchMock.mockResolvedValueOnce(ok({...file, trashed: true}));
    expect(await fileInfo('f1')).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{}', {status: 404}));
    expect(await fileInfo('f1')).toBeNull();
    fetchMock.mockResolvedValueOnce(new Response('{}', {status: 400}));
    await expect(fileInfo('f1')).rejects.toThrow(/Google Drive error 400/);
  });

  it('downloads the content', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([8, 1])));
    expect(await download('f1')).toEqual(new Uint8Array([8, 1]));
    expect(call().url).toMatch(/\/drive\/v3\/files\/f1\?alt=media$/);
  });

  it('creates the file with its marker in one multipart upload, never retried', async () => {
    fetchMock.mockResolvedValueOnce(ok(file));
    expect(await createFile(new Uint8Array([8, 1, 0xff]))).toEqual(file);
    const {url, init} = call();
    expect(url).toContain('/upload/drive/v3/files?uploadType=multipart');
    expect(init.method).toBe('POST');
    const raw = new Uint8Array(await (init.body as Blob).arrayBuffer());
    const body = new TextDecoder('latin1').decode(raw);
    expect(body).toContain('"appProperties":{"personalDashboard":"binpb"}');
    expect(body).toContain('"name":"personal-dashboard.binpb"');
    expect(body).toContain('Content-Type: application/octet-stream');
    // The bytes go in unchanged, between the part headers and the closing boundary.
    expect(body).toContain('\r\n\r\n\x08\x01\xff\r\n--');
    const boundary = (init.headers as Record<string, string>)[
      'Content-Type'
    ].split('boundary=')[1];
    expect(body.endsWith(`--${boundary}--\r\n`)).toBe(true);

    // A retried POST could create a second file.
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('', {status: 503}));
    await expect(createFile(new Uint8Array())).rejects.toThrow(
      /Google Drive is having/,
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('replaces the content, retrying server errors', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', {status: 503}))
      .mockResolvedValueOnce(ok({...file, version: '8'}));
    const bytes = new Uint8Array([8, 2]);
    expect((await updateFile('f1', bytes)).version).toBe('8');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const {url, init} = call(1);
    expect(url).toContain('/upload/drive/v3/files/f1?uploadType=media');
    expect([init.method, init.body]).toEqual(['PATCH', bytes]);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/octet-stream',
    );
  });

  it('writes the readable copy as its own file, kept apart from the sync file', async () => {
    fetchMock
      .mockResolvedValueOnce(ok({files: []}))
      .mockResolvedValueOnce(ok({...file, id: 'c1'}));
    await writeCopy('{"areas": []}\n');
    expect(new URL(call(0).url).searchParams.get('q')).toBe(
      "appProperties has { key='personalDashboard' and value='json-copy' } and trashed = false",
    );
    const body = await (call(1).init.body as Blob).text();
    expect(body).toContain('"name":"personal-dashboard.json"');
    expect(body).toContain('"description":"A read-only copy');
    expect(body).toContain('"appProperties":{"personalDashboard":"json-copy"}');
    expect(body).toContain(
      'Content-Type: application/json\r\n\r\n{"areas": []}\n',
    );

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(ok({files: [{...file, id: 'c1'}]}))
      .mockResolvedValueOnce(ok({...file, id: 'c1', version: '8'}));
    await writeCopy('{}\n');
    const {url, init} = call(1);
    expect(url).toContain('/upload/drive/v3/files/c1?uploadType=media');
    expect([init.method, init.body]).toEqual(['PATCH', '{}\n']);
    expect((init.headers as Record<string, string>)['Content-Type']).toBe(
      'application/json',
    );
  });
});
