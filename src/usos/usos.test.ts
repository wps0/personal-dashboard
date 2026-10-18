import {describe, expect, it} from 'vitest';
import {ItemKind} from '../model/types';
import type {ApiEvent} from '../google/events';
import {
  coursePattern,
  meetingTitle,
  meetingsFromGoogle,
  meetingsFromICal,
  parseClassTitle,
  proposeImports,
  taskFromMeeting,
  type ClassMeeting,
} from './usos';

// Tests run with TZ=Europe/Warsaw (see package.json).

describe('parseClassTitle', () => {
  it('splits the type designator from the course title', () => {
    expect(parseClassTitle('SEM-MGR - Dane, strumienie, rozpraszanie')).toEqual(
      {type: 'SEM-MGR', course: 'Dane, strumienie, rozpraszanie'},
    );
    expect(parseClassTitle('LAB - Programowanie mikrokontrolerów')).toEqual({
      type: 'LAB',
      course: 'Programowanie mikrokontrolerów',
    });
    expect(parseClassTitle('CW - Złożoność obliczeniowa')).toEqual({
      type: 'CW',
      course: 'Złożoność obliczeniowa',
    });
    expect(
      parseClassTitle('WYK – Implementacja systemów operacyjnych'),
    ).toEqual({type: 'WYK', course: 'Implementacja systemów operacyjnych'});
  });

  it('keeps hyphens inside the course title', () => {
    expect(parseClassTitle('WYK - Teoria grafów - część 2')).toEqual({
      type: 'WYK',
      course: 'Teoria grafów - część 2',
    });
  });

  it('reads the first line only', () => {
    expect(parseClassTitle('LAB - Analiza\nGrupa 2')).toEqual({
      type: 'LAB',
      course: 'Analiza',
    });
  });

  it('rejects other titles', () => {
    expect(parseClassTitle('Dentist')).toBeNull();
    expect(parseClassTitle('Team standup - weekly')).toBeNull();
    expect(parseClassTitle('WYK-Bez spacji')).toBeNull();
  });
});

describe('coursePattern', () => {
  it('is a case-insensitive regex on the course title', () => {
    expect(coursePattern('złożoność').test('Złożoność obliczeniowa')).toBe(
      true,
    );
    expect(coursePattern('^dane,').test('Dane, strumienie')).toBe(true);
  });

  it('explains an invalid pattern', () => {
    expect(() => coursePattern('(')).toThrow(/Invalid pattern/);
  });
});

function ics(events: string) {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', events, 'END:VCALENDAR'].join(
    '\r\n',
  );
}

