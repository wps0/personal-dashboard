import {beforeEach, describe, expect, it} from 'vitest';
import {emptyData, Weekday} from './model/types';
import {useStore} from './store';

describe('USOS settings in the store', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()));
  const usos = () => useStore.getState().data.settings.usos;

  it('sets and clears the source', () => {
    const source = {case: 'googleCalendarId', value: 'usos@x'} as const;
    useStore.getState().setUsosSource(source);
    expect(usos().source).toEqual(source);
    useStore.getState().setUsosSource({case: undefined});
    expect(usos().source.case).toBeUndefined();
  });

  it('remembers handled class meetings once each', () => {
    useStore.getState().markUsosHandled(['a', 'b']);
    useStore.getState().markUsosHandled(['b', 'c']);
    expect(usos().handled).toEqual(['a', 'b', 'c']);
  });
});

describe('week start in the store', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()));

  it('starts unset (Sunday) and can be changed', () => {
    const weekStart = () => useStore.getState().data.settings.weekStart;
    expect(weekStart()).toBe(Weekday.UNSPECIFIED);
    useStore.getState().setWeekStart(Weekday.MONDAY);
    expect(weekStart()).toBe(Weekday.MONDAY);
  });
});

describe('item groups in the store', () => {
  let projectId: string;
  let otherId: string;
  beforeEach(() => {
    useStore.getState().replaceAll(emptyData());
    const area = useStore.getState().addArea('University');
    projectId = useStore.getState().addProject(area, 'Analiza');
    otherId = useStore.getState().addProject(area, 'Algebra');
  });
  const s = () => useStore.getState();
  const project = (id = projectId) => s().data.projects.find(p => p.id === id)!;
  const groupOf = (itemId: string) =>
    s().data.items.find(i => i.id === itemId)?.groupId;

  it('adds, renames and orders groups in the array order', () => {
    const a = s().addGroup(projectId, 'Lectures');
    const b = s().addGroup(projectId, 'Labs');
    s().renameGroup(projectId, a, 'Classes');
    expect(project().groups).toMatchObject([
      {id: a, name: 'Classes'},
      {id: b, name: 'Labs'},
    ]);
    s().moveGroup(projectId, b, 0);
    expect(project().groups.map(g => g.id)).toEqual([b, a]);
    s().moveGroup(projectId, b, 9);
    expect(project().groups.map(g => g.id)).toEqual([a, b]);
    expect(project(otherId).groups).toEqual([]);
  });

  it('folds a group, or "No group", in that project only', () => {
    const a = s().addGroup(projectId, 'Lectures');
    const b = s().addGroup(projectId, 'Labs');
    expect(project().groups.map(g => g.collapsed)).toEqual([false, false]);
    s().setGroupCollapsed(projectId, b, true);
    expect(project().groups.map(g => g.collapsed)).toEqual([false, true]);
    s().setGroupCollapsed(projectId, null, true);
    expect(project().ungroupedCollapsed).toBe(true);
    expect(project(otherId).ungroupedCollapsed).toBe(false);
    s().setGroupCollapsed(projectId, b, false);
    expect(project().groups.find(g => g.id === a)?.collapsed).toBe(false);
    expect(project().groups.find(g => g.id === b)?.collapsed).toBe(false);
  });

  it('moves one or many items into a group and out of it', () => {
    const g = s().addGroup(projectId, 'Classes');
    const [x, y, z] = s().addItems(projectId, [
      {title: 'L1'},
      {title: 'L2'},
      {title: 'L3'},
    ]);
    s().moveToGroup([x], g);
    expect([x, y, z].map(groupOf)).toEqual([g, undefined, undefined]);
    s().moveToGroup([y, z], g);
    expect([x, y, z].map(groupOf)).toEqual([g, g, g]);
    s().moveToGroup([y], undefined);
    expect([x, y, z].map(groupOf)).toEqual([g, undefined, g]);
  });

  it('only moves items into a group of their own project', () => {
    const g = s().addGroup(projectId, 'Classes');
    const [mine] = s().addItems(projectId, [{title: 'Mine'}]);
    const [other] = s().addItems(otherId, [{title: 'Other'}]);
    s().moveToGroup([mine, other], g);
    expect(groupOf(mine)).toBe(g);
    expect(groupOf(other)).toBeUndefined();
  });

  it('adds new items straight into a group', () => {
    const g = s().addGroup(projectId, 'Classes');
    const [id] = s().addItems(projectId, [{title: 'L1', groupId: g}]);
    expect(groupOf(id)).toBe(g);
  });

  it('deleting a group keeps its items, in no group', () => {
    const g = s().addGroup(projectId, 'Classes');
    const keep = s().addGroup(projectId, 'Labs');
    const [x, y] = s().addItems(projectId, [{title: 'L1'}, {title: 'Lab 1'}]);
    s().moveToGroup([x], g);
    s().moveToGroup([y], keep);
    s().deleteGroup(projectId, g);
    expect(project().groups.map(gr => gr.id)).toEqual([keep]);
    expect(s().data.items.map(i => i.title)).toEqual(['L1', 'Lab 1']);
    expect([x, y].map(groupOf)).toEqual([undefined, keep]);
  });

  it('takes an item out of its group when it moves to another project', () => {
    const g = s().addGroup(projectId, 'Lectures');
    const [a, b] = s().addItems(projectId, [
      {title: 'L1', groupId: g},
      {title: 'L2', groupId: g},
    ]);
    s().updateItem(a, {projectId: otherId});
    s().updateItem(b, {projectId, title: 'Lecture 2'});
    expect(groupOf(a)).toBeUndefined();
    expect(groupOf(b)).toBe(g);
  });
});

describe('area order in the store', () => {
  beforeEach(() => useStore.getState().replaceAll(emptyData()));
  const s = () => useStore.getState();
  const order = () => s().data.areas.map(a => a.name);

  it('moves an area to a place in the order, keeping its projects', () => {
    const uni = s().addArea('University');
    s().addArea('Work');
    s().addArea('Personal');
    s().addProject(uni, 'Operating Systems');
    s().moveArea(uni, 2);
    expect(order()).toEqual(['Work', 'Personal', 'University']);
    s().moveArea(uni, 0);
    expect(order()).toEqual(['University', 'Work', 'Personal']);
    // Out of range lands at the end.
    s().moveArea(uni, 9);
    expect(order()).toEqual(['Work', 'Personal', 'University']);
    expect(s().data.projects.map(p => p.areaId)).toEqual([uni]);
  });
});
