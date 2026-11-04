import {describe, expect, it} from 'vitest';
import {fmtDuration} from '../format';
import {parseDuration} from './duration';

describe('parseDuration', () => {
  it('reads lengths however they are typed, in hours', () => {
    const cases: [string, number][] = [
      ['1h 53m', 113 / 60],
      ['1h53m', 113 / 60],
      ['2h', 2],
      ['45m', 0.75],
      ['1:53', 113 / 60],
      ['0:05', 5 / 60],
      ['1.5', 1.5],
      ['1,5', 1.5],
      ['2', 2],
      ['90m', 1.5],
      ['1.5h', 1.5],
      ['0', 0],
    ];
    for (const [typed, hours] of cases)
      expect(parseDuration(typed), typed).toBeCloseTo(hours, 9);
  });

  it('keeps whole minutes', () => {
    expect(parseDuration('1.01')).toBe(61 / 60);
  });

  it('refuses what is not a length', () => {
    for (const typed of [
      '',
      'h',
      'm',
      'abc',
      '1:60',
      '-1',
      '1h 2h',
      '5x',
      '45 min',
    ])
      expect(parseDuration(typed), typed).toBeNull();
  });
});

describe('fmtDuration', () => {
  it('writes hours and minutes', () => {
    expect(fmtDuration(113 / 60)).toBe('1h 53m');
    expect(fmtDuration(1.5)).toBe('1h 30m');
    expect(fmtDuration(2)).toBe('2h');
    expect(fmtDuration(0.75)).toBe('45m');
    expect(fmtDuration(0)).toBe('0h');
    expect(fmtDuration(8.881)).toBe('8h 53m');
  });

  it('reads back what it writes', () => {
    for (const min of [5, 45, 60, 113, 480, 533])
      expect(parseDuration(fmtDuration(min / 60))).toBe(min / 60);
  });
});
