import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  addGroup,
  addReserved,
  deleteGroup,
  deleteReserved,
  importClasses,
  importCurriculum,
  moveReserved,
  moveToGroup,
  renameGroup,
  resetReserved,
  updateReserved,
} from './actions';
import {reservedRanges} from './model/capacity';
import {ItemKind, emptyData} from './model/types';
import {useStore} from './store';
import {clearHistory, undoLast, useToasts} from './toast';
import type {ClassMeeting, Proposal} from './usos/usos';

function meeting(key: string, date: string): ClassMeeting {
  return {
    key,
    type: 'WYK',
    course: 'Analiza',
    date,
    start: '10:15',
    end: '12:00',
  };
}

describe('importClasses', () => {
  let projectId: string;
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    useToasts.setState({toasts: []});
    clearHistory();
    const area = useStore.getState().addArea('University');
    projectId = useStore.getState().addProject(area, 'Analiza');
  });

  const shown: Proposal[] = [
    {projectId: '', meeting: meeting('a', '2026-10-14')},
    {projectId: '', meeting: meeting('b', '2026-10-21')},
  ];

  it('adds the chosen classes as tasks and remembers every class shown', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([all[1]], all, new Set(['b']));
    const {items, allocations, settings} = useStore.getState().data;
    expect(items).toMatchObject([
      {
        projectId,
        kind: ItemKind.CLASS,
        title: 'WYK · Wed 21 Oct, 10:15',
        heldOn: '2026-10-21',
        estimateHours: 1.75,
        source: {source: {case: 'usosMeeting', value: 'b'}},
      },
    ]);
    // Planned like the class itself: its day, start and length.
    expect(allocations).toMatchObject([
      {
        itemId: items[0].id,
        date: '2026-10-21',
        start: '10:15',
        plannedHours: 1.75,
        done: false,
      },
    ]);
    // Only the skipped class: the imported one is known by its task.
    expect(settings.usos.handled).toEqual(['a']);
    expect(useToasts.getState().toasts[0].message).toBe(
      'Imported 1 class from USOS',
    );
  });

  it('is one undo step', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses(all, all, new Set(['a', 'b']));
    expect(useStore.getState().data.items).toHaveLength(2);
    expect(useStore.getState().data.allocations).toHaveLength(2);
    undoLast();
    expect(useStore.getState().data.items).toHaveLength(0);
    expect(useStore.getState().data.allocations).toHaveLength(0);
    expect(useStore.getState().data.settings.usos.handled).toEqual([]);
  });

  it('frees a class whose project was deleted, to import it elsewhere', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses(all, all, new Set(['a', 'b']));
    useStore.getState().deleteProject(projectId);
    const {items, settings} = useStore.getState().data;
    expect(items).toEqual([]);
    expect(settings.usos.handled).toEqual([]);
  });

  it('plans only the classes chosen for the calendar', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses(all, all, new Set(['b']));
    const {items, allocations} = useStore.getState().data;
    expect(items).toHaveLength(2);
    expect(items[0].estimateHours).toBe(1.75);
    expect(allocations).toMatchObject([{itemId: items[1].id}]);
  });

  it('can offer skipped classes again', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([], all, new Set());
    useStore.getState().clearUsosHandled();
    expect(useStore.getState().data.settings.usos.handled).toEqual([]);
  });

  it('imports into the picked group and remembers it for next time', () => {
    const [a, b] = shown.map(p => ({...p, projectId}));
    const g = useStore.getState().addGroup(projectId, 'Classes');
    const data = () => useStore.getState().data;
    importClasses([a], [a], new Set(['a']), new Map([[projectId, g]]));
    expect(data().items.map(i => i.groupId)).toEqual([g]);
    expect(data().projects[0].importGroupId).toBe(g);
    // Not picked this time: the remembered group.
    importClasses([b], [b], new Set(['b']));
    expect(data().items.map(i => i.groupId)).toEqual([g, g]);
    undoLast();
    undoLast();
    expect(data().items).toEqual([]);
    expect(data().projects[0].importGroupId).toBeUndefined();
  });

  it('imports into a group and plans only the classes chosen for the calendar', () => {
    const all = shown.map(p => ({...p, projectId}));
    const g = useStore.getState().addGroup(projectId, 'Classes');
    importClasses(all, all, new Set(['b']), new Map([[projectId, g]]));
    const {items, allocations} = useStore.getState().data;
    expect(items.map(i => i.groupId)).toEqual([g, g]);
    expect(allocations).toMatchObject([{itemId: items[1].id}]);
  });

  it('imports into no group when picked, or when the remembered one is gone', () => {
    const [a, b] = shown.map(p => ({...p, projectId}));
    const g = useStore.getState().addGroup(projectId, 'Classes');
    const data = () => useStore.getState().data;
    importClasses([a], [a], new Set(['a']), new Map([[projectId, g]]));
    useStore.getState().deleteGroup(projectId, g);
    importClasses([b], [b], new Set(['b']));
    expect(data().items.map(i => i.groupId)).toEqual([undefined, undefined]);
    expect(data().projects[0].importGroupId).toBeUndefined();
  });

  it('skipping everything only remembers the classes', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([], all, new Set());
    expect(useStore.getState().data.items).toHaveLength(0);
    expect(useStore.getState().data.settings.usos.handled).toEqual(['a', 'b']);
    expect(useToasts.getState().toasts[0].message).toBe('Skipped 2 classes');
  });
});

