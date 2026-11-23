/**
 * @fileoverview How the dashboard's data is stored: protobuf binary, which
 * the app reads and writes, and protobuf's JSON form as a read-only copy for
 * people. Both come from the schema in proto/dashboard/data.proto; the
 * reading and writing is shared with the climbing log (saving/proto_codec.ts).
 */

import * as pb from '../gen/dashboard/data_pb';
import {protoCodec} from '../saving/proto_codec';
import {MIGRATIONS} from './migrations';

/**
 * The schema version this version of the app writes. Raise it for any schema
 * change older versions can't handle, with a migration from the previous
 * version (migrations.ts); data of older versions is upgraded as it's read.
 */
export const SCHEMA_VERSION = 3;

const codec = protoCodec(pb.AppDataSchema, {
  version: SCHEMA_VERSION,
  migrations: MIGRATIONS,
  what: 'dashboard data',
});

/** The data as stored: protobuf binary, stamped with the schema version. */
export const encode: (data: pb.AppData) => Uint8Array<ArrayBuffer> =
  codec.encode;

/**
 * Reads stored data. Fields this version doesn't know are kept, and saved
 * again with the data. Data from a newer schema version is refused with a
 * message to update the app, so it's never misread or overwritten.
 */
export const decode: (bytes: Uint8Array) => pb.AppData = codec.decode;

/** The read-only copy: the data as protobuf's JSON form, indented. */
export const toReadableJson: (data: pb.AppData) => string =
  codec.toReadableJson;

/** Reads the JSON form back, e.g. an exported file chosen for import. */
export const fromReadableJson: (text: string) => pb.AppData =
  codec.fromReadableJson;
