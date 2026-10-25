/**
 * GlobalNavigation — the single hamburger entry point shared by EVERY header.
 *
 * The app has three header variants (the marketing GlobalLayout, the /ai chat
 * header and the /agent workspace header) because those pages need their own
 * controls (family profile, language, composer). They all share this component
 * so there is exactly ONE navigation surface and ONE drawer implementation —
 * a route can never end up with a second, divergent nav row.
 *
 * Renders the trigger button plus the NavDrawer; the drawer is a real dialog
 * (see NavDrawer) that dims the page, locks background scroll, traps focus and
 * restores it on close.
 */

import { useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../common/cn';
import { NavDrawer } from './NavDrawer';

interface GlobalNavigationProps {
  /** Extra classes for the trigger button (each header styles it to match). */
  className?: string;
  /** Accessible name for the trigger; defaults to the E2E-tested label. */
  label?: string;
}

export function GlobalNavigation({ className, label = 'Open navigation menu' }: GlobalNavigationProps) {
  const [open, setOpen] = useState(false);
  const drawerId = useId();

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={drawerId}
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-all duration-200 hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
          className,
        )}
      >
        <span className="flex flex-col gap-[5px]" aria-hidden>
          <span className="h-0.5 w-5 rounded-full bg-white" />
          <span className="h-0.5 w-5 rounded-full bg-white" />
          <span className="h-0.5 w-5 rounded-full bg-white" />
        </span>
      </button>

      {/* The drawer is portalled to <body> on purpose: every header uses
          `backdrop-blur`, and a backdrop-filtered ancestor becomes the
          containing block for `position: fixed` descendants — which would pin the
          drawer to the header instead of the viewport. The portal also keeps the
          drawer's links OUT of the header's DOM, so the header genuinely contains
          only the brand and this button. */}
      {typeof document !== 'undefined'
        ? createPortal(
            <div id={drawerId}>
              <NavDrawer open={open} onClose={() => setOpen(false)} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