describe('item groups', () => {
  let projectId: string;
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    useToasts.setState({toasts: []});
    clearHistory();
    const area = useStore.getState().addArea('University');
    projectId = useStore.getState().addProject(area, 'Analiza');
  });
  const data = () => useStore.getState().data;
  const lastToast = () => useToasts.getState().toasts.at(-1)?.message;

  it('adding and renaming are undoable without a toast', () => {
    const id = addGroup(projectId, 'Lectures');
    renameGroup(projectId, id, 'Classes');
    expect(data().projects[0].groups).toMatchObject([{id, name: 'Classes'}]);
    expect(useToasts.getState().toasts).toEqual([]);
    undoLast();
    expect(data().projects[0].groups[0].name).toBe('Lectures');
    undoLast();
    expect(data().projects[0].groups).toEqual([]);
  });

  it('deleting a group shows a toast, and undo puts its items back in it', () => {
    const id = addGroup(projectId, 'Classes');
    const [item] = useStore
      .getState()
      .addItems(projectId, [{title: 'L1', groupId: id}]);
    deleteGroup(projectId, data().projects[0].groups[0]);
    expect(lastToast()).toBe('Deleted group “Classes”');
    expect(data().items).toMatchObject([{id: item, groupId: undefined}]);
    undoLast();
    expect(data().projects[0].groups).toHaveLength(1);
    expect(data().items).toMatchObject([{id: item, groupId: id}]);
  });

  it('moves all items of a kind in one undoable step', () => {
    const id = addGroup(projectId, 'Classes');
    useStore.getState().addItems(projectId, [
      {title: 'L1', kind: ItemKind.CLASS},
      {title: 'Essay', kind: ItemKind.ASSIGNMENT},
      {title: 'L2', kind: ItemKind.CLASS},
    ]);
    const group = data().projects[0].groups[0];
    moveToGroup(
      data().items.filter(i => i.kind === ItemKind.CLASS),
      group,
    );
    expect(lastToast()).toBe('Moved 2 items to “Classes”');
    expect(data().items.map(i => i.groupId)).toEqual([id, undefined, id]);
    undoLast();
    expect(data().items.map(i => i.groupId)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it('moving one item is quiet', () => {
    addGroup(projectId, 'Classes');
    useStore.getState().addItems(projectId, [{title: 'L1'}]);
    moveToGroup(data().items, data().projects[0].groups[0]);
    expect(useToasts.getState().toasts).toEqual([]);
    expect(data().items[0].groupId).toBe(data().projects[0].groups[0].id);
  });
});

describe('importCurriculum', () => {
  let projectId: string;
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    useToasts.setState({toasts: []});
    clearHistory();
    const area = useStore.getState().addArea('University');
    projectId = useStore.getState().addProject(area, 'Analiza');
    useStore.getState().updateProject(projectId, {overviewDoc: '## Goals'});
  });
  const data = () => useStore.getState().data;
  const items = [
    {kind: ItemKind.CLASS, title: '1. Granice'},
    {kind: ItemKind.CLASS, title: '2. Pochodne'},
  ];

  it('creates the items in the group, remembers it and adds the notes', () => {
    const g = useStore.getState().addGroup(projectId, 'Lectures');
    importCurriculum(projectId, items, g, 'Odd weeks only.');
    expect(data().items).toMatchObject([
      {title: '1. Granice', groupId: g},
      {title: '2. Pochodne', groupId: g},
    ]);
    expect(data().projects[0]).toMatchObject({
      importGroupId: g,
      overviewDoc: '## Goals\n\n## Course notes\n\nOdd weeks only.\n',
    });
    expect(useToasts.getState().toasts[0].message).toBe(
      'Imported 2 classes from the curriculum',
    );
  });

  it('is one undo step, and can import into no group', () => {
    importCurriculum(projectId, items, '');
    expect(data().items.map(i => i.groupId)).toEqual([undefined, undefined]);
    expect(data().projects[0].overviewDoc).toBe('## Goals');
    undoLast();
    expect(data().items).toEqual([]);
  });
});

