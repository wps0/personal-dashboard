import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {migrate, protoCodec} from './proto_codec';

// Any root message with the schema version in field 1 works; the dashboard's
// stands in for another app's here, with its own version and migrations.
const codec = protoCodec(pb.AppDataSchema, {
  version: 2,
  migrations: {1: d => ({...d, dayNotes: {...d.dayNotes, x: 'upgraded'}})},
  what: 'test data',
});

describe('protoCodec', () => {
  it('round-trips binary and JSON, upgrading older data as it reads it', () => {
    const data = create(pb.AppDataSchema, {dayNotes: {'2026-11-23': 'a'}});
    expect(codec.decode(codec.encode(data)).dayNotes).toEqual(data.dayNotes);
    expect(codec.fromReadableJson(codec.toReadableJson(data)).dayNotes).toEqual(
      data.dayNotes,
    );
    const old = protoCodec(pb.AppDataSchema, {
      version: 1,
      migrations: {},
      what: 'test data',
    });
    expect(codec.decode(old.encode(data)).dayNotes.x).toBe('upgraded');
  });

  it('names the data in its messages, and refuses newer data', () => {
    expect(() => codec.fromReadableJson('{}')).toThrow('This isn’t test data.');
    const newer = protoCodec(pb.AppDataSchema, {
      version: 3,
      migrations: {},
      what: 'test data',
    });
    expect(() => codec.decode(newer.encode(create(pb.AppDataSchema)))).toThrow(
      /newer version/,
    );
  });

  it('migrates step by step, and says which step is missing', () => {
    expect(migrate(1, 1, 3, {1: n => n * 10, 2: n => n + 1})).toBe(11);
    expect(() => migrate(1, 1, 3, {1: n => n})).toThrow(
      'no migration to version 3',
    );
  });
});
