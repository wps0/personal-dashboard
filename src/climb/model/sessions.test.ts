import {describe, expect, it} from 'vitest';
import {emptyData, GradeSystem, type ClimbData} from './data';
import {gradeOf, labelOf} from './grades';
import {addPlace, updatePlace} from './places';
import {
  climbsOf,
  dayOf,
  deleteClimb,
  finishSession,
  formatLength,
  hardest,
  lengthOf,
  logClimb,
  nextPlaceId,
  runningSession,
  startSession,
  timeOf,
  updateClimb,
} from './sessions';

const at = (t: string) => new Date(`2026-11-21T${t}:00`);
const font = (g: string) => gradeOf(GradeSystem.FONT, g);

function twoGyms(): [ClimbData, string, string] {
  const [a, one] = addPlace(emptyData(), 'Blokownia');
  const [b, two] = addPlace(a, 'West');
  return [b, one, two];
}

describe('sessions', () => {
  it('start at a gym, run until finished, and hold their climbs', () => {
    const [data, gym] = twoGyms();
    const [a, s] = startSession(data, gym, at('18:58'));
    const running = runningSession(a)!;
    expect(running.id).toBe(s);
    expect(timeOf(running.start)).toBe('18:58');
    expect(dayOf(running)).toBe('2026-11-21');
    const [b] = logClimb(a, s, font('6A'), 1, at('19:05'));
    const [c] = logClimb(b, s, font('6B+'), 3, at('19:31'));
    expect(climbsOf(c, s).map(x => labelOf(x.grade))).toEqual(['6B+', '6A']);
    const d = finishSession(c, s, at('20:31'));
    expect(runningSession(d)).toBeUndefined();
    expect(timeOf(d.sessions[0].end)).toBe('20:31');
    expect(lengthOf(d.sessions[0])).toBe(93);
  });

  it('aren’t kept when finished with nothing logged', () => {
    const [data, gym] = twoGyms();
    const [a, s] = startSession(data, gym, at('18:00'));
    expect(finishSession(a, s, at('18:10')).sessions).toEqual([]);
  });

  it('offer the last gym again, unless it’s archived', () => {
    const [data, one, two] = twoGyms();
    expect(nextPlaceId(data)).toBe(one);
    const [a] = startSession(data, two, at('11:00'));
    expect(nextPlaceId(a)).toBe(two);
    expect(nextPlaceId(updatePlace(a, two, {archived: true}))).toBe(one);
  });
});

describe('climbs', () => {
  it('change, and are deleted', () => {
    const [data, gym] = twoGyms();
    const [a, s] = startSession(data, gym, at('18:00'));
    const [b, c] = logClimb(a, s, font('6A'), 0, at('18:05'));
    expect(b.sessions[0].climbs[0].tries).toBe(1);
    const d = updateClimb(b, c, {
      grade: font('6B'),
      tries: 2,
      name: 'the arête',
    });
    expect(labelOf(d.sessions[0].climbs[0].grade)).toBe('6B');
    expect(d.sessions[0].climbs[0]).toMatchObject({
      tries: 2,
      name: 'the arête',
    });
    expect(deleteClimb(d, c).sessions[0].climbs).toEqual([]);
  });

  it('give the hardest grade, converting ones logged in the other scale', () => {
    const [data, gym] = twoGyms();
    const [a, s] = startSession(data, gym, at('18:00'));
    const [b] = logClimb(a, s, font('6B+'), 1, at('18:05'));
    const [c] = logClimb(b, s, gradeOf(GradeSystem.V, 'V5'), 1, at('18:10'));
    const climbs = c.sessions[0].climbs;
    expect(hardest(climbs, GradeSystem.FONT)).toBe('6C');
    expect(hardest(climbs, GradeSystem.V)).toBe('V5');
    expect(hardest([], GradeSystem.FONT)).toBeUndefined();
  });
});

describe('lengths', () => {
  it('read as hours and minutes', () => {
    expect(formatLength(93)).toBe('1h 33m');
    expect(formatLength(45)).toBe('45m');
  });
});
