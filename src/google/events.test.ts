import {describe, expect, it} from 'vitest';
import {expandEvent, rangeBounds, type ApiCalendar} from './events';

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
