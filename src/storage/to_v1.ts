/**
 * @fileoverview Converts the protobuf data model to the app's in-memory
 * model, which still has the v1 shape. Temporary: it goes away as the app
 * moves to the protobuf types.
 */

import * as pb from '../gen/dashboard/v2/data_pb';
import {defaultRules, type CapacityRule} from '../model/capacity';
import type * as v1 from '../model/types';

/** The app's model of `data`. */
export function toV1(data: pb.AppData): v1.AppData {
  return {
    version: 1,
    areas: data.areas.map(a => ({id: a.id, name: a.name, color: a.color})),
    projects: data.projects.map(projectToV1),
    items: data.items.map(itemToV1),
    allocations: data.allocations.map(a =>
      withoutUndefined({
        id: a.id,
        itemId: a.itemId,
        date: a.date,
        plannedHours: a.plannedHours,
        done: a.done,
        actualHours: a.actualHours,
        start: a.start,
      }),
    ),
    events: data.events.map(e =>
      withoutUndefined({
        id: e.id,
        title: e.title,
        date: e.date,
        allDay: e.allDay || undefined,
        start: e.start,
        end: e.end,
        notes: e.notes,
      }),
    ),
    dayNotes: {...data.dayNotes},
    monthNotes: {...data.monthNotes},
    settings: settingsToV1(data.settings),
  };
}

function projectToV1(p: pb.Project): v1.Project {
  return withoutUndefined({
    id: p.id,
    areaId: p.areaId,
    name: p.name,
    progressMode: p.progressMode,
    manualProgress: p.manualProgress,
    dueDate: p.dueDate,
    overviewDoc: p.overviewDoc,
    log: p.log.map(entry =>
      withoutUndefined({
        id: entry.id,
        at: entry.at,
        text: entry.text,
        editedAt: entry.editedAt,
      }),
    ),
    archived: p.archived,
    createdAt: p.createdAt,
    coursePattern: p.coursePattern,
  });
}

function itemToV1(i: pb.Item): v1.Item {
  return withoutUndefined({
    id: i.id,
    projectId: i.projectId,
    kind: i.kind,
    title: i.title,
    status: i.status,
    dueDate: i.dueDate,
    heldOn: i.heldOn,
    estimateHours: i.estimateHours,
    notes: i.notes,
    createdAt: i.createdAt,
    source: i.source ? {source: i.source.source} : undefined,
  });
}

function settingsToV1(s: pb.Settings | undefined): v1.Settings {
  return {
    capacityRules: s?.capacityRules.length
      ? s.capacityRules.map(ruleToV1)
      : defaultRules(),
    dayCapacity: Object.fromEntries(
      Object.entries(s?.dayCapacity ?? {}).map(([date, day]) => [
        date,
        withoutUndefined({delta: day.delta, override: day.override}),
      ]),
    ),
    defaultEventMinutes: s?.defaultEventMinutes || 60,
    defaultCalendarView: s?.defaultCalendarView ?? pb.CalendarView.WEEK,
    usos: {
      source: s?.usos?.source ?? {case: undefined},
      handled: [...(s?.usos?.handled ?? [])],
    },
  };
}

function ruleToV1(rule: pb.CapacityRule): CapacityRule {
  return withoutUndefined({
    from: rule.from,
    windows: rule.windows.map(w => ({start: w.start, end: w.end})),
    adjustment: rule.adjustment,
    reserved: rule.reserved.map(day => ({
      ranges: day.ranges.map(r =>
        withoutUndefined({start: r.start, end: r.end, label: r.label}),
      ),
    })),
  });
}

/** `value` without its undefined fields, as v1 data had them. */
function withoutUndefined<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as T;
}
