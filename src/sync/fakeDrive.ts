import type {DriveFile} from '../google/drive';
import type {Remote} from './sync';

/** An in-memory Drive for tests: versions grow on every write, like Drive's. */
export class FakeDrive implements Remote {
  files = new Map<string, {content: string; version: number}>();
  calls: string[] = [];
  private next = 1;

  private info(id: string): DriveFile {
    const f = this.files.get(id)!;
    return {
      id,
      version: String(f.version),
      modifiedTime: '2026-10-13T10:00:00Z',
    };
  }

  async findFile() {
    this.calls.push('find');
    const id = [...this.files.keys()].at(-1);
    return id ? this.info(id) : null;
  }
  async fileInfo(id: string) {
    this.calls.push('info');
    return this.files.has(id) ? this.info(id) : null;
  }
  async download(id: string) {
    this.calls.push('download');
    return this.files.get(id)!.content;
  }
  async createFile(content: string) {
    this.calls.push('create');
    const id = `f${this.next++}`;
    this.files.set(id, {content, version: 1});
    return this.info(id);
  }
  async updateFile(id: string, content: string) {
    this.calls.push('update');
    const f = this.files.get(id)!;
    this.files.set(id, {content, version: f.version + 1});
    return this.info(id);
  }
  /** The data currently in the (only) file. */
  content() {
    return JSON.parse([...this.files.values()].at(-1)!.content);
  }
}
