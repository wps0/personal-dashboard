/**
 * @fileoverview The data model. Records are the protobuf messages generated
 * from proto/dashboard/v2/data.proto, which documents their fields: make new
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
import * as pb from '../gen/dashboard/v2/data_pb';
import {defaultRules} from './capacity';

export {
  CalendarView,
  ItemKind,
  ItemStatus,
  ProgressMode,
} from '../gen/dashboard/v2/data_pb';

export type Area = pb.Area;
export type Project = pb.Project;
export type LogEntry = pb.LogEntry;
export type Item = pb.Item;
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
 * in: settings and their USOS part, capacity rules, the event length.
 */
export function withDefaults(data: pb.AppData): AppData {
  const defaults = defaultSettings();
  const s = data.settings ?? defaults;
  return {
    ...data,
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
