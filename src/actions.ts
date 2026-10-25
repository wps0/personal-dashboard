import {
  ItemStatus,
  type Allocation,
  type CalendarEvent,
  type Item,
} from './model/types';
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

/**
 * Imports the chosen USOS classes as tasks, each planned as a session at the
 * class's own day, time and length. The classes shown but not chosen are
 * remembered as skipped; the imported ones are known by their tasks, so
 * deleting a task (or its project) offers its class again. One undo step.
 */
export function importClasses(chosen: Proposal[], shown: Proposal[]) {
  const n = chosen.length;
  const message = n
    ? `Imported ${n} ${n === 1 ? 'class' : 'classes'} from USOS`
    : `Skipped ${shown.length} ${shown.length === 1 ? 'class' : 'classes'}`;
  withUndo(message, () => {
    const byProject = new Map<string, Proposal[]>();
    for (const p of chosen)
      byProject.set(p.projectId, [...(byProject.get(p.projectId) ?? []), p]);
    for (const [projectId, list] of byProject) {
      const ids = s().addItems(
        projectId,
        list.map(p => taskFromMeeting(p.meeting)),
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
