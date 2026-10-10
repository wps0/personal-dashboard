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
    expect(d.settings.capacity).toHaveLength(7);
  });
});
