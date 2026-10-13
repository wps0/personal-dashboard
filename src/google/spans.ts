import type {ISODate} from '../model/types';
import type {GEvent} from './events';

/** A multi-day all-day event drawn as one bar across the visible days. */
export interface Span {
  ev: GEvent;
  /** Indices into the visible days, inclusive. */
  start: number;
  end: number;
  /** Row in the all-day area; spans in the same lane don't overlap. */
  lane: number;
  /** The event continues before the first / after the last visible day. */
  before: boolean;
  after: boolean;
}

/**
 * Splits all-day Google events into multi-day spans (one bar each, stacked in
 * lanes, longest first like Google Calendar) and single-day events per day.
 */
export function layoutAllDay(
  days: ISODate[],
  byDay: ReadonlyMap<ISODate, GEvent[]>,
): {spans: Span[]; lanes: number; singles: Map<ISODate, GEvent[]>} {
  const singles = new Map<ISODate, GEvent[]>(days.map(d => [d, []]));
  const pieces = new Map<string, {ev: GEvent; idx: number[]}>();
  days.forEach((d, i) => {
    for (const ev of byDay.get(d) ?? []) {
      if (ev.first === ev.last) {
        singles.get(d)!.push(ev);
        continue;
      }
      const id = `${ev.calendarId}|${ev.id}`;
      const p = pieces.get(id) ?? {ev, idx: []};
      p.idx.push(i);
      pieces.set(id, p);
    }
  });
  const spans = [...pieces.values()]
    .map(({ev, idx}) => ({
      ev,
      start: Math.min(...idx),
      end: Math.max(...idx),
      lane: 0,
      before: ev.first < days[0],
      after: ev.last > days[days.length - 1],
    }))
    .sort(
      (a, b) =>
        a.start - b.start ||
        b.end - b.start - (a.end - a.start) ||
        a.ev.title.localeCompare(b.ev.title),
    );
  // Greedy lanes: each span takes the first lane free from its start.
  const laneEnds: number[] = [];
  for (const s of spans) {
    let lane = laneEnds.findIndex(end => end < s.start);
    if (lane < 0) lane = laneEnds.length;
    laneEnds[lane] = s.end;
    s.lane = lane;
  }
  return {spans, lanes: laneEnds.length, singles};
}
