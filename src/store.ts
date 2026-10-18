import {create as createMessage} from '@bufbuild/protobuf';
import {create} from 'zustand';
import * as pb from './gen/dashboard/data_pb';
import type {
  Allocation,
  AppData,
  Area,
  CalendarEvent,
  CalendarView,
  EventInit,
  ISODate,
  Item,
  ItemInit,
  Project,
  UsosSource,
} from './model/types';
import {
  AREA_COLORS,
  ItemKind,
  ItemStatus,
  ProgressMode,
  emptyData,
} from './model/types';
import {withRuleChange, type CapacityRule} from './model/capacity';
import {todayISO} from './model/dates';

function uid() {
  return crypto.randomUUID();
}
function now() {
  return new Date().toISOString();
}

interface Actions {
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

  addItems(projectId: string, items: ItemInit[]): void;
  updateItem(id: string, patch: Partial<Omit<Item, 'id'>>): void;
  deleteItem(id: string): void;

  addAllocation(
    itemId: string,
    date: ISODate,
    plannedHours: number,
    start?: string,
  ): string;
  updateAllocation(id: string, patch: Partial<Omit<Allocation, 'id'>>): void;
  toggleAllocation(id: string): void;
  deleteAllocation(id: string): void;

  addEvent(event: EventInit): string;
  updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id'>>): void;
  deleteEvent(id: string): void;

  setDayNote(date: ISODate, text: string): void;
  setMonthNote(key: string, text: string): void;
  /** Changes planning windows / global adjustment from today on (past days keep theirs). */
  changeCapacityRule(patch: Partial<Omit<CapacityRule, 'from'>>): void;
  setDefaultEventMinutes(minutes: number): void;
  setDefaultCalendarView(view: CalendarView): void;
  setUsosSource(source: UsosSource): void;
  /** Remembers class meetings as imported or skipped, so they aren't offered again. */
  markUsosHandled(keys: string[]): void;
  /** Per-day tweak; ignored for past days. `null` resets the day. */
  setDayCapacity(
    date: ISODate,
    patch: {delta?: number; override?: number} | null,
  ): void;
}

interface State extends Actions {
  data: AppData;
}

