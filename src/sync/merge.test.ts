import {describe, expect, it} from 'vitest';
import {sampleData} from '../model/sample';
import type {AppData} from '../model/types';
import {merge3, mergeData, same} from './merge';

const base = () => structuredClone(sampleData('2026-10-12'));
const edit = (d: AppData, f: (d: AppData) => void) => {
  const c = structuredClone(d);
  f(c);
  return c;
};

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
    const entry = (id: string) => ({id, at: '2026-10-13T10:00:00Z', text: id});
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

  it('drops records whose parent the other side deleted, and only those', () => {
    const b = base();
    const project = b.projects.find(p =>
      b.items.some(
        i => i.projectId === p.id && b.allocations.some(a => a.itemId === i.id),
      ),
    )!;
    const item = b.items.find(
      i =>
        i.projectId === project.id &&
        b.allocations.some(a => a.itemId === i.id),
    )!;
    const local = edit(b, d => {
      d.projects = d.projects.filter(p => p.id !== project.id);
      const items = new Set(
        d.items.filter(i => i.projectId === project.id).map(i => i.id),
      );
      d.items = d.items.filter(i => !items.has(i.id));
      d.allocations = d.allocations.filter(a => !items.has(a.itemId));
    });
    const remote = edit(b, d => {
      d.items.find(i => i.id === item.id)!.title = 'Edited on the phone';
      // Never had a project: not the merge's business.
      d.items.push({...d.items[0], id: 'stray', projectId: 'missing'});
    });
    const {data} = mergeData(b, local, remote);
    expect(data.items.some(i => i.id === item.id)).toBe(false);
    expect(data.allocations.some(a => a.itemId === item.id)).toBe(false);
    expect(data.items.some(i => i.id === 'stray')).toBe(true);
  });
});
