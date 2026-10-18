import {describe, expect, it} from 'vitest';
import {
  expandEvent,
  rangeBounds,
  shownEndMin,
  type ApiCalendar,
} from './events';

// Tests run with TZ=Europe/Warsaw (see package.json) so local-time handling is exercised.
const cal: ApiCalendar = {
  id: 'me@gmail.com',
  summary: 'Me',
  backgroundColor: '#7986cb',
};

describe('expandEvent', () => {
  it('maps a timed event to local minutes, with calendar color and busy flag', () => {
    const [e] = expandEvent(
      {
        id: 'a',
        summary: 'Standup',
        start: {dateTime: '2026-10-12T09:30:00+02:00'},
        end: {dateTime: '2026-10-12T09:45:00+02:00'},
      },
      cal,
    );
    expect(e).toMatchObject({
      date: '2026-10-12',
      startMin: 570,
      endMin: 585,
      allDay: false,
      busy: true,
      color: '#7986cb',
      title: 'Standup',
    });
    expect(e.when).toBe('Mon 12 Oct, 09:30 – 09:45');
  });

  it('converts other time zones to local time', () => {
    const [e] = expandEvent(
      {
        id: 'b',
        start: {dateTime: '2026-10-12T08:00:00Z'},
        end: {dateTime: '2026-10-12T09:00:00Z'},
      },
      cal,
    );
    expect([e.startMin, e.endMin, e.title]).toEqual([600, 660, '(No title)']); // 10:00–11:00 CEST
  });

  it('splits overnight events and treats a midnight end as the end of the previous day', () => {
    const parts = expandEvent(
      {
        id: 'c',
        start: {dateTime: '2026-10-12T22:00:00+02:00'},
        end: {dateTime: '2026-10-13T01:30:00+02:00'},
      },
      cal,
    );
    expect(parts.map(p => [p.date, p.startMin, p.endMin])).toEqual([
      ['2026-10-12', 1320, 1440],
      ['2026-10-13', 0, 90],
    ]);
    const toMidnight = expandEvent(
      {
        id: 'd',
        start: {dateTime: '2026-10-12T23:00:00+02:00'},
        end: {dateTime: '2026-10-13T00:00:00+02:00'},
      },
      cal,
    );
    expect(toMidnight.map(p => [p.date, p.startMin, p.endMin])).toEqual([
      ['2026-10-12', 1380, 1440],
    ]);
  });

  it('expands all-day events over their exclusive end date, never busy', () => {
    const parts = expandEvent(
      {
        id: 'e',
        summary: 'Trip',
        start: {date: '2026-10-14'},
        end: {date: '2026-10-17'},
      },
      cal,
    );
    expect(parts.map(p => p.date)).toEqual([
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
    ]);
    expect(parts.every(p => p.allDay && !p.busy)).toBe(true);
    expect(parts[0].when).toBe('Wed 14 Oct – Fri 16 Oct');
  });

  it('drops cancelled events and marks free / working-location time as not busy', () => {
    expect(
      expandEvent(
        {
          id: 'f',
          status: 'cancelled',
          start: {date: '2026-10-14'},
          end: {date: '2026-10-15'},
        },
        cal,
      ),
    ).toEqual([]);
    const free = expandEvent(
      {
        id: 'g',
        transparency: 'transparent',
        start: {dateTime: '2026-10-12T12:00:00+02:00'},
        end: {dateTime: '2026-10-12T13:00:00+02:00'},
      },
      cal,
    );
    expect(free[0].busy).toBe(false);
    const wl = expandEvent(
      {
        id: 'h',
        eventType: 'workingLocation',
        start: {dateTime: '2026-10-12T09:00:00+02:00'},
        end: {dateTime: '2026-10-12T17:00:00+02:00'},
      },
      cal,
    );
    expect(wl[0].busy).toBe(false);
  });
});

