import {describe, expect, it} from 'vitest';
import {emptyData, GradeSystem} from './data';
import {gradeOf, labelOf} from './grades';
import {mergeClimbData} from './merge';
import {addPlace, deletePlace, updatePlace} from './places';
import {deleteSession, logClimb, startSession} from './sessions';

const at = new Date('2026-11-23T18:00:00');
const font = (g: string) => gradeOf(GradeSystem.FONT, g);

describe('merging two devices’ logs', () => {
  it('keeps climbs logged on both since the last sync', () => {
    const [a, gym] = addPlace(emptyData(), 'A');
    const [base, s] = startSession(a, gym, at);
    const [local] = logClimb(base, s, font('6A'), 1, at);
    const [remote] = logClimb(base, s, font('6B'), 2, at);
    const {data, conflicts} = mergeClimbData(base, local, remote);
    expect(data.sessions[0].climbs.map(c => labelOf(c.grade)).sort()).toEqual([
      '6A',
      '6B',
    ]);
    expect(conflicts).toEqual([]);
  });

  it('keeps a session deleted on one device while the other logged in it', () => {
    const [a, gym] = addPlace(emptyData(), 'A');
    const [base, s] = startSession(a, gym, at);
    const local = deleteSession(base, s);
    const [remote] = logClimb(base, s, font('6A'), 1, at);
    const {data} = mergeClimbData(base, local, remote);
    expect(data.sessions.map(x => x.id)).toEqual([s]);
    expect(data.sessions[0].climbs).toHaveLength(1);
  });

  it('brings back a gym deleted on one device while the other started a session there', () => {
    const [base, gym] = addPlace(emptyData(), 'A');
    const local = deletePlace(base, gym);
    const [remote] = startSession(base, gym, at);
    const {data} = mergeClimbData(base, local, remote);
    expect(data.places.map(p => p.id)).toEqual([gym]);
    expect(data.sessions).toHaveLength(1);
  });

  it('keeps this device’s value when both changed the same one, and says so', () => {
    const [base, gym] = addPlace(emptyData(), 'A');
    const {data, conflicts} = mergeClimbData(
      base,
      updatePlace(base, gym, {name: 'B'}),
      updatePlace(base, gym, {name: 'C'}),
    );
    expect(data.places[0].name).toBe('B');
    expect(conflicts).toHaveLength(1);
  });
});
