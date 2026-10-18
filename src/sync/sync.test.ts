import {create, toBinary} from '@bufbuild/protobuf';
import {beforeEach, describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/v2/data_pb';
import {SCHEMA_VERSION, toReadableJson} from '../storage/codec';
import {sampleData} from '../model/sample';
import {emptyData, type AppData} from '../model/types';
import {FakeDrive} from './fakeDrive';
import {same} from './merge';
import {syncOnce, type SyncBase} from './sync';

function sample() {
  return structuredClone(sampleData('2026-10-12'));
}
function edit(d: AppData, f: (d: AppData) => void) {
  const c = structuredClone(d);
  f(c);
  return c;
}

/** A device: its data and its base, synced with `drive`. */
class Device {
  base: SyncBase | null = null;
  constructor(
    public data: AppData,
    private drive: FakeDrive,
  ) {}
  async sync(choice?: 'drive' | 'merge') {
    const res = await syncOnce(this.data, this.base, this.drive, choice);
    if (res.kind !== 'choose') [this.data, this.base] = [res.data, res.base];
    return res;
  }
}

describe('syncOnce', () => {
  let drive: FakeDrive;
  beforeEach(() => (drive = new FakeDrive()));

  it('creates the file on the first sync, then does nothing while nothing changes', async () => {
    const laptop = new Device(sample(), drive);
    expect((await laptop.sync()).kind).toBe('created');
    expect(same(drive.content(), laptop.data)).toBe(true);
    drive.calls = [];
    expect((await laptop.sync()).kind).toBe('up-to-date');
    expect(drive.calls).toEqual(['info']); // no download, no upload
  });

  it('brings a new device up to date, and carries edits both ways', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const phone = new Device(emptyData(), drive);
    expect((await phone.sync()).kind).toBe('pulled');
    expect(same(phone.data, laptop.data)).toBe(true);

    phone.data = edit(phone.data, d => (d.items[0].title = 'From the phone'));
    expect((await phone.sync()).kind).toBe('pushed');
    expect((await laptop.sync()).kind).toBe('pulled');
    expect(laptop.data.items[0].title).toBe('From the phone');
  });

  it('merges when both devices changed, and uploads the result', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const phone = new Device(emptyData(), drive);
    await phone.sync();

    phone.data = edit(phone.data, d => (d.items[0].notes = 'phone'));
    await phone.sync();
    laptop.data = edit(laptop.data, d => (d.items[1].notes = 'laptop'));
    const res = await laptop.sync();
    expect(res.kind).toBe('merged');
    expect(res.kind !== 'choose' && res.conflicts).toEqual([]);
    expect(laptop.data.items[0].notes).toBe('phone');
    expect(laptop.data.items[1].notes).toBe('laptop');

    expect((await phone.sync()).kind).toBe('pulled');
    expect(same(phone.data, laptop.data)).toBe(true);
  });

  it('asks before mixing a device’s own data with Drive’s on the first sync', async () => {
    await new Device(sample(), drive).sync();
    const own = edit(emptyData(), d => {
      d.areas.push(
        create(pb.AreaSchema, {id: 'a-own', name: 'Own', color: '#fff'}),
      );
    });
    const other = new Device(own, drive);
    drive.calls = [];
    expect((await other.sync()).kind).toBe('choose');
    expect(drive.calls).not.toContain('update');

    // Merge keeps both.
    expect((await other.sync('merge')).kind).toBe('merged');
    expect(other.data.areas.map(a => a.id)).toContain('a-own');
    expect(other.data.projects.length).toBe(sample().projects.length);
    expect(same(drive.content(), other.data)).toBe(true);
  });

  it('can replace a device’s data with Drive’s on the first sync', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const other = new Device(
      edit(emptyData(), d => (d.dayNotes['2026-10-13'] = 'x')),
      drive,
    );
    expect((await other.sync('drive')).kind).toBe('pulled');
    expect(same(other.data, laptop.data)).toBe(true);
  });

  it('never overwrites Drive data it can’t read', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const id = [...drive.files.keys()][0];
    const newer = toBinary(
      pb.AppDataSchema,
      create(pb.AppDataSchema, {schemaVersion: SCHEMA_VERSION + 1}),
    );
    drive.files.set(id, {content: newer, version: 9});
    laptop.data = edit(laptop.data, d => (d.items[0].title = 'x'));
    await expect(laptop.sync()).rejects.toThrow(/can’t be read.*newer version/);
    expect(drive.files.get(id)!.content).toBe(newer);
  });

  it('writes the readable copy after every upload, and only then', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    expect(drive.copy).toBe(toReadableJson(laptop.data));

    const phone = new Device(emptyData(), drive);
    drive.calls = [];
    await phone.sync();
    expect(drive.calls).not.toContain('copy');

    phone.data = edit(phone.data, d => (d.items[0].title = 'From the phone'));
    drive.calls = [];
    await phone.sync();
    expect(drive.calls).toEqual(['info', 'update', 'copy']);
    expect(drive.copy).toBe(toReadableJson(phone.data));
  });

  it('syncs even if the readable copy can’t be written', async () => {
    drive.writeCopy = () => Promise.reject(new Error('quota'));
    const laptop = new Device(sample(), drive);
    expect((await laptop.sync()).kind).toBe('created');
    laptop.data = edit(laptop.data, d => (d.items[0].title = 'x'));
    expect((await laptop.sync()).kind).toBe('pushed');
    expect(drive.content().items[0].title).toBe('x');
  });

  it('makes a new file if the old one was deleted', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    drive.files.clear();
    expect((await laptop.sync()).kind).toBe('created');
    expect(same(drive.content(), laptop.data)).toBe(true);
  });
});
