import { describe, expect, it } from 'vitest';
import { readableOn } from './format';

describe('readableOn', () => {
  it('uses white on dark colors and dark text on light ones', () => {
    expect(readableOn('#d50000')).toBe('#ffffff'); // Tomato
    expect(readableOn('#3f51b5')).toBe('#ffffff'); // Blueberry
    expect(readableOn('#0b8043')).toBe('#ffffff'); // Basil
    expect(readableOn('#f6bf26')).toBe('#0b1626'); // Banana
    expect(readableOn('#8ab4f8')).toBe('#0b1626');
    expect(readableOn('not-a-color')).toBe('var(--color-on-block)');
  });
});
