import {describe, expect, it} from 'vitest';
import {
  allocationsByItem,
  backlogItems,
  missedAllocations,
  migrateStatus,
  projectStats,
} from './selectors';
import type {Allocation, AppData, Item, Project} from './types';
import {emptyData} from './types';

const TODAY = '2026-10-10';

function fixture(): AppData {
  const d = emptyData();
  d.areas = [{id: 'a', name: 'Uni', color: '#fff'}];
  return d;
}

const project = (extra: Partial<Project> = {}): Project => ({
  id: 'p',
  areaId: 'a',
  name: 'OS',
  progressMode: 'checklist',
  manualProgress: 0,
  overviewDoc: '',
  log: [],
  archived: false,
  createdAt: '',
  ...extra,
});
const item = (id: string, extra: Partial<Item> = {}): Item => ({
  id,
  projectId: 'p',
  kind: 'task',
  title: id,
  status: 'todo',
  createdAt: '',
  ...extra,
});
const alloc = (
  id: string,
  itemId: string,
  date: string,
  plannedHours: number,
  extra: Partial<Allocation> = {},
): Allocation => ({
  id,
  itemId,
  date,
  plannedHours,
  done: false,
  ...extra,
});

describe('projectStats', () => {
  it('computes checklist progress from done items', () => {
    const items = [
      item('l1', {kind: 'class', status: 'done'}),
      item('l2', {kind: 'class', status: 'doing'}),
      item('t1', {status: 'done'}),
      item('t2'),
    ];
    const s = projectStats(project(), items, new Map());
    expect(s).toMatchObject({percent: 50, done: 2, total: 4});
  });

  it('computes hours progress from done allocations across days', () => {
    const items = [item('x', {estimateHours: 4})];
    const allocs = [
      alloc('1', 'x', '2026-10-08', 1, {done: true, actualHours: 1.5}),
      alloc('2', 'x', '2026-10-09', 1, {done: true}),
      alloc('3', 'x', '2026-10-11', 2),
    ];
    const d = {...fixture(), items, allocations: allocs};
    const s = projectStats(
      project({progressMode: 'hours'}),
      items,
      allocationsByItem(d),
    );
    expect(s.percent).toBe(63); // (1.5 + 1) / 4
  });

  it('clamps manual progress and picks the earliest open deadline', () => {
    const items = [
      item('a', {dueDate: '2026-10-20'}),
      item('b', {dueDate: '2026-10-12'}),
      item('c', {dueDate: '2026-10-11', status: 'done'}),
    ];
    const s = projectStats(
      project({
        progressMode: 'manual',
        manualProgress: 140,
        dueDate: '2026-12-01',
      }),
      items,
      new Map(),
    );
    expect(s.percent).toBe(100);
    expect(s.next).toEqual({title: 'b', date: '2026-10-12'});
  });
});

describe('backlogItems', () => {
  it('keeps estimated items until fully planned, counting split allocations', () => {
    const d = fixture();
    d.projects = [project()];
    d.items = [item('x', {estimateHours: 3}), item('y', {estimateHours: 2})];
    d.allocations = [
      alloc('1', 'x', TODAY, 1),
      alloc('2', 'x', '2026-10-11', 1),
      alloc('3', 'y', TODAY, 2),
    ];
    expect(backlogItems(d, TODAY)).toEqual([{item: d.items[0], remaining: 1}]);
  });

  it('hides unestimated items with an open or upcoming allocation, and missed ones', () => {
    const d = fixture();
    d.projects = [project()];
    d.items = [
      item('planned'),
      item('missed'),
      item('free'),
      item('finished', {status: 'done'}),
    ];
    d.allocations = [
      alloc('1', 'planned', '2026-10-12', 1),
      alloc('2', 'missed', '2026-10-01', 1),
    ];
    expect(backlogItems(d, TODAY).map(b => b.item.id)).toEqual(['free']);
  });

  it('skips archived projects and sorts by due date then title numerically', () => {
    const d = fixture();
    d.projects = [project(), project({id: 'old', archived: true})];
    d.items = [
      item('Lecture 10'),
      item('Lecture 2'),
      item('Exam', {dueDate: '2026-11-01'}),
      item('Hidden', {projectId: 'old'}),
    ];
    expect(backlogItems(d, TODAY).map(b => b.item.id)).toEqual([
      'Exam',
      'Lecture 2',
      'Lecture 10',
    ]);
  });
});

describe('missedAllocations', () => {
  it('returns unchecked past allocations of open items, oldest first', () => {
    const d = fixture();
    d.projects = [project()];
    d.items = [item('x'), item('closed', {status: 'done'})];
    d.allocations = [
      alloc('today', 'x', TODAY, 1),
      alloc('late', 'x', '2026-10-09', 1),
      alloc('early', 'x', '2026-10-02', 1),
      alloc('checked', 'x', '2026-10-03', 1, {done: true}),
      alloc('closedItem', 'closed', '2026-10-03', 1),
    ];
    expect(missedAllocations(d, TODAY).map(a => a.id)).toEqual([
      'early',
      'late',
    ]);
  });
});

describe('migrateStatus', () => {
  it('maps old lecture stages onto todo / in progress / done', () => {
    expect(migrateStatus('watched')).toBe('doing');
    expect(migrateStatus('notes')).toBe('done');
    expect(migrateStatus('revised')).toBe('done');
    expect(migrateStatus('doing')).toBe('doing');
    expect(migrateStatus('todo')).toBe('todo');
    expect(migrateStatus('garbage')).toBe('todo');
  });
});
