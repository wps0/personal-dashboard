import {del, get, set, setMany} from 'idb-keyval';
import type {AppData} from '../model/types';
import type {SyncBase} from '../sync/sync';
import {parseAppData} from './parse_v1';

/**
 * Persistence boundary. The data lives in IndexedDB on every device; Google
 * Drive sync (sync/) works on top of it, so the app works offline.
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
    return raw == null ? null : parseAppData(raw);
  }

  async save(data: AppData): Promise<void> {
    await set(KEY, data);
  }

  /** What this device and Drive agreed on at the last sync. */
  async loadSyncBase(): Promise<SyncBase | null> {
    const raw = await get<SyncBase>(BASE_KEY);
    return raw ? {...raw, data: parseAppData(raw.data)} : null;
  }

  /**
   * Saves synced data with its base in one transaction. Saved apart, a crash
   * in between could make an old local copy look like a fresh edit, and the
   * next sync would upload it over newer data.
   */
  async saveSynced(data: AppData, base: SyncBase): Promise<void> {
    await setMany([
      [KEY, data],
      [BASE_KEY, base],
    ]);
  }

  async clearSyncBase(): Promise<void> {
    await del(BASE_KEY);
  }
}

export function exportJson(data: AppData): string {
  return JSON.stringify(data, null, 2);
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
