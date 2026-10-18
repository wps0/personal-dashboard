/**
 * @fileoverview How the data is stored: protobuf binary, which the app reads
 * and writes, and protobuf's JSON form as a read-only copy for people. Both
 * come from the schema in proto/dashboard/v2/data.proto.
 */

import {
  create,
  fromBinary,
  fromJson,
  toBinary,
  toJson,
} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/v2/data_pb';

/**
 * The schema version this version of the app reads and writes. Raise it for
 * any schema change older versions can't handle.
 */
export const SCHEMA_VERSION = 1;

/** The data as stored: protobuf binary, stamped with the schema version. */
export function encode(data: pb.AppData): Uint8Array<ArrayBuffer> {
  return toBinary(
    pb.AppDataSchema,
    create(pb.AppDataSchema, {...data, schemaVersion: SCHEMA_VERSION}),
  );
}

/**
 * Reads stored data. Fields this version doesn't know are kept, and saved
 * again with the data. Data from a newer schema version is refused with a
 * message to update the app, so it's never misread or overwritten.
 */
export function decode(bytes: Uint8Array): pb.AppData {
  let data: pb.AppData;
  try {
    data = fromBinary(pb.AppDataSchema, bytes);
  } catch (e) {
    throw new Error(`The data can’t be read: ${(e as Error).message}`);
  }
  return checked(data);
}

/** The read-only copy: the data as protobuf's JSON form, indented. */
export function toReadableJson(data: pb.AppData): string {
  const json = toJson(pb.AppDataSchema, {
    ...data,
    schemaVersion: SCHEMA_VERSION,
  });
  return `${JSON.stringify(json, null, 2)}\n`;
}

/** Reads the JSON form back, e.g. an exported file chosen for import. */
export function fromReadableJson(text: string): pb.AppData {
  let data: pb.AppData;
  try {
    data = fromJson(pb.AppDataSchema, JSON.parse(text));
  } catch (e) {
    throw new Error(
      `This isn’t dashboard data, or it’s from a newer version of the app: ${(e as Error).message}`,
    );
  }
  return checked(data);
}

/**
 * `data` once its schema version is checked, with the version cleared: it
 * only exists in what's stored, so data read from storage and data made in
 * the app compare equal.
 */
function checked(data: pb.AppData): pb.AppData {
  const version = data.schemaVersion;
  if (version > SCHEMA_VERSION)
    throw new Error(
      'This data was saved by a newer version of the app. Update the app (reload it) to use it.',
    );
  if (version < 1) throw new Error('This isn’t dashboard data.');
  return {...data, schemaVersion: 0};
}
