import { describe, expect, it } from 'vitest';
import { addDays, countdown, daysBetween, isoWeek, startOfWeek, weekdayIndex } from './dates';

describe('dates', () => {
  it('treats Monday as the first weekday', () => {
    expect(weekdayIndex('2026-10-05')).toBe(0); // Monday
    expect(weekdayIndex('2026-10-11')).toBe(6); // Sunday
    expect(startOfWeek('2026-10-11')).toBe('2026-10-05');
    expect(startOfWeek('2026-10-05')).toBe('2026-10-05');
  });

  it('adds days across month and DST boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30');
    expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
  });

  it('formats countdowns', () => {
    expect(countdown('2026-10-10', '2026-10-10')).toBe('today');
    expect(countdown('2026-10-11', '2026-10-10')).toBe('tomorrow');
    expect(countdown('2026-10-14', '2026-10-10')).toBe('in 4d');
    expect(countdown('2026-10-08', '2026-10-10')).toBe('2d ago');
  });
});

describe('isoWeek', () => {
  it('matches ISO-8601 week numbers', () => {
    expect(isoWeek('2026-10-10')).toBe(41);
    expect(isoWeek('2026-01-01')).toBe(1); // Thursday
    expect(isoWeek('2027-01-01')).toBe(53); // Friday belongs to 2026-W53
    expect(isoWeek('2024-12-30')).toBe(1); // Monday of 2025-W01
  });
});

describe('isoWeek across DST', () => {
  it('is stable in a DST time zone', () => {
    // Thursday 2026-04-02 is in W14; a naive ms-based division gives W13 in Europe/Warsaw.
    expect(isoWeek('2026-03-30')).toBe(14);
    expect(isoWeek('2026-11-02')).toBe(45);
  });
});
