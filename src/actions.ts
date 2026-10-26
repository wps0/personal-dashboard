import {
  ItemStatus,
  type Allocation,
  type CalendarEvent,
  type ISODate,
  type Item,
  type ItemGroup,
  type ItemInit,
  type WorkSpan,
} from './model/types';
import {create as createMessage} from '@bufbuild/protobuf';
import * as pb from './gen/dashboard/data_pb';
import {reservedRanges, type Reserved} from './model/capacity';
import {importGroup} from './model/selectors';
import {fromMinutes, toMinutes} from './model/time';
import {plannedWork} from './model/work';
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

/**
 * Sets a day's reserved time to `edit` of a copy of its ranges (its weekday's,
 * until the day has its own). Other days keep the weekday's.
 */
function editReserved(date: ISODate, edit: (ranges: Reserved[]) => Reserved[]) {
  const {capacityRules, dayCapacity} = s().data.settings;
  s().setDayReserved(
    date,
    edit([...reservedRanges(capacityRules, dayCapacity, date)]),
  );
}

/** Changes one of a day's reserved ranges (by its index in the day's). */
export function updateReserved(
  date: ISODate,
  index: number,
  patch: Partial<Pick<Reserved, 'start' | 'end' | 'label'>>,
  message = 'Reserved time changed',
) {
  withUndo(
    message,
    () =>
      editReserved(date, ranges =>
        ranges.map((r, i) => (i === index ? {...r, ...patch} : r)),
      ),
    {quiet: true},
  );
}

/** Moves a reserved range to `start` minutes on `to`, keeping its length. */
export function moveReserved(
  from: ISODate,
  index: number,
  to: ISODate,
  start: number,
) {
  const {capacityRules, dayCapacity} = s().data.settings;
  const r = reservedRanges(capacityRules, dayCapacity, from)[index];
  // Dropped where it was: leave the day on its weekday's reserved time.
  if (!r || (to === from && fromMinutes(start) === r.start)) return;
  const len = toMinutes(r.end) - toMinutes(r.start);
  const moved = {
    ...r,
    start: fromMinutes(start),
    end: fromMinutes(Math.min(start + len, 24 * 60 - 1)),
  };
  withUndo(
    'Reserved time moved',
    () => {
      if (to === from) {
        editReserved(from, ranges =>
          ranges.map((x, i) => (i === index ? moved : x)),
        );
        return;
      }
      editReserved(from, ranges => ranges.filter((_, i) => i !== index));
      editReserved(to, ranges => [...ranges, moved]);
    },
    {quiet: true},
  );
}

/** Adds a reserved range to a day (which then keeps its own reserved time). */
export function addReserved(
  date: ISODate,
  r: Pick<Reserved, 'start' | 'end' | 'label'>,
) {
  withUndo(`Reserved ${r.start} – ${r.end}`, () =>
    editReserved(date, ranges => [
      ...ranges,
      createMessage(pb.TimeRangeSchema, r),
    ]),
  );
}

/** Removes one of a day's reserved ranges; the weekday's other days keep it. */
export function deleteReserved(date: ISODate, index: number) {
  withUndo('Removed reserved time', () =>
    editReserved(date, ranges => ranges.filter((_, i) => i !== index)),
  );
}

/** Gives a day its weekday's reserved time back. */
export function resetReserved(date: ISODate) {
  withUndo('Back to the weekly reserved time', () =>
    s().setDayReserved(date, null),
  );
}

/** Logs a stretch of work on `date`. */
export function logWork(date: ISODate, start: string, end: string) {
  withUndo(
    `Logged ${start} – ${end}`,
    () => void s().addWorkSpan(date, start, end),
    {quiet: true},
  );
}

/**
 * Logs `date`'s planned work (its reserved time labelled as work) as worked,
 * in one step. Returns how many stretches were logged.
 */
export function logAsPlanned(date: ISODate): number {
  const {capacityRules, dayCapacity, workLabel} = s().data.settings;
  const planned = plannedWork(capacityRules, dayCapacity, date, workLabel);
  if (planned.length)
    withUndo('Logged as planned', () => {
      for (const p of planned) s().addWorkSpan(date, p.start, p.end);
    });
  return planned.length;
}

export function updateWorkSpan(
  id: string,
  patch: Partial<Pick<WorkSpan, 'start' | 'end' | 'note'>>,
) {
  withUndo('Work log changed', () => s().updateWorkSpan(id, patch), {
    quiet: true,
  });
}

export function deleteWorkSpan(span: WorkSpan) {
  withUndo(`Removed ${span.start} – ${span.end} from the work log`, () =>
    s().deleteWorkSpan(span.id),
  );
}

/** One week's own target (by its Monday), or `null` for the default. */
export function setWeekTarget(monday: ISODate, hours: number | null) {
  withUndo(
    'Weekly target changed',
    () => s().setWeekWorkTarget(monday, hours),
    {
      quiet: true,
    },
  );
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
 * Imports the chosen USOS classes as tasks, into the group picked for their
 * project in `targets` (by project id; '' for no group, missing for the
 * project's import group). Those in `onCalendar` (by key) are also planned as
 * a session at the class's own day, time and length. The classes shown but
 * not chosen are remembered as skipped; the imported ones are known by their
 * tasks, so deleting a task (or its project) offers its class again. One
 * undo step.
 */
export function importClasses(
  chosen: Proposal[],
  shown: Proposal[],
  onCalendar: ReadonlySet<string>,
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
        if (hours > 0 && onCalendar.has(m.key))
          s().addAllocation(ids[k], m.date, hours, m.start);
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
