import 'fake-indexeddb/auto';
import {get, set} from 'idb-keyval';
import {describe, expect, it} from 'vitest';
import {sampleData} from '../model/sample';
import {CalendarView, ItemKind, ItemStatus} from '../model/types';
import {parseAppData} from './parse_v1';
import {IndexedDbStorage} from './storage';
import v1Sample from './testdata/v1_sample.json';

describe('storage', () => {
  it('round-trips data through IndexedDB', async () => {
    const s = new IndexedDbStorage();
    expect(await s.load()).toBeNull();
    const data = sampleData('2026-10-10');
    await s.save(data);
    expect(await s.load()).toEqual(data);
  });

  it('saves synced data and its base together, and forgets the base', async () => {
    const s = new IndexedDbStorage();
    const data = sampleData('2026-10-10');
    const base = {fileId: 'f1', version: '3', data};
    await s.saveSynced(data, base);
    expect(await s.load()).toEqual(data);
    expect(await s.loadSyncBase()).toEqual(base);
    await s.clearSyncBase();
    expect(await s.loadSyncBase()).toBeNull();
    expect(await s.load()).toEqual(data);
  });

  it('stores the protobuf format, and still reads v1 data', async () => {
    const data = sampleData('2026-10-10');
    await new IndexedDbStorage().save(data);
    expect(await get('personal-dashboard/data')).toMatchObject({format: 2});

    await set('personal-dashboard/data', structuredClone(v1Sample));
    expect(await new IndexedDbStorage().load()).toEqual(
      parseAppData(structuredClone(v1Sample)),
    );
  });

  it('rejects malformed or future-version imports', () => {
    expect(() => parseAppData(null)).toThrow();
    expect(() => parseAppData({version: 2})).toThrow(/version/);
    expect(() => parseAppData({version: 1, areas: []})).toThrow(/projects/);
  });

  it('fills in missing optional sections', () => {
    const d = parseAppData({
      version: 1,
      areas: [],
      projects: [],
      items: [],
      allocations: [],
    });
    expect(d.dayNotes).toEqual({});
    expect(d.settings.capacityRules[0].windows).toHaveLength(7);
    expect(d.settings.defaultEventMinutes).toBe(60);
  });

  it('keeps a valid default event length and rejects junk', () => {
    const base = {
      version: 1,
      areas: [],
      projects: [],
      items: [],
      allocations: [],
    };
    expect(
      parseAppData({...base, settings: {defaultEventMinutes: 15}}).settings
        .defaultEventMinutes,
    ).toBe(15);
    expect(
      parseAppData({...base, settings: {defaultEventMinutes: 0}}).settings
        .defaultEventMinutes,
    ).toBe(60);
    expect(
      parseAppData({...base, settings: {defaultEventMinutes: 'x'}}).settings
        .defaultEventMinutes,
    ).toBe(60);
  });

  it('keeps a valid default calendar view, falling back to week', () => {
    const base = {
      version: 1,
      areas: [],
      projects: [],
      items: [],
      allocations: [],
    };
    expect(
      parseAppData({...base, settings: {defaultCalendarView: 'month'}}).settings
        .defaultCalendarView,
    ).toBe(CalendarView.MONTH);
    expect(
      parseAppData({...base, settings: {defaultCalendarView: 'year'}}).settings
        .defaultCalendarView,
    ).toBe(CalendarView.WEEK);
    expect(parseAppData(base).settings.defaultCalendarView).toBe(
      CalendarView.WEEK,
    );
  });

  it('reads the USOS settings, dropping anything malformed', () => {
    const base = {
      version: 1,
      areas: [],
      projects: [],
      items: [],
      allocations: [],
    };
    expect(parseAppData(base).settings.usos).toEqual({
      source: undefined,
      handled: [],
    });
    const ok = {
      source: {kind: 'ical', url: 'https://usosweb.example/plan.ics'},
      handled: ['a@2026-10-14T10:15', 7],
    };
    expect(parseAppData({...base, settings: {usos: ok}}).settings.usos).toEqual(
      {
        source: {kind: 'ical', url: 'https://usosweb.example/plan.ics'},
        handled: ['a@2026-10-14T10:15'],
      },
    );
    expect(
      parseAppData({
        ...base,
        settings: {usos: {source: {kind: 'google'}, handled: 'x'}},
      }).settings.usos,
    ).toEqual({source: undefined, handled: []});
  });

  it('migrates old data: fixed capacity hours and lecture statuses', () => {
    const d = parseAppData({
      version: 1,
      areas: [],
      projects: [],
      items: [
        {
          id: 'x',
          projectId: 'p',
          kind: 'lecture',
          title: 'L1',
          status: 'notes',
          createdAt: '',
        },
      ],
      allocations: [],
      settings: {capacity: [2, 2, 2, 2, 2, 5, 5]},
    });
    expect(d.items[0].status).toBe(ItemStatus.DONE); // was 'notes'
    expect(d.items[0].kind).toBe(ItemKind.CLASS); // was 'lecture'
    expect(d.settings.capacityRules[0].windows[5]).toEqual({
      start: '10:00',
      end: '15:00',
    });
  });
});
