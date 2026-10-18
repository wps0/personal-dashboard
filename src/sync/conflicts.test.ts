import {describe as group, expect, it} from 'vitest';
import {sampleData} from '../model/sample';
import type {AppData} from '../model/types';
import {applyChoices, describe, keptSide} from './conflicts';
import {mergeData} from './merge';

function base() {
  return structuredClone(sampleData('2026-10-12'));
}
function edit(d: AppData, f: (d: AppData) => void) {
  const c = structuredClone(d);
  f(c);
  return c;
}

/** Both devices changed the first task's title and the first event. */
function conflicted() {
  const b = edit(base(), d => (d.items[0].dueDate = '2026-10-15'));
  const local = edit(b, d => {
    d.items[0].title = 'Local title';
    d.items[0].dueDate = '2026-10-20';
    d.events = d.events.slice(1); // deleted here
  });
  const remote = edit(b, d => {
    d.items[0].title = 'Remote title';
    d.items[0].dueDate = undefined;
    d.events[0].title = 'Moved there';
  });
  return {b, ...mergeData(b, local, remote)};
}

group('describe', () => {
  it('names the record and the field, with both values in words', () => {
    const {data, conflicts} = conflicted();
    const views = conflicts.map(c => describe(c, data));
    expect(views).toContainEqual({
      what: 'Task “Local title”',
      field: 'title',
      local: 'Local title',
      remote: 'Remote title',
    });
    expect(views).toContainEqual({
      what: 'Task “Local title”',
      field: 'due date',
      local: '2026-10-20',
      remote: 'Empty',
    });
    expect(views).toContainEqual({
      what: 'Event “Moved there”',
      field: '',
      local: 'Deleted',
      remote: 'Edited',
    });
  });

  it('describes notes, settings and sessions', () => {
    const data = base();
    const alloc = data.allocations[0];
    const item = data.items.find(i => i.id === alloc.itemId)!;
    expect(
      describe(
        {path: ['dayNotes', '2026-10-13'], local: 'a', remote: 'b'},
        data,
      ).what,
    ).toBe('Note for 13 Oct');
    expect(
      describe(
        {
          path: ['settings', 'defaultEventMinutes'],
          local: 30,
          remote: 45,
        },
        data,
      ),
    ).toEqual({
      what: 'Settings',
      field: 'defaultEventMinutes',
      local: '30',
      remote: '45',
    });
    expect(
      describe(
        {path: ['allocations', alloc.id, 'done'], local: true, remote: false},
        data,
      ),
    ).toMatchObject({
      what: `Session on ${alloc.date.slice(8).replace(/^0/, '')} Oct of “${item.title}”`,
      field: 'done',
      local: 'Yes',
      remote: 'No',
    });
  });
});

group('applyChoices', () => {
  it('keeps everything as merged when this device’s side is chosen', () => {
    const {data, conflicts} = conflicted();
    const choices = conflicts.map(conflict => ({
      conflict,
      side: keptSide(conflict),
    }));
    expect(applyChoices(data, choices)).toEqual({data, skipped: 0});
  });

  it('applies the other side, including clearing a field', () => {
    const {data, conflicts} = conflicted();
    const id = data.items[0].id;
    const out = applyChoices(
      data,
      conflicts
        .filter(c => c.path[0] === 'items')
        .map(conflict => ({conflict, side: 'remote' as const})),
    );
    expect(out.skipped).toBe(0);
    const item = out.data.items.find(i => i.id === id)!;
    expect(item.title).toBe('Remote title');
    expect('dueDate' in item).toBe(false);
    expect(out.data.items.length).toBe(data.items.length);
  });

  it('can confirm a deletion the merge undid', () => {
    const {b, data, conflicts} = conflicted();
    const ev = conflicts.find(c => c.path[0] === 'events')!;
    expect(keptSide(ev)).toBe('remote');
    const out = applyChoices(data, [{conflict: ev, side: 'local'}]);
    expect(out.data.events.some(e => e.id === b.events[0].id)).toBe(false);
    expect(out.data.events.length).toBe(b.events.length - 1);
  });

  it('never overwrites a value edited since the sync', () => {
    const {data, conflicts} = conflicted();
    const title = conflicts.find(c => c.path.at(-1) === 'title')!;
    const later = edit(data, d => (d.items[0].title = 'Typed afterwards'));
    const out = applyChoices(later, [{conflict: title, side: 'remote'}]);
    expect(out.skipped).toBe(1);
    expect(out.data.items[0].title).toBe('Typed afterwards');
  });

  it('deleting a project also deletes its tasks and sessions', () => {
    const b = base();
    const project = b.projects.find(p =>
      b.items.some(
        i => i.projectId === p.id && b.allocations.some(a => a.itemId === i.id),
      ),
    )!;
    const local = edit(b, d => {
      d.projects = d.projects.filter(p => p.id !== project.id);
    });
    const remote = edit(b, d => {
      d.projects.find(p => p.id === project.id)!.name = 'Renamed there';
    });
    const {data, conflicts} = mergeData(b, local, remote);
    expect(data.items.some(i => i.projectId === project.id)).toBe(true);
    const c = conflicts.find(x => x.path[0] === 'projects')!;
    const out = applyChoices(data, [{conflict: c, side: 'local'}]);
    expect(out.data.projects.some(p => p.id === project.id)).toBe(false);
    expect(out.data.items.some(i => i.projectId === project.id)).toBe(false);
    const items = new Set(data.items.map(i => i.id));
    expect(
      out.data.allocations.every(a => items.has(a.itemId)) &&
        out.data.allocations.length < data.allocations.length,
    ).toBe(true);
  });
});
