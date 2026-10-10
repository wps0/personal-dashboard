import { useEffect, useState } from 'react';

export type Route =
  | { name: 'week'; week?: string }
  | { name: 'projects' }
  | { name: 'project'; id: string }
  | { name: 'settings' };

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  switch (parts[0]) {
    case 'projects':
      return { name: 'projects' };
    case 'project':
      return parts[1] ? { name: 'project', id: parts[1] } : { name: 'projects' };
    case 'settings':
      return { name: 'settings' };
    case 'week':
      return { name: 'week', week: parts[1] };
    default:
      return { name: 'week' };
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'week':
      return route.week ? `#/week/${route.week}` : '#/week';
    case 'project':
      return `#/project/${route.id}`;
    default:
      return `#/${route.name}`;
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
