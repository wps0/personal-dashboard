import {create} from 'zustand';
import {GoogleApiError} from '../google/errors';
import type {AppData} from '../model/types';
import {mergeData, type Conflict} from './merge';
import {
  syncOnce,
  type FirstSyncChoice,
  type Remote,
  type SyncBase,
} from './sync';

export type SyncStatus =
  | {kind: 'off'}
  | {kind: 'idle'}
  | {kind: 'syncing'}
  /** No Google token with Drive access: sign in (again) to sync. */
  | {kind: 'signed-out'}
  | {kind: 'offline'}
  | {kind: 'error'; message: string; help?: string}
  /** First sync (or a new file), and Drive has different data: the user decides. */
  | {
      kind: 'choose';
      drive: {projects: number; items: number; modifiedTime: string};
    };

interface SyncState {
  status: SyncStatus;
  /** When the last sync finished (ms). */
  lastSynced?: number;
}

/** Sync status for the UI. */
export const useSync = create<SyncState>()(() => ({status: {kind: 'off'}}));

export interface SyncDeps {
  remote: Remote;
  getData(): AppData;
  setData(data: AppData): void;
  /** Whether there is a Google token with Drive access. */
  canSync(): boolean;
  loadBase(): Promise<SyncBase | null>;
  /** Saves the data and the base together, so neither is ever stored without the other. */
  saveSynced(data: AppData, base: SyncBase): Promise<void>;
  clearBase(): Promise<void>;
  /** Some values were changed differently on both sides; this device's were kept. */
  onConflicts?(conflicts: Conflict[]): void;
}

/**
 * Runs syncs one at a time. A sync requested while one is running runs
 * again right after it, so the latest edits always get uploaded.
 */
export class SyncRunner {
  private running: Promise<void> | null = null;
  private again = false;
  private base: SyncBase | null | undefined;
  /** The data the last sync put into the store; that change isn't an edit to upload. */
  applied?: AppData;

  constructor(private readonly deps: SyncDeps) {}

  sync(choice?: FirstSyncChoice): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.loop(choice).finally(() => (this.running = null));
    return this.running;
  }

  /** Turns sync off on this device; turning it on again starts afresh. */
  async stop() {
    await this.running;
    this.base = null;
    await this.deps.clearBase();
    useSync.setState({status: {kind: 'off'}, lastSynced: undefined});
  }

  private async loop(choice?: FirstSyncChoice) {
    do {
      this.again = false;
      if (!(await this.once(choice))) return;
      choice = undefined;
    } while (this.again);
  }

  /** One sync; false when there's no point trying again right away. */
  private async once(choice?: FirstSyncChoice): Promise<boolean> {
    const {deps} = this;
    const {status} = useSync.getState();
    // Waiting for the user to choose; automatic syncs would only ask again.
    if (status.kind === 'choose' && !choice) return false;
    if (!deps.canSync()) {
      useSync.setState({status: {kind: 'signed-out'}});
      return false;
    }
    useSync.setState({status: {kind: 'syncing'}});
    try {
      this.base ??= await deps.loadBase();
      const local = deps.getData();
      const res = await syncOnce(local, this.base, deps.remote, choice);
      if (res.kind === 'choose') {
        useSync.setState({
          status: {
            kind: 'choose',
            drive: {
              projects: res.remote.projects.length,
              items: res.remote.items.length,
              modifiedTime: res.file.modifiedTime,
            },
          },
        });
        return false;
      }
      // Edits made while the sync was running are merged in as this device's.
      const now = deps.getData();
      const late = now === local ? null : mergeData(local, now, res.data);
      const data = late ? late.data : res.data;
      if (data !== now) {
        this.applied = data;
        deps.setData(data);
      }
      await deps.saveSynced(data, res.base);
      this.base = res.base;
      if (data !== res.data) this.again = true; // upload those edits
      const conflicts = [...res.conflicts, ...(late?.conflicts ?? [])];
      if (conflicts.length) deps.onConflicts?.(conflicts);
      useSync.setState({status: {kind: 'idle'}, lastSynced: Date.now()});
      return true;
    } catch (e) {
      useSync.setState({status: statusOf(e)});
      return false;
    }
  }
}

function statusOf(e: unknown): SyncStatus {
  if (e instanceof GoogleApiError) {
    if (e.kind === 'expired') return {kind: 'signed-out'};
    if (e.kind === 'offline') return {kind: 'offline'};
    return {kind: 'error', message: e.message, help: e.help};
  }
  return {kind: 'error', message: String((e as Error)?.message ?? e)};
}
