import {useEffect, useState} from 'react';

import {CAL_VIEWS, type CalView} from './model/types';
import {unreachable} from './unreachable';
export type {CalView};

export type Route =
  | {name: 'home'; date?: string}
  | {name: 'week'; week?: string}
  | {name: 'calendar'; view?: CalView; date?: string}
  | {name: 'projects'; id?: string}
  | {name: 'work'; week?: string}
  | {name: 'settings'};

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'week':
      return {name: 'week', week: parts[1]};
    case 'calendar': {
      const view = (CAL_VIEWS as readonly string[]).includes(parts[1])
        ? (parts[1] as CalView)
        : undefined;
      return {name: 'calendar', view, date: view ? parts[2] : parts[1]};
    }
    case 'projects':
    case 'project': // old links
      return {name: 'projects', id: parts[1]};
    case 'work':
      return {name: 'work', week: parts[1]};
    case 'settings':
      return {name: 'settings'};
    case 'home':
      return {name: 'home', date: parts[1]};
    default:
      return {name: 'home'};
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return route.date ? `#/home/${route.date}` : '#/';
    case 'week':
      return route.week ? `#/week/${route.week}` : '#/week';
    case 'calendar':
      return route.view || route.date
        ? `#/calendar/${route.view ?? 'week'}${route.date ? `/${route.date}` : ''}`
        : '#/calendar';
    case 'projects':
      return route.id ? `#/projects/${route.id}` : '#/projects';
    case 'work':
      return route.week ? `#/work/${route.week}` : '#/work';
    case 'settings':
      return '#/settings';
    default:
      return unreachable(route);
  }
}

export function navigate(route: Route) {
  window.location.hash = href(route);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
