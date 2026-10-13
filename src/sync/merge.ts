import type {AppData} from '../model/types';

type Json = unknown;
type Obj = Record<string, Json>;
type WithId = {id: string};

const isObj = (v: Json): v is Obj =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const hasIds = (v: Json): v is WithId[] =>
  Array.isArray(v) &&
  v.every(x => isObj(x) && typeof (x as Obj).id === 'string');
const isScalars = (v: Json): v is (string | number | boolean)[] =>
  Array.isArray(v) && v.every(x => x === null || typeof x !== 'object');

/**
 * Deep equality for JSON-like data. Key order is ignored, and a key set to
 * undefined counts as missing (it disappears in JSON anyway).
 */
export function same(a: Json, b: Json): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length)
      return false;
    return a.every((x, i) => same(x, b[i]));
  }
  if (!isObj(a) || !isObj(b)) return false;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) if (!same(a[k], b[k])) return false;
  return true;
}

/**
 * Three-way merge of what this device has (`local`) and what Drive has
 * (`remote`), given what both had at the last sync (`base`):
 * - a change made on one side only is taken from that side;
 * - objects merge key by key, and arrays of `{id}` objects record by record,
 *   so different fields of the same task edited on two devices both survive;
 * - arrays of plain values merge as sets;
 * - a real conflict (the same value changed differently on both sides) keeps
 *   this device's value, except that an edit wins over a deletion.
 * `conflicts` lists the paths of real conflicts.
 */
export function merge3(base: Json, local: Json, remote: Json) {
  const conflicts: string[] = [];
  const value = mergeValue(base, local, remote, '', conflicts);
  return {value, conflicts};
}

function mergeValue(
  b: Json,
  l: Json,
  r: Json,
  path: string,
  conflicts: string[],
): Json {
  if (same(l, r)) return l;
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  // Both sides changed it, differently.
  if (isObj(l) && isObj(r)) return mergeObj(b, l, r, path, conflicts);
  if (hasIds(l) && hasIds(r))
    return mergeById(hasIds(b) ? b : [], l, r, path, conflicts);
  if (isScalars(l) && isScalars(r))
    return mergeSet(isScalars(b) ? b : [], l, r);
  conflicts.push(path || '/');
  return l === undefined ? r : l;
}

function mergeObj(b: Json, l: Obj, r: Obj, path: string, conflicts: string[]) {
  const base = isObj(b) ? b : {};
  const out: Obj = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const v = mergeValue(base[k], l[k], r[k], `${path}/${k}`, conflicts);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Merges records by id. Keeps this device's order; a record only Drive has
 * goes right after the record it follows there (so new log entries, which
 * are prepended, stay at the top).
 */
function mergeById(
  b: WithId[],
  l: WithId[],
  r: WithId[],
  path: string,
  conflicts: string[],
) {
  const byId = (xs: WithId[]) => new Map(xs.map(x => [x.id, x]));
  const [bm, lm, rm] = [byId(b), byId(l), byId(r)];
  const pick = (id: string) =>
    mergeValue(bm.get(id), lm.get(id), rm.get(id), `${path}/${id}`, conflicts);

  // Records only on Drive, grouped by the record they follow there.
  const after = new Map<string | null, Json[]>();
  let prev: string | null = null;
  for (const x of r) {
    if (lm.has(x.id)) {
      prev = x.id;
      continue;
    }
    const v = pick(x.id);
    if (v === undefined) continue;
    after.set(prev, [...(after.get(prev) ?? []), v]);
  }
  const out: Json[] = [...(after.get(null) ?? [])];
  for (const x of l) {
    const v = pick(x.id);
    if (v !== undefined) out.push(v);
    out.push(...(after.get(x.id) ?? []));
  }
  return out;
}

function mergeSet<T>(b: T[], l: T[], r: T[]) {
  const [bs, ls, rs] = [new Set(b), new Set(l), new Set(r)];
  // Kept on both sides, or added on one side.
  return [
    ...l.filter(x => rs.has(x) || !bs.has(x)),
    ...r.filter(x => !ls.has(x) && !bs.has(x)),
  ];
}

/**
 * Merges two versions of the app data. A merge can bring back a record that
 * the other side deleted along with its parent (an item edited on one
 * device, its project deleted on the other); such orphans are dropped, as the
 * deletion would have done.
 */
export function mergeData(base: AppData, local: AppData, remote: AppData) {
  const {value, conflicts} = merge3(base, local, remote);
  return {
    data: withoutOrphans(value as AppData, [base, local, remote]),
    conflicts,
  };
}

/**
 * Drops projects, items and sessions whose parent was deleted: it exists in
 * one of `versions` but not in `d`. Records whose parent never existed are
 * left alone; that isn't the merge's doing.
 */
function withoutOrphans(d: AppData, versions: AppData[]): AppData {
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
