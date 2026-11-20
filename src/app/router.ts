import { useEffect, useState } from 'react';

const ROUTES = ['/', '/page', '/check', '/unfiled', '/browse', '/browse/:album', '/browse/:album/:page', '/item/:id', '/backup'];

export function matchRoute(path: string): { route: string; params: Record<string, string> } {
  const parts = path.split('/').filter(Boolean);
  for (const r of ROUTES) {
    const rp = r.split('/').filter(Boolean);
    if (rp.length !== parts.length) continue;
    const params: Record<string, string> = {};
    if (rp.every((seg, i) => (seg.startsWith(':') ? ((params[seg.slice(1)] = decodeURIComponent(parts[i])), true) : seg === parts[i])))
      return { route: r, params };
  }
  return { route: '/', params: {} };
}

const current = () => (typeof location === 'undefined' ? '/' : location.hash.replace(/^#/, '') || '/');

export function useRoute(): { path: string; route: string; params: Record<string, string>; go(path: string): void } {
  const [path, setPath] = useState(current);
  useEffect(() => {
    const on = () => setPath(current());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = (p: string) => { location.hash = p; setPath(p); };
  return { path, ...matchRoute(path), go };
}
