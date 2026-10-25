import {describe, expect, it} from 'vitest';
import {EVENT_COLORS, eventColorHex} from './event_colors';
import {EventColor} from './model/types';

describe('event colours', () => {
  it('has every colour but unset, once', () => {
    const values = Object.values(EventColor).filter(
      (v): v is EventColor => typeof v === 'number' && v !== 0,
    );
    expect(EVENT_COLORS.map(c => c.color).sort((a, b) => a - b)).toEqual(
      values.sort((a, b) => a - b),
    );
  });

  it('looks colours up by Google colorId', () => {
    expect(eventColorHex(11)).toBe('#d50000');
    expect(eventColorHex(EventColor.UNSPECIFIED)).toBeUndefined();
    expect(eventColorHex(Number('99'))).toBeUndefined();
  });
});
