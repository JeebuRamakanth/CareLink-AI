import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

interface PageTransitionProps {
  children: ReactNode;
  keyName?: string;
}

/** Scroll to a hash target after the route has painted. */
function scrollToHash(hash: string) {
  if (!hash) return;
  const id = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!id) return;
  requestAnimationFrame(() => {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
}

export function PageTransition({ children, keyName = 'page' }: PageTransitionProps) {
  const { pathname, hash } = useLocation();

  // Deep-link hash navigation (e.g. /about#mission, /help#privacy): when the
  // route changes while a hash is present, scroll to the anchored section once
  // the new page has painted. Same-route anchor links re-scroll on hash change.

  useEffect(() => {
    if (!hash) {
      window.scrollTo({ top: 0 });
      return;
    }
    scrollToHash(hash);
    // The double frame lets the page transition's fade-in paint first so the
    // anchor position is measured after layout.

    const rerun = requestAnimationFrame(() => scrollToHash(hash));
    return () => cancelAnimationFrame(rerun);
  }, [pathname, hash]);

  return (
    <div key={keyName} className="min-h-screen animate-fade-in">
      {children}
    </div>
  );
}
