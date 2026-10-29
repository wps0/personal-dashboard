import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {
  changeEvent,
  deleteEvent,
  describeRecurrence,
  eventsByDay,
  happensOn,
  nthDate,
  occurrenceKey,
  parseKey,
  restoreOccurrence,
  shownEvent,
  WORK_DAYS,
} from './recurrence';
import type {CalendarEvent, EventInit, InitOf} from './types';

const {DAY, WEEK} = pb.RecurrenceUnit;
const {MONDAY, WEDNESDAY, FRIDAY} = pb.Weekday;

/** 2026-10-14 is a Wednesday. */
function event(
  recurrence?: InitOf<typeof pb.RecurrenceSchema>,
  more: EventInit & {id?: string} = {},
): CalendarEvent {
  return create(pb.CalendarEventSchema, {
    id: 'gym',
    title: 'Gym',
    date: '2026-10-14',
    start: '18:00',
    end: '19:00',
    recurrence: recurrence && create(pb.RecurrenceSchema, recurrence),
    ...more,
  });
}

let n = 0;
const newId = () => `new${++n}`;

describe('happensOn', () => {
  it('a single event happens on its date only', () => {
    expect(happensOn(event(), '2026-10-14')).toBe(true);
    expect(happensOn(event(), '2026-10-21')).toBe(false);
  });

  it('weekly: on its own weekday from its date on', () => {
    const e = event({unit: WEEK});
    expect(happensOn(e, '2026-10-07')).toBe(false);
    expect(happensOn(e, '2026-10-14')).toBe(true);
    expect(happensOn(e, '2026-10-15')).toBe(false);
    expect(happensOn(e, '2027-03-03')).toBe(true);
  });

  it('weekly on chosen days, every other week, until a date', () => {
    const e = event({
      unit: WEEK,
      interval: 2,
      weekdays: [MONDAY, WEDNESDAY],
      until: '2026-11-11',
    });
    // Weeks of 12 Oct (yes), 19 Oct (no), 26 Oct (yes), 9 Nov (yes).
    expect(happensOn(e, '2026-10-12')).toBe(false); // before its date
    expect(happensOn(e, '2026-10-19')).toBe(false);
    expect(happensOn(e, '2026-10-21')).toBe(false);
    expect(happensOn(e, '2026-10-26')).toBe(true);
    expect(happensOn(e, '2026-10-28')).toBe(true);
    expect(happensOn(e, '2026-11-11')).toBe(true);
    expect(happensOn(e, '2026-11-23')).toBe(false); // after until
  });

  it('daily every n days, skipping skipped dates', () => {
    const e = event({unit: DAY, interval: 3}, {skippedDates: ['2026-10-17']});
    expect(happensOn(e, '2026-10-14')).toBe(true);
    expect(happensOn(e, '2026-10-16')).toBe(false);
    expect(happensOn(e, '2026-10-17')).toBe(false);
    expect(happensOn(e, '2026-10-20')).toBe(true);
  });

  it('a unit from a newer version: its first date only', () => {
    const e = event({unit: 9 as pb.RecurrenceUnit});
    expect(happensOn(e, '2026-10-14')).toBe(true);
    expect(happensOn(e, '2026-10-15')).toBe(false);
  });
});

describe('showing', () => {
  it('lists each occurrence under its own key and date', () => {
    const days = ['2026-10-14', '2026-10-15', '2026-10-21'];
    const once = event(undefined, {id: 'once', date: '2026-10-15'});
    const m = eventsByDay([event({unit: WEEK}), once], days);
    expect(m.get('2026-10-14')!.map(e => [e.id, e.date])).toEqual([
      ['gym@2026-10-14', '2026-10-14'],
    ]);
    expect(m.get('2026-10-15')).toEqual([once]);
    expect(m.get('2026-10-21')!.map(e => e.id)).toEqual(['gym@2026-10-21']);
  });

  it('finds the event shown for a key, while it still happens', () => {
    const events = [event({unit: WEEK}, {skippedDates: ['2026-10-21']})];
    expect(shownEvent(events, 'gym@2026-10-28')?.date).toBe('2026-10-28');
    expect(shownEvent(events, 'gym@2026-10-21')).toBeUndefined();
    expect(shownEvent(events, 'nope')).toBeUndefined();
    expect(parseKey(occurrenceKey('a-b', '2026-10-14'))).toEqual({
      id: 'a-b',
      date: '2026-10-14',
    });
  });
});

