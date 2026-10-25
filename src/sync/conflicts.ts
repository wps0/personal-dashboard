import {monthName, shortDate} from '../model/dates';
import type {AppData} from '../model/types';
import {same, withoutOrphans, type Conflict} from './merge';

export type Side = 'local' | 'remote';

/** Which side's value the merge kept: this device's, unless it had deleted it. */
export function keptSide(c: Conflict): Side {
  return c.local === undefined ? 'remote' : 'local';
}

/** A conflict in words, for the review list. */
export interface ConflictView {
  /** The record it's in, e.g. 'Task "Lecture 5"'. */
  what: string;
  /** The field, e.g. 'due date'; empty when the whole record conflicts. */
  field: string;
  local: string;
  remote: string;
}

const FIELDS: Record<string, string> = {
  title: 'title',
  name: 'name',
  notes: 'notes',
  status: 'status',
  kind: 'kind',
  dueDate: 'due date',
  heldOn: 'held on',
  estimateHours: 'estimate',
  plannedHours: 'planned hours',
  actualHours: 'actual hours',
  done: 'done',
  date: 'date',
  start: 'start',
  end: 'end',
  allDay: 'all day',
  color: 'colour',
  overviewDoc: 'overview',
  progressMode: 'progress mode',
  manualProgress: 'progress',
  archived: 'archived',
  coursePattern: 'course pattern',
  projectId: 'project',
  areaId: 'area',
  itemId: 'task',
  groupId: 'group',
  text: 'text',
};

interface Rec {
  id: string;
  [k: string]: unknown;
}

/** Describes a conflict using the current data for names. */
export function describe(c: Conflict, data: AppData): ConflictView {
  const [section, id, ...rest] = c.path;
  const find = (list: {id: string}[]): Rec | undefined =>
    (list.find(x => x.id === id) as Rec | undefined) ??
    [c.local, c.remote].find(
      (v): v is Rec => !!v && typeof v === 'object' && (v as Rec).id === id,
    );
  const label = (r: Rec | undefined, key: string) =>
    r && typeof r[key] === 'string' && r[key] ? `“${r[key] as string}”` : '';
  let what: string;
  let fieldPath = rest;
  // Values that are ids, in words.
  let named: ((v: unknown) => string) | undefined;
  switch (section) {
    case 'areas':
      what = `Area ${label(find(data.areas), 'name')}`;
      break;
    case 'projects': {
      what = `Project ${label(find(data.projects), 'name')}`;
      if (rest[0] === 'log') {
        what += ' · log entry';
        fieldPath = rest.slice(2);
      }
      if (rest[0] === 'groups') {
        const groups = data.projects.find(p => p.id === id)?.groups ?? [];
        const group = [...groups, c.local, c.remote].find(
          (v): v is Rec =>
            !!v && typeof v === 'object' && (v as Rec).id === rest[1],
        );
        what += ` · group ${label(group, 'name')}`;
        fieldPath = rest.slice(2);
      }
      break;
    }
    case 'items': {
      const item = find(data.items);
      what = `Task ${label(item, 'title')}`;
      if (rest.length === 1 && rest[0] === 'groupId') {
        const groups =
          data.projects.find(p => p.id === item?.projectId)?.groups ?? [];
        named = v =>
          v === undefined
            ? 'No group'
            : (groups.find(g => g.id === v)?.name ?? 'A deleted group');
      }
      break;
    }
    case 'allocations': {
      const a = find(data.allocations);
      const item = data.items.find(i => i.id === a?.itemId);
      what = `Session${a?.date ? ` on ${shortDate(a.date as string)}` : ''}${item ? ` of “${item.title}”` : ''}`;
      break;
    }
    case 'events':
      what = `Event ${label(find(data.events), 'title')}`;
      break;
    case 'dayNotes':
      what = `Note for ${id ? shortDate(id) : 'a day'}`;
      fieldPath = [];
      break;
    case 'monthNotes':
      what = `Note for ${id ? monthName(id) : 'a month'}`;
      fieldPath = [];
      break;
    case 'settings':
      what = 'Settings';
      fieldPath = c.path.slice(1);
      break;
    default:
      what = c.path.join(' › ') || 'All data';
      fieldPath = [];
  }
  const record = fieldPath.length === 0;
  return {
    what: what.trim(),
    field: fieldPath.map(f => FIELDS[f] ?? f).join(' › '),
    local: named ? named(c.local) : show(c.local, record),
    remote: named ? named(c.remote) : show(c.remote, record),
  };
}

/** A value as short text: a whole record shows as edited or deleted. */
function show(v: unknown, record: boolean): string {
  if (v === undefined) return record ? 'Deleted' : 'Empty';
  if (record && typeof v === 'object' && v !== null) return 'Edited';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string') {
    const s = v.replace(/\s+/g, ' ').trim();
    if (!s) return 'Empty';
    return s.length > 120 ? `${s.slice(0, 119)}…` : s;
  }
  if (typeof v === 'number') return String(v);
  return JSON.stringify(v);
}

/**
 * Applies the chosen side of each conflict. A choice equal to what the merge
 * kept changes nothing. A value edited since the sync is left alone (counted
 * in `skipped`), so resolving never overwrites a newer edit. Deleting a
 * record also deletes what belongs to it, as deleting it in the app would.
 */
export function applyChoices(
  data: AppData,
  choices: {conflict: Conflict; side: Side}[],
): {data: AppData; skipped: number} {
  let out: unknown = data;
  let skipped = 0;
  for (const {conflict: c, side} of choices) {
    const kept = c[keptSide(c)];
    if (side === keptSide(c)) continue;
    if (!same(getAt(out, c.path), kept)) {
      skipped++;
      continue;
    }
    out = setAt(out, c.path, c[side]);
  }
  return {data: withoutOrphans(out as AppData, [data]), skipped};
}

function isRecords(v: unknown): v is Rec[] {
  return (
    Array.isArray(v) &&
    v.every(x => !!x && typeof x === 'object' && typeof x.id === 'string')
  );
}

function getAt(v: unknown, path: string[]): unknown {
  let cur = v;
  for (const key of path) {
    if (isRecords(cur)) cur = cur.find(x => x.id === key);
    else if (cur && typeof cur === 'object')
      cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur;
}

/** A copy of `v` with the value at `path` replaced (removed when undefined). */
function setAt(v: unknown, path: string[], value: unknown): unknown {
  if (!path.length) return value;
  const [key, ...rest] = path;
  if (isRecords(v)) {
    const i = v.findIndex(x => x.id === key);
    const next = setAt(i < 0 ? undefined : v[i], rest, value);
    if (i < 0) return next === undefined ? v : [...v, next];
    return next === undefined
      ? v.filter((_, j) => j !== i)
      : v.map((x, j) => (j === i ? next : x));
  }
  const obj = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const next = setAt(obj[key], rest, value);
  const copy = {...obj};
  if (next === undefined) delete copy[key];
  else copy[key] = next;
  return copy;
}
