// Hash routes only, so GitHub Pages needs no rewrites.
import { useEffect, useState } from 'react';
import { isDate } from './domain/dates';

export type PlanView = 'calendar' | 'overview' | 'day' | 'map';
export type Route =
  | { page: 'plan'; view: PlanView; date?: string }
  | { page: 'locations' }
  | { page: 'location'; id: string }
  | { page: 'stays' }
  | { page: 'flights' }
  | { page: 'settings' }
  | { page: 'costs' }
  | { page: 'inbox' }
  | { page: 'today'; which?: 'tomorrow' };

export function parseRoute(hash: string): Route {
  const [head, arg] = hash.replace(/^#\/?/, '').split('/');
  switch (head) {
    case 'overview': case 'weeks': return { page: 'plan', view: 'overview' };
    case 'map': return { page: 'plan', view: 'map' };
    case 'day': case 'days': case 'itinerary': return { page: 'plan', view: 'day', date: isDate(arg) ? arg : undefined };
    case 'locations': case 'pools': return { page: 'locations' };
    case 'location': return arg ? { page: 'location', id: decodeURIComponent(arg) } : { page: 'locations' };
    case 'stays': return { page: 'stays' };
    case 'flights': case 'travel': return { page: 'flights' };
    case 'settings': return { page: 'settings' };
    case 'costs': case 'budget': return { page: 'costs' };
    case 'inbox': return { page: 'inbox' };
    case 'today': return arg === 'tomorrow' ? { page: 'today', which: 'tomorrow' } : { page: 'today' };
    default: return { page: 'plan', view: 'calendar' };
  }
}

export function routeHash(r: Route): string {
  switch (r.page) {
    case 'plan': return r.view === 'day' ? `#day${r.date ? '/' + r.date : ''}` : `#${r.view}`;
    case 'location': return `#location/${encodeURIComponent(r.id)}`;
    case 'today': return r.which ? '#today/tomorrow' : '#today';
    default: return `#${r.page}`;
  }
}

export function useRoute(): [Route, (r: Route, replace?: boolean) => void] {
  const [route, setRoute] = useState<Route>(() => parseRoute(location.hash));
  useEffect(() => {
    const h = () => setRoute(parseRoute(location.hash));
    window.addEventListener('hashchange', h);
    return () => window.removeEventListener('hashchange', h);
  }, []);
  const go = (r: Route, replace = false) => {
    const h = routeHash(r);
    if (h !== location.hash) {
      if (replace) history.replaceState(null, '', h); else history.pushState(null, '', h);
    }
    setRoute(r);
    window.scrollTo({ top: 0 });
  };
  return [route, go];
}
