import {
  ItemStatus,
  type Allocation,
  type CalendarEvent,
  type Item,
  type ItemGroup,
  type ItemInit,
} from './model/types';
import {importGroup} from './model/selectors';
import {useStore} from './store';
import {withUndo} from './toast';
import {meetingHours, taskFromMeeting, type Proposal} from './usos/usos';

/**
 * User-level operations, all undoable with Ctrl+Z. Direct manipulation (drag,
 * resize, ticking off) is recorded quietly because its result is already
 * visible; destructive or bulk actions also show a toast with Undo.
 */
function s() {
  return useStore.getState();
}

export function toggleSession(id: string) {
  withUndo('Session updated', () => s().toggleAllocation(id), {quiet: true});
}

export function updateSession(
  id: string,
  patch: Partial<Omit<Allocation, 'id'>>,
  message = 'Session moved',
) {
  withUndo(message, () => s().updateAllocation(id, patch), {quiet: true});
}

export function planSession(itemId: string, date: string, hours: number) {
  withUndo('Planned', () => s().addAllocation(itemId, date, hours), {
    quiet: true,
  });
}

export function removeSession(id: string, message = 'Removed from plan') {
  withUndo(message, () => s().deleteAllocation(id));
}

export function updateEvent(
  id: string,
  patch: Partial<Omit<CalendarEvent, 'id'>>,
  message = 'Event moved',
) {
  withUndo(message, () => s().updateEvent(id, patch), {quiet: true});
}

export function deleteEvent(e: CalendarEvent) {
  withUndo(`Deleted “${e.title}”`, () => s().deleteEvent(e.id));
}

export function completeItem(item: Item) {
  withUndo(`Completed “${item.title}”`, () =>
    s().updateItem(item.id, {status: ItemStatus.DONE}),
  );
}

export function deleteItem(item: Item) {
  withUndo(`Deleted “${item.title}”`, () => s().deleteItem(item.id));
}

/** Adds a group at the end of the project's groups; returns its id. */
export function addGroup(projectId: string, name: string): string {
  let id = '';
  const add = () => {
    id = s().addGroup(projectId, name);
  };
  withUndo(`Added group “${name}”`, add, {quiet: true});
  return id;
}

export function renameGroup(projectId: string, groupId: string, name: string) {
  withUndo('Group renamed', () => s().renameGroup(projectId, groupId, name), {
    quiet: true,
  });
}

export function moveGroup(projectId: string, groupId: string, index: number) {
  withUndo('Group moved', () => s().moveGroup(projectId, groupId, index), {
    quiet: true,
  });
}

/** Deletes a group; its items stay in the project, in no group. */
export function deleteGroup(projectId: string, group: ItemGroup) {
  withUndo(`Deleted group “${group.name}”`, () =>
    s().deleteGroup(projectId, group.id),
  );
}

/**
 * Moves items into a group, or out of any (`undefined`). Moving one item is
 * quiet, since the row moves; moving several shows a toast with Undo.
 */
export function moveToGroup(items: Item[], group: ItemGroup | undefined) {
  const where = group ? `“${group.name}”` : 'no group';
  const n = items.length;
  withUndo(
    n === 1
      ? `Moved “${items[0].title}” to ${where}`
      : `Moved ${n} items to ${where}`,
    () =>
      s().moveToGroup(
        items.map(i => i.id),
        group?.id,
      ),
    {quiet: n === 1},
  );
}

/**
 * Adds imported items to a project, in the group `groupId` ('' for none),
 * and remembers that group for the project's next import.
 */
function addImported(projectId: string, items: ItemInit[], groupId: string) {
  const ids = s().addItems(
    projectId,
    items.map(i => ({...i, groupId: groupId || undefined})),
  );
  const p = s().data.projects.find(x => x.id === projectId);
  if (p && (p.importGroupId ?? '') !== groupId)
    s().updateProject(projectId, {importGroupId: groupId || undefined});
  return ids;
}

/** Where a project's imports go: the group picked in `targets`, else its import group. */
function targetOf(projectId: string, targets: ReadonlyMap<string, string>) {
  const p = s().data.projects.find(x => x.id === projectId);
  return targets.get(projectId) ?? (p && importGroup(p)?.id) ?? '';
}

/**
 * Imports the chosen USOS classes as tasks, each planned as a session at the
 * class's own day, time and length, into the group picked for its project in
 * `targets` (by project id; '' for no group, missing for the project's
 * import group). The classes shown but not chosen are remembered as skipped;
 * the imported ones are known by their tasks, so deleting a task (or its
 * project) offers its class again. One undo step.
 */
export function importClasses(
  chosen: Proposal[],
  shown: Proposal[],
  targets: ReadonlyMap<string, string> = new Map(),
) {
  const n = chosen.length;
  const message = n
    ? `Imported ${n} ${n === 1 ? 'class' : 'classes'} from USOS`
    : `Skipped ${shown.length} ${shown.length === 1 ? 'class' : 'classes'}`;
  withUndo(message, () => {
    const byProject = new Map<string, Proposal[]>();
    for (const p of chosen)
      byProject.set(p.projectId, [...(byProject.get(p.projectId) ?? []), p]);
    for (const [projectId, list] of byProject) {
      const ids = addImported(
        projectId,
        list.map(p => taskFromMeeting(p.meeting)),
        targetOf(projectId, targets),
      );
      list.forEach(({meeting: m}, k) => {
        const hours = meetingHours(m);
        if (hours > 0) s().addAllocation(ids[k], m.date, hours, m.start);
      });
    }
    const keys = new Set(chosen.map(p => p.meeting.key));
    s().markUsosHandled(
      shown.map(p => p.meeting.key).filter(k => !keys.has(k)),
    );
  });
}

/**
 * Creates a curriculum's class items in the group `groupId` ('' for none),
 * remembered for the project's next import, and appends the course notes,
 * if any, to the project's overview. One undo step.
 */
export function importCurriculum(
  projectId: string,
  items: ItemInit[],
  groupId: string,
  notes = '',
) {
  const n = items.length;
  withUndo(
    `Imported ${n} ${n === 1 ? 'class' : 'classes'} from the curriculum`,
    () => {
      addImported(projectId, items, groupId);
      const p = s().data.projects.find(x => x.id === projectId);
      if (p && notes.trim())
        s().updateProject(projectId, {
          overviewDoc:
            `${p.overviewDoc.trimEnd()}\n\n## Course notes\n\n${notes.trim()}\n`.trimStart(),
        });
    },
  );
}