describe('expandEvent with a range', () => {
  const range = {from: '2026-10-12', to: '2026-10-18'};

  it('makes pieces only for the days in the range', () => {
    const t = Date.now();
    const parts = expandEvent(
      {
        id: 'long',
        start: {date: '2026-01-01'},
        end: {date: '3026-01-01'},
      },
      cal,
      range,
    );
    expect(Date.now() - t).toBeLessThan(100);
    expect(parts.map(p => p.date)).toEqual([
      '2026-10-12',
      '2026-10-13',
      '2026-10-14',
      '2026-10-15',
      '2026-10-16',
      '2026-10-17',
      '2026-10-18',
    ]);
    expect([parts[0].first, parts[0].last]).toEqual([
      '2026-01-01',
      '3025-12-31',
    ]);
  });

  it('keeps the times of timed pieces at the range edges', () => {
    const parts = expandEvent(
      {
        id: 'trip',
        start: {dateTime: '2026-10-10T10:00:00+02:00'},
        end: {dateTime: '2026-10-13T12:00:00+02:00'},
      },
      cal,
      range,
    );
    expect(parts.map(p => [p.date, p.startMin, p.endMin])).toEqual([
      ['2026-10-12', 0, 1440],
      ['2026-10-13', 0, 720],
    ]);
    expect(parts[0].first).toBe('2026-10-10');
  });

  it('gives nothing for an event outside the range', () => {
    expect(
      expandEvent(
        {
          id: 'later',
          start: {dateTime: '2026-10-19T10:00:00+02:00'},
          end: {dateTime: '2026-10-19T11:00:00+02:00'},
        },
        cal,
        range,
      ),
    ).toEqual([]);
  });

  it('handles events ending after year 9999', () => {
    const parts = expandEvent(
      {id: 'far', start: {date: '2026-10-17'}, end: {date: '12026-01-01'}},
      cal,
      range,
    );
    expect(parts.map(p => p.date)).toEqual(['2026-10-17', '2026-10-18']);
    expect(parts[0].when).toBe('Sat 17 Oct – Wed 31 Dec');
  });
});

describe('short events', () => {
  it('keeps zero-length events, drawn 15 min long', () => {
    const [e, ...rest] = expandEvent(
      {
        id: 'z',
        summary: 'Take meds',
        start: {dateTime: '2026-10-12T10:00:00+02:00'},
        end: {dateTime: '2026-10-12T10:00:00+02:00'},
      },
      cal,
    );
    expect(rest).toEqual([]);
    expect([e.date, e.startMin, e.endMin, e.busy]).toEqual([
      '2026-10-12',
      600,
      600,
      true,
    ]);
    expect(e.when).toBe('Mon 12 Oct, 10:00');
    expect(shownEndMin(e)).toBe(615);
  });

  it('keeps a zero-length event at midnight on its own day', () => {
    const parts = expandEvent(
      {
        id: 'm',
        start: {dateTime: '2026-10-13T00:00:00+02:00'},
        end: {dateTime: '2026-10-13T00:00:00+02:00'},
      },
      cal,
    );
    expect(parts.map(p => [p.date, p.startMin, p.endMin])).toEqual([
      ['2026-10-13', 0, 0],
    ]);
  });

  it('draws the repeated hour on the DST fall-back night', () => {
    // 02:30 CEST – 02:30 CET is an hour long, but both read 02:30.
    const [e] = expandEvent(
      {
        id: 'dst',
        start: {dateTime: '2026-10-25T02:30:00+02:00'},
        end: {dateTime: '2026-10-25T02:30:00+01:00'},
      },
      cal,
    );
    expect([e.startMin, e.endMin, shownEndMin(e)]).toEqual([150, 150, 165]);
  });

  it('draws longer events as they are, within the day', () => {
    const [e] = expandEvent(
      {
        id: 'l',
        start: {dateTime: '2026-10-12T23:50:00+02:00'},
        end: {dateTime: '2026-10-12T23:55:00+02:00'},
      },
      cal,
    );
    expect(shownEndMin(e)).toBe(1440);
    const [long] = expandEvent(
      {
        id: 'h',
        start: {dateTime: '2026-10-12T09:00:00+02:00'},
        end: {dateTime: '2026-10-12T10:00:00+02:00'},
      },
      cal,
    );
    expect(shownEndMin(long)).toBe(600);
  });

  it('still drops events that end before they start', () => {
    expect(
      expandEvent(
        {
          id: 'x',
          start: {dateTime: '2026-10-12T10:00:00+02:00'},
          end: {dateTime: '2026-10-12T09:00:00+02:00'},
        },
        cal,
      ),
    ).toEqual([]);
  });
});