describe('describing', () => {
  it('reads like Google Calendar', () => {
    const d = (r: InitOf<typeof pb.RecurrenceSchema>) =>
      describeRecurrence(create(pb.RecurrenceSchema, r), '2026-10-14');
    expect(d({unit: DAY})).toBe('Daily');
    expect(d({unit: DAY, interval: 2})).toBe('Every 2 days');
    expect(d({unit: WEEK})).toBe('Weekly on Wednesday');
    expect(d({unit: WEEK, weekdays: WORK_DAYS})).toBe(
      'Every weekday (Monday to Friday)',
    );
    expect(
      d({
        unit: WEEK,
        interval: 2,
        weekdays: [FRIDAY, MONDAY],
        until: '2026-12-20',
      }),
    ).toBe('Every 2 weeks on Mon, Fri, until Sun, 20 Dec 2026');
  });

  it('finds the date of the nth occurrence', () => {
    const r = create(pb.RecurrenceSchema, {
      unit: WEEK,
      weekdays: [MONDAY, WEDNESDAY],
    });
    expect(nthDate(r, '2026-10-14', 1)).toBe('2026-10-14');
    expect(nthDate(r, '2026-10-14', 3)).toBe('2026-10-21');
    expect(nthDate(r, '2026-10-14', 4)).toBe('2026-10-26');
  });
});

describe('changing an occurrence', () => {
  const series = event({unit: WEEK});

  it('this event: becomes an event of its own; the series skips the date', () => {
    const r = changeEvent(
      [series],
      'gym@2026-10-21',
      'this',
      {start: '19:00', end: '20:00'},
      newId,
    );
    const own = r.events.find(e => e.id === r.key)!;
    expect(own).toMatchObject({
      date: '2026-10-21',
      start: '19:00',
      seriesId: 'gym',
      seriesDate: '2026-10-21',
    });
    expect(own.recurrence).toBeUndefined();
    expect(r.events[0].skippedDates).toEqual(['2026-10-21']);
    // Moved to another day, still only that occurrence.
    const moved = changeEvent(
      [series],
      'gym@2026-10-21',
      'this',
      {date: '2026-10-22'},
      newId,
    );
    expect(
      eventsByDay(moved.events, ['2026-10-21', '2026-10-22', '2026-10-28'])
        .get('2026-10-22')!
        .map(e => e.id),
    ).toEqual([moved.key]);
    expect(happensOn(moved.events[0], '2026-10-28')).toBe(true);
  });

  it('all events: the series changes; moving a day moves every one', () => {
    const r = changeEvent(
      [series],
      'gym@2026-10-21',
      'all',
      {title: 'Swim', date: '2026-10-22'},
      newId,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0]).toMatchObject({title: 'Swim', date: '2026-10-15'});
    expect(r.key).toBe('gym@2026-10-22');
    expect(happensOn(r.events[0], '2026-10-29')).toBe(true);
    expect(happensOn(r.events[0], '2026-10-28')).toBe(false);
  });

  it('this and following: the series ends before it, a new one starts there', () => {
    const own = event(undefined, {
      id: 'moved',
      date: '2026-11-04',
      seriesId: 'gym',
    });
    const withSkips = {...series, skippedDates: ['2026-10-21', '2026-11-04']};
    const r = changeEvent(
      [withSkips, own],
      'gym@2026-10-28',
      'following',
      {start: '07:00', end: '08:00'},
      newId,
    );
    const [old, , rest] = r.events;
    expect(old.recurrence!.until).toBe('2026-10-27');
    expect(old.skippedDates).toEqual(['2026-10-21']);
    expect(rest).toMatchObject({
      date: '2026-10-28',
      start: '07:00',
      skippedDates: ['2026-11-04'],
    });
    expect(r.events[1].seriesId).toBe(rest.id);
    expect(r.key).toBe(occurrenceKey(rest.id, '2026-10-28'));
  });

  it('this and following from the first date changes them all', () => {
    const r = changeEvent(
      [series],
      'gym@2026-10-14',
      'following',
      {title: 'Swim'},
      newId,
    );
    expect(r.events).toHaveLength(1);
    expect(r.events[0].title).toBe('Swim');
  });

  it('a new repeat applies to the series even from "this event"', () => {
    const r = changeEvent(
      [series],
      'gym@2026-10-14',
      'this',
      {recurrence: create(pb.RecurrenceSchema, {unit: DAY})},
      newId,
    );
    expect(r.events).toHaveLength(1);
    expect(happensOn(r.events[0], '2026-10-15')).toBe(true);
  });

  it('"does not repeat" leaves a single event on that date', () => {
    const r = changeEvent(
      [series],
      'gym@2026-10-28',
      'all',
      {recurrence: undefined},
      newId,
    );
    expect(r.events[0]).toMatchObject({
      id: 'gym',
      date: '2026-10-28',
      skippedDates: [],
    });
    expect(r.events[0].recurrence).toBeUndefined();
    expect(r.key).toBe('gym');
  });

  it('a single event that gets a repeat is shown as its first occurrence', () => {
    const r = changeEvent(
      [event()],
      'gym',
      'all',
      {recurrence: create(pb.RecurrenceSchema, {unit: WEEK})},
      newId,
    );
    expect(r.key).toBe('gym@2026-10-14');
  });
});

