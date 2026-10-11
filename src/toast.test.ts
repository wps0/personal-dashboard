import {beforeEach, describe, expect, it, vi} from 'vitest';
import {emptyData} from './model/types';
import {useStore} from './store';
import {clearHistory, undoLast, useToasts, withUndo} from './toast';

const titles = () => useStore.getState().data.events.map(e => e.title);
const add = (title: string) =>
  useStore
    .getState()
    .addEvent({title, date: '2026-10-12', start: '10:00', end: '11:00'});

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
