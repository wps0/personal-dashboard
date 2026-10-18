import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {emptyData, type AppData} from '../model/types';
import {useStore} from '../store';
import {useToasts} from '../toast';
import {setUpAutosave} from './autosave';

function add(title: string) {
  useStore
    .getState()
    .addEvent({title, date: '2026-10-12', start: '10:00', end: '11:00'});
}

describe('setUpAutosave', () => {
  const listeners = new Map<string, () => void>();
  const page = {visibilityState: 'visible'};
  let saved: AppData[] = [];
  let fail = false;

  // Once: it subscribes to the store for good, like the app does.
  beforeAll(() => {
    const on = (type: string, f: () => void) => listeners.set(type, f);
    vi.stubGlobal('window', {
      setTimeout: (f: () => void, ms: number) => setTimeout(f, ms),
      clearTimeout: (id: number) => clearTimeout(id),
      addEventListener: on,
    });
    vi.stubGlobal('document', {
      get visibilityState() {
        return page.visibilityState;
      },
      addEventListener: on,
    });
    setUpAutosave({
      save: async data => {
        if (fail) throw new Error('The quota has been exceeded.');
        saved.push(data);
      },
    });
  });
  afterAll(() => vi.unstubAllGlobals());
  beforeEach(async () => {
    vi.useFakeTimers();
    fail = false;
    useStore.getState().replaceAll(emptyData());
    await vi.advanceTimersByTimeAsync(400);
    saved = [];
    useToasts.setState({toasts: []});
  });
  afterEach(() => vi.useRealTimers());

  it('saves shortly after the last change, and at once when the tab is hidden', async () => {
    add('A');
    add('B');
    await vi.advanceTimersByTimeAsync(400);
    expect(saved).toEqual([useStore.getState().data]);

    add('C');
    page.visibilityState = 'hidden';
    listeners.get('visibilitychange')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved.at(-1)).toBe(useStore.getState().data);
    page.visibilityState = 'visible';
  });

  it('reports a failed save, and tries again with the next flush', async () => {
    fail = true;
    add('A');
    await vi.advanceTimersByTimeAsync(400);
    expect(saved).toEqual([]);
    const {toasts} = useToasts.getState();
    expect(toasts.map(t => t.message)).toEqual([
      'Changes can’t be saved on this device; export the data to keep them. The quota has been exceeded.',
    ]);
    expect(toasts[0].action?.label).toBe('Export');

    // Still unsaved: closing the tab tries again.
    fail = false;
    listeners.get('pagehide')!();
    await vi.advanceTimersByTimeAsync(0);
    expect(saved).toEqual([useStore.getState().data]);
  });

  it('shows the failure once while it lasts, and retries with the next change', async () => {
    fail = true;
    add('A');
    await vi.advanceTimersByTimeAsync(400);
    add('B');
    await vi.advanceTimersByTimeAsync(400);
    expect(useToasts.getState().toasts).toHaveLength(1);

    fail = false;
    add('C');
    await vi.advanceTimersByTimeAsync(400);
    expect(saved).toEqual([useStore.getState().data]);
  });
});
