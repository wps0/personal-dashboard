import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {
  allocationsByItem,
  backlogItems,
  compareOpenFirst,
  dueByDay,
  findTasks,
  groupIdOf,
  missedAllocations,
  projectStats,
} from './selectors';
import {
  ItemKind,
  ItemStatus,
  ProgressMode,
  emptyData,
  type Allocation,
  type AppData,
  type InitOf,
  type Item,
  type Project,
} from './types';

const TODAY = '2026-10-10';

function fixture(): AppData {
  const d = emptyData();
  d.areas = [create(pb.AreaSchema, {id: 'a', name: 'Uni', color: '#fff'})];
  return d;
}

function project(extra: InitOf<typeof pb.ProjectSchema> = {}): Project {
  return create(pb.ProjectSchema, {
    id: 'p',
    areaId: 'a',
    name: 'OS',
    progressMode: ProgressMode.CHECKLIST,
    ...extra,
  });
}
function item(id: string, extra: InitOf<typeof pb.ItemSchema> = {}): Item {
  return create(pb.ItemSchema, {
    id,
    projectId: 'p',
    kind: ItemKind.TASK,
    title: id,
    status: ItemStatus.TODO,
    ...extra,
  });
}
function alloc(
  id: string,
  itemId: string,
  date: string,
  plannedHours: number,
  extra: InitOf<typeof pb.AllocationSchema> = {},
): Allocation {
  return create(pb.AllocationSchema, {
    id,
    itemId,
    date,
    plannedHours,
    ...extra,
  });
}

describe('projectStats', () => {
  it('computes checklist progress from done items', () => {
    const items = [
      item('l1', {kind: ItemKind.CLASS, status: ItemStatus.DONE}),
      item('l2', {kind: ItemKind.CLASS, status: ItemStatus.DOING}),
      item('t1', {status: ItemStatus.DONE}),
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
      project({progressMode: ProgressMode.HOURS}),
      items,
      allocationsByItem(d),
    );
    expect(s.percent).toBe(63); // (1.5 + 1) / 4
  });

  it('clamps manual progress and picks the earliest open deadline', () => {
    const items = [
      item('a', {dueDate: '2026-10-20'}),
      item('b', {dueDate: '2026-10-12'}),
      item('c', {dueDate: '2026-10-11', status: ItemStatus.DONE}),
    ];
    const s = projectStats(
      project({
        progressMode: ProgressMode.MANUAL,
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
      item('finished', {status: ItemStatus.DONE}),
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
    d.items = [item('x'), item('closed', {status: ItemStatus.DONE})];
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

describe('dueByDay', () => {
  const days = ['2026-10-10', '2026-10-11'];

  it('lists the tasks due on each day, done ones too, in planning order', () => {
    const d = fixture();
    d.projects = [project()];
    d.items = [
      item('Lecture 10', {dueDate: '2026-10-10'}),
      item('Lecture 2', {dueDate: '2026-10-10'}),
      item('done', {dueDate: '2026-10-11', status: ItemStatus.DONE}),
      item('later', {dueDate: '2026-10-12'}),
      item('undated'),
    ];
    const m = dueByDay(days, d);
    expect([...m.keys()]).toEqual(days);
    expect(m.get('2026-10-10')!.map(i => i.id)).toEqual([
      'Lecture 2',
      'Lecture 10',
    ]);
    expect(m.get('2026-10-11')!.map(i => i.id)).toEqual(['done']);
  });

  it('leaves out archived projects and hidden areas', () => {
    const d = fixture();
    d.projects = [
      project(),
      project({id: 'old', archived: true}),
      project({id: 'work', areaId: 'w'}),
    ];
    d.items = [
      item('shown', {dueDate: '2026-10-10'}),
      item('archived', {projectId: 'old', dueDate: '2026-10-10'}),
      item('hidden', {projectId: 'work', dueDate: '2026-10-10'}),
      item('orphan', {projectId: 'gone', dueDate: '2026-10-10'}),
    ];
    expect(
      dueByDay(days, d, ['w'])
        .get('2026-10-10')!
        .map(i => i.id),
    ).toEqual(['shown']);
  });
});

describe('groupIdOf', () => {
  const groups = [create(pb.ItemGroupSchema, {id: 'g', name: 'Classes'})];
  const item = (groupId?: string) =>
    create(pb.ItemSchema, {id: 'i', title: 'L1', groupId});

  it('finds the item’s group; none when unset or gone', () => {
    expect(groupIdOf(item('g'), groups)).toBe('g');
    expect(groupIdOf(item(), groups)).toBe('');
    // Deleted on another device: shows as no group.
    expect(groupIdOf(item('gone'), groups)).toBe('');
  });
});

describe('findTasks', () => {
  function data(): AppData {
    const d = fixture();
    d.projects = [
      project({name: 'Złożoność obliczeniowa'}),
      project({id: 'old', name: 'Old', archived: true}),
    ];
    d.items = [
      item('Lecture 10', {estimateHours: 2}),
      item('Lecture 2', {estimateHours: 2}),
      item('Planned', {estimateHours: 1}),
      item('Done one', {status: ItemStatus.DONE}),
      item('Archived', {projectId: 'old'}),
    ];
    d.allocations = [alloc('x', 'Planned', TODAY, 1)];
    return d;
  }

  it('offers the backlog without a query', () => {
    expect(findTasks(data(), ' ', TODAY).map(i => i.id)).toEqual([
      'Lecture 2',
      'Lecture 10',
    ]);
  });

  it('searches open tasks by title or project, ignoring case and diacritics', () => {
    expect(findTasks(data(), 'PLAN', TODAY).map(i => i.id)).toEqual([
      'Planned',
    ]);
    expect(findTasks(data(), 'zlozonosc', TODAY).map(i => i.id)).toEqual([
      'Lecture 2',
      'Lecture 10',
      'Planned',
    ]);
    expect(findTasks(data(), 'done', TODAY)).toEqual([]);
    expect(findTasks(data(), 'archived', TODAY)).toEqual([]);
  });

  it('stops at the limit', () => {
    expect(findTasks(data(), 'lecture', TODAY, 1).map(i => i.id)).toEqual([
      'Lecture 2',
    ]);
  });
});

describe('compareOpenFirst', () => {
  it('puts done items last, keeping the planning order in both parts', () => {
    const items = [
      item('done early', {dueDate: '2026-10-01', status: ItemStatus.DONE}),
      item('Lecture 10'),
      item('due', {dueDate: '2026-10-20', status: ItemStatus.DOING}),
      item('done late', {dueDate: '2026-11-01', status: ItemStatus.DONE}),
      item('Lecture 2'),
    ];
    expect(items.sort(compareOpenFirst).map(i => i.id)).toEqual([
      'due',
      'Lecture 2',
      'Lecture 10',
      'done early',
      'done late',
    ]);
  });
});