describe('rangeBounds', () => {
  it('covers whole local days', () => {
    expect(rangeBounds('2026-10-12', '2026-10-18')).toEqual({
      timeMin: '2026-10-11T22:00:00.000Z',
      timeMax: '2026-10-18T22:00:00.000Z',
    });
    // Across the DST change (25 Oct): the end is local midnight in CET.
    expect(rangeBounds('2026-10-19', '2026-10-25').timeMax).toBe(
      '2026-10-25T23:00:00.000Z',
    );
  });
});

describe('event colors', () => {
  const slot = {
    start: {dateTime: '2026-10-12T09:00:00+02:00'},
    end: {dateTime: '2026-10-12T10:00:00+02:00'},
  };
  it("uses the event's own color when set, else the calendar's", () => {
    expect(expandEvent({id: 'a', colorId: '11', ...slot}, cal)[0].color).toBe(
      '#d50000',
    ); // Tomato
    expect(
      expandEvent(
        {
          id: 'b',
          colorId: '2',
          start: {date: '2026-10-12'},
          end: {date: '2026-10-13'},
        },
        cal,
      )[0].color,
    ).toBe('#33b679'); // Sage
    expect(expandEvent({id: 'c', ...slot}, cal)[0].color).toBe('#7986cb'); // calendar color
    expect(expandEvent({id: 'd', colorId: '99', ...slot}, cal)[0].color).toBe(
      '#7986cb',
    ); // unknown id
  });

  it("keeps the calendar's color for the strip", () => {
    const [e] = expandEvent({id: 'a', colorId: '11', ...slot}, cal);
    expect(e.calendarColor).toBe('#7986cb');
    expect(
      expandEvent({id: 'b', ...slot}, {...cal, backgroundColor: undefined})[0]
        .calendarColor,
    ).toBe('#8ab4f8');
  });
});

describe('declined invitations', () => {
  const slot = {
    start: {dateTime: '2026-10-12T09:00:00+02:00'},
    end: {dateTime: '2026-10-12T10:00:00+02:00'},
  };
  it('marks events you declined, and never counts them as busy', () => {
    const [e] = expandEvent(
      {
        id: 'a',
        attendees: [
          {responseStatus: 'accepted'},
          {self: true, responseStatus: 'declined'},
        ],
        ...slot,
      },
      cal,
    );
    expect([e.declined, e.busy]).toEqual([true, false]);
  });
  it("ignores other guests' answers and your other answers", () => {
    const others = expandEvent(
      {
        id: 'b',
        attendees: [
          {responseStatus: 'declined'},
          {self: true, responseStatus: 'accepted'},
        ],
        ...slot,
      },
      cal,
    )[0];
    expect([others.declined, others.busy]).toEqual([false, true]);
    const tentative = expandEvent(
      {
        id: 'c',
        attendees: [{self: true, responseStatus: 'tentative'}],
        ...slot,
      },
      cal,
    )[0];
    expect([tentative.declined, tentative.busy]).toEqual([false, true]);
    expect(expandEvent({id: 'd', ...slot}, cal)[0].declined).toBe(false); // not an invitation
  });
});
