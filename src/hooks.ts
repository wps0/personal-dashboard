import {create} from '@bufbuild/protobuf';
import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import * as pb from './gen/dashboard/data_pb';
import {capacityFor, type CapacityInfo} from './model/capacity';
import {todayISO, type DayOfWeek} from './model/dates';
import {eventsByDay} from './model/recurrence';
import {
  weekStartOf,
  type Area,
  type ISODate,
  type Item,
  type Project,
} from './model/types';
import {useStore} from './store';
import {useGoogleEvents} from './google/use_google_events';
import {fromMinutes} from './model/time';

export interface Lookups {
  item(id: string): Item | undefined;
  project(id: string): Project | undefined;
  area(id: string): Area | undefined;
  /** Area color for an item, via its project. */
  color(item: Item | undefined): string;
}

const FALLBACK_COLOR = '#94a3b8';

/**
 * A ref that always holds the latest committed `value`, for callbacks that
 * outlive a render (timers, global handlers). It is updated after commit, not
 * during render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

/** The first day of the week (Settings → Calendar), as `Date.getDay()` numbers it. */
export function useWeekStart(): DayOfWeek {
  return useStore(s => weekStartOf(s.data.settings.weekStart));
}

/** Id lookups that only change when items, projects or areas change (not on notes or plans). */
export function useLookups(): Lookups {
  const items = useStore(s => s.data.items);
  const projects = useStore(s => s.data.projects);
  const areas = useStore(s => s.data.areas);
  return useMemo(() => {
    const im = new Map(items.map(i => [i.id, i]));
    const pm = new Map(projects.map(p => [p.id, p]));
    const am = new Map(areas.map(a => [a.id, a]));
    return {
      item: id => im.get(id),
      project: id => pm.get(id),
      area: id => am.get(id),
      color: item => {
        const p = item && pm.get(item.projectId);
        return (p && am.get(p.areaId)?.color) ?? FALLBACK_COLOR;
      },
    };
  }, [items, projects, areas]);
}

/**
 * Capacity per day; only recomputed when events or capacity settings change.
 * Busy Google Calendar events count too.
 */
export function useCapacities(days: ISODate[]): Map<ISODate, CapacityInfo> {
  const events = useStore(s => s.data.events);
  const settings = useStore(s => s.data.settings);
  const google = useGoogleEvents(days);
  return useMemo(() => {
    const want = new Set(days);
    const byDay = eventsByDay(events, days);
    for (const [d, list] of google) {
      if (!want.has(d)) continue;
      const busy = list
        .filter(g => g.busy)
        .map(g =>
          create(pb.CalendarEventSchema, {
            id: g.key,
            title: g.title,
            date: d,
            start: fromMinutes(g.startMin),
            end: fromMinutes(Math.min(g.endMin, 1439)),
          }),
        );
      byDay.set(d, [...(byDay.get(d) ?? []), ...busy]);
    }
    return new Map(
      days.map(d => [
        d,
        capacityFor(
          d,
          settings.capacityRules,
          settings.dayCapacity,
          byDay.get(d) ?? [],
        ),
      ]),
    );
  }, [days, events, settings, google]);
}

/** Animation class for a change of the first visible day (or period): content slides in from the side we moved toward. */
export function useSlide(first: string): string {
  // Remembers the previous value in state (React's pattern for reacting to a
  // changed prop during render) rather than in a ref.
  const [seen, setSeen] = useState({first, dir: ''});
  if (seen.first !== first) {
    const dir = first > seen.first ? 'animate-from-right' : 'animate-from-left';
    setSeen({first, dir});
    return dir;
  }
  return seen.dir;
}

/** Whether a CSS media query matches, updating when it changes (e.g. on rotation). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    onChange => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', onChange);
      return () => mq.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

/** Re-checks the date at the next local midnight and whenever the app comes back to the foreground. */
function subscribeToday(onChange: () => void) {
  let timer = 0;
  const check = () => {
    onChange();
    window.clearTimeout(timer);
    const now = new Date();
    const midnight = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    timer = window.setTimeout(check, midnight.getTime() - now.getTime());
  };
  check();
  window.addEventListener('focus', check);
  document.addEventListener('visibilitychange', check);
  return () => {
    window.clearTimeout(timer);
    window.removeEventListener('focus', check);
    document.removeEventListener('visibilitychange', check);
  };
}

/** Today's date, changing at midnight so an app left open overnight moves on to the new day. */
export function useToday(): ISODate {
  return useSyncExternalStore(subscribeToday, todayISO);
}
