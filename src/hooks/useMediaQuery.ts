import { useEffect, useState } from 'react';

/** True while the CSS media query matches; updates on resize/orientation change. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => (typeof window !== 'undefined' ? window.matchMedia(query).matches : false));
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Tailwind's `lg` breakpoint — where the dashboard switches from the mobile top bar to the sidebar. */
export const useIsDesktop = () => useMediaQuery('(min-width: 1024px)');
