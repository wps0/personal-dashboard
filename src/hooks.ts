import { useMemo } from 'react';
import type { Area, Item, Project } from './model/types';
import { useStore } from './store';

export interface Lookups {
  item(id: string): Item | undefined;
  project(id: string): Project | undefined;
  area(id: string): Area | undefined;
  /** Area color for an item, via its project. */
  color(item: Item | undefined): string;
}

export const FALLBACK_COLOR = '#94a3b8';

/** Id lookups that only change when items, projects or areas change (not on notes or plans). */
export function useLookups(): Lookups {
  const items = useStore((s) => s.data.items);
  const projects = useStore((s) => s.data.projects);
  const areas = useStore((s) => s.data.areas);
  return useMemo(() => {
    const im = new Map(items.map((i) => [i.id, i]));
    const pm = new Map(projects.map((p) => [p.id, p]));
    const am = new Map(areas.map((a) => [a.id, a]));
    return {
      item: (id) => im.get(id),
      project: (id) => pm.get(id),
      area: (id) => am.get(id),
      color: (item) => {
        const p = item && pm.get(item.projectId);
        return (p && am.get(p.areaId)?.color) ?? FALLBACK_COLOR;
      },
    };
  }, [items, projects, areas]);
}
