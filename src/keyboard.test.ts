import {describe, expect, it} from 'vitest';
import {isTyping} from './keyboard';

/** Just what isTyping reads; tests run without a DOM. */
function el(tagName: string, type = '', isContentEditable = false): Element {
  return {tagName, type, isContentEditable} as unknown as Element;
}

describe('isTyping', () => {
  it('is true in text fields', () => {
    for (const type of ['text', 'number', 'date', 'password', 'search', ''])
      expect(isTyping(el('INPUT', type))).toBe(true);
    expect(isTyping(el('TEXTAREA'))).toBe(true);
    expect(isTyping(el('SELECT'))).toBe(true);
    expect(isTyping(el('DIV', '', true))).toBe(true);
  });

  it('is false on inputs that take no typing', () => {
    for (const type of [
      'checkbox',
      'radio',
      'button',
      'submit',
      'reset',
      'range',
      'color',
      'file',
    ])
      expect(isTyping(el('INPUT', type))).toBe(false);
  });

  it('is false elsewhere', () => {
    expect(isTyping(null)).toBe(false);
    expect(isTyping(el('BUTTON'))).toBe(false);
    expect(isTyping(el('DIV'))).toBe(false);
  });
});
