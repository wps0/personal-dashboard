/**
 * @fileoverview Where the climbing log keeps its data: its own IndexedDB
 * database ("climb"), its own keys and its own schema version, with the
 * saving code shared with the dashboard (saving/).
 */

import {createStore} from 'idb-keyval';
import * as pb from '../gen/climb/climb_pb';
import {downloadFile, LocalStore, readFile} from '../saving/local_store';
import {protoCodec} from '../saving/proto_codec';
import {withDefaults, type ClimbData} from './model/data';
import {today} from './model/dates';

/**
 * The schema version this version of the log writes. Raise it for any
 * change older versions can't handle, with a migration in MIGRATIONS.
 */
export const SCHEMA_VERSION = 1;

/** The lock that keeps the log open in one tab at a time (its own, not the dashboard's). */
export const LOCK = 'climb';

export const codec = protoCodec(pb.ClimbDataSchema, {
  version: SCHEMA_VERSION,
  migrations: {},
  what: 'climbing log data',
});

/** Reads stored data. Throws if it isn't data this version can read. */
export function readStored(bytes: Uint8Array): ClimbData {
  return withDefaults(codec.decode(bytes));
}

/** Reads an exported file: the readable JSON, or binary. Throws if it can't. */
export function readExport(bytes: Uint8Array): ClimbData {
  return readFile(bytes, {
    json: text => withDefaults(codec.fromReadableJson(text)),
    binary: readStored,
  });
}

let storage: LocalStore<ClimbData> | undefined;

/** The log's data on this device (opened on first use). */
export function climbStorage(): LocalStore<ClimbData> {
  storage ??= new LocalStore<ClimbData>({
    key: 'climb/data',
    baseKey: 'climb/sync-base',
    read: readStored,
    write: codec.encode,
    store: createStore('climb', 'keyval'),
  });
  return storage;
}

/** Saves the data as readable JSON (the browser's download). */
export function downloadJson(data: ClimbData) {
  downloadFile(
    new Blob([codec.toReadableJson(data)], {type: 'application/json'}),
    `climb-${today()}.json`,
  );
}

/** Saves the data as protobuf binary, exactly as it's stored. */
export function downloadBinary(data: ClimbData) {
  downloadFile(
    new Blob([codec.encode(data)], {type: 'application/octet-stream'}),
    `climb-${today()}.binpb`,
  );
}
