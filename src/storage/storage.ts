import {del, get, set, setMany} from 'idb-keyval';
import type {AppData} from '../model/types';
import type {SyncBase} from '../sync/sync';
import {fromStored, toEnvelope, type Envelope} from './codec';
import {fromV1} from './from_v1';
import {toV1} from './to_v1';

/**
 * Persistence boundary. The data lives in IndexedDB on every device; Google
 * Drive sync (sync/) works on top of it, so the app works offline. Everything
 * is stored in the format of codec.ts; older formats are read too.
 */
interface Storage {
  load(): Promise<AppData | null>;
  save(data: AppData): Promise<void>;
}

const KEY = 'personal-dashboard/data';
const BASE_KEY = 'personal-dashboard/sync-base';

export class IndexedDbStorage implements Storage {
  async load(): Promise<AppData | null> {
    const raw = await get<unknown>(KEY);
    return raw == null ? null : readStored(raw);
  }

  async save(data: AppData): Promise<void> {
    await set(KEY, toStored(data));
  }

  /** What this device and Drive agreed on at the last sync. */
  async loadSyncBase(): Promise<SyncBase | null> {
    const raw = await get<StoredBase>(BASE_KEY);
    return raw ? {...raw, data: readStored(raw.data)} : null;
  }

  /**
   * Saves synced data with its base in one transaction. Saved apart, a crash
   * in between could make an old local copy look like a fresh edit, and the
   * next sync would upload it over newer data.
   */
  async saveSynced(data: AppData, base: SyncBase): Promise<void> {
    const stored: StoredBase = {...base, data: toStored(base.data)};
    await setMany([
      [KEY, toStored(data)],
      [BASE_KEY, stored],
    ]);
  }

  async clearSyncBase(): Promise<void> {
    await del(BASE_KEY);
  }
}

/** The sync base as stored: its data in the stored format. */
interface StoredBase extends Omit<SyncBase, 'data'> {
  data: unknown;
}

/** Reads data stored in any format this version knows. Throws on anything else. */
export function readStored(raw: unknown): AppData {
  return toV1(fromStored(raw));
}

/** The stored form of the data. */
export function toStored(data: AppData): Envelope {
  return toEnvelope(fromV1(data));
}

/** The data as a JSON file: Drive's copy and exports. */
export function exportJson(data: AppData): string {
  return JSON.stringify(toStored(data), null, 2);
}

/** Saves the data as a JSON file (the browser's download). */
export function downloadJson(data: AppData) {
  const blob = new Blob([exportJson(data)], {type: 'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `dashboard-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