describe('back to the repeating event', () => {
  it('drops the day’s own event and unskips its original date', () => {
    const series = event({unit: WEEK});
    const moved = changeEvent(
      [series],
      'gym@2026-10-21',
      'this',
      {date: '2026-10-22'},
      newId,
    );
    const back = restoreOccurrence(moved.events, moved.key);
    expect(back).toHaveLength(1);
    expect(back[0].skippedDates).toEqual([]);
    expect(happensOn(back[0], '2026-10-21')).toBe(true);
  });

  it('leaves events alone without a repeating event to go back to', () => {
    const lone = event(undefined, {
      id: 'x',
      seriesId: 'gone',
      seriesDate: '2026-10-21',
    });
    expect(restoreOccurrence([lone], 'x')).toEqual([lone]);
    expect(restoreOccurrence([event()], 'gym')).toEqual([event()]);
  });
});

describe('deleting an occurrence', () => {
  const series = event({unit: WEEK});
  const own = event(undefined, {
    id: 'own',
    date: '2026-11-05',
    seriesId: 'gym',
  });

  it('this event: skips its date', () => {
    const out = deleteEvent([series], 'gym@2026-10-21', 'this');
    expect(out[0].skippedDates).toEqual(['2026-10-21']);
  });

  it('this and following: ends the series and drops its later changed ones', () => {
    const out = deleteEvent([series, own], 'gym@2026-10-28', 'following');
    expect(out).toHaveLength(1);
    expect(out[0].recurrence!.until).toBe('2026-10-27');
  });

  it('all events: the series and its changed occurrences', () => {
    expect(
      deleteEvent(
        [series, own, event(undefined, {id: 'x'})],
        'gym@2026-10-28',
        'all',
      ).map(e => e.id),
    ).toEqual(['x']);
  });

  it('a single event is just removed', () => {
    expect(deleteEvent([event()], 'gym', 'this')).toEqual([]);
  });
});
