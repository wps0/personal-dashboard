import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {SCHEMA_VERSION} from './codec';
import {MIGRATIONS, migrate, type Migration} from './migrations';

/** A step that records that it ran, in the day notes. */
function step(name: string): Migration {
  return data => ({...data, dayNotes: {...data.dayNotes, [name]: name}});
}

describe('migrate', () => {
  const data = create(pb.AppDataSchema, {});
  const steps = {1: step('1→2'), 2: step('2→3'), 3: step('3→4')};

  it('runs each step from the saved version up to the target, in order', () => {
    const out = migrate(data, 2, 4, steps);
    expect(Object.keys(out.dayNotes)).toEqual(['2→3', '3→4']);
  });

  it('leaves data of the target version as it is', () => {
    expect(migrate(data, 3, 3, steps)).toBe(data);
  });

  it('fails when a step is missing, instead of reading data wrongly', () => {
    expect(() => migrate(data, 1, 5, steps)).toThrow(
      /schema version 4 can’t be upgraded/,
    );
  });

  it('has a step from every older schema version, and none beyond', () => {
    for (let v = 1; v < SCHEMA_VERSION; v++)
      expect(MIGRATIONS[v], `migration from version ${v}`).toBeTypeOf(
        'function',
      );
    expect(
      Object.keys(MIGRATIONS)
        .map(Number)
        .filter(v => v < 1 || v >= SCHEMA_VERSION),
    ).toEqual([]);
  });
});
