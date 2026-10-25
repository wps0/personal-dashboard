import {beforeEach, describe, expect, it, vi} from 'vitest';
import {
  addGroup,
  deleteGroup,
  importClasses,
  moveToGroup,
  renameGroup,
} from './actions';
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
    importClasses([all[1]], all);
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
    importClasses(all, all);
    expect(useStore.getState().data.items).toHaveLength(2);
    expect(useStore.getState().data.allocations).toHaveLength(2);
    undoLast();
    expect(useStore.getState().data.items).toHaveLength(0);
    expect(useStore.getState().data.allocations).toHaveLength(0);
    expect(useStore.getState().data.settings.usos.handled).toEqual([]);
  });

  it('frees a class whose project was deleted, to import it elsewhere', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses(all, all);
    useStore.getState().deleteProject(projectId);
    const {items, settings} = useStore.getState().data;
    expect(items).toEqual([]);
    expect(settings.usos.handled).toEqual([]);
  });

  it('can offer skipped classes again', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([], all);
    useStore.getState().clearUsosHandled();
    expect(useStore.getState().data.settings.usos.handled).toEqual([]);
  });

  it('skipping everything only remembers the classes', () => {
    const all = shown.map(p => ({...p, projectId}));
    importClasses([], all);
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
