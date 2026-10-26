/**
 * @fileoverview The data model. Records are the protobuf messages generated
 * from proto/dashboard/data.proto, which documents their fields: make new
 * ones with `create()` (nested records too), change them by copying (spread
 * keeps a message a message). Code must cope with enum values it doesn't
 * know, since a newer version of the app may add some.
 */

import {
  create,
  type DescMessage,
  type MessageInitShape,
  type MessageShape,
} from '@bufbuild/protobuf';
import * as pb from '../gen/dashboard/data_pb';
import {defaultRules} from './capacity';
import type {DayOfWeek} from './dates';

export {
  CalendarView,
  EventColor,
  ItemKind,
  ItemStatus,
  ProgressMode,
  Weekday,
} from '../gen/dashboard/data_pb';

export type Area = pb.Area;
export type Project = pb.Project;
export type LogEntry = pb.LogEntry;
export type ItemGroup = pb.ItemGroup;
export type Item = pb.Item;
export type WorkSpan = pb.WorkSpan;
export type ItemSource = pb.ItemSource;
export type Allocation = pb.Allocation;
export type CalendarEvent = pb.CalendarEvent;
export type UsosSettings = pb.UsosSettings;

/** A record's fields as plain values, as `create()` accepts them. */
export type InitOf<Desc extends DescMessage> = Exclude<
  MessageInitShape<Desc>,
  MessageShape<Desc>
>;
/** A new item's fields; the store adds the id and the project. */
export type ItemInit = Omit<InitOf<typeof pb.ItemSchema>, 'id' | 'projectId'>;
/** A new event's fields; the store adds the id. */
export type EventInit = Omit<InitOf<typeof pb.CalendarEventSchema>, 'id'>;

/** Where the USOS timetable comes from: a Google calendar, an iCal link, or nowhere (off). */
export type UsosSource = pb.UsosSettings['source'];

/** Settings, with their USOS part always present. */
export interface Settings extends pb.Settings {
  usos: UsosSettings;
}

/** All the data, with its settings always present. */
export interface AppData extends pb.AppData {
  settings: Settings;
}

/** ISO calendar date in local time, `YYYY-MM-DD`. */
export type ISODate = string;

/** The calendar's views, as the UI and the address bar name them. */
export const CAL_VIEWS = ['day', '3day', 'week', 'month'] as const;
export type CalView = (typeof CAL_VIEWS)[number];

const CAL_VIEW_OF: Record<pb.CalendarView, CalView> = {
  [pb.CalendarView.UNSPECIFIED]: 'week',
  [pb.CalendarView.DAY]: 'day',
  [pb.CalendarView.THREE_DAY]: '3day',
  [pb.CalendarView.WEEK]: 'week',
  [pb.CalendarView.MONTH]: 'month',
};

/** The UI view for a stored calendar view; week for one this version doesn't know. */
export function calViewOf(view: pb.CalendarView): CalView {
  return CAL_VIEW_OF[view] ?? 'week';
}

const DAY_OF_WEEK: Record<pb.Weekday, DayOfWeek> = {
  [pb.Weekday.UNSPECIFIED]: 0,
  [pb.Weekday.MONDAY]: 1,
  [pb.Weekday.TUESDAY]: 2,
  [pb.Weekday.WEDNESDAY]: 3,
  [pb.Weekday.THURSDAY]: 4,
  [pb.Weekday.FRIDAY]: 5,
  [pb.Weekday.SATURDAY]: 6,
  [pb.Weekday.SUNDAY]: 0,
};

/** The first day of the week for a stored setting; Sunday when unset or unknown. */
export function weekStartOf(day: pb.Weekday): DayOfWeek {
  return DAY_OF_WEEK[day] ?? 0;
}

/** The statuses an item moves through, in order. */
export const STATUSES = [
  pb.ItemStatus.TODO,
  pb.ItemStatus.DOING,
  pb.ItemStatus.DONE,
] as const;

export const AREA_COLORS = [
  '#60a5fa', // blue
  '#34d399', // green
  '#f472b6', // pink
  '#fbbf24', // amber
  '#a78bfa', // violet
  '#22d3ee', // cyan
  '#fb923c', // orange
  '#94a3b8', // slate
];

/** "#rrggbb": the only colors from data that go into styles (not a url()). */
export function isHexColor(color: unknown): color is string {
  return typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color);
}

/** Default settings. */
export function defaultSettings(): Settings {
  return create(pb.SettingsSchema, {
    capacityRules: defaultRules(),
    defaultEventMinutes: 60,
    defaultCalendarView: pb.CalendarView.WEEK,
    usos: create(pb.UsosSettingsSchema),
  }) as Settings;
}

export function emptyData(): AppData {
  return create(pb.AppDataSchema, {settings: defaultSettings()}) as AppData;
}

/**
 * `data` with whatever an older or newer version may have left out filled
 * in: settings and their USOS part, capacity rules, the event length. Area
 * colors other than "#rrggbb" (from an edited file) become palette colors.
 */
export function withDefaults(data: pb.AppData): AppData {
  const defaults = defaultSettings();
  const s = data.settings ?? defaults;
  return {
    ...data,
    areas: data.areas.map((a, i) =>
      isHexColor(a.color)
        ? a
        : {...a, color: AREA_COLORS[i % AREA_COLORS.length]},
    ),
    settings: {
      ...s,
      capacityRules: s.capacityRules.length
        ? s.capacityRules
        : defaults.capacityRules,
      defaultEventMinutes: s.defaultEventMinutes || 60,
      usos: s.usos ?? defaults.usos,
    },
  };
}
