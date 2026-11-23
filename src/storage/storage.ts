/**
 * @fileoverview Persistence. The data lives in IndexedDB on every device, as
 * protobuf binary (codec.ts); Google Drive sync (sync/) works on top of it,
 * so the app works offline. The storing itself is shared with the climbing
 * log (saving/local_store.ts).
 */

import {todayISO} from '../model/dates';
import {withDefaults, type AppData} from '../model/types';
import {downloadFile, LocalStore, readFile} from '../saving/local_store';
import {decode, encode, fromReadableJson, toReadableJson} from './codec';

const KEY = 'personal-dashboard/data';
const BASE_KEY = 'personal-dashboard/sync-base';

/** Reads stored data. Throws if it isn't data this version can read. */
export function readStored(bytes: Uint8Array): AppData {
  return withDefaults(decode(bytes));
}

/** The dashboard's data on this device, in idb-keyval's default database. */
export class IndexedDbStorage extends LocalStore<AppData> {
  constructor() {
    super({key: KEY, baseKey: BASE_KEY, read: readStored, write: encode});
  }
}

/** Reads an exported file (the readable JSON). Throws if it can't. */
export function importJson(text: string): AppData {
  return withDefaults(fromReadableJson(text));
}

/**
 * Reads an exported file: the readable JSON, or protobuf binary (an export,
 * or the file Drive sync keeps). Throws if it can't.
 */
export function importFile(bytes: Uint8Array): AppData {
  return readFile(bytes, {json: importJson, binary: readStored});
}

/** Saves a file with the browser's download, named for today. */
function download(blob: Blob, extension: string) {
  // Today's local date: the UTC one is still yesterday just after midnight.
  downloadFile(blob, `dashboard-${todayISO()}.${extension}`);
}

/** Saves the data as readable JSON (the browser's download). */
export function downloadJson(data: AppData) {
  download(
    new Blob([toReadableJson(data)], {type: 'application/json'}),
    'json',
  );
}

/**
 * Saves the data as protobuf binary (the browser's download): exactly as
 * it's stored, and as Drive sync keeps it.
 */
export function downloadBinary(data: AppData) {
  download(
    new Blob([encode(data)], {type: 'application/octet-stream'}),
    'binpb',
  );
}