describe('meetingsFromICal', () => {
  it('reads timed classes with a TZID, in local time', () => {
    const {meetings, warnings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:usos-1',
          'SUMMARY:WYK - Implementacja systemów operacyjnych',
          'DTSTART;TZID=Europe/Warsaw:20261014T101500',
          'DTEND;TZID=Europe/Warsaw:20261014T120000',
          'LOCATION:Banacha 2\\, sala 3180',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(warnings).toEqual([]);
    expect(meetings).toEqual([
      {
        key: 'usos-1@2026-10-14T10:15',
        type: 'WYK',
        course: 'Implementacja systemów operacyjnych',
        date: '2026-10-14',
        start: '10:15',
        end: '12:00',
        location: 'Banacha 2, sala 3180',
      },
    ]);
  });

  it('converts UTC times and unfolds long lines', () => {
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:usos-2',
          'SUMMARY:CW - Złożoność ',
          ' obliczeniowa',
          'DTSTART:20261216T131500Z', // winter: UTC+1
          'DTEND:20261216T144500Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(meetings[0]).toMatchObject({
      course: 'Złożoność obliczeniowa',
      date: '2026-12-16',
      start: '14:15',
      end: '15:45',
    });
  });

  it('expands weekly repeats across a DST change, minus EXDATEs', () => {
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:usos-3',
          'SUMMARY:LAB - Programowanie mikrokontrolerów',
          'DTSTART;TZID=Europe/Warsaw:20261019T081500',
          'DTEND;TZID=Europe/Warsaw:20261019T094500',
          'RRULE:FREQ=WEEKLY;COUNT=3',
          'EXDATE;TZID=Europe/Warsaw:20261026T081500',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    // 25 Oct is the switch to winter time; the class stays at 08:15.
    expect(meetings.map(m => `${m.date} ${m.start}`)).toEqual([
      '2026-10-19 08:15',
      '2026-11-02 08:15',
    ]);
    expect(new Set(meetings.map(m => m.key)).size).toBe(2);
  });

  it('applies RECURRENCE-ID overrides: moved and cancelled classes', () => {
    const {meetings, warnings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:usos-4',
          'SUMMARY:LAB - Programowanie mikrokontrolerów',
          'DTSTART;TZID=Europe/Warsaw:20261019T081500',
          'DTEND;TZID=Europe/Warsaw:20261019T094500',
          'RRULE:FREQ=WEEKLY;COUNT=3',
          'END:VEVENT',
          // The second class moves to Wednesday afternoon, in another room.
          'BEGIN:VEVENT',
          'UID:usos-4',
          'RECURRENCE-ID;TZID=Europe/Warsaw:20261026T081500',
          'SUMMARY:LAB - Programowanie mikrokontrolerów',
          'DTSTART;TZID=Europe/Warsaw:20261028T141500',
          'DTEND;TZID=Europe/Warsaw:20261028T154500',
          'LOCATION:Sala 2',
          'END:VEVENT',
          // The third is cancelled (its original start in UTC).
          'BEGIN:VEVENT',
          'UID:usos-4',
          'RECURRENCE-ID:20261102T071500Z',
          'SUMMARY:LAB - Programowanie mikrokontrolerów',
          'STATUS:CANCELLED',
          'DTSTART;TZID=Europe/Warsaw:20261102T081500',
          'DTEND;TZID=Europe/Warsaw:20261102T094500',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(warnings).toEqual([]);
    expect(
      meetings.map(m => `${m.key} ${m.start}–${m.end} ${m.location ?? ''}`),
    ).toEqual([
      'usos-4@2026-10-19T08:15 08:15–09:45 ',
      'usos-4@2026-10-28T14:15 14:15–15:45 Sala 2',
    ]);
  });

  it('skips cancelled and non-class events, and warns about unsupported repeats', () => {
    const {meetings, warnings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:a',
          'SUMMARY:WYK - Odwołany',
          'STATUS:CANCELLED',
          'DTSTART:20261014T080000Z',
          'DTEND:20261014T090000Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:b',
          'SUMMARY:Rektorskie godziny wolne',
          'DTSTART:20261014T080000Z',
          'DTEND:20261014T090000Z',
          'END:VEVENT',
          'BEGIN:VEVENT',
          'UID:c',
          'SUMMARY:CW - Analiza',
          'DTSTART:20261014T080000Z',
          'DTEND:20261014T090000Z',
          'RRULE:FREQ=MONTHLY;COUNT=3',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(meetings.map(m => m.course)).toEqual(['Analiza']);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/not supported/);
  });

  it('finds the value after the first colon outside quotes', () => {
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:q',
          'SUMMARY:WYK - Systemy "Big data',
          'DTSTART:20261014T080000Z',
          'DTEND:20261014T090000Z',
          'LOCATION;ALTREP="https://maps.example/a:b":Sala 1',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(meetings).toMatchObject([
      {course: 'Systemy "Big data', location: 'Sala 1'},
    ]);
  });

  it('reads lines with many colons in linear time', () => {
    const t = Date.now();
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:c',
          'SUMMARY:WYK - Analiza',
          // An odd quote after them made each colon rescan the rest of the line.
          `DESCRIPTION:${':'.repeat(50_000)}"`,
          'DTSTART:20261014T080000Z',
          'DTEND:20261014T090000Z',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(meetings).toHaveLength(1);
    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('ignores trailing whitespace on lines', () => {
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT ',
          'UID:w',
          'SUMMARY:WYK - Analiza',
          'DTSTART:20261014T080000Z\t',
          'DTEND:20261014T090000Z',
          'END:VEVENT  ',
        ].join('\r\n'),
      ),
    );
    expect(meetings).toMatchObject([{course: 'Analiza', start: '10:00'}]);
  });

  it('unescapes text in one pass and keeps the first line of a title', () => {
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:e',
          'SUMMARY:WYK - Analiza\\nGrupa 2',
          'DTSTART:20261014T080000Z',
          'DTEND:20261014T090000Z',
          'LOCATION:C:\\\\new\\; sala 1\\, 2',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(meetings).toMatchObject([
      {course: 'Analiza', location: 'C:\\new; sala 1, 2'},
    ]);
  });

  it('takes the end from DURATION when there is no DTEND', () => {
    const {meetings} = meetingsFromICal(
      ics(
        [
          'BEGIN:VEVENT',
          'UID:d',
          'SUMMARY:LAB - Analiza',
          'DTSTART;TZID=Europe/Warsaw:20261019T081500',
          'DURATION:PT1H30M',
          'RRULE:FREQ=WEEKLY;COUNT=2',
          'END:VEVENT',
        ].join('\r\n'),
      ),
    );
    expect(meetings.map(m => `${m.date} ${m.start}–${m.end}`)).toEqual([
      '2026-10-19 08:15–09:45',
      '2026-10-26 08:15–09:45',
    ]);
  });

  it('says when the text is not iCalendar', () => {
    expect(meetingsFromICal('<html>Login</html>').warnings[0]).toMatch(
      /iCalendar/,
    );
  });
});

