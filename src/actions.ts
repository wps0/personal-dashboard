import {ALL_DAY_TASK_SESSION_HOURS} from './config';
import {
  ItemKind,
  ItemStatus,
  type Allocation,
  type Area,
  type CalendarEvent,
  type ISODate,
  type Item,
  type ItemGroup,
  type ItemInit,
  type WorkSpan,
} from './model/types';
import * as pb from './gen/dashboard/data_pb';
import {fmtDuration, fmtWorkSpan} from './format';
import {addDays, formatMedium, todayISO} from './model/dates';
import {
  changeEvent,
  deleteEvent as deleteFromEvents,
  occurrenceKey,
  parseKey,
  restoreOccurrence,
  type EventPatch,
  type Scope,
} from './model/recurrence';
import {importGroup, statusLabel} from './model/selectors';
import {plannedWork, targetKey, weekHours, weekTarget} from './model/work';
import {useStore} from './store';
import {withUndo} from './toast';
import {meetingHours, taskFromMeeting, type Proposal} from './usos/usos';
import {endMinutes, fromMinutes, showEnd, toMinutes} from './model/time';

/**
 * User-level operations, all undoable with Ctrl+Z. Direct manipulation (drag,
 * resize, ticking off) is recorded quietly because its result is already
 * visible; destructive or bulk actions also show a toast with Undo.
 */
function s() {
  return useStore.getState();
}

export function toggleSession(id: string) {
  const done = s().data.allocations.find(a => a.id === id)?.done;
  withUndo(
    done ? 'Session marked not done' : 'Session marked done',
    () => s().toggleAllocation(id),
    {quiet: true},
  );
}

export function updateSession(
  id: string,
  patch: Partial<Omit<Allocation, 'id'>>,
  message = 'Session moved',
) {
  withUndo(message, () => s().updateAllocation(id, patch), {quiet: true});
}

export function planSession(
  itemId: string,
  date: string,
  hours: number,
  message = 'Planned',
  {quiet = true} = {},
) {
  withUndo(message, () => s().addAllocation(itemId, date, hours), {quiet});
}

/** Plans a task's suggested sessions (untimed), in one undoable step. */
export function planSessions(
  itemId: string,
  sessions: readonly {date: ISODate; hours: number}[],
) {
  const n = sessions.length;
  withUndo(`Planned ${n} ${n === 1 ? 'session' : 'sessions'}`, () => {
    for (const x of sessions) s().addAllocation(itemId, x.date, x.hours);
  });
}

export function removeSession(id: string, message = 'Removed from plan') {
  withUndo(message, () => s().deleteAllocation(id));
}

/**
 * Changes the event shown as `key` (see model/recurrence), quietly: on a
 * repeating event's occurrence, `scope` says which occurrences change.
 * Returns the key the changed event is shown as now.
 */
export function editEvent(
  key: string,
  scope: Scope,
  patch: EventPatch,
  message = 'Event changed',
): string {
  let shown = key;
  withUndo(
    message,
    () => {
      const r = changeEvent(s().data.events, key, scope, patch, () =>
        crypto.randomUUID(),
      );
      s().setEvents(r.events);
      shown = r.key;
    },
    {quiet: true},
  );
  return shown;
}

/**
 * A change made on the calendar (drag, resize): a repeating event's
 * occurrence changes that day only.
 */
export function updateEvent(
  key: string,
  patch: EventPatch,
  message = 'Event moved',
): string {
  return editEvent(key, 'this', patch, message);
}

/**
 * Drops the changes made to one occurrence of a repeating event (`e`, an
 * event of its own since): the repeating event happens there again. Returns
 * the key it's shown as.
 */
export function backToSeries(e: CalendarEvent): string {
  withUndo('Back to the repeating event', () =>
    s().setEvents(restoreOccurrence(s().data.events, e.id)),
  );
  return occurrenceKey(e.seriesId!, e.seriesDate!);
}

/** Deletes the event shown as `e`; for an occurrence, `scope` says which. */
export function deleteEvent(e: CalendarEvent, scope: Scope = 'this') {
  const {date} = parseKey(e.id);
  const message =
    date === undefined || scope === 'all'
      ? `Deleted “${e.title}”`
      : scope === 'this'
        ? `Deleted “${e.title}” on ${formatMedium(date)}`
        : `Deleted “${e.title}” from ${formatMedium(date)} on`;
  withUndo(message, () =>
    s().setEvents(deleteFromEvents(s().data.events, e.id, scope)),
  );
}

/**
 * An event's length in hours, or undefined when it has none to give a
 * session: all day, or running past midnight (sleep).
 */
