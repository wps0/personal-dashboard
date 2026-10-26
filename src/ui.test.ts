import {describe, expect, it, vi} from 'vitest';

const saved = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => saved.get(k) ?? null,
  setItem: (k: string, v: string) => void saved.set(k, v),
  removeItem: (k: string) => void saved.delete(k),
});

const {emptyData} = await import('./model/types');
const {useStore} = await import('./store');
const {adoptFoldedGroups} = await import('./ui');

const KEY = 'personal-dashboard/collapsed-groups';

describe('adoptFoldedGroups', () => {
  it('moves the folds this device kept into the data, once', () => {
    useStore.getState().replaceAll(emptyData());
    const s = useStore.getState();
    const area = s.addArea('University');
    const p = s.addProject(area, 'Analiza');
    const q = s.addProject(area, 'Algebra');
    const a = s.addGroup(p, 'Lectures');
    s.addGroup(p, 'Labs');
    saved.set(KEY, JSON.stringify([a, `${p}:none`, 'a-deleted-group']));

    adoptFoldedGroups();
    const project = (id: string) =>
      useStore.getState().data.projects.find(x => x.id === id)!;
    expect(project(p).groups.map(g => g.collapsed)).toEqual([true, false]);
    expect(project(p).ungroupedCollapsed).toBe(true);
    expect(project(q).ungroupedCollapsed).toBe(false);
    expect(saved.has(KEY)).toBe(false);

    // Unfolded since: the old list doesn't fold it again.
    useStore.getState().setGroupCollapsed(p, a, false);
    adoptFoldedGroups();
    expect(project(p).groups[0].collapsed).toBe(false);
  });

  it('leaves the data alone when nothing was folded', () => {
    useStore.getState().replaceAll(emptyData());
    const before = useStore.getState().data;
    adoptFoldedGroups();
    expect(useStore.getState().data).toBe(before);
  });
});
