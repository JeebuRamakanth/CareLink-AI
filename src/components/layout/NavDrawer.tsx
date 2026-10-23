/**
 * NavDrawer — the global hamburger navigation overlay.
 *
 * A real navigation dialog (NOT an ARIA `menu`; these are ordinary links):
 *   - renders above the page with a dimmed backdrop that blocks the page,
 *   - locks background scrolling while open and restores it on close,
 *   - closes on the close button, backdrop click, Escape, or a link selection,
 *   - moves focus into the panel on open and returns it to the trigger on close,
 *   - traps Tab focus inside the panel while open,
 *   - keeps its own content scrollable when it exceeds the viewport height.
 *
 * The panel is rendered inside the header's stacking context (`z-[60]`, above the
 * sticky header at `z-50`) so it can never appear underneath it.
 */

import { useEffect, useRef } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';
import { cn } from '../common/cn';
import { ROUTES } from '../../routes/routeConstants';
import { useAuth } from '../../contexts/AuthContext';
import { IconArrowRight, IconClose, IconSparkle } from '../agent/AgentIcons';
import { isNavItemActive, visibleNavGroups } from './navigationData';

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
}

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const auth = useAuth();

  const groups = visibleNavGroups({ isAuthenticated: Boolean(auth.user), isAdmin: Boolean(auth.isAdmin) });

  // Body scroll lock + Escape handling + initial focus, all tied to `open`.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      // Focus trap: keep keyboard navigation inside the dialog while it is open.
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    const focusTimer = window.setTimeout(() => {
      const firstFocusable = panelRef.current?.querySelector<HTMLElement>(FOCUSABLE);
      firstFocusable?.focus();
    }, 40);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.clearTimeout(focusTimer);
    };
  }, [open, onClose]);

  // Restore focus to the element that opened the drawer once it closes.
  const triggerRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open) {
      triggerRef.current = document.activeElement as HTMLElement | null;
      return;
    }
    triggerRef.current?.focus?.();
    triggerRef.current = null;
  }, [open]);

  return (
    <div
      className={cn('fixed inset-0 z-[60]', open ? '' : 'pointer-events-none')}
      aria-hidden={open ? undefined : true}
    >
      {/* Backdrop — dims and blocks the page behind the panel. */}
      <motion.div
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={{ duration: 0.2 }}
        onClick={onClose}
        className={cn('absolute inset-0 bg-slate-950/75 backdrop-blur-sm', open ? '' : 'invisible')}
        aria-hidden
      />

      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Site navigation"
        initial={false}
        animate={{ x: open ? 0 : '-100%' }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        className={cn(
          'absolute inset-y-0 left-0 flex w-full max-w-[22rem] flex-col border-r border-white/10 bg-slate-950/95 shadow-[0_24px_80px_rgba(2,6,23,0.7)] backdrop-blur-2xl',
          open ? '' : 'invisible',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-4">
          <Link
            to={ROUTES.home}
            onClick={onClose}
            className="flex min-w-0 items-center gap-3 rounded-full py-1 pr-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
            aria-label="CareLink.AI home"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-sm font-semibold text-white">
              C
            </span>
            <span className="min-w-0 leading-none">
              <span className="block truncate text-[0.95rem] font-semibold uppercase tracking-[0.24em] text-white">CareLink.AI</span>
              <span className="mt-1 block text-[0.7rem] font-medium text-brand-200">AI for care</span>
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close navigation menu"
            className="flex size-10 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/5 text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
          >
            <IconClose width={18} height={18} aria-hidden />
          </button>
        </div>

        <div className="agent-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          <Link
            to={ROUTES.ai}
            onClick={onClose}
            className="flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
          >
            <IconSparkle width={16} height={16} aria-hidden />
            Ask CareLink AI
          </Link>

          <nav aria-label="All destinations" className="mt-5 space-y-5">
            {groups.map((group) => (
              <div key={group.heading} className="space-y-1.5">
                <h2 className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-ink-400">
                  {group.heading}
                </h2>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={`${group.heading}-${item.label}`}>
                      <NavLink
                        to={item.to}
                        onClick={onClose}
                        aria-current={undefined}
                        className={({ isActive }) => {
                          const active = isActive || isNavItemActive(item.to, window.location.pathname, window.location.search);
                          return cn(
                            'group flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
                            active
                              ? 'border-brand-400/40 bg-brand-500/15 text-white'
                              : 'border-white/10 bg-white/[0.04] text-ink-200 hover:border-white/20 hover:bg-white/10 hover:text-white',
                          );
                        }}
                      >
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{item.label}</span>
                          {item.hint ? <span className="mt-0.5 block truncate text-[0.72rem] text-ink-400">{item.hint}</span> : null}
                        </span>
                        <IconArrowRight width={14} height={14} className="shrink-0 text-brand-300 opacity-0 transition group-hover:opacity-100" aria-hidden />
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>

          {auth.user ? (
            <div className="mt-6 space-y-2 border-t border-white/10 pt-4">
              <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-[0.26em] text-ink-400">Signed in</p>
              <p className="truncate px-1 text-sm text-ink-200">{auth.user.email}</p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  void auth.signOut();
                }}
                className="w-full rounded-xl border border-white/12 bg-white/5 px-3 py-2.5 text-sm font-semibold text-ink-200 transition hover:border-rose-400/30 hover:bg-rose-500/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
              >
                Sign out
              </button>
            </div>
          ) : null}
        </div>
      </motion.div>
    </div>
  );
}
