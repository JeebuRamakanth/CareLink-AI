/**
 * CareLink-AI — NotificationBell.
 *
 * Recipient-scoped notification center in the header. Reads only the
 * authenticated user's own notifications (RLS enforces this server-side),
 * shows an unread count, and lets the user mark rows read. When the backend is
 * not configured it renders nothing — no fake notifications are ever shown.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useOptionalAuth } from '../../contexts/AuthContext';
import { listNotifications, markNotificationRead } from '../../services/health-data';
import { isSupabaseConfigured } from '../../services/supabase/client';
import type { NotificationRow } from '../../services/health-data/types';
import { ROUTES } from '../../routes/routeConstants';
import { cn } from '../common/cn';

function BellIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function NotificationBell() {
  const auth = useOptionalAuth();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const configured = isSupabaseConfigured() && Boolean(auth.user);

  const load = useCallback(async () => {
    if (!configured) return;
    setLoading(true);
    try {
      const rows = await listNotifications({ limit: 20 });
      setItems(rows ?? []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [configured]);

  useEffect(() => {
    if (configured) void load();
  }, [configured, load]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!configured) return null;

  const unread = items.filter((n) => n.status === 'sent').length;

  const onMarkRead = async (id: string) => {
    const ok = await markNotificationRead(id);
    if (ok) {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, status: 'read' } : n)));
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => { void load(); setOpen((v) => !v); }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-ink-200 transition-all duration-200 hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[0.6rem] font-bold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-12 z-50 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-white/10 bg-slate-950/95 shadow-[0_24px_70px_rgba(0,0,0,0.4)] backdrop-blur-xl">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <p className="text-sm font-semibold text-white">Notifications</p>
            <Link to={ROUTES.profile} className="text-[0.72rem] font-medium text-brand-200 hover:text-white" onClick={() => setOpen(false)}>
              View all
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-ink-400">Loading…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-ink-400">No notifications yet.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {items.slice(0, 8).map((n) => (
                  <li key={n.id} className="flex items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cn('text-[0.82rem] font-medium', n.status === 'read' ? 'text-ink-400' : 'text-white')}>{n.title}</p>
                      {n.body ? <p className="mt-0.5 text-xs leading-5 text-ink-400">{n.body}</p> : null}
                      {n.scheduled_for ? <p className="mt-0.5 text-[0.68rem] text-ink-500">{new Date(n.scheduled_for).toLocaleString()}</p> : null}
                    </div>
                    {n.status === 'sent' ? (
                      <button
                        type="button"
                        onClick={() => void onMarkRead(n.id)}
                        className="shrink-0 rounded-full border border-white/10 px-2 py-0.5 text-[0.66rem] font-medium text-ink-300 transition hover:bg-white/10 hover:text-white"
                      >
                        Read
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}