import {describe, expect, it} from 'vitest';
import {sameProps} from './sameProps';

describe('sameProps', () => {
  const a = {id: 'a'};
  const b = {id: 'b'};

  it('compares plain props by identity', () => {
    expect(sameProps({n: 1, o: a}, {n: 1, o: a})).toBe(true);
    expect(sameProps({n: 1, o: a}, {n: 2, o: a})).toBe(false);
    expect(sameProps({o: a}, {o: {id: 'a'}})).toBe(false);
  });

  it('treats arrays with the same items as equal', () => {
    expect(sameProps({list: [a, b]}, {list: [a, b]})).toBe(true);
    expect(sameProps({list: []}, {list: []})).toBe(true);
  });

  it('notices changed, added, removed or reordered items', () => {
    expect(sameProps({list: [a, b]}, {list: [a, {id: 'b'}]})).toBe(false);
    expect(sameProps({list: [a]}, {list: [a, b]})).toBe(false);
    expect(sameProps({list: [a, b]}, {list: [a]})).toBe(false);
    expect(sameProps({list: [a, b]}, {list: [b, a]})).toBe(false);
  });

  it('notices added or removed props', () => {
    expect(sameProps<{x?: number; y?: number}>({x: 1}, {x: 1, y: 2})).toBe(
      false,
    );
    expect(sameProps<{x?: number; y?: number}>({x: 1, y: 2}, {x: 1})).toBe(
      false,
    );
  });
});
