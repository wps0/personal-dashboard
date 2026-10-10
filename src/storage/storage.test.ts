import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { sampleData } from '../model/sample';
import { IndexedDbStorage, parseAppData } from './storage';

describe('storage', () => {
  it('round-trips data through IndexedDB', async () => {
    const s = new IndexedDbStorage();
    expect(await s.load()).toBeNull();
    const data = sampleData('2026-10-10');
    await s.save(data);
    expect(await s.load()).toEqual(data);
  });

  it('rejects malformed or future-version imports', () => {
    expect(() => parseAppData(null)).toThrow();
    expect(() => parseAppData({ version: 2 })).toThrow(/version/);
    expect(() => parseAppData({ version: 1, areas: [] })).toThrow(/projects/);
  });

  it('fills in missing optional sections', () => {
    const d = parseAppData({ version: 1, areas: [], projects: [], items: [], allocations: [] });
    expect(d.dayNotes).toEqual({});
    expect(d.settings.capacityRules[0].windows).toHaveLength(7);
    expect(d.settings.defaultEventMinutes).toBe(60);
  });

  it('keeps a valid default event length and rejects junk', () => {
    const base = { version: 1, areas: [], projects: [], items: [], allocations: [] };
    expect(parseAppData({ ...base, settings: { defaultEventMinutes: 15 } }).settings.defaultEventMinutes).toBe(15);
    expect(parseAppData({ ...base, settings: { defaultEventMinutes: 0 } }).settings.defaultEventMinutes).toBe(60);
    expect(parseAppData({ ...base, settings: { defaultEventMinutes: 'x' } }).settings.defaultEventMinutes).toBe(60);
  });

  it('keeps a valid default calendar view, falling back to week', () => {
    const base = { version: 1, areas: [], projects: [], items: [], allocations: [] };
    expect(parseAppData({ ...base, settings: { defaultCalendarView: 'month' } }).settings.defaultCalendarView).toBe('month');
    expect(parseAppData({ ...base, settings: { defaultCalendarView: 'year' } }).settings.defaultCalendarView).toBe('week');
    expect(parseAppData(base).settings.defaultCalendarView).toBe('week');
  });

  it('migrates old data: fixed capacity hours and lecture statuses', () => {
    const d = parseAppData({
      version: 1,
      areas: [],
      projects: [],
      items: [{ id: 'x', projectId: 'p', kind: 'lecture', title: 'L1', status: 'notes', createdAt: '' }],
      allocations: [],
      settings: { capacity: [2, 2, 2, 2, 2, 5, 5] },
    });
    expect(d.items[0].status).toBe('done');
    expect(d.settings.capacityRules[0].windows[5]).toEqual({ start: '10:00', end: '15:00' });
  });
});
