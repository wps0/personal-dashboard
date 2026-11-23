import {describe, expect, it} from 'vitest';
import {FakeDrive} from '../sync/fake_drive';
import {syncOnce, type SyncModel} from '../saving/drive_sync';
import {emptyData, GradeSystem, type ClimbData} from './model/data';
import {gradeOf} from './model/grades';
import {isBlank, mergeClimbData, same} from './model/merge';
import {addPlace} from './model/places';
import {logClimb, startSession} from './model/sessions';
import {codec, readStored} from './storage';

const MODEL: SyncModel<ClimbData> = {
  encode: codec.encode,
  read: readStored,
  readable: codec.toReadableJson,
  merge: mergeClimbData,
  same,
  isBlank,
  empty: emptyData,
};

const at = new Date('2026-11-23T18:00:00');

function device(name: string): ClimbData {
  const [a, gym] = addPlace(emptyData(), name);
  const [b, s] = startSession(a, gym, at);
  return logClimb(b, s, gradeOf(GradeSystem.FONT, '6A'), 1, at)[0];
}

describe('the log’s Drive sync', () => {
  it('creates climb.binpb, and merges a second device’s different log instead of asking', async () => {
    const drive = new FakeDrive();
    const one = await syncOnce(MODEL, device('A'), null, drive, 'merge');
    expect(one.kind).toBe('created');
    const two = await syncOnce(MODEL, device('B'), null, drive, 'merge');
    expect(two.kind).toBe('merged');
    if (two.kind === 'choose') throw new Error('asked');
    expect(two.data.places.map(p => p.name).sort()).toEqual(['A', 'B']);
    expect(two.data.sessions.flatMap(x => x.climbs)).toHaveLength(2);
    // The first device picks the merge up.
    if (one.kind === 'choose') throw new Error('asked');
    const back = await syncOnce(MODEL, one.data, one.base, drive, 'merge');
    expect(back.kind).toBe('pulled');
    expect(JSON.parse(drive.copy ?? '{}').places).toHaveLength(2);
  });
});
