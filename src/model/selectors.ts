import {daysBetween} from './dates';
import {
  ItemStatus,
  ProgressMode,
  type Allocation,
  type AppData,
  type ISODate,
  type Item,
  type Project,
} from './types';

/** The slices planning selectors need; lets callers memoize on just these. */
type PlanData = Pick<AppData, 'items' | 'allocations' | 'projects'>;

export function isItemDone(item: Item): boolean {
  return item.status === ItemStatus.DONE;
}

export function plannedHours(allocs: Allocation[]): number {
  return allocs.reduce((s, a) => s + a.plannedHours, 0);
}

export function actualHours(allocs: Allocation[]): number {
  return allocs.reduce(
    (s, a) => s + (a.done ? (a.actualHours ?? a.plannedHours) : 0),
    0,
  );
}

export function allocationsByItem(
  data: Pick<AppData, 'allocations'>,
): Map<string, Allocation[]> {
  const m = new Map<string, Allocation[]>();
  for (const a of data.allocations) {
    const list = m.get(a.itemId);
    if (list) list.push(a);
    else m.set(a.itemId, [a]);
  }
  return m;
}

export interface ProjectStats {
  /** 0–100. */
  percent: number;
  done: number;
  total: number;
  next?: {title: string; date: ISODate};
}

export function projectStats(
  project: Project,
  items: Item[],
  allocs: Map<string, Allocation[]>,
): ProjectStats {
  const own = items.filter(i => i.projectId === project.id);
  const done = own.filter(isItemDone).length;
  const total = own.length;

  let percent: number;
  switch (project.progressMode) {
    case ProgressMode.MANUAL:
      percent = project.manualProgress;
      break;
    case ProgressMode.HOURS: {
      const estimate = own.reduce((s, i) => s + (i.estimateHours ?? 0), 0);
      const spent = own.reduce(
        (s, i) => s + actualHours(allocs.get(i.id) ?? []),
        0,
      );
      percent = estimate > 0 ? (spent / estimate) * 100 : 0;
      break;
    }
    default:
      // Checklist, and any mode this version doesn't know.
      percent = total > 0 ? (done / total) * 100 : 0;
  }
  percent = Math.max(0, Math.min(100, Math.round(percent)));

  // Next deadline: the earliest due date among open items, or the project's own.
  let next: ProjectStats['next'];
  for (const i of own) {
    if (i.dueDate && !isItemDone(i) && (!next || i.dueDate < next.date)) {
      next = {title: i.title, date: i.dueDate};
    }
  }
  if (
    project.dueDate &&
    (!next || project.dueDate < next.date) &&
    percent < 100
  ) {
    next = {title: project.name, date: project.dueDate};
  }
  return {percent, done, total, next};
}

export type Urgency = 'overdue' | 'soon' | 'near' | 'far';

export function urgency(due: ISODate, today: ISODate): Urgency {
  const n = daysBetween(today, due);
  if (n < 0) return 'overdue';
  if (n <= 3) return 'soon';
  if (n <= 7) return 'near';
  return 'far';
}

/**
 * Open items that still need time on the plan:
 * - with an estimate: hours spent (done slices) + planned (open slices) < estimate;
 * - without an estimate: no open or upcoming allocation.
 * Sorted by {@link compareItems}.
 */
export function backlogItems(
  data: PlanData,
  today: ISODate,
): {item: Item; remaining?: number}[] {
  const allocs = allocationsByItem(data);
  const activeProjects = new Set(
    data.projects.filter(p => !p.archived).map(p => p.id),
  );
  const out: {item: Item; remaining?: number}[] = [];
  for (const item of data.items) {
    if (isItemDone(item) || !activeProjects.has(item.projectId)) continue;
    const list = allocs.get(item.id) ?? [];
    if (item.estimateHours != null && item.estimateHours > 0) {
      // Missed slices still count as planned: they wait in the overdue tray, not here.
      const committed = list.reduce(
        (s, a) =>
          s + (a.done ? (a.actualHours ?? a.plannedHours) : a.plannedHours),
        0,
      );
      const remaining = item.estimateHours - committed;
      if (remaining > 0) out.push({item, remaining});
    } else if (!list.some(a => a.date >= today || !a.done)) {
      out.push({item});
    }
  }
  out.sort((a, b) => compareItems(a.item, b.item));
  return out;
}

/** Allocations on past days that weren't checked off, for items still open. */
export function missedAllocations(
  data: PlanData,
  today: ISODate,
): Allocation[] {
  const items = new Map(data.items.map(i => [i.id, i]));
  return data.allocations
    .filter(a => {
      const item = items.get(a.itemId);
      return a.date < today && !a.done && item && !isItemDone(item);
    })
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Default hours for a new allocation dropped from the backlog. */
export function defaultAllocationHours(remaining: number | undefined): number {
  if (remaining == null) return 1;
  return Math.min(remaining, 2);
}

/** Due date (undated last), then class date, then title with numeric awareness ("Lecture 2" < "Lecture 10"). */
export function compareItems(a: Item, b: Item): number {
  const da = a.dueDate ?? '9999';
  const db = b.dueDate ?? '9999';
  if (da !== db) return da < db ? -1 : 1;
  const ha = a.heldOn ?? '9999';
  const hb = b.heldOn ?? '9999';
  if (ha !== hb) return ha < hb ? -1 : 1;
  return a.title.localeCompare(b.title, undefined, {numeric: true});
}

const STATUS_LABEL: Record<ItemStatus, string> = {
  [ItemStatus.UNSPECIFIED]: 'Unknown',
  [ItemStatus.TODO]: 'To do',
  [ItemStatus.DOING]: 'In progress',
  [ItemStatus.DONE]: 'Done',
};

/** How a status reads in the UI. */
export function statusLabel(status: ItemStatus): string {
  return STATUS_LABEL[status] ?? 'Unknown';
}