describe('meetingsFromGoogle', () => {
  const ev = (over: Partial<ApiEvent>): ApiEvent => ({
    id: 'g1',
    iCalUID: 'usos-1',
    summary: 'WYK - Implementacja systemów operacyjnych',
    start: {dateTime: '2026-10-14T10:15:00+02:00'},
    end: {dateTime: '2026-10-14T12:00:00+02:00'},
    ...over,
  });

  it('uses the iCal UID, so the key matches the iCal source', () => {
    expect(meetingsFromGoogle([ev({})])[0].key).toBe('usos-1@2026-10-14T10:15');
  });

  it('skips cancelled, all-day and non-class events', () => {
    expect(
      meetingsFromGoogle([
        ev({status: 'cancelled'}),
        ev({start: {date: '2026-10-14'}, end: {date: '2026-10-15'}}),
        ev({summary: 'Dentist'}),
      ]),
    ).toEqual([]);
  });
});

describe('proposeImports', () => {
  const m = (course: string, date: string, type = 'WYK'): ClassMeeting => ({
    key: `${course}@${date}`,
    type,
    course,
    date,
    start: '10:15',
    end: '12:00',
  });
  const meetings = [
    m('Złożoność obliczeniowa', '2026-10-21', 'CW'),
    m('Implementacja systemów operacyjnych', '2026-10-14'),
    m('Złożoność obliczeniowa', '2026-10-14', 'CW'),
    m('Wychowanie fizyczne', '2026-10-15'),
  ];

  it('assigns meetings to projects by course title, oldest first', () => {
    const out = proposeImports(
      meetings,
      [
        {projectId: 'os', pattern: 'systemów operacyjnych'},
        {projectId: 'cc', pattern: '^złożoność'},
      ],
      new Set(),
    );
    expect(out.map(p => `${p.projectId} ${p.meeting.date}`)).toEqual([
      'os 2026-10-14',
      'cc 2026-10-14',
      'cc 2026-10-21',
    ]);
  });

  it('never matches the type designator', () => {
    expect(
      proposeImports(meetings, [{projectId: 'x', pattern: '^CW'}], new Set()),
    ).toEqual([]);
  });

  it('skips imported meetings, empty and invalid patterns', () => {
    const out = proposeImports(
      meetings,
      [
        {projectId: 'bad', pattern: '('},
        {projectId: 'empty', pattern: '  '},
        {projectId: 'cc', pattern: 'złożoność'},
      ],
      new Set(['Złożoność obliczeniowa@2026-10-14']),
    );
    expect(out.map(p => `${p.projectId} ${p.meeting.date}`)).toEqual([
      'cc 2026-10-21',
    ]);
  });

  it('gives a meeting to the first matching project only', () => {
    const out = proposeImports(
      meetings,
      [
        {projectId: 'a', pattern: 'obliczeniowa'},
        {projectId: 'b', pattern: 'złożoność'},
      ],
      new Set(),
    );
    expect(new Set(out.map(p => p.projectId))).toEqual(new Set(['a']));
  });
});

describe('meetingTitle', () => {
  it('names the task by type, day and time', () => {
    expect(
      meetingTitle({
        key: 'k',
        type: 'LAB',
        course: 'Programowanie mikrokontrolerów',
        date: '2026-10-19',
        start: '08:15',
        end: '09:45',
      }),
    ).toBe('LAB · Mon 19 Oct, 08:15');
  });
});

describe('taskFromMeeting', () => {
  it('makes a class item dated by the class, remembering the meeting', () => {
    expect(
      taskFromMeeting({
        key: 'usos-1@2026-10-14T10:15',
        type: 'WYK',
        course: 'Implementacja systemów operacyjnych',
        date: '2026-10-14',
        start: '10:15',
        end: '12:00',
        location: 'Banacha 2, sala 3180',
      }),
    ).toEqual({
      kind: ItemKind.CLASS,
      title: 'WYK · Wed 14 Oct, 10:15',
      heldOn: '2026-10-14',
      estimateHours: 1.75,
      notes: 'WYK 10:15–12:00 · Banacha 2, sala 3180',
      source: {
        source: {case: 'usosMeeting', value: 'usos-1@2026-10-14T10:15'},
      },
    });
  });
});
