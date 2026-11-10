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

const {fetchTasks, taskFromApi} = await import('./tasks');
const {useGoogle} = await import('./auth');

const list = {id: 'L1', title: 'My Tasks'};

describe('taskFromApi', () => {
  it('keeps the due date as Google has it, not shifted to local time', () => {
    // Tests run in Europe/Warsaw: as a local time this would still be the 12th,
    // but in a zone west of UTC it would be the 11th.
    expect(
      taskFromApi(
        {
          id: 't1',
          title: ' Return books ',
          due: '2026-11-12T00:00:00.000Z',
          status: 'needsAction',
          notes: 'Library, floor 2',
          webViewLink: 'https://tasks.google.com/task/t1',
        },
        list,
      ),
    ).toEqual({
      key: 'L1/t1',
      title: 'Return books',
      notes: 'Library, floor 2',
      done: false,
      due: '2026-11-12',
      listTitle: 'My Tasks',
      link: 'https://tasks.google.com/task/t1',
    });
  });

  it('marks done tasks, names untitled ones, and skips the undated and deleted', () => {
    expect(
      taskFromApi(
        {id: 'a', due: '2026-11-12T00:00:00Z', status: 'completed'},
        list,
      ),
    ).toMatchObject({done: true, title: '(no title)'});
    expect(taskFromApi({id: 'b', title: 'Someday'}, list)).toBeNull();
    expect(
      taskFromApi({id: 'c', due: '2026-11-12T00:00:00Z', deleted: true}, list),
    ).toBeNull();
  });
});

describe('fetchTasks', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const ok = (body: unknown) =>
    new Response(JSON.stringify(body), {status: 200});
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    useGoogle.setState({
      status: 'signed-in',
      token: {value: 'tok', expiresAt: Date.now() + 3600_000},
    });
  });

  it('reads every list’s tasks in the range, GET only, following pages', async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const u = new URL(url);
      if (u.pathname.endsWith('/users/@me/lists'))
        return ok({items: [list, {id: 'L2', title: 'Uni'}]});
      if (u.pathname.includes('/lists/L1/') && !u.searchParams.get('pageToken'))
        return ok({
          items: [{id: 'a', title: 'A', due: '2026-11-10T00:00:00.000Z'}],
          nextPageToken: 'p2',
        });
      if (u.pathname.includes('/lists/L1/'))
        return ok({
          items: [{id: 'b', title: 'B', due: '2026-11-11T00:00:00.000Z'}],
        });
      // Out of the range (the API's bound is inclusive), and undated.
      return ok({
        items: [
          {id: 'c', title: 'C', due: '2026-11-17T00:00:00.000Z'},
          {id: 'd', title: 'D'},
        ],
      });
    });
    const tasks = await fetchTasks('2026-11-10', '2026-11-16');
    expect(tasks.map(t => `${t.key} ${t.due}`)).toEqual([
      'L1/a 2026-11-10',
      'L1/b 2026-11-11',
    ]);
    const urls = fetchMock.mock.calls.map(c => new URL(c[0] as string));
    expect(urls.every(u => u.host === 'tasks.googleapis.com')).toBe(true);
    const first = urls.find(u => u.pathname.includes('/lists/L1/'))!;
    expect(first.searchParams.get('dueMin')).toBe('2026-11-10T00:00:00.000Z');
    expect(first.searchParams.get('dueMax')).toBe('2026-11-17T00:00:00.000Z');
    expect(first.searchParams.get('showCompleted')).toBe('true');
    for (const [, init] of fetchMock.mock.calls) {
      expect((init as RequestInit).method ?? 'GET').toBe('GET');
      expect(
        new Headers((init as RequestInit).headers).get('Authorization'),
      ).toBe('Bearer tok');
    }
  });

  it('explains a Tasks API that isn’t enabled', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            code: 403,
            status: 'PERMISSION_DENIED',
            errors: [{reason: 'accessNotConfigured'}],
          },
        }),
        {status: 403},
      ),
    );
    await expect(fetchTasks('2026-11-10', '2026-11-16')).rejects.toThrow(
      /Google Tasks API isn’t enabled/,
    );
  });
});
