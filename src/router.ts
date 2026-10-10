import { useEffect, useState } from 'react';

export type Route =
  | { name: 'home' }
  | { name: 'week'; week?: string }
  | { name: 'calendar'; week?: string }
  | { name: 'projects'; id?: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'week':
    case 'calendar':
      return { name: parts[0], week: parts[1] };
    case 'projects':
    case 'project': // old links
      return { name: 'projects', id: parts[1] };
    case 'settings':
      return { name: 'settings' };
    default:
      return { name: 'home' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/';
    case 'week':
    case 'calendar':
      return route.week ? `#/${route.name}/${route.week}` : `#/${route.name}`;
    case 'projects':
      return route.id ? `#/projects/${route.id}` : '#/projects';
    case 'settings':
      return '#/settings';
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
