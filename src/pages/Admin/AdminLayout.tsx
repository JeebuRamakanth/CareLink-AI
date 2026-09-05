/**
 * CareLink-AI — shared Admin shell.
 *
 * Server-side role gating is applied by the parent route (AdminRoute). This
 * shell renders the admin navigation (module tabs) and the module outlet. Only
 * modules with real backend RPC support are offered; nothing here invents
 * metrics or capabilities. The active-tab highlight is derived from the URL so
 * bookmarking/deep-linking stays correct.
 */

import { NavLink, Outlet } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { ROUTES } from '../../routes/routeConstants';
import { cn } from '../../components/common/cn';
import { isSuperAdmin, hasPermission } from '../../services/auth/authorization';

interface AdminModule {
  label: string;
  to: string;
  hint: string;
  /** Permission code checked client-side for display only — the backend gates too. */
  permission?: string;
  /** Super-admin only (Roles, Data Quality). Hidden from plain admins. */
  superOnly?: boolean;
}

const BASE = ROUTES.admin;

const modules: AdminModule[] = [
  { label: 'Overview', to: BASE, hint: 'Real DB counts', permission: 'dashboard.view' },
  { label: 'Users', to: `${BASE}/users`, hint: 'Directory, status, roles', permission: 'users.view' },
  { label: 'Providers', to: `${BASE}/providers`, hint: 'Registry + provenance', permission: 'providers.view' },
  { label: 'Reviews', to: `${BASE}/reviews`, hint: 'Moderation queue', permission: 'reviews.view' },
  { label: 'Appointments', to: `${BASE}/appointments`, hint: 'Ops directory', permission: 'appointments.view' },
  { label: 'Notifications', to: `${BASE}/notifications`, hint: 'Dispatch queue', permission: 'notifications.view' },
  { label: 'Security', to: `${BASE}/security`, hint: 'Activity + audit', permission: 'security.view' },
  { label: 'Reports', to: `${BASE}/reports`, hint: 'Aggregate reports', permission: 'reports.view' },
  { label: 'Roles & Permissions', to: `${BASE}/roles`, hint: 'Super admin only', superOnly: true, permission: 'roles.manage' },
  { label: 'Data Quality', to: `${BASE}/data-quality`, hint: 'Flags only', superOnly: true, permission: 'data_quality.view' },
];

export function AdminLayout({ children }: { children?: ReactNode }) {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const roleLabel = superAdmin ? 'Super Admin' : Array.isArray(user?.roles) && (user.roles as string[]).includes('admin') ? 'Admin' : 'Operator';

  // Client-side module gating is DISPLAY ONLY: routes/backend still deny
  // anything the server does not authorize for the session.
  const visibleModules = modules.filter((m) => {
    if (m.superOnly && !superAdmin) return false;
    if (!m.permission) return true;
    return hasPermission(user, m.permission);
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-200">CareLink Console</p>
          <h1 className="mt-2 text-3xl font-semibold text-white">Administration</h1>
          <p className="mt-1 text-sm text-ink-300">
            Signed in as {user?.email ?? 'operator'} · <span className="text-brand-200 font-medium">{roleLabel}</span>
          </p>
        </div>
        <div className="flex items-start gap-2 text-xs text-ink-400">
          <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-emerald-300" aria-hidden />
          <span>Server-authorized view — every read rides your Supabase session and RLS enforces what you may see.</span>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="lg:w-72 lg:shrink-0">
          <nav className="flex flex-col gap-1 rounded-2xl border border-white/10 bg-white/5 p-2 lg:sticky lg:top-28" aria-label="Admin modules">
            {visibleModules.map((m) => (
              <NavLink
                key={m.to}
                to={m.to}
                end={m.to === BASE}
                className={({ isActive }) => cn(
                  'group flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all duration-200',
                  isActive ? 'bg-white/10 text-white' : 'text-ink-300 hover:bg-white/5 hover:text-white'
                )}
              >
                <span>{m.label}</span>
                {m.superOnly ? (
                  <span className="text-[0.6rem] uppercase tracking-[0.18em] text-brand-300">Super Admin</span>
                ) : (
                  <span className="text-[0.6rem] uppercase tracking-[0.18em] text-ink-500">{m.hint}</span>
                )}
              </NavLink>
            ))}
          </nav>
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs leading-5 text-ink-400">
            <p className="font-semibold text-ink-200">Security note</p>
            <p className="mt-1">
              Role membership, suspensions, and audit events are enforced in the database. The UI only
              renders what the server-authorized RPCs return for your session. Hiding a menu item never
              grants access — the backend denies anything not permitted.
            </p>
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          {children ?? <Outlet />}
        </section>
      </div>
    </div>
  );
}