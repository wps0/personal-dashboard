/**
 * @fileoverview A three-way merge of JSON-like data, for any app's Drive
 * sync: what this device has, what Drive has, and what both had at the last
 * sync. Each app adds its own rules on top (records that must exist
 * together).
 */

type Json = unknown;
type Obj = Record<string, Json>;
export interface WithId {
  id: string;
}

/**
 * A value both sides changed differently since the last sync. `path` leads
 * to it: object keys, and record ids inside arrays of records (e.g.
 * ['items', '<id>', 'title']). `undefined` means deleted on that side.
 */
export interface Conflict {
  path: string[];
  local: Json;
  remote: Json;
}

function isObj(v: Json): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function hasIds(v: Json): v is WithId[] {
  return (
    Array.isArray(v) &&
    v.every(x => isObj(x) && typeof (x as Obj).id === 'string')
  );
}
/** A protobuf `oneof` ({case, value}): its parts only make sense together. */
function isOneof(v: Json) {
  return isObj(v) && 'case' in v;
}
function isScalars(v: Json): v is (string | number | boolean)[] {
  return Array.isArray(v) && v.every(x => x === null || typeof x !== 'object');
}

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
 *   a protobuf `oneof` ({case, value}) merges as a whole;
 * - arrays of plain values merge as sets;
 * - a real conflict (the same value changed differently on both sides) keeps
 *   this device's value, except that an edit wins over a deletion.
 * `conflicts` lists the real conflicts, with both sides' values.
 */
export function merge3(base: Json, local: Json, remote: Json) {
  const conflicts: Conflict[] = [];
  const value = mergeValue(base, local, remote, [], conflicts);
  return {value, conflicts};
}

function mergeValue(
  b: Json,
  l: Json,
  r: Json,
  path: string[],
  conflicts: Conflict[],
): Json {
  if (same(l, r)) return l;
  if (same(l, b)) return r;
  if (same(r, b)) return l;
  // Both sides changed it, differently.
  if (isObj(l) && isObj(r) && !isOneof(l) && !isOneof(r))
    return mergeObj(b, l, r, path, conflicts);
  if (hasIds(l) && hasIds(r))
    return mergeById(hasIds(b) ? b : [], l, r, path, conflicts);
  if (isScalars(l) && isScalars(r))
    return mergeSet(isScalars(b) ? b : [], l, r);
  conflicts.push({path, local: l, remote: r});
  return l === undefined ? r : l;
}

function mergeObj(
  b: Json,
  l: Obj,
  r: Obj,
  path: string[],
  conflicts: Conflict[],
) {
  const base = isObj(b) ? b : {};
  const out: Obj = {};
  for (const k of new Set([...Object.keys(l), ...Object.keys(r)])) {
    const v = mergeValue(base[k], l[k], r[k], [...path, k], conflicts);
    if (v !== undefined) out[k] = v;
  }
  return out;
}

/**
 * Merges records by id. Their order is this device's, unless only Drive's
 * changed (records moved there, e.g. reordered groups), like any change made
 * on one side only. A record only one side has goes right after the record
 * it follows there (so new log entries, which are prepended, stay at the
 * top).
 */
function mergeById(
  b: WithId[],
  l: WithId[],
  r: WithId[],
  path: string[],
  conflicts: Conflict[],
) {
  const byId = (xs: WithId[]) => new Map(xs.map(x => [x.id, x]));
  const [bm, lm, rm] = [byId(b), byId(l), byId(r)];
  const pick = (id: string) =>
    mergeValue(bm.get(id), lm.get(id), rm.get(id), [...path, id], conflicts);

  // The order of the records all three have, on each side.
  const order = (xs: WithId[]) =>
    xs
      .map(x => x.id)
      .filter(id => bm.has(id) && lm.has(id) && rm.has(id))
      .join('\n');
  const moved = (xs: WithId[]) => order(xs) !== order(b);
  const [main, other] = moved(r) && !moved(l) ? [r, l] : [l, r];
  const inMain = new Set(main.map(x => x.id));

  // Records only the other side has, grouped by the record they follow there.
  const after = new Map<string | null, Json[]>();
  let prev: string | null = null;
  for (const x of other) {
    if (inMain.has(x.id)) {
      prev = x.id;
      continue;
    }
    const v = pick(x.id);
    if (v === undefined) continue;
    after.set(prev, [...(after.get(prev) ?? []), v]);
  }
  const out: Json[] = [...(after.get(null) ?? [])];
  for (const x of main) {
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
