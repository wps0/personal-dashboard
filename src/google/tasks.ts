/**
 * @fileoverview Google Tasks, read-only: the tasks with a due date, shown on
 * the calendar's days like the app's own deadlines. Only GET requests, with
 * the tasks.readonly scope (see auth.ts).
 */
import {addDays} from '../model/dates';
import type {ISODate} from '../model/types';
import {googleFetch} from './request';

const BASE = 'https://tasks.googleapis.com/tasks/v1';

/** The parts of a task list that matter here. */
export interface ApiTaskList {
  id: string;
  title?: string;
}

/** The parts of a task that matter here. */
export interface ApiTask {
  id: string;
  title?: string;
  notes?: string;
  status?: 'needsAction' | 'completed';
  /** RFC 3339, but only the date counts: Google keeps no time of day. */
  due?: string;
  webViewLink?: string;
  deleted?: boolean;
}

/** A Google task on its due day. */
export interface GTask {
  /** Unique across lists: "list id/task id". */
  key: string;
  title: string;
  notes?: string;
  done: boolean;
  due: ISODate;
  listTitle: string;
  /** Opens it in Google Tasks. */
  link?: string;
}

async function paged<T>(
  path: string,
  params: Record<string, string>,
): Promise<T[]> {
  const out: T[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams(
      pageToken ? {...params, pageToken} : params,
    );
    const page = (await (
      await googleFetch('tasks', `${BASE}${path}?${query}`)
    ).json()) as {items?: T[]; nextPageToken?: string};
    out.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken && out.length < 10_000);
  return out;
}

export function listTaskLists() {
  return paged<ApiTaskList>('/users/@me/lists', {maxResults: '100'});
}

/** The list's tasks due from `from` to `to`, done ones included. */
export function listTasks(listId: string, from: ISODate, to: ISODate) {
  return paged<ApiTask>(`/lists/${encodeURIComponent(listId)}/tasks`, {
    dueMin: `${from}T00:00:00.000Z`,
    dueMax: `${addDays(to, 1)}T00:00:00.000Z`,
    showCompleted: 'true',
    // Done tasks cleared from the list are hidden, not gone.
    showHidden: 'true',
    maxResults: '100',
  });
}

/** A task for the calendar, or null without a due date (or deleted). */
export function taskFromApi(t: ApiTask, list: ApiTaskList): GTask | null {
  if (t.deleted || !t.due) return null;
  return {
    key: `${list.id}/${t.id}`,
    title: t.title?.trim() || '(no title)',
    notes: t.notes || undefined,
    done: t.status === 'completed',
    // The date as Google keeps it, not shifted into the local time zone.
    due: t.due.slice(0, 10),
    listTitle: list.title ?? '',
    link: t.webViewLink,
  };
}

/** Every list's tasks due from `from` to `to`. */
export async function fetchTasks(from: ISODate, to: ISODate) {
  const lists = await listTaskLists();
  const perList = await Promise.all(
    lists.map(async l =>
      (await listTasks(l.id, from, to)).flatMap(t => {
        const task = taskFromApi(t, l);
        return task && task.due >= from && task.due <= to ? [task] : [];
      }),
    ),
  );
  return perList.flat();
}
