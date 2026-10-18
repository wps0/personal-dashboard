import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/v2/data_pb';
import {same} from '../sync/merge';
import {fromV1} from './from_v1';
import {parseAppData} from './parse_v1';
import {toV1} from './to_v1';
import v1Sample from './testdata/v1_sample.json';

describe('toV1', () => {
  it('gives back the same data that went in', () => {
    const data = parseAppData(structuredClone(v1Sample));
    data.items[0].source = {source: {case: 'usosMeeting', value: 'abc'}};
    data.events[0].allDay = true;
    data.settings.defaultCalendarView = pb.CalendarView.MONTH;
    data.settings.dayCapacity['2026-10-13'] = {delta: -1};
    data.settings.usos = {
      source: {
        case: 'googleCalendarId',
        value: 'usos@group.calendar.google.com',
      },
      handled: ['a'],
    };
    data.settings.capacityRules[0].reserved = [
      {ranges: [{start: '23:00', end: '07:00'}]},
    ];
    expect(same(toV1(fromV1(data)), data)).toBe(true);
  });

  it('passes enum values through, including ones this version doesn’t know', () => {
    const data = create(pb.AppDataSchema, {
      items: [
        create(pb.ItemSchema, {
          id: 'i',
          kind: 9 as pb.ItemKind,
          status: pb.ItemStatus.DOING,
        }),
      ],
    });
    const out = toV1(data);
    expect(out.items[0]).toMatchObject({kind: 9, status: pb.ItemStatus.DOING});
    expect(out.settings.defaultCalendarView).toBe(pb.CalendarView.WEEK);
    expect(out.settings.capacityRules[0].windows).toHaveLength(7);
  });
});
