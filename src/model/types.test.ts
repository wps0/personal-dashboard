import {create} from '@bufbuild/protobuf';
import {describe, expect, it} from 'vitest';
import * as pb from '../gen/dashboard/data_pb';
import {AREA_COLORS, isHexColor, withDefaults} from './types';

describe('isHexColor', () => {
  it('accepts only #rrggbb', () => {
    expect(isHexColor('#60a5fa')).toBe(true);
    expect(isHexColor('#60A5FA')).toBe(true);
    for (const c of [
      'url(https://evil.example/t)',
      '#fff',
      '#60a5fa url(https://evil.example/t)',
      'red',
      '',
      undefined,
    ])
      expect(isHexColor(c)).toBe(false);
  });
});

describe('withDefaults', () => {
  it('replaces area colors that are not #rrggbb with palette colors', () => {
    const data = withDefaults(
      create(pb.AppDataSchema, {
        areas: [
          {id: 'a', name: 'A', color: '#123ABC'},
          {id: 'b', name: 'B', color: 'url(https://evil.example/t)'},
          {id: 'c', name: 'C', color: ''},
        ],
      }),
    );
    expect(data.areas.map(a => a.color)).toEqual([
      '#123ABC',
      AREA_COLORS[1],
      AREA_COLORS[2],
    ]);
    expect(data.areas[1]).toMatchObject({id: 'b', name: 'B'});
  });
});
