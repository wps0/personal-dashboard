import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {sampleData} from '../model/sample';
import type {AppData} from '../model/types';
import {merge3, mergeData, same} from './merge';

function base() {
  return structuredClone(sampleData('2026-10-12'));
}
function edit(d: AppData, f: (d: AppData) => void) {
  const c = structuredClone(d);
  f(c);
  return c;
}
/** Deletes a project with its tasks and their sessions, as the app does. */
function deleteProject(d: AppData, id: string) {
  const items = new Set(d.items.filter(i => i.projectId === id).map(i => i.id));
  d.projects = d.projects.filter(p => p.id !== id);
  d.items = d.items.filter(i => !items.has(i.id));
  d.allocations = d.allocations.filter(a => !items.has(a.itemId));
}

describe('same', () => {
  it('ignores key order and undefined keys', () => {
    expect(same({a: 1, b: [1, {c: 2}]}, {b: [1, {c: 2}], a: 1})).toBe(true);
    expect(same({a: 1, b: undefined}, {a: 1})).toBe(true);
    expect(same({a: 1}, {a: 2})).toBe(false);
    expect(same([1, 2], [2, 1])).toBe(false);
    expect(same(null, {})).toBe(false);
  });
});

describe('merge3', () => {
  it('takes a change made on one side only', () => {
    const b = base();
    const changed = edit(b, d => (d.items[0].title = 'Renamed'));
    expect(mergeData(b, changed, b)).toEqual({data: changed, conflicts: []});
    expect(mergeData(b, b, changed)).toEqual({data: changed, conflicts: []});
  });

  it('keeps edits to different fields of the same record from both sides', () => {
    const b = base();
    const id = b.items[0].id;
    const local = edit(b, d => (d.items[0].estimateHours = 42));
    const remote = edit(b, d => (d.items[0].notes = 'from the phone'));
    const {data, conflicts} = mergeData(b, local, remote);
    expect(conflicts).toEqual([]);
    expect(data.items.find(i => i.id === id)).toMatchObject({
      estimateHours: 42,
      notes: 'from the phone',
    });
  });

  it('keeps this device’s value when both changed the same field', () => {
    const b = base();
    const id = b.items[0].id;
    const local = edit(b, d => (d.items[0].title = 'Local'));
    const remote = edit(b, d => (d.items[0].title = 'Remote'));
    const {data, conflicts} = mergeData(b, local, remote);
    expect(data.items[0].title).toBe('Local');
    expect(conflicts).toEqual([
      {path: ['items', id, 'title'], local: 'Local', remote: 'Remote'},
    ]);
  });

  it('applies a deletion from either side, but an edit wins over a deletion', () => {
    const b = base();
    const [first, second] = b.events;
    const deletedHere = edit(b, d => (d.events = d.events.slice(1)));
    expect(mergeData(b, b, deletedHere).data.events[0].id).toBe(second.id);
    expect(mergeData(b, deletedHere, b).data.events[0].id).toBe(second.id);

    const editedThere = edit(b, d => (d.events[0].title = 'Moved'));
    const {data, conflicts} = mergeData(b, deletedHere, editedThere);
    expect(data.events.find(e => e.id === first.id)?.title).toBe('Moved');
    expect(conflicts).toEqual([
      {
        path: ['events', first.id],
        local: undefined,
        remote: editedThere.events[0],
      },
    ]);
  });

  it('keeps records added on both sides, in a sensible order', () => {
    const b = base();
    const p = b.projects[0];
    const entry = (id: string) =>
      create(pb.LogEntrySchema, {id, at: '2026-10-13T10:00:00Z', text: id});
    const local = edit(b, d => {
      d.projects[0].log.unshift(entry('mine'));
      d.dayNotes['2026-10-13'] = 'mine';
    });
    const remote = edit(b, d => {
      d.projects[0].log.unshift(entry('theirs'));
      d.dayNotes['2026-10-14'] = 'theirs';
    });
    const {data, conflicts} = mergeData(b, local, remote);
    expect(conflicts).toEqual([]);
    const log = data.projects.find(x => x.id === p.id)!.log.map(e => e.id);
    // Both new entries on top (prepended), the old ones below in order.
    expect(log).toEqual(['theirs', 'mine', ...p.log.map(e => e.id)]);
    expect(data.dayNotes['2026-10-13']).toBe('mine');
    expect(data.dayNotes['2026-10-14']).toBe('theirs');
  });

  it('merges a oneof as a whole, never mixing its case and value', () => {
    const base = {source: {case: 'googleCalendarId', value: 'cal-a'}};
    const local = {source: {case: 'googleCalendarId', value: 'cal-b'}};
    const remote = {
      source: {case: 'icalUrl', value: 'https://x.example/p.ics'},
    };
    const {value, conflicts} = merge3(base, local, remote);
    expect(value).toEqual(local);
    expect(conflicts.map(c => c.path)).toEqual([['source']]);
  });

  it('merges lists of plain values as sets', () => {
    const {value} = merge3(
      {handled: ['a', 'b']},
      {handled: ['a', 'b', 'mine']},
      {handled: ['b', 'theirs']},
    );
    // 'a' was removed on one side, one key was added on each.
    expect(value).toEqual({handled: ['b', 'mine', 'theirs']});
  });

  it('brings back the project of a task edited on one side and deleted with it on the other', () => {
    const b = base();
    const item = b.items[0];
    const project = b.projects.find(p => p.id === item.projectId)!;
    const local = edit(b, d => (d.items[0].title = 'Edited on the laptop'));
    const remote = edit(b, d => deleteProject(d, project.id));
    const {data, conflicts} = mergeData(b, local, remote);
    expect(data.items.find(i => i.id === item.id)?.title).toBe(
      'Edited on the laptop',
    );
    expect(data.projects.map(p => p.id)).toEqual(b.projects.map(p => p.id));
    // Its other tasks stay deleted.
    expect(data.items.filter(i => i.projectId === project.id)).toHaveLength(1);
    expect(conflicts).toEqual([
      {path: ['items', item.id], local: local.items[0], remote: undefined},
      {path: ['projects', project.id], local: project, remote: undefined},
    ]);

    // The same when this device deleted it.
    const mirrored = mergeData(b, remote, local);
    expect(mirrored.data.items.some(i => i.id === item.id)).toBe(true);
    expect(mirrored.data.projects.some(p => p.id === project.id)).toBe(true);
  });

  it('brings back the task, project and area of an edited session', () => {
    const b = base();
    const session = b.allocations[0];
    const item = b.items.find(i => i.id === session.itemId)!;
    const project = b.projects.find(p => p.id === item.projectId)!;
    const local = edit(b, d => (d.allocations[0].plannedHours += 1));
    const remote = edit(b, d => {
      d.areas = d.areas.filter(a => a.id !== project.areaId);
      for (const p of d.projects.filter(p => p.areaId === project.areaId))
        deleteProject(d, p.id);
    });
    const {data, conflicts} = mergeData(b, local, remote);
    expect(data.allocations.find(a => a.id === session.id)?.plannedHours).toBe(
      session.plannedHours + 1,
    );
    expect(data.items.some(i => i.id === item.id)).toBe(true);
    expect(data.projects.some(p => p.id === project.id)).toBe(true);
    expect(data.areas.some(a => a.id === project.areaId)).toBe(true);
    expect(conflicts.map(c => c.path)).toEqual([
      ['allocations', session.id],
      ['items', item.id],
      ['projects', project.id],
      ['areas', project.areaId],
    ]);
  });

  it('drops records added to a parent the other side deleted, and only those', () => {
    const b = base();
    const project = b.projects[0];
    const local = edit(b, d => deleteProject(d, project.id));
    const remote = edit(b, d => {
      d.items.push({...d.items[0], id: 'added', projectId: project.id});
      // Never had a project: not the merge's business.
      d.items.push({...d.items[0], id: 'stray', projectId: 'missing'});
    });
    const {data, conflicts} = mergeData(b, local, remote);
    expect(data.projects.some(p => p.id === project.id)).toBe(false);
    expect(data.items.some(i => i.id === 'added')).toBe(false);
    expect(data.items.some(i => i.id === 'stray')).toBe(true);
    expect(conflicts).toEqual([]);
  });
});

