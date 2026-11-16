import { useCallback, useEffect, useState } from 'react';
import { PAID_PLANS, type PaidPlan } from '@shared/billing';

export type SiteTab = 'qa' | 'inbox' | 'unanswered' | 'appearance' | 'embed' | 'orders' | 'verify';

export type Route =
  | { view: 'overview' }
  | { view: 'docs' }
  | { view: 'help' }
  | { view: 'billing'; plan?: PaidPlan }
  | { view: 'admin' }
  | { view: 'site'; botId: string; tab?: SiteTab };

const TABS: SiteTab[] = ['qa', 'inbox', 'unanswered', 'appearance', 'embed', 'orders', 'verify'];

function parse(hash: string): Route {
  const [first, id, tab] = hash.replace(/^#\/?/, '').split('/');
  if (first === 'docs') return { view: 'docs' };
  if (first === 'help') return { view: 'help' };
  if (first === 'billing') return { view: 'billing', plan: PAID_PLANS.includes(id as PaidPlan) ? (id as PaidPlan) : undefined };
  if (first === 'admin') return { view: 'admin' };
  if (first === 'sites' && id) {
    return { view: 'site', botId: id, tab: TABS.includes(tab as SiteTab) ? (tab as SiteTab) : undefined };
  }
  return { view: 'overview' };
}

export function routeToHash(r: Route): string {
  if (r.view === 'site') return `#/sites/${r.botId}${r.tab ? `/${r.tab}` : ''}`;
  if (r.view === 'billing') return `#/billing${r.plan ? `/${r.plan}` : ''}`;
  return `#/${r.view}`;
}

/** Hash-based routing so refresh, deep links and the back button all work. */
export function useRoute() {
  const [route, setRoute] = useState<Route>(() => parse(window.location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const navigate = useCallback((r: Route, opts?: { replace?: boolean }) => {
    const hash = routeToHash(r);
    if (opts?.replace) window.history.replaceState(null, '', hash);
    else if (window.location.hash !== hash) window.history.pushState(null, '', hash);
    setRoute(r);
  }, []);

  return { route, navigate };
}
