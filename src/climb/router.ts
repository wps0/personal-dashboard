/**
 * @fileoverview The climbing log's screens, in the address's hash
 * (#/progress), so the back button and reloads work.
 */

import {useSyncExternalStore} from 'react';

export type Route =
  | {name: 'today'}
  | {name: 'progress'}
  | {name: 'history'}
  | {name: 'settings'}
  | {name: 'place'; id: string};

export function parse(hash: string): Route {
  const [first, id] = hash.replace(/^#\/?/, '').split('/');
  switch (first) {
    case 'progress':
      return {name: 'progress'};
    case 'history':
      return {name: 'history'};
    case 'settings':
      return {name: 'settings'};
    case 'place':
      return id
        ? {name: 'place', id: decodeURIComponent(id)}
        : {name: 'settings'};
    default:
      return {name: 'today'};
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'today':
      return '#/';
    case 'place':
      return `#/place/${encodeURIComponent(route.id)}`;
    default:
      return `#/${route.name}`;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener('hashchange', onChange);
  return () => window.removeEventListener('hashchange', onChange);
}

/** The screen the address shows. */
export function useRoute(): Route {
  const hash = useSyncExternalStore(subscribe, () => location.hash);
  return parse(hash);
}