describe('item groups', () => {
  const group = (id: string, name: string) =>
    create(pb.ItemGroupSchema, {id, name});
  /** The sample data with a "Classes" group holding the first project's first item. */
  function grouped() {
    return edit(base(), d => {
      d.projects[0].groups.push(group('g', 'Classes'));
      d.items.find(i => i.projectId === d.projects[0].id)!.groupId = 'g';
    });
  }
  function addItem(d: AppData, id: string, groupId: string) {
    const first = d.items.find(i => i.projectId === d.projects[0].id)!;
    d.items.push({...first, id, title: id, groupId});
  }

  it('keeps a rename on one device and an item added to the group on the other', () => {
    const b = grouped();
    const local = edit(b, d => (d.projects[0].groups[0].name = 'Lectures'));
    const remote = edit(b, d => addItem(d, 'new', 'g'));
    for (const [l, r] of [
      [local, remote],
      [remote, local],
    ]) {
      const {data, conflicts} = mergeData(b, l, r);
      expect(conflicts).toEqual([]);
      expect(data.projects[0].groups).toEqual([group('g', 'Lectures')]);
      expect(data.items.find(i => i.id === 'new')?.groupId).toBe('g');
    }
  });

  it('keeps an item added to a group deleted on the other device, in no group', () => {
    const b = grouped();
    const old = b.items.find(i => i.groupId === 'g')!;
    // Deleted as the app does: its items move to no group.
    const local = edit(b, d => {
      d.projects[0].groups = [];
      for (const i of d.items) if (i.groupId === 'g') i.groupId = undefined;
    });
    const remote = edit(b, d => addItem(d, 'new', 'g'));
    const {data, conflicts} = mergeData(b, local, remote);
    expect(conflicts).toEqual([]);
    expect(data.projects[0].groups).toEqual([]);
    expect(data.items.find(i => i.id === old.id)?.groupId).toBeUndefined();
    // Kept; its group id points nowhere, which shows as no group.
    expect(data.items.find(i => i.id === 'new')?.groupId).toBe('g');
  });

  it('keeps groups added on both devices', () => {
    const b = grouped();
    const local = edit(b, d => d.projects[0].groups.push(group('mine', 'A')));
    const remote = edit(b, d =>
      d.projects[0].groups.push(group('theirs', 'B')),
    );
    const {data, conflicts} = mergeData(b, local, remote);
    expect(conflicts).toEqual([]);
    // Theirs goes right after the group it follows there.
    expect(data.projects[0].groups.map(g => g.id)).toEqual([
      'g',
      'theirs',
      'mine',
    ]);
  });
});

