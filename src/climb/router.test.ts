import {describe, expect, it} from 'vitest';
import {href, parse, type Route} from './router';

describe('routes', () => {
  it('round-trip through the address', () => {
    const routes: Route[] = [
      {name: 'today'},
      {name: 'progress'},
      {name: 'history'},
      {name: 'settings'},
    ];
    for (const r of routes) expect(parse(href(r))).toEqual(r);
  });

  it('show Today for an empty or unknown address', () => {
    expect(parse('')).toEqual({name: 'today'});
    expect(parse('#/nowhere')).toEqual({name: 'today'});
  });
});