export const useStore = create<State>()((set, get) => {
  const update = (fn: (d: AppData) => Partial<AppData>) =>
    set(s => ({data: {...s.data, ...fn(s.data)}}));
  const patchById = <T extends {id: string}>(
    list: T[],
    id: string,
    patch: Partial<NoInfer<T>>,
  ) => list.map(x => (x.id === id ? {...x, ...patch} : x));

  // Cascading deletes: area → projects → items → allocations.
  const withoutItems = (d: AppData, itemIds: Set<string>) => ({
    items: d.items.filter(i => !itemIds.has(i.id)),
    allocations: d.allocations.filter(a => !itemIds.has(a.itemId)),
  });
  const withoutProjects = (d: AppData, projectIds: Set<string>) => ({
    projects: d.projects.filter(p => !projectIds.has(p.id)),
    ...withoutItems(
      d,
      new Set(d.items.filter(i => projectIds.has(i.projectId)).map(i => i.id)),
    ),
  });

  return {
    data: emptyData(),

    replaceAll: data => set({data}),

    addArea: name => {
      const id = uid();
      update(d => ({
        areas: [
          ...d.areas,
          createMessage(pb.AreaSchema, {
            id,
            name,
            color: AREA_COLORS[d.areas.length % AREA_COLORS.length],
          }),
        ],
      }));
      return id;
    },
    updateArea: (id, patch) =>
      update(d => ({areas: patchById(d.areas, id, patch)})),
    deleteArea: id =>
      update(d => ({
        areas: d.areas.filter(a => a.id !== id),
        ...withoutProjects(
          d,
          new Set(d.projects.filter(p => p.areaId === id).map(p => p.id)),
        ),
      })),

    addProject: (areaId, name) => {
      const id = uid();
      const project = createMessage(pb.ProjectSchema, {
        id,
        areaId,
        name,
        progressMode: ProgressMode.CHECKLIST,
        createdAt: now(),
      });
      update(d => ({projects: [...d.projects, project]}));
      return id;
    },
    updateProject: (id, patch) =>
      update(d => ({projects: patchById(d.projects, id, patch)})),
    deleteProject: id => update(d => withoutProjects(d, new Set([id]))),
    addLog: (projectId, text) => {
      const p = get().data.projects.find(x => x.id === projectId);
      if (!p) return;
      get().updateProject(projectId, {
        log: [
          createMessage(pb.LogEntrySchema, {id: uid(), at: now(), text}),
          ...p.log,
        ],
      });
    },
    updateLog: (projectId, logId, text) => {
      const p = get().data.projects.find(x => x.id === projectId);
      if (!p) return;
      get().updateProject(projectId, {
        log: p.log.map(l =>
          l.id === logId ? {...l, text, editedAt: now()} : l,
        ),
      });
    },
    deleteLog: (projectId, logId) => {
      const p = get().data.projects.find(x => x.id === projectId);
      if (!p) return;
      get().updateProject(projectId, {log: p.log.filter(l => l.id !== logId)});
    },

    addItems: (projectId, items) =>
      update(d => ({
        items: [
          ...d.items,
          ...items.map(i =>
            createMessage(pb.ItemSchema, {
              kind: ItemKind.TASK,
              title: 'Untitled',
              status: ItemStatus.TODO,
              createdAt: now(),
              ...i,
              id: uid(),
              projectId,
            }),
          ),
        ],
      })),
    updateItem: (id, patch) =>
      update(d => ({items: patchById(d.items, id, patch)})),
    deleteItem: id => update(d => withoutItems(d, new Set([id]))),

    addAllocation: (itemId, date, plannedHours, start) => {
      const id = uid();
      update(d => ({
        allocations: [
          ...d.allocations,
          createMessage(pb.AllocationSchema, {
            id,
            itemId,
            date,
            plannedHours,
            start,
          }),
        ],
      }));
      return id;
    },
    updateAllocation: (id, patch) =>
      update(d => ({allocations: patchById(d.allocations, id, patch)})),
    toggleAllocation: id =>
      update(d => ({
        allocations: d.allocations.map(a =>
          a.id !== id
            ? a
            : a.done
              ? {...a, done: false, actualHours: undefined}
              : {...a, done: true, actualHours: a.plannedHours},
        ),
      })),
    deleteAllocation: id =>
      update(d => ({allocations: d.allocations.filter(a => a.id !== id)})),

    addEvent: event => {
      const id = uid();
      update(d => ({
        events: [
          ...d.events,
          createMessage(pb.CalendarEventSchema, {...event, id}),
        ],
      }));
      return id;
    },
    updateEvent: (id, patch) =>
      update(d => ({events: patchById(d.events, id, patch)})),
    deleteEvent: id =>
      update(d => ({events: d.events.filter(e => e.id !== id)})),

    setDayNote: (date, text) =>
      update(d => ({dayNotes: {...d.dayNotes, [date]: text}})),
    setMonthNote: (key, text) =>
      update(d => ({monthNotes: {...d.monthNotes, [key]: text}})),
    changeCapacityRule: patch =>
      update(d => ({
        settings: {
          ...d.settings,
          capacityRules: withRuleChange(
            d.settings.capacityRules,
            todayISO(),
            patch,
          ),
        },
      })),
    setDefaultCalendarView: view =>
      update(d => ({settings: {...d.settings, defaultCalendarView: view}})),
    setDefaultEventMinutes: minutes =>
      update(d => ({settings: {...d.settings, defaultEventMinutes: minutes}})),
    setUsosSource: source =>
      update(d => ({
        settings: {...d.settings, usos: {...d.settings.usos, source}},
      })),
    markUsosHandled: keys =>
      update(d => {
        const handled = new Set(d.settings.usos.handled);
        for (const k of keys) handled.add(k);
        return {
          settings: {
            ...d.settings,
            usos: {...d.settings.usos, handled: [...handled]},
          },
        };
      }),
    setDayCapacity: (date, patch) => {
      if (date < todayISO()) return;
      update(d => {
        const dayCapacity = {...d.settings.dayCapacity};
        if (patch === null) delete dayCapacity[date];
        else
          dayCapacity[date] = createMessage(pb.DayCapacitySchema, {
            delta: dayCapacity[date]?.delta,
            override: dayCapacity[date]?.override,
            ...patch,
          });
        return {settings: {...d.settings, dayCapacity}};
      });
    },
  };
});

/** Subscribes to the whole data object. Prefer narrow selectors in hot components. */
export function useData() {
  return useStore(s => s.data);
}
