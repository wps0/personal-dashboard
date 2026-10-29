import {create, equals, fromBinary, toBinary} from '@bufbuild/protobuf';
import {BinaryWriter, WireType} from '@bufbuild/protobuf/wire';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {
  SCHEMA_VERSION,
  decode,
  encode,
  fromReadableJson,
  toReadableJson,
} from './codec';

function sample(): pb.AppData {
  return create(pb.AppDataSchema, {
    areas: [{id: 'uni', name: 'University', color: '#60a5fa'}],
    items: [
      {
        id: 'i1',
        projectId: 'p1',
        kind: pb.ItemKind.CLASS,
        status: pb.ItemStatus.DONE,
        title: 'Lecture 1',
        source: {source: {case: 'usosMeeting', value: 'abc@2026-10-14T10:15'}},
      },
    ],
    dayNotes: {'2026-10-13': 'Note'},
    settings: {
      defaultCalendarView: pb.CalendarView.THREE_DAY,
      usos: {source: {case: 'icalUrl', value: 'https://x.example/p.ics'}},
    },
  });
}

describe('binary', () => {
  it('keeps the schema version in field 1, where every version finds it', () => {
    expect(pb.AppDataSchema.field.schemaVersion.number).toBe(1);
  });

  it('round-trips; the schema version is only in what’s stored', () => {
    const data = sample();
    const bytes = encode(data);
    expect(fromBinary(pb.AppDataSchema, bytes).schemaVersion).toBe(
      SCHEMA_VERSION,
    );
    const out = decode(bytes);
    expect(out.schemaVersion).toBe(0);
    expect(equals(pb.AppDataSchema, out, data)).toBe(true);
  });

  it('reads data of the first schema version and saves it as this one', () => {
    const v1 = toBinary(pb.AppDataSchema, {...sample(), schemaVersion: 1});
    const out = decode(v1);
    expect(equals(pb.AppDataSchema, out, sample())).toBe(true);
    expect(fromBinary(pb.AppDataSchema, encode(out)).schemaVersion).toBe(
      SCHEMA_VERSION,
    );
  });

  it('refuses a newer schema version and anything that isn’t its data', () => {
    const newer = toBinary(
      pb.AppDataSchema,
      create(pb.AppDataSchema, {schemaVersion: SCHEMA_VERSION + 1}),
    );
    expect(() => decode(newer)).toThrow(/newer version of the app/);
    expect(() => decode(new Uint8Array())).toThrow(/isn’t dashboard data/);
    expect(() => decode(new Uint8Array([0xff, 0xff, 0xff]))).toThrow(
      /can’t be read/,
    );
  });

  it('keeps fields and enum values it doesn’t know through an edit and a save', () => {
    // What a newer version might write without raising the schema version: an
    // item with a new enum value and a new field, and a new top-level field.
    const item = create(pb.ItemSchema, {
      id: 'i1',
      title: 'Lab 3',
      kind: 9 as pb.ItemKind,
    });
    const {field} = pb.AppDataSchema;
    const bytes = new BinaryWriter()
      .tag(field.schemaVersion.number, WireType.Varint)
      .int32(SCHEMA_VERSION)
      .tag(field.items.number, WireType.LengthDelimited)
      .bytes(
        new BinaryWriter()
          .raw(toBinary(pb.ItemSchema, item))
          .tag(50, WireType.LengthDelimited)
          .string('room 1.23')
          .finish(),
      )
      .tag(99, WireType.Varint)
      .int32(7)
      .finish();

    const data = decode(bytes);
    data.items[0].title = 'Lab 3 (moved)';
    const saved = decode(encode(data));
    expect(saved.items[0]).toMatchObject({title: 'Lab 3 (moved)', kind: 9});
    expect(saved.items[0].$unknown?.map(f => f.no)).toEqual([50]);
    expect(saved.$unknown?.map(f => f.no)).toEqual([99]);
  });
});

describe('readable JSON', () => {
  it('is indented, with enum names and the schema version', () => {
    const text = toReadableJson(sample());
    expect(text).toContain('\n  "areas": [');
    expect(text).toContain('"kind": "ITEM_KIND_CLASS"');
    expect(text).toContain('"defaultCalendarView": "CALENDAR_VIEW_THREE_DAY"');
    expect(text).toContain(`"schemaVersion": ${SCHEMA_VERSION}`);
  });

  it('reads back to the same data', () => {
    const data = sample();
    expect(
      equals(pb.AppDataSchema, fromReadableJson(toReadableJson(data)), data),
    ).toBe(true);
  });

  it('refuses fields it doesn’t know and newer schema versions', () => {
    const json = JSON.parse(toReadableJson(sample()));
    expect(() =>
      fromReadableJson(JSON.stringify({...json, newField: 1})),
    ).toThrow(/newer version of the app/);
    expect(() =>
      fromReadableJson(
        JSON.stringify({...json, schemaVersion: SCHEMA_VERSION + 1}),
      ),
    ).toThrow(/newer version of the app/);
    expect(() => fromReadableJson('{"version": 1}')).toThrow();
  });
});
