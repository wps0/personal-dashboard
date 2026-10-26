/**
 * @fileoverview Persistence. The data lives in IndexedDB on every device, as
 * protobuf binary (codec.ts); Google Drive sync (sync/) works on top of it,
 * so the app works offline.
 */

import {del, delMany, get, set, setMany} from 'idb-keyval';
import {todayISO} from '../model/dates';
import {withDefaults, type AppData} from '../model/types';
import type {SyncBase} from '../sync/sync';
import {decode, encode, fromReadableJson, toReadableJson} from './codec';

const KEY = 'personal-dashboard/data';
const BASE_KEY = 'personal-dashboard/sync-base';

/** The sync base as stored: its data encoded. */
interface StoredBase extends Omit<SyncBase, 'data'> {
  data: Uint8Array;
}

/** Reads stored data. Throws if it isn't data this version can read. */
export function readStored(bytes: Uint8Array): AppData {
  return withDefaults(decode(bytes));
}

export class IndexedDbStorage {
  async load(): Promise<AppData | null> {
    const raw = await get<unknown>(KEY);
    if (raw == null) return null;
    if (!(raw instanceof Uint8Array))
      throw new Error(
        'The saved data is in a format this app no longer reads.',
      );
    return readStored(raw);
  }

  async save(data: AppData): Promise<void> {
    await set(KEY, encode(data));
  }

  /** What this device and Drive agreed on at the last sync. */
  async loadSyncBase(): Promise<SyncBase | null> {
    const raw = await get<unknown>(BASE_KEY);
    if (!raw) return null;
    const base = raw as Partial<StoredBase>;
    // From an older version of the app: start afresh with Drive.
    if (!(base.data instanceof Uint8Array)) return null;
    return {...(base as StoredBase), data: readStored(base.data)};
  }

  /**
   * Saves synced data with its base in one transaction. Saved apart, a crash
   * in between could make an old local copy look like a fresh edit, and the
   * next sync would upload it over newer data.
   */
  async saveSynced(data: AppData, base: SyncBase): Promise<void> {
    const stored: StoredBase = {...base, data: encode(base.data)};
    await setMany([
      [KEY, encode(data)],
      [BASE_KEY, stored],
    ]);
  }

  async clearSyncBase(): Promise<void> {
    await del(BASE_KEY);
  }

  /**
   * The saved data exactly as stored, for keeping a copy of data that can't
   * be read: protobuf binary, or the JSON an older version saved.
   */
  async loadRaw(): Promise<Blob | null> {
    const raw = await get<unknown>(KEY);
    if (raw == null) return null;
    return raw instanceof Uint8Array
      ? new Blob([raw as Uint8Array<ArrayBuffer>], {
          type: 'application/octet-stream',
        })
      : new Blob([JSON.stringify(raw)], {type: 'application/json'});
  }

  /** Deletes the saved data and the sync base: the app starts empty. */
  async reset(): Promise<void> {
    await delMany([KEY, BASE_KEY]);
  }
}

/** Reads an exported file (the readable JSON). Throws if it can't. */
export function importJson(text: string): AppData {
  return withDefaults(fromReadableJson(text));
}

/** Saves the data as readable JSON (the browser's download). */
export function downloadJson(data: AppData) {
  const blob = new Blob([toReadableJson(data)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  // Today's local date: the UTC one is still yesterday just after midnight.
  a.download = `dashboard-${todayISO()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
