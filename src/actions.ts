import type { Allocation, CalendarEvent, Item } from './model/types';
import { useStore } from './store';
import { withUndo } from './toast';

/**
 * User-level operations, all undoable with Ctrl+Z. Direct manipulation (drag,
 * resize, ticking off) is recorded quietly because its result is already
 * visible; destructive or bulk actions also show a toast with Undo.
 */
const s = () => useStore.getState();

export const toggleSession = (id: string) => withUndo('Session updated', () => s().toggleAllocation(id), { quiet: true });

export const updateSession = (id: string, patch: Partial<Omit<Allocation, 'id'>>, message = 'Session moved') =>
  withUndo(message, () => s().updateAllocation(id, patch), { quiet: true });

export const planSession = (itemId: string, date: string, hours: number) =>
  withUndo('Planned', () => s().addAllocation(itemId, date, hours), { quiet: true });

export const removeSession = (id: string, message = 'Removed from plan') => withUndo(message, () => s().deleteAllocation(id));

export const updateEvent = (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>, message = 'Event moved') =>
  withUndo(message, () => s().updateEvent(id, patch), { quiet: true });

export const deleteEvent = (e: CalendarEvent) => withUndo(`Deleted “${e.title}”`, () => s().deleteEvent(e.id));

export const completeItem = (item: Item) => withUndo(`Completed “${item.title}”`, () => s().updateItem(item.id, { status: 'done' }));

export const deleteItem = (item: Item) => withUndo(`Deleted “${item.title}”`, () => s().deleteItem(item.id));
