import { describe, expect, it } from 'vitest';
import { addDays, countdown, daysBetween, startOfWeek, weekdayIndex } from './dates';

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
