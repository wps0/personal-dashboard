import {afterEach, describe, expect, it, vi} from 'vitest';
import {coursesIn, fetchMeetings, isValidICalUrl, usosRange} from './fetch';
import type {ClassMeeting} from './usos';

afterEach(() => vi.unstubAllGlobals());

const ics = [
  'BEGIN:VCALENDAR',
  'BEGIN:VEVENT',
  'UID:in',
  'SUMMARY:WYK - Analiza',
  'DTSTART:20261014T080000Z',
  'DTEND:20261014T093000Z',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:out',
  'SUMMARY:WYK - Analiza',
  'DTSTART:20300101T080000Z',
  'DTEND:20300101T093000Z',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('fetchMeetings (iCal link)', () => {
  it('fetches without cookies or referrer and keeps the range', async () => {
    const fetchMock = vi.fn(async () => new Response(ics));
    vi.stubGlobal('fetch', fetchMock);
    vi.useFakeTimers({now: new Date('2026-10-12T12:00:00Z'), toFake: ['Date']});
    const {meetings} = await fetchMeetings({
      kind: 'ical',
      url: 'https://usosweb.example/plan.ics',
    });
    vi.useRealTimers();
    expect(meetings.map(m => m.key)).toEqual(['in@2026-10-14T10:00']);
    expect(fetchMock).toHaveBeenCalledWith('https://usosweb.example/plan.ics', {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      cache: 'no-store',
    });
  });

  it('explains a blocked request and an HTTP error', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(
      fetchMeetings({kind: 'ical', url: 'https://x.example/a.ics'}),
    ).rejects.toThrow(/CORS/);
    vi.stubGlobal(
      'fetch',
      async () => new Response('', {status: 403, statusText: 'Forbidden'}),
    );
    await expect(
      fetchMeetings({kind: 'ical', url: 'https://x.example/a.ics'}),
    ).rejects.toThrow('The iCal link returned 403 Forbidden.');
  });

  it('refuses links that are not https', async () => {
    expect(isValidICalUrl('http://x.example/a.ics')).toBe(false);
    expect(isValidICalUrl('webcal://x.example/a.ics')).toBe(false);
    expect(isValidICalUrl('https://x.example/a.ics')).toBe(true);
    await expect(
      fetchMeetings({kind: 'ical', url: 'http://x.example/a.ics'}),
    ).rejects.toThrow(/https/);
  });
});

describe('usosRange', () => {
  it('spans about a semester back and half a year ahead', () => {
    expect(usosRange('2026-10-12')).toEqual({
      from: '2026-06-14',
      to: '2027-04-10',
    });
  });
});

describe('coursesIn', () => {
  it('lists courses with their class types and meeting counts', () => {
    const m = (course: string, type: string) =>
      ({course, type}) as ClassMeeting;
    expect(
      coursesIn([
        m('Złożoność obliczeniowa', 'WYK'),
        m('Analiza', 'CW'),
        m('Złożoność obliczeniowa', 'CW'),
        m('Złożoność obliczeniowa', 'WYK'),
      ]),
    ).toEqual([
      {course: 'Analiza', types: ['CW'], count: 1},
      {course: 'Złożoność obliczeniowa', types: ['CW', 'WYK'], count: 3},
    ]);
  });
});
