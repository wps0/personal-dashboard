/**
 * @fileoverview Upgrades data saved by older versions of the app, one schema
 * version at a time, as it's read (see `checked()` in codec.ts). That covers
 * every way data comes in: this device's copy, the sync base, the file on
 * Drive and imported exports.
 *
 * A change older versions can't handle (they'd misread or drop something)
 * raises `SCHEMA_VERSION` in codec.ts and adds the step from the previous
 * version here. Older versions then refuse the new data and ask to be updated
 * instead of misreading it. See "Changing the data model" in SPEC.md (6).
 *
 * A step works on the current schema's messages, so the fields it reads must
 * still be in the schema: mark them `deprecated` there instead of deleting
 * them, for as long as data from before the step may be around.
 *
 * Steps must be deterministic: the same input gives the same output, with ids
 * derived from the data, never random or from the clock. This device's data,
 * its sync base and the file on Drive are upgraded separately, and the sync's
 * merge must see what they share as the same.
 */

import type * as pb from '../gen/dashboard/data_pb';

/** Upgrades data of one schema version to the next. */
export type Migration = (data: pb.AppData) => pb.AppData;

/** `MIGRATIONS[n]` upgrades data of schema version `n` to version `n + 1`. */
export const MIGRATIONS: Readonly<Record<number, Migration>> = {};

/**
 * `data`, saved with schema version `from`, upgraded step by step to version
 * `to`. Throws if a step is missing.
 */
export function migrate(
  data: pb.AppData,
  from: number,
  to: number,
  steps: Readonly<Record<number, Migration>> = MIGRATIONS,
): pb.AppData {
  let out = data;
  for (let version = from; version < to; version++) {
    const step = steps[version];
    if (!step)
      throw new Error(
        `Data of schema version ${version} can’t be upgraded: no migration to version ${version + 1}.`,
      );
    out = step(out);
  }
  return out;
}
