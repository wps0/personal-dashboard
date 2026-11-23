import type {AppData} from '../model/types';
import {merge3, same, type Conflict, type WithId} from '../saving/merge3';

export {merge3, same, type Conflict};

/**
 * Merges two versions of the app data. A record edited on one side wins over
 * its deletion on the other also when its parent was deleted with it (an
 * item edited on one device, its project deleted on the other): the parents
 * come back too. Other records whose parent was deleted (e.g. added to it on
 * the other side) are dropped, as the deletion would have done.
 */
export function mergeData(base: AppData, local: AppData, remote: AppData) {
  const {value, conflicts} = merge3(base, local, remote);
  const data = withParents(value as AppData, local, remote, conflicts);
  return {
    data: withoutOrphans(data, [base, local, remote]),
    conflicts,
  };
}

/**
 * Brings back the deleted parents of records kept by an edit winning over a
 * deletion: the item of a session, the project of an item, the area of a
 * project. Each is added to `conflicts` too, so the review can delete it
 * again.
 */
function withParents(
  d: AppData,
  local: AppData,
  remote: AppData,
  conflicts: Conflict[],
): AppData {
  /** Ids of the `key` records kept over a deletion (or brought back). */
  const kept = (key: string) =>
    new Set(
      conflicts
        .filter(
          c =>
            c.path.length === 2 &&
            c.path[0] === key &&
            (c.local === undefined || c.remote === undefined),
        )
        .map(c => c.path[1]),
    );
  /** The records `ids` of a list added back, from the side that has them. */
  const restore = <T extends WithId>(
    name: string,
    of: (v: AppData) => T[],
    ids: string[],
  ) => {
    const list = [...of(d)];
    const back = new Set<string>();
    for (const id of ids) {
      if (list.some(x => x.id === id)) continue;
      const [l, r] = [local, remote].map(v => of(v).find(x => x.id === id));
      const record = l ?? r;
      if (!record) continue;
      // Where it was, as near as the merged list allows.
      const i = of(l ? local : remote).indexOf(record);
      list.splice(Math.min(i, list.length), 0, record);
      back.add(id);
      conflicts.push({path: [name, id], local: l, remote: r});
    }
    return {list, back};
  };

  const sessions = kept('allocations');
  const items = restore(
    'items',
    v => v.items,
    d.allocations.filter(a => sessions.has(a.id)).map(a => a.itemId),
  );
  const keptItems = kept('items');
  const projects = restore(
    'projects',
    v => v.projects,
    items.list.filter(i => keptItems.has(i.id)).map(i => i.projectId),
  );
  const keptProjects = kept('projects');
  const areas = restore(
    'areas',
    v => v.areas,
    projects.list.filter(p => keptProjects.has(p.id)).map(p => p.areaId),
  );
  if (!items.back.size && !projects.back.size && !areas.back.size) return d;
  return {
    ...d,
    areas: areas.list,
    projects: projects.list,
    items: items.list,
  };
}

/**
 * Drops projects, items and sessions whose parent was deleted: it exists in
 * one of `versions` but not in `d`. Records whose parent never existed are
 * left alone; that isn't the merge's doing.
 */
export function withoutOrphans(d: AppData, versions: AppData[]): AppData {
  const deleted = <T extends WithId>(key: (v: AppData) => T[], kept: T[]) => {
    const ids = new Set(kept.map(x => x.id));
    return new Set(
      versions.flatMap(v => key(v).map(x => x.id)).filter(id => !ids.has(id)),
    );
  };
  const goneAreas = deleted(v => v.areas, d.areas);
  const projects = d.projects.filter(p => !goneAreas.has(p.areaId));
  const goneProjects = deleted(v => v.projects, projects);
  const items = d.items.filter(i => !goneProjects.has(i.projectId));
  const goneItems = deleted(v => v.items, items);
  const allocations = d.allocations.filter(a => !goneItems.has(a.itemId));
  if (
    projects.length === d.projects.length &&
    items.length === d.items.length &&
    allocations.length === d.allocations.length
  )
    return d;
  return {...d, projects, items, allocations};
}