describe('record order', () => {
  const group = (id: string, name: string) =>
    create(pb.ItemGroupSchema, {id, name});
  /** The first project with groups a, b and c, in that order. */
  function abc() {
    return edit(base(), d =>
      d.projects[0].groups.push(
        group('a', 'A'),
        group('b', 'B'),
        group('c', 'C'),
      ),
    );
  }
  const ids = (d: AppData) => d.projects[0].groups.map(g => g.id);
  const move = (d: AppData, from: number, to: number) => {
    const gs = d.projects[0].groups;
    gs.splice(to, 0, ...gs.splice(from, 1));
  };

  it('takes groups reordered on the other device, with a rename made here', () => {
    const b = abc();
    const local = edit(b, d => (d.projects[0].groups[1].name = 'Lectures'));
    const remote = edit(b, d => move(d, 2, 0));
    const {data, conflicts} = mergeData(b, local, remote);
    expect(conflicts).toEqual([]);
    expect(ids(data)).toEqual(['c', 'a', 'b']);
    expect(data.projects[0].groups[2].name).toBe('Lectures');
  });

  it('keeps an order changed here, with a rename made there', () => {
    const b = abc();
    const local = edit(b, d => move(d, 0, 2));
    const remote = edit(b, d => (d.projects[0].groups[0].name = 'Classes'));
    const {data} = mergeData(b, local, remote);
    expect(ids(data)).toEqual(['b', 'c', 'a']);
    expect(data.projects[0].groups[2].name).toBe('Classes');
  });

  it('keeps this device’s order when both reordered', () => {
    const b = abc();
    const local = edit(b, d => move(d, 0, 2));
    const remote = edit(b, d => move(d, 2, 0));
    expect(ids(mergeData(b, local, remote).data)).toEqual(['b', 'c', 'a']);
  });

  it('places a record added here after the one it follows, in their order', () => {
    const b = abc();
    const local = edit(b, d =>
      d.projects[0].groups.splice(1, 0, group('new', 'N')),
    );
    const remote = edit(b, d => move(d, 0, 2));
    // Their order (b, c, a), with the new one right after a, as here.
    expect(ids(mergeData(b, local, remote).data)).toEqual([
      'b',
      'c',
      'a',
      'new',
    ]);
  });

  it('takes areas reordered there and drops one deleted here', () => {
    const b = edit(base(), d =>
      d.areas.push(create(pb.AreaSchema, {id: 'x', name: 'Extra'})),
    );
    const local = edit(b, d => (d.areas = d.areas.filter(a => a.id !== 'x')));
    const remote = edit(b, d => d.areas.reverse());
    const {data} = mergeData(b, local, remote);
    expect(data.areas.map(a => a.id)).toEqual(
      b.areas
        .map(a => a.id)
        .filter(id => id !== 'x')
        .reverse(),
    );
  });
});
