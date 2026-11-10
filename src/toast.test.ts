import {beforeEach, describe, expect, it, vi} from 'vitest';
import {emptyData} from './model/types';
import {useStore} from './store';
import {
  clearHistory,
  dismissLastStep,
  undoLast,
  undoStep,
  useLastStep,
  useToasts,
  withUndo,
} from './toast';

function titles() {
  return useStore.getState().data.events.map(e => e.title);
}
function add(title: string) {
  return useStore
    .getState()
    .addEvent({title, date: '2026-10-12', start: '10:00', end: '11:00'});
}

describe('undo history', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    useToasts.setState({toasts: []});
    clearHistory();
  });

  it('undoes several steps in order', () => {
    withUndo('a', () => add('A'));
    withUndo('b', () => add('B'), {quiet: true});
    withUndo('c', () => add('C'));
    expect(titles()).toEqual(['A', 'B', 'C']);
    undoLast();
    expect(titles()).toEqual(['A', 'B']);
    undoLast();
    undoLast();
    expect(titles()).toEqual([]);
    expect(undoLast()).toBe(false);
  });

  it('refuses to undo over a change it did not record', () => {
    withUndo('a', () => add('A'));
    add('untracked');
    expect(undoLast()).toBe(false);
    expect(titles()).toEqual(['A', 'untracked']);
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/Can’t undo/);
  });

  it('records nothing for a no-op change', () => {
    withUndo('noop', () => {});
    expect(undoLast()).toBe(false);
  });

  it("lets the toast's Undo button undo only its own, latest step", () => {
    withUndo('a', () => add('A'));
    const first = useToasts.getState().toasts.at(-1)!;
    withUndo('b', () => add('B'));
    first.action!.run(); // stale: B came after
    expect(titles()).toEqual(['A', 'B']);
    useToasts
      .getState()
      .toasts.find(t => t.message === 'b')!
      .action!.run();
    expect(titles()).toEqual(['A']);
  });
});

describe('the latest step, for the undo bar', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    useToasts.setState({toasts: []});
    clearHistory();
  });
  const last = () => useLastStep.getState().step;

  it('is kept for quiet changes too, and undone from the bar', () => {
    withUndo('Session moved', () => add('A'), {quiet: true});
    expect(useToasts.getState().toasts).toEqual([]);
    expect(last()?.message).toBe('Session moved');
    undoStep(last()!);
    expect(titles()).toEqual([]);
    expect(last()).toBeNull();
  });

  it('is replaced by the next change, and gone after Ctrl+Z or a dismissal', () => {
    withUndo('a', () => add('A'));
    withUndo('b', () => add('B'), {quiet: true});
    expect(last()?.message).toBe('b');
    undoLast();
    expect(last()).toBeNull();
    withUndo('c', () => add('C'));
    dismissLastStep();
    expect(last()).toBeNull();
    // Still undoable with Ctrl+Z.
    undoLast();
    expect(titles()).toEqual(['A']);
  });

  it('refuses a step that is no longer the latest', () => {
    withUndo('a', () => add('A'));
    const first = last()!;
    withUndo('b', () => add('B'));
    undoStep(first);
    expect(titles()).toEqual(['A', 'B']);
    expect(useToasts.getState().toasts.at(-1)?.message).toMatch(/Can’t undo/);
  });

  it('marks undo toasts, so touch screens can leave them to the bar', () => {
    withUndo('a', () => add('A'));
    expect(useToasts.getState().toasts[0]).toMatchObject({undo: true});
  });
});