export function eventHours(e: CalendarEvent): number | undefined {
  if (e.allDay) return undefined;
  const min = endMinutes(e.end) - toMinutes(e.start);
  return min > 0 ? min / 60 : undefined;
}

/** Whether the event shown as `e` could become a session: not past midnight. */
export function canBeSession(e: CalendarEvent): boolean {
  return e.allDay || eventHours(e) !== undefined;
}

/**
 * Turns the event shown as `e` (for a repeating one, that day's occurrence;
 * the rest keep repeating) into a new task in `projectId`, planned where the
 * event was: at its time, or without one for an all-day event. Its title and
 * description go with it. One undo step; returns the task's id.
 */
export function eventToTask(
  e: CalendarEvent,
  projectId: string,
  kind: ItemKind = ItemKind.TASK,
): string {
  const project = s().data.projects.find(p => p.id === projectId);
  const hours = eventHours(e);
  const title = e.title.trim() || 'Untitled';
  let id = '';
  withUndo(
    `“${title}” is now a task in ${project?.name ?? 'a project'}`,
    () => {
      [id] = s().addItems(projectId, [
        {kind, title, notes: e.notes || undefined, estimateHours: hours},
      ]);
      if (hours === undefined)
        s().addAllocation(id, e.date, ALL_DAY_TASK_SESSION_HOURS);
      else s().addAllocation(id, e.date, hours, e.start);
      s().setEvents(deleteFromEvents(s().data.events, e.id, 'this'));
    },
  );
  return id;
}

/**
 * Adds a session for `item` (inside the caller's undo step). For a task
 * that's already done, a session on a day up to today is done too: it
 * records time spent on it, rather than waiting to be ticked off.
 */
export function addSessionFor(
  item: Item,
  date: ISODate,
  hours: number,
  start?: string,
): string {
  const id = s().addAllocation(item.id, date, hours, start);
  if (item.status === ItemStatus.DONE && date <= todayISO())
    s().updateAllocation(id, {done: true});
  return id;
}

/**
 * Turns the event shown as `e` into time planned for an existing task: a
 * session at the event's time (that day's occurrence of a repeating one).
 * One undo step.
 */
export function eventToSession(e: CalendarEvent, itemId: string) {
  const item = s().data.items.find(i => i.id === itemId);
  const hours = eventHours(e);
  if (!item || hours === undefined) return;
  withUndo(`“${e.title}” is now time for “${item.title}”`, () => {
    addSessionFor(item, e.date, hours, e.start);
    s().setEvents(deleteFromEvents(s().data.events, e.id, 'this'));
  });
}

/**
 * Makes the event shown as `key` reserved time, or reserved time an event,
 * for the occurrences `scope` says. Returns the key it's shown as now.
 */
export function setEventKind(
  key: string,
  scope: Scope,
  kind: pb.EventKind,
): string {
  let shown = key;
  withUndo(
    kind === pb.EventKind.RESERVED ? 'Now reserved time' : 'Now an event',
    () => {
      const r = changeEvent(s().data.events, key, scope, {kind}, () =>
        crypto.randomUUID(),
      );
      s().setEvents(r.events);
      shown = r.key;
    },
  );
  return shown;
}

/**
 * Turns a planned session back into an event of its own, named after its
 * task, at its time (all day when it has none). The task stays. One undo
 * step.
 */
export function sessionToEvent(alloc: Allocation) {
  const item = s().data.items.find(i => i.id === alloc.itemId);
  const title = item?.title ?? 'Untitled';
  const {start} = alloc;
  withUndo(`“${title}” on ${formatMedium(alloc.date)} is now an event`, () => {
    s().addEvent({
      date: alloc.date,
      start: start ?? '09:00',
      end: start
        ? fromMinutes(
            Math.min(
              toMinutes(start) + Math.round(alloc.plannedHours * 60),
              24 * 60 - 1,
            ),
          )
        : '10:00',
      allDay: !start,
      title,
    });
    s().deleteAllocation(alloc.id);
  });
}

/**
 * Adds reserved time (sleep, work): a reserved event, which may repeat. It's
 * drawn hatched and takes capacity, like an event.
 */
export function addReserved(
  r: Pick<CalendarEvent, 'date' | 'start' | 'end' | 'title' | 'recurrence'>,
) {
  withUndo(`Reserved ${r.start} – ${showEnd(r.end)}`, () =>
    s().addEvent({...r, kind: pb.EventKind.RESERVED}),
  );
}

/** Logs a stretch of work on `date`. */
export function logWork(date: ISODate, start: string, end: string) {
  withUndo(
    `Logged ${start} – ${showEnd(end)}`,
    () => void s().addWorkSpan(date, start, end),
    {quiet: true},
  );
}

/**
 * Logs `hours` worked on `date` without a time of day. Returns its id.
 */
