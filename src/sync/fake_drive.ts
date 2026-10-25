import type {DriveFile} from '../google/drive';
import {readStored} from '../storage/storage';
import type {Remote} from './sync';

/** An in-memory Drive for tests: versions grow on every write, like Drive's. */
export class FakeDrive implements Remote {
  files = new Map<
    string,
    {content: Uint8Array; version: number; created?: string}
  >();
  /** Trashed files, with the file each was merged into. */
  trashed = new Map<string, string>();
  /** The readable copy, as last written. */
  copy: string | null = null;
  calls: string[] = [];
  private next = 1;

  private info(id: string): DriveFile {
    const f = this.files.get(id)!;
    return {
      id,
      version: String(f.version),
      modifiedTime: '2026-10-13T10:00:00Z',
      createdTime: f.created ?? '2026-10-13T09:00:00.000Z',
    };
  }

  async listFiles() {
    this.calls.push('list');
    // Newest first, so callers can't rely on the order.
    return [...this.files.keys()].reverse().map(id => this.info(id));
  }
  async fileInfo(id: string) {
    this.calls.push('info');
    return this.files.has(id) ? this.info(id) : null;
  }
  async trash(id: string, into: string) {
    this.calls.push('trash');
    if (this.files.delete(id)) this.trashed.set(id, into);
  }
  async mergedInto(id: string) {
    this.calls.push('merged-into');
    return this.trashed.get(id) ?? null;
  }
  async download(id: string) {
    this.calls.push('download');
    return this.files.get(id)!.content;
  }
  async createFile(content: Uint8Array) {
    this.calls.push('create');
    const n = this.next++;
    const id = `f${n}`;
    const created = new Date(Date.UTC(2026, 9, 13, 10, 0, n)).toISOString();
    this.files.set(id, {content, version: 1, created});
    return this.info(id);
  }
  async updateFile(id: string, content: Uint8Array) {
    this.calls.push('update');
    const f = this.files.get(id)!;
    this.files.set(id, {...f, content, version: f.version + 1});
    return this.info(id);
  }
  async writeCopy(text: string) {
    this.calls.push('copy');
    this.copy = text;
  }
  /** The data currently in the (only) file. */
  content() {
    return readStored([...this.files.values()].at(-1)!.content);
  }
}
