/**
 * @fileoverview Converts data in the first stored format (plain JSON,
 * `version: 1`) to the protobuf data model.
 */

import {create} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/v2/data_pb';
import type {CapacityRule, DayCapacity} from '../model/capacity';
import type * as v1 from '../model/types';

/**
 * The protobuf form of the app's model, or of v1 data once validated and
 * migrated by `parseAppData`.
 */
export function fromV1(data: v1.AppData): pb.AppData {
  return create(pb.AppDataSchema, {
    areas: data.areas.map(a => create(pb.AreaSchema, a)),
    projects: data.projects.map(projectFromV1),
    items: data.items.map(itemFromV1),
    allocations: data.allocations.map(a => create(pb.AllocationSchema, a)),
    events: data.events.map(e =>
      create(pb.CalendarEventSchema, {...e, allDay: e.allDay ?? false}),
    ),
    dayNotes: {...data.dayNotes},
    monthNotes: {...data.monthNotes},
    settings: settingsFromV1(data.settings),
  });
}

function projectFromV1(p: v1.Project): pb.Project {
  return create(pb.ProjectSchema, {
    ...p,
    log: p.log.map(entry => create(pb.LogEntrySchema, entry)),
  });
}

function itemFromV1(i: v1.Item): pb.Item {
  return create(pb.ItemSchema, {
    ...i,
    source: i.source
      ? create(pb.ItemSourceSchema, {
          source: {case: 'usosMeeting', value: i.source.key},
        })
      : undefined,
  });
}

function settingsFromV1(s: v1.Settings): pb.Settings {
  const source = s.usos.source;
  return create(pb.SettingsSchema, {
    capacityRules: s.capacityRules.map(ruleFromV1),
    dayCapacity: Object.fromEntries(
      Object.entries(s.dayCapacity).map(([date, day]) => [
        date,
        dayCapacityFromV1(day),
      ]),
    ),
    defaultEventMinutes: s.defaultEventMinutes,
    defaultCalendarView: s.defaultCalendarView,
    usos: create(pb.UsosSettingsSchema, {
      source:
        source?.kind === 'google'
          ? {case: 'googleCalendarId', value: source.calendarId}
          : source?.kind === 'ical'
            ? {case: 'icalUrl', value: source.url}
            : {case: undefined},
      handled: [...s.usos.handled],
    }),
  });
}

function ruleFromV1(rule: CapacityRule): pb.CapacityRule {
  return create(pb.CapacityRuleSchema, {
    from: rule.from,
    windows: rule.windows.map(w => create(pb.TimeRangeSchema, w)),
    adjustment: rule.adjustment,
    reserved: (rule.reserved ?? []).map(day =>
      create(pb.ReservedDaySchema, {
        ranges: day.map(r => create(pb.TimeRangeSchema, r)),
      }),
    ),
  });
}

function dayCapacityFromV1(day: DayCapacity): pb.DayCapacity {
  return create(pb.DayCapacitySchema, {
    delta: day.delta,
    override: day.override,
  });
}
