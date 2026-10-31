import {create, toBinary} from '@bufbuild/protobuf';
import {beforeEach, describe, expect, it, vi} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {encode, SCHEMA_VERSION, toReadableJson} from '../storage/codec';
import {sampleData} from '../model/sample';
import {emptyData, type AppData} from '../model/types';
import {FakeDrive} from './fake_drive';
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

function area(id: string) {
  return create(pb.AreaSchema, {id, name: id, color: '#ffffff'});
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
    expect(drive.calls).toEqual(['list', 'info']); // no download, no upload
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

  it('carries the order of the areas to the other device', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const phone = new Device(emptyData(), drive);
    await phone.sync();
    const order = (d: AppData) => d.areas.map(a => a.name);

    laptop.data = edit(laptop.data, d => d.areas.reverse());
    await laptop.sync();
    expect((await phone.sync()).kind).toBe('pulled');
    expect(order(phone.data)).toEqual(order(laptop.data));
  });

  it('keeps the areas’ new order when the other device edited one meanwhile', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const phone = new Device(emptyData(), drive);
    await phone.sync();
    const reversed = sample()
      .areas.map(a => a.id)
      .reverse();

    // Reordered on the laptop, and an area renamed on the phone before it
    // had synced.
    laptop.data = edit(laptop.data, d => d.areas.reverse());
    await laptop.sync();
    phone.data = edit(phone.data, d => (d.areas[0].name = 'Uni'));
    expect((await phone.sync()).kind).toBe('merged');
    expect((await laptop.sync()).kind).toBe('pulled');

    for (const device of [laptop, phone]) {
      expect(device.data.areas.map(a => a.id)).toEqual(reversed);
      expect(device.data.areas.at(-1)!.name).toBe('Uni');
    }
  });

  it('asks before mixing a device’s own data with Drive’s on the first sync', async () => {
    await new Device(sample(), drive).sync();
    const own = edit(emptyData(), d => {
      d.areas.push(
        create(pb.AreaSchema, {id: 'a-own', name: 'Own', color: '#ffffff'}),
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

  it('takes Drive’s data on a device whose notes were all cleared', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const phone = new Device(
      edit(emptyData(), d => {
        d.dayNotes['2026-10-13'] = '';
        d.monthNotes['2026-10'] = '';
      }),
      drive,
    );
    expect((await phone.sync()).kind).toBe('pulled');
    expect(same(phone.data, laptop.data)).toBe(true);
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
    expect(drive.calls).toEqual(['list', 'info', 'update', 'copy']);
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

  it('treats another Google account’s file like a first sync', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    // Signed in with another account, whose Drive has other data.
    const other = new FakeDrive();
    const theirs = edit(emptyData(), d => {
      d.areas.push(
        create(pb.AreaSchema, {
          id: 'a-theirs',
          name: 'Theirs',
          color: '#ffffff',
        }),
      );
    });
    other.files.set('g1', {content: encode(theirs), version: 3});
    const switched = new Device(laptop.data, other);
    switched.base = laptop.base;
    other.calls = [];
    // Not taken as this account deleting everything else.
    expect((await switched.sync()).kind).toBe('choose');
    expect(other.calls).not.toContain('update');

    expect((await switched.sync('merge')).kind).toBe('merged');
    expect(switched.data.areas.map(a => a.id).sort()).toEqual(
      [...sample().areas.map(a => a.id), 'a-theirs'].sort(),
    );
    expect(switched.data.items.length).toBe(sample().items.length);
    expect(same(other.content(), switched.data)).toBe(true);
  });

  it('treats a file another device made anew like a first sync', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    const phone = new Device(emptyData(), drive);
    await phone.sync();
    // The file is deleted; the phone, short of an event, makes a new one.
    drive.files.clear();
    phone.data = edit(phone.data, d => d.events.shift());
    expect((await phone.sync()).kind).toBe('created');

    laptop.data = edit(laptop.data, d => (d.items[0].title = 'Laptop'));
    expect((await laptop.sync()).kind).toBe('choose');
    expect((await laptop.sync('merge')).kind).toBe('merged');
    expect(laptop.data.events.length).toBe(sample().events.length);
    expect(laptop.data.items[0].title).toBe('Laptop');
    expect(same(drive.content(), laptop.data)).toBe(true);
  });

  describe('with more than one sync file', () => {
    /** The phone's first sync made a second file: the search lagged behind the laptop's. */
    async function twoFiles(phoneData: AppData, laptopData = sample()) {
      const laptop = new Device(laptopData, drive);
      await laptop.sync();
      vi.spyOn(drive, 'listFiles').mockResolvedValueOnce([]);
      const phone = new Device(phoneData, drive);
      expect((await phone.sync()).kind).toBe('created');
      expect([...drive.files.keys()]).toEqual(['f1', 'f2']);
      return {laptop, phone};
    }
    const phoneOnly = () =>
      edit(emptyData(), d => d.areas.push(area('a-phone'), area('a-old')));

    it('merges them into the oldest and trashes the rest; both devices keep each other’s records', async () => {
      const {laptop, phone} = await twoFiles(phoneOnly());
      expect((await laptop.sync()).kind).toBe('pulled');
      expect([...drive.files.keys()]).toEqual(['f1']);
      expect(drive.trashed.get('f2')).toBe('f1');
      expect(laptop.data.areas.map(a => a.id)).toContain('a-phone');
      expect(laptop.data.items.length).toBe(sample().items.length);
      expect(drive.copy).toBe(toReadableJson(drive.content()));

      // The phone, still on the trashed file, carries on with the oldest.
      phone.data = edit(phone.data, d => (d.dayNotes['2026-10-14'] = 'phone'));
      expect((await phone.sync()).kind).toBe('merged');
      expect(phone.base?.fileId).toBe('f1');
      expect(phone.data.items.length).toBe(sample().items.length);
      expect((await laptop.sync()).kind).toBe('pulled');
      expect(laptop.data.dayNotes['2026-10-14']).toBe('phone');
      expect(same(laptop.data, phone.data)).toBe(true);
    });

    it('keeps the edits of a device on the other file, deletions too', async () => {
      const {phone} = await twoFiles(phoneOnly());
      // Edited before the merge: one area deleted, a note added.
      phone.data = edit(phone.data, d => {
        d.areas = d.areas.filter(a => a.id !== 'a-old');
        d.dayNotes['2026-10-14'] = 'phone';
      });
      const res = await phone.sync();
      expect(res.kind).toBe('merged'); // not asked, as for an unrelated file
      expect(drive.trashed.get('f2')).toBe('f1');
      const areas = phone.data.areas.map(a => a.id);
      expect(areas).toContain('a-phone');
      expect(areas).not.toContain('a-old');
      expect(phone.data.dayNotes['2026-10-14']).toBe('phone');
      expect(phone.data.projects.length).toBe(sample().projects.length);
      expect(same(drive.content(), phone.data)).toBe(true);
    });

    it('reports values the files have differently, keeping the oldest file’s', async () => {
      const own = sample();
      const {title} = own.items[0];
      const {laptop} = await twoFiles(
        edit(own, d => (d.items[0].title = 'Phone')),
        own,
      );
      const res = await laptop.sync();
      expect(res.kind !== 'choose' && res.conflicts).toEqual([
        {
          path: ['items', own.items[0].id, 'title'],
          local: title,
          remote: 'Phone',
        },
      ]);
      expect(drive.content().items[0].title).toBe(title);
    });

    it('converges when two devices merge them at once', async () => {
      const {laptop, phone} = await twoFiles(phoneOnly());
      await Promise.all([laptop.sync(), phone.sync()]);
      expect([...drive.files.keys()]).toEqual(['f1']);
      expect(same(laptop.data, phone.data)).toBe(true);
      expect(laptop.data.areas.map(a => a.id)).toContain('a-phone');

      phone.data = edit(phone.data, d => (d.dayNotes['2026-10-14'] = 'phone'));
      await phone.sync();
      expect((await laptop.sync()).kind).toBe('pulled');
      expect(same(laptop.data, phone.data)).toBe(true);
    });

    it('takes the oldest on a new device', async () => {
      await twoFiles(phoneOnly());
      const tablet = new Device(emptyData(), drive);
      expect((await tablet.sync()).kind).toBe('pulled');
      expect(tablet.base?.fileId).toBe('f1');
      expect(tablet.data.areas.map(a => a.id)).toContain('a-phone');
      expect(tablet.data.items.length).toBe(sample().items.length);
    });

    it('leaves them all alone while one can’t be read', async () => {
      const {laptop, phone} = await twoFiles(phoneOnly());
      const newer = toBinary(
        pb.AppDataSchema,
        create(pb.AppDataSchema, {schemaVersion: SCHEMA_VERSION + 1}),
      );
      drive.files.set('f2', {
        ...drive.files.get('f2')!,
        content: newer,
        version: 9,
      });
      laptop.data = edit(laptop.data, d => (d.items[0].title = 'x'));
      expect((await laptop.sync()).kind).toBe('pushed');
      expect([...drive.files.keys()]).toEqual(['f1', 'f2']);
      expect(drive.files.get('f2')!.content).toBe(newer);
      expect(drive.calls).not.toContain('trash');
      await expect(phone.sync()).rejects.toThrow(/can’t be read/);
    });
  });

  it('makes a new file if the old one was deleted', async () => {
    const laptop = new Device(sample(), drive);
    await laptop.sync();
    drive.files.clear();
    expect((await laptop.sync()).kind).toBe('created');
    expect(same(drive.content(), laptop.data)).toBe(true);
  });
});
