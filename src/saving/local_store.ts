/**
 * @fileoverview Persistence on this device, for any app in this repository:
 * the data in IndexedDB as protobuf binary (proto_codec.ts), with the sync
 * base beside it. Each app has its own keys, and can have its own database.
 */

import {del, delMany, get, set, setMany, type UseStore} from 'idb-keyval';

/** Where this device stands with Drive: the file, and its version and content at the last sync. */
export interface SyncBase<T> {
  fileId: string;
  version: string;
  data: T;
}

/** The sync base as stored: its data encoded. */
interface StoredBase extends Omit<SyncBase<unknown>, 'data'> {
  data: Uint8Array;
}

export interface LocalStoreOptions<T> {
  /** The key of the data. */
  key: string;
  /** The key of the sync base. */
  baseKey: string;
  /** Reads stored bytes; throws if they aren't data this version can read. */
  read(bytes: Uint8Array): T;
  write(data: T): Uint8Array<ArrayBuffer>;
  /** The IndexedDB database and store; idb-keyval's default if unset. */
  store?: UseStore;
}

export class LocalStore<T> {
  constructor(private readonly options: LocalStoreOptions<T>) {}

  async load(): Promise<T | null> {
    const {key, read, store} = this.options;
    const raw = await get<unknown>(key, store);
    if (raw == null) return null;
    if (!(raw instanceof Uint8Array))
      throw new Error(
        'The saved data is in a format this app no longer reads.',
      );
    return read(raw);
  }

  async save(data: T): Promise<void> {
    const {key, write, store} = this.options;
    await set(key, write(data), store);
  }

  /** What this device and Drive agreed on at the last sync. */
  async loadSyncBase(): Promise<SyncBase<T> | null> {
    const {baseKey, read, store} = this.options;
    const raw = await get<unknown>(baseKey, store);
    if (!raw) return null;
    const base = raw as Partial<StoredBase>;
    // From an older version of the app: start afresh with Drive.
    if (!(base.data instanceof Uint8Array)) return null;
    return {...(base as StoredBase), data: read(base.data)};
  }

  /**
   * Saves synced data with its base in one transaction. Saved apart, a crash
   * in between could make an old local copy look like a fresh edit, and the
   * next sync would upload it over newer data.
   */
  async saveSynced(data: T, base: SyncBase<T>): Promise<void> {
    const {key, baseKey, write, store} = this.options;
    const stored: StoredBase = {...base, data: write(base.data)};
    await setMany(
      [
        [key, write(data)],
        [baseKey, stored],
      ],
      store,
    );
  }

  async clearSyncBase(): Promise<void> {
    await del(this.options.baseKey, this.options.store);
  }

  /**
   * The saved data exactly as stored, for keeping a copy of data that can't
   * be read: protobuf binary, or the JSON an older version saved.
   */
  async loadRaw(): Promise<Blob | null> {
    const raw = await get<unknown>(this.options.key, this.options.store);
    if (raw == null) return null;
    return raw instanceof Uint8Array
      ? new Blob([raw as Uint8Array<ArrayBuffer>], {
          type: 'application/octet-stream',
        })
      : new Blob([JSON.stringify(raw)], {type: 'application/json'});
  }

  /** Deletes the saved data and the sync base: the app starts empty. */
  async reset(): Promise<void> {
    const {key, baseKey, store} = this.options;
    await delMany([key, baseKey], store);
  }
}

/**
 * Reads an exported file: the readable JSON, or protobuf binary (an export,
 * or the file Drive sync keeps). Throws if it can't.
 */
export function readFile<T>(
  bytes: Uint8Array,
  read: {json(text: string): T; binary(bytes: Uint8Array): T},
): T {
  // JSON starts with "{" (after a byte-order mark or spaces, which the
  // decoder and trimStart drop); protobuf binary of a root message with the
  // schema version in field 1 can't.
  const start = new TextDecoder().decode(bytes.subarray(0, 16)).trimStart();
  return start.startsWith('{')
    ? read.json(new TextDecoder().decode(bytes))
    : read.binary(bytes);
}

/** Saves a file with the browser's download. */
export function downloadFile(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
