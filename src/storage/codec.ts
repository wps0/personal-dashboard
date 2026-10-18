/**
 * @fileoverview The stored form of the data, in IndexedDB, Drive and exports:
 *
 *   {"format": 2, "data": "<base64 protobuf>", "view": {…}}
 *
 * `data`, the protobuf binary, is the source of truth. Reading and writing it
 * keeps fields and enum values this version of the app doesn't know, so an
 * older app never erases what a newer one wrote. `view` is the same data as
 * readable JSON, for people; the app never reads it.
 */

import {fromBinary, toBinary, toJson, type JsonValue} from '@bufbuild/protobuf';
import {base64Decode, base64Encode} from '@bufbuild/protobuf/wire';
import * as pb from '../gen/dashboard/v2/data_pb';
import {fromV1} from './from_v1';
import {parseAppData} from './parse_v1';

/** The current stored format. Older formats are converted on reading. */
export const FORMAT = 2;

/** The stored form; see the file overview. */
export interface Envelope {
  format: number;
  data: string;
  view: JsonValue;
}

/** The stored form of `data`. */
export function toEnvelope(data: pb.AppData): Envelope {
  return {
    format: FORMAT,
    data: base64Encode(toBinary(pb.AppDataSchema, data)),
    view: toJson(pb.AppDataSchema, data),
  };
}

/**
 * Reads stored data in any format this version knows: the current envelope,
 * or v1 JSON. Throws a readable error for anything else, including data from
 * a newer format, which must never be overwritten.
 */
export function fromStored(raw: unknown): pb.AppData {
  if (typeof raw !== 'object' || raw === null)
    throw new Error('Not dashboard data');
  const stored = raw as Partial<Envelope> & {version?: unknown};
  if (stored.format === undefined) {
    if (stored.version === 1) return fromV1(parseAppData(raw));
    throw new Error(`Unsupported data version: ${String(stored.version)}`);
  }
  if (stored.format !== FORMAT || typeof stored.data !== 'string') {
    throw new Error(
      typeof stored.format === 'number' && stored.format > FORMAT
        ? 'This data was saved by a newer version of the app. Update the app (reload it) to use it.'
        : `Unsupported data format: ${String(stored.format)}`,
    );
  }
  return fromBinary(pb.AppDataSchema, base64Decode(stored.data));
}
