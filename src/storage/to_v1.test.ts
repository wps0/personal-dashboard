import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/v2/data_pb';
import {sampleData} from '../model/sample';
import {same} from '../sync/merge';
import {fromV1} from './from_v1';
import {parseAppData} from './parse_v1';
import {toV1} from './to_v1';

describe('toV1', () => {
  it('gives back the same data that went in', () => {
    const data = parseAppData(structuredClone(sampleData('2026-10-12')));
    data.items[0].source = {kind: 'usos', key: 'abc'};
    data.events[0].allDay = true;
    data.settings.defaultCalendarView = 'month';
    data.settings.dayCapacity['2026-10-13'] = {delta: -1};
    data.settings.usos = {
      source: {kind: 'google', calendarId: 'usos@group.calendar.google.com'},
      handled: ['a'],
    };
    data.settings.capacityRules[0].reserved = [
      [{start: '23:00', end: '07:00'}],
    ];
    expect(same(toV1(fromV1(data)), data)).toBe(true);
  });

  it('falls back to defaults for enum values it doesn’t know', () => {
    const data = create(pb.AppDataSchema, {
      items: [
        create(pb.ItemSchema, {
          id: 'i',
          kind: 9 as pb.ItemKind,
          status: 7 as pb.ItemStatus,
        }),
      ],
    });
    const out = toV1(data);
    expect(out.items[0]).toMatchObject({kind: 'task', status: 'todo'});
    expect(out.settings.defaultCalendarView).toBe('week');
    expect(out.settings.capacityRules[0].windows).toHaveLength(7);
  });
});
