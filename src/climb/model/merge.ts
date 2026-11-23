/**
 * @fileoverview Merging the log's data from two devices: the shared
 * three-way merge (saving/merge3.ts), which merges sessions and the climbs
 * in them record by record. A session that gained climbs on one device
 * while the other deleted it is an edit, which wins over the deletion. A
 * gym deleted on one device while the other started a session there comes
 * back.
 */

import {merge3, same, type Conflict} from '../../saving/merge3';
import {emptyData, withDefaults, type ClimbData} from './data';

export function mergeClimbData(
  base: ClimbData,
  local: ClimbData,
  remote: ClimbData,
): {data: ClimbData; conflicts: Conflict[]} {
  const {value, conflicts} = merge3(base, local, remote);
  const data = withDefaults(value as ClimbData);
  const have = new Set(data.places.map(p => p.id));
  const lost = [
    ...new Set(data.sessions.map(s => s.placeId).filter(id => !have.has(id))),
  ];
  const back = lost
    .map(id =>
      [local, remote, base].flatMap(d => d.places).find(p => p.id === id),
    )
    .filter(p => p !== undefined);
  return {
    data: back.length ? {...data, places: [...data.places, ...back]} : data,
    conflicts,
  };
}

/** Nothing worth keeping yet: a fresh install (settings aside). */
export function isBlank(data: ClimbData): boolean {
  return !data.places.length && !data.sessions.length;
}

export {emptyData, same};
