import { create } from 'zustand';
import type { Allocation, AppData, Area, CalendarEvent, ISODate, Item, Project } from './model/types';
import { AREA_COLORS, emptyData } from './model/types';
import { withRuleChange, type CapacityRule, type DayCapacity } from './model/capacity';
import { todayISO } from './model/dates';

const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();

export interface Actions {
  replaceAll(data: AppData): void;

  addArea(name: string): string;
  updateArea(id: string, patch: Partial<Omit<Area, 'id'>>): void;
  deleteArea(id: string): void;

  addProject(areaId: string, name: string): string;
  updateProject(id: string, patch: Partial<Omit<Project, 'id'>>): void;
  deleteProject(id: string): void;
  addLog(projectId: string, text: string): void;
  updateLog(projectId: string, logId: string, text: string): void;
  deleteLog(projectId: string, logId: string): void;

  addItems(projectId: string, items: Partial<Omit<Item, 'id' | 'projectId'>>[]): void;
  updateItem(id: string, patch: Partial<Omit<Item, 'id'>>): void;
  deleteItem(id: string): void;

  addAllocation(itemId: string, date: ISODate, plannedHours: number, start?: string): string;
  updateAllocation(id: string, patch: Partial<Omit<Allocation, 'id'>>): void;
  toggleAllocation(id: string): void;
  deleteAllocation(id: string): void;

  addEvent(event: Omit<CalendarEvent, 'id'>): string;
  updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): void;
  deleteEvent(id: string): void;

  setDayNote(date: ISODate, text: string): void;
  setMonthNote(key: string, text: string): void;
  /** Changes planning windows / global adjustment from today on (past days keep theirs). */
  changeCapacityRule(patch: Partial<Omit<CapacityRule, 'from'>>): void;
  setDefaultEventMinutes(minutes: number): void;
  /** Per-day tweak; ignored for past days. `null` resets the day. */
  setDayCapacity(date: ISODate, patch: DayCapacity | null): void;
}

export type State = { data: AppData } & Actions;

export const useStore = create<State>()((set, get) => {
  const update = (fn: (d: AppData) => Partial<AppData>) => set((s) => ({ data: { ...s.data, ...fn(s.data) } }));
  const patchById = <T extends { id: string }>(list: T[], id: string, patch: Partial<NoInfer<T>>) =>
    list.map((x) => (x.id === id ? { ...x, ...patch } : x));

  // Cascading deletes: area → projects → items → allocations.
  const withoutItems = (d: AppData, itemIds: Set<string>) => ({
    items: d.items.filter((i) => !itemIds.has(i.id)),
    allocations: d.allocations.filter((a) => !itemIds.has(a.itemId)),
  });
  const withoutProjects = (d: AppData, projectIds: Set<string>) => ({
    projects: d.projects.filter((p) => !projectIds.has(p.id)),
    ...withoutItems(d, new Set(d.items.filter((i) => projectIds.has(i.projectId)).map((i) => i.id))),
  });

  return {
    data: emptyData(),

    replaceAll: (data) => set({ data }),

    addArea: (name) => {
      const id = uid();
      update((d) => ({ areas: [...d.areas, { id, name, color: AREA_COLORS[d.areas.length % AREA_COLORS.length] }] }));
      return id;
    },
    updateArea: (id, patch) => update((d) => ({ areas: patchById(d.areas, id, patch) })),
    deleteArea: (id) =>
      update((d) => ({
        areas: d.areas.filter((a) => a.id !== id),
        ...withoutProjects(d, new Set(d.projects.filter((p) => p.areaId === id).map((p) => p.id))),
      })),

    addProject: (areaId, name) => {
      const id = uid();
      const project: Project = {
        id,
        areaId,
        name,
        progressMode: 'checklist',
        manualProgress: 0,
        overviewDoc: '',
        log: [],
        archived: false,
        createdAt: now(),
      };
      update((d) => ({ projects: [...d.projects, project] }));
      return id;
    },
    updateProject: (id, patch) => update((d) => ({ projects: patchById(d.projects, id, patch) })),
    deleteProject: (id) => update((d) => withoutProjects(d, new Set([id]))),
    addLog: (projectId, text) => {
      const p = get().data.projects.find((x) => x.id === projectId);
      if (!p) return;
      get().updateProject(projectId, { log: [{ id: uid(), at: now(), text }, ...p.log] });
    },
    updateLog: (projectId, logId, text) => {
      const p = get().data.projects.find((x) => x.id === projectId);
      if (!p) return;
      get().updateProject(projectId, { log: p.log.map((l) => (l.id === logId ? { ...l, text, editedAt: now() } : l)) });
    },
    deleteLog: (projectId, logId) => {
      const p = get().data.projects.find((x) => x.id === projectId);
      if (!p) return;
      get().updateProject(projectId, { log: p.log.filter((l) => l.id !== logId) });
    },

    addItems: (projectId, items) =>
      update((d) => ({
        items: [
          ...d.items,
          ...items.map(
            (i): Item => ({ kind: 'task', title: 'Untitled', status: 'todo', createdAt: now(), ...i, id: uid(), projectId }),
          ),
        ],
      })),
    updateItem: (id, patch) => update((d) => ({ items: patchById(d.items, id, patch) })),
    deleteItem: (id) => update((d) => withoutItems(d, new Set([id]))),

    addAllocation: (itemId, date, plannedHours, start) => {
      const id = uid();
      update((d) => ({ allocations: [...d.allocations, { id, itemId, date, plannedHours, done: false, start }] }));
      return id;
    },
    updateAllocation: (id, patch) => update((d) => ({ allocations: patchById(d.allocations, id, patch) })),
    toggleAllocation: (id) =>
      update((d) => ({
        allocations: d.allocations.map((a) =>
          a.id !== id ? a : a.done ? { ...a, done: false, actualHours: undefined } : { ...a, done: true, actualHours: a.plannedHours },
        ),
      })),
    deleteAllocation: (id) => update((d) => ({ allocations: d.allocations.filter((a) => a.id !== id) })),

    addEvent: (event) => {
      const id = uid();
      update((d) => ({ events: [...d.events, { ...event, id }] }));
      return id;
    },
    updateEvent: (id, patch) => update((d) => ({ events: patchById(d.events, id, patch) })),
    deleteEvent: (id) => update((d) => ({ events: d.events.filter((e) => e.id !== id) })),

    setDayNote: (date, text) => update((d) => ({ dayNotes: { ...d.dayNotes, [date]: text } })),
    setMonthNote: (key, text) => update((d) => ({ monthNotes: { ...d.monthNotes, [key]: text } })),
    changeCapacityRule: (patch) =>
      update((d) => ({ settings: { ...d.settings, capacityRules: withRuleChange(d.settings.capacityRules, todayISO(), patch) } })),
    setDefaultEventMinutes: (minutes) => update((d) => ({ settings: { ...d.settings, defaultEventMinutes: minutes } })),
    setDayCapacity: (date, patch) => {
      if (date < todayISO()) return;
      update((d) => {
        const dayCapacity = { ...d.settings.dayCapacity };
        if (patch === null) delete dayCapacity[date];
        else dayCapacity[date] = { ...dayCapacity[date], ...patch };
        return { settings: { ...d.settings, dayCapacity } };
      });
    },
  };
});

/** Subscribes to the whole data object. Prefer narrow selectors in hot components. */
export const useData = () => useStore((s) => s.data);
