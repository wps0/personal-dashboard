import 'fake-indexeddb/auto';
import {create, equals} from '@bufbuild/protobuf';
import {get, set} from 'idb-keyval';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {sampleData} from '../model/sample';
import {CalendarView} from '../model/types';
import {encode, toReadableJson} from './codec';
import {IndexedDbStorage, importJson} from './storage';

function sameData(a: pb.AppData, b: pb.AppData) {
  return equals(pb.AppDataSchema, a, b);
}

describe('storage', () => {
  it('round-trips data through IndexedDB, as protobuf binary', async () => {
    const s = new IndexedDbStorage();
    expect(await s.load()).toBeNull();
    const data = sampleData('2026-10-10');
    await s.save(data);
    expect(await get('personal-dashboard/data')).toBeInstanceOf(Uint8Array);
    expect(sameData((await s.load())!, data)).toBe(true);
  });

  it('saves synced data and its base together, and forgets the base', async () => {
    const s = new IndexedDbStorage();
    const data = sampleData('2026-10-10');
    await s.saveSynced(data, {fileId: 'f1', version: '3', data});
    const base = (await s.loadSyncBase())!;
    expect([base.fileId, base.version]).toEqual(['f1', '3']);
    expect(sameData(base.data, data)).toBe(true);
    expect(sameData((await s.load())!, data)).toBe(true);
    await s.clearSyncBase();
    expect(await s.loadSyncBase()).toBeNull();
  });

  it('refuses data in an older format instead of overwriting it', async () => {
    await set('personal-dashboard/data', {version: 1, areas: []});
    await expect(new IndexedDbStorage().load()).rejects.toThrow(
      /no longer reads/,
    );
  });

  it('fills in settings an older or newer version left out', async () => {
    await set('personal-dashboard/data', encode(create(pb.AppDataSchema)));
    const d = (await new IndexedDbStorage().load())!;
    expect(d.settings.defaultEventMinutes).toBe(60);
    expect(d.settings.defaultCalendarView).toBe(CalendarView.WEEK);
    expect(d.settings.capacityRules[0].windows).toHaveLength(7);
    expect(d.settings.usos.source.case).toBeUndefined();
  });

  it('imports an exported file', () => {
    const data = sampleData('2026-10-10');
    expect(sameData(importJson(toReadableJson(data)), data)).toBe(true);
    expect(() => importJson('{"version": 1}')).toThrow();
  });
});
