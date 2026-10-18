import {create, equals, fromBinary, toBinary} from '@bufbuild/protobuf';
import {BinaryWriter, WireType} from '@bufbuild/protobuf/wire';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/v2/data_pb';
import {FORMAT, fromStored, toEnvelope} from './codec';
import v1Sample from './testdata/v1_sample.json';

/** Real v1 JSON, as an older version of the app stored it. */
interface V1Json {
  areas: Array<{name: string}>;
  projects: unknown[];
  items: Array<{
    id: string;
    kind: string;
    status: string;
    dueDate?: string;
    notes?: string;
  }>;
  allocations: unknown[];
  events: unknown[];
}

function v1Data(): V1Json {
  return structuredClone(v1Sample) as V1Json;
}

/** A round trip through JSON text, as storage and Drive do. */
function store(data: pb.AppData): unknown {
  return JSON.parse(JSON.stringify(toEnvelope(data)));
}

describe('reading v1 data', () => {
  it('converts every part, including enums and unions', () => {
    const old = v1Data();
    const data = fromStored(JSON.parse(JSON.stringify(old)));
    expect(data.areas.map(a => a.name)).toEqual(old.areas.map(a => a.name));
    expect(data.projects).toHaveLength(old.projects.length);
    expect(data.items).toHaveLength(old.items.length);
    expect(data.allocations).toHaveLength(old.allocations.length);
    expect(data.events).toHaveLength(old.events.length);

    const item = data.items[0];
    expect(item.kind).toBe(pb.ItemKind.CLASS);
    expect(item.source?.source).toEqual({
      case: 'usosMeeting',
      value: 'abc@2026-10-14T10:15',
    });
    expect(data.events[0].allDay).toBe(true);

    const settings = data.settings!;
    expect(settings.defaultCalendarView).toBe(pb.CalendarView.THREE_DAY);
    expect(settings.dayCapacity['2026-10-13'].override).toBe(2);
    expect(settings.dayCapacity['2026-10-13'].delta).toBeUndefined();
    expect(settings.usos?.source).toEqual({
      case: 'icalUrl',
      value: 'https://usosweb.example/plan.ics',
    });
    expect(settings.usos?.handled).toEqual(['a', 'b']);
    expect(settings.capacityRules[0].reserved[0].ranges[0]).toMatchObject({
      start: '23:00',
      end: '07:00',
      label: 'Sleep',
    });
    expect(settings.capacityRules[0].windows).toHaveLength(7);
  });

  it('keeps optional fields unset rather than empty', () => {
    const old = v1Data();
    const plain = old.items.find(i => i.dueDate === undefined)!;
    const item = fromStored(old).items.find(i => i.id === plain.id)!;
    expect(item.dueDate).toBeUndefined();
    expect(item.notes).toBe(plain.notes);
  });

  it('migrates old values on the way, as v1 reading did', () => {
    const old = v1Data();
    old.items[1].kind = 'lecture';
    old.items[1].status = 'notes';
    const item = fromStored(old).items[1];
    expect(item.kind).toBe(pb.ItemKind.CLASS);
    expect(item.status).toBe(pb.ItemStatus.DONE);
  });
});

describe('the stored envelope', () => {
  it('round-trips exactly', () => {
    const data = fromStored(v1Data());
    const stored = store(data) as {format: number};
    expect(stored.format).toBe(FORMAT);
    expect(equals(pb.AppDataSchema, fromStored(stored), data)).toBe(true);
  });

  it('carries a readable copy with enum names', () => {
    const {view} = store(fromStored(v1Data())) as {view: unknown};
    const json = JSON.stringify(view);
    expect(json).toContain('"kind":"ITEM_KIND_CLASS"');
    expect(json).toContain('"defaultCalendarView":"CALENDAR_VIEW_THREE_DAY"');
    expect(json).toContain('"icalUrl":"https://usosweb.example/plan.ics"');
  });

  it('refuses newer formats and garbage, with a readable error', () => {
    expect(() => fromStored({format: FORMAT + 1, data: ''})).toThrow(
      /newer version of the app/,
    );
    expect(() => fromStored({format: 1, data: ''})).toThrow(/format/);
    expect(() => fromStored({version: 3})).toThrow(/version/);
    expect(() => fromStored(null)).toThrow();
  });
});

describe('data from a newer version of the app', () => {
  /**
   * What a future app might write: an item with an enum value and a field
   * this version doesn't know, and an unknown top-level field.
   */
  function futureBytes(): Uint8Array {
    const item = create(pb.ItemSchema, {
      id: 'i1',
      projectId: 'p1',
      title: 'Lab 3',
      kind: 9 as pb.ItemKind,
      status: pb.ItemStatus.TODO,
    });
    const itemBytes = new BinaryWriter()
      .raw(toBinary(pb.ItemSchema, item))
      .tag(50, WireType.LengthDelimited)
      .string('room 1.23')
      .finish();
    return new BinaryWriter()
      .tag(3, WireType.LengthDelimited)
      .bytes(itemBytes)
      .tag(99, WireType.Varint)
      .int32(7)
      .finish();
  }

  it('keeps unknown fields and enum values through an edit and a save', () => {
    const original = futureBytes();
    const data = fromStored({
      format: FORMAT,
      data: toEnvelope(fromBinary(pb.AppDataSchema, original)).data,
    });
    expect(data.items[0].kind).toBe(9);

    // This version edits what it knows and saves.
    data.items[0].title = 'Lab 3 (moved)';
    const saved = fromStored(store(data));
    const item = saved.items[0];
    expect(item.title).toBe('Lab 3 (moved)');
    expect(item.kind).toBe(9);
    expect(item.$unknown?.map(f => f.no)).toEqual([50]);
    expect(saved.$unknown?.map(f => f.no)).toEqual([99]);
  });

  it('saves the unknown parts byte for byte when nothing changed', () => {
    const original = futureBytes();
    const data = fromBinary(pb.AppDataSchema, original);
    const saved = fromStored(store(data));
    expect(toBinary(pb.AppDataSchema, saved)).toEqual(original);
  });
});