export function logHours(date: ISODate, hours: number): string {
  let id = '';
  withUndo(
    `Logged ${fmtDuration(hours)}`,
    () => void (id = s().addWorkHours(date, hours)),
    {quiet: true},
  );
  return id;
}

/**
 * Logs `date`'s planned work (its reserved time labelled as work) as worked,
 * in one step. Returns how many stretches were logged.
 */
export function logAsPlanned(date: ISODate): number {
  const {events, settings} = s().data;
  const planned = plannedWork(events, date, settings.workLabel);
  if (planned.length)
    withUndo('Logged as planned', () => {
      for (const p of planned) s().addWorkSpan(date, p.start, p.end);
    });
  return planned.length;
}

export function updateWorkSpan(
  id: string,
  patch: Partial<Pick<WorkSpan, 'start' | 'end' | 'note' | 'hours'>>,
) {
  withUndo('Work log changed', () => s().updateWorkSpan(id, patch), {
    quiet: true,
  });
}

export function deleteWorkSpan(span: WorkSpan) {
  withUndo(`Removed ${fmtWorkSpan(span)} from the work log`, () =>
    s().deleteWorkSpan(span.id),
  );
}

/**
 * The own target of the week starting on `start` (kept under its Monday,
 * see targetKey), or `null` for the default.
 */
export function setWeekTarget(start: ISODate, hours: number | null) {
  withUndo(
    'Weekly target changed',
    () => s().setWeekWorkTarget(targetKey(start), hours),
    {
      quiet: true,
    },
  );
}

/**
 * Moves a task on with one tap: to do → in progress → done → to do. Quiet,
 * so a slip is undone from the undo bar (or with Ctrl+Z).
 */
export function advanceStatus(item: Item) {
  const next =
    item.status === ItemStatus.TODO
      ? ItemStatus.DOING
      : item.status === ItemStatus.DOING
        ? ItemStatus.DONE
        : ItemStatus.TODO;
  withUndo(
    `“${item.title}”: ${statusLabel(next).toLowerCase()}`,
    () => s().updateItem(item.id, {status: next}),
    {quiet: true},
  );
}

/**
 * Moves what the week starting `start` is short of its target, or over it,
 * to the next week's target: this week's target becomes the hours logged,
 * and the next one's grows (or shrinks) by the difference, so the two add up
 * to the same. Once done there's nothing left to move. One undo step.
 */
export function carryOver(start: ISODate) {
  const {settings, workLog} = s().data;
  const target = weekTarget(settings, start);
  const logged = weekHours(workLog, start);
  // In whole minutes, as the log is.
  const diff = Math.round((target - logged) * 60) / 60;
  if (!target || !diff) return;
  const next = addDays(start, 7);
  withUndo(
    diff > 0
      ? `Added ${fmtDuration(diff)} to next week's target`
      : `Took ${fmtDuration(-diff)} off next week's target`,
    () => {
      s().setWeekWorkTarget(targetKey(start), logged);
      s().setWeekWorkTarget(
        targetKey(next),
        Math.max(0, weekTarget(settings, next) + diff),
      );
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

/**
 * Deletes an area with its projects, their tasks and planned time, in one
 * undo step (no question first: Undo brings it all back).
 */
export function deleteArea(area: Area) {
  const n = s().data.projects.filter(p => p.areaId === area.id).length;
  withUndo(
    n
      ? `Deleted “${area.name}” and its ${n} ${n === 1 ? 'project' : 'projects'}`
      : `Deleted “${area.name}”`,
    () => s().deleteArea(area.id),
  );
}

export function moveArea(id: string, index: number) {
  withUndo('Area moved', () => s().moveArea(id, index), {quiet: true});
}

export function moveGroup(projectId: string, groupId: string, index: number) {
  withUndo('Group moved', () => s().moveGroup(projectId, groupId, index), {
    quiet: true,
  });
}

/**
 * Folds a group away, or unfolds it; `null` is "No group". Kept in the data,
 * so it syncs. Undoable like any change, since undo needs every change of the
 * data in its history.
 */
export function foldGroup(
  projectId: string,
  groupId: string | null,
  collapsed: boolean,
) {
  withUndo(
    collapsed ? 'Group folded' : 'Group unfolded',
    () => s().setGroupCollapsed(projectId, groupId, collapsed),
    {quiet: true},
  );
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
/** Adds the tasks made from a prompt (SPEC 5.4) to a project, in one undo step. */
export function addPromptTasks(projectId: string, items: ItemInit[]) {
  const n = items.length;
  withUndo(
    `Added ${n} ${n === 1 ? 'task' : 'tasks'} from the prompt`,
    () => void s().addItems(projectId, items),
  );
}

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