describe('editing a day’s reserved time', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {setTimeout: () => 0});
    useStore.getState().replaceAll(emptyData());
    clearHistory();
  });
  // Mondays get Sleep 23:00–07:00 (index 0) and Work 09:00–17:00 (index 1).
  const mon = '2026-10-12';
  const tue = '2026-10-13';
  const ranges = (date: string) => {
    const {capacityRules, dayCapacity} = useStore.getState().data.settings;
    return reservedRanges(capacityRules, dayCapacity, date).map(
      r => `${r.label} ${r.start}–${r.end}`,
    );
  };

  it('changes only that day, starting from its weekday’s ranges', () => {
    updateReserved(mon, 1, {start: '10:00', label: 'Office'});
    expect(ranges(mon)).toEqual(['Sleep 23:00–07:00', 'Office 10:00–17:00']);
    expect(ranges('2026-10-19')).toEqual([
      'Sleep 23:00–07:00',
      'Work 09:00–17:00',
    ]);
  });

  it('moves a range within a day, or to another day in one undo step', () => {
    moveReserved(mon, 1, mon, 8 * 60);
    expect(ranges(mon)[1]).toBe('Work 08:00–16:00');
    moveReserved(mon, 1, tue, 13 * 60);
    expect(ranges(mon)).toEqual(['Sleep 23:00–07:00']);
    expect(ranges(tue)).toEqual([
      'Sleep 23:00–07:00',
      'Work 09:00–17:00',
      'Work 13:00–21:00',
    ]);
    undoLast();
    expect(ranges(mon)[1]).toBe('Work 08:00–16:00');
    expect(ranges(tue)).toHaveLength(2);
  });

  it('adds a range to that day only, in one undo step', () => {
    addReserved(mon, {start: '18:00', end: '19:30', label: 'Gym'});
    expect(ranges(mon)).toEqual([
      'Sleep 23:00–07:00',
      'Work 09:00–17:00',
      'Gym 18:00–19:30',
    ]);
    expect(ranges('2026-10-19')).toHaveLength(2);
    undoLast();
    expect(useStore.getState().data.settings.dayCapacity[mon]).toBeUndefined();
  });

  it('deletes with undo, and resets to the weekday’s', () => {
    deleteReserved(mon, 1);
    expect(ranges(mon)).toEqual(['Sleep 23:00–07:00']);
    expect(useToasts.getState().toasts.at(-1)?.message).toBe(
      'Removed reserved time',
    );
    deleteReserved(mon, 0);
    expect(ranges(mon)).toEqual([]);
    resetReserved(mon);
    expect(ranges(mon)).toHaveLength(2);
    expect(useStore.getState().data.settings.dayCapacity[mon]).toBeUndefined();
  });
});
