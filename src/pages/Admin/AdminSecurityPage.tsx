/**
 * CareLink-AI — Admin Security module.
 *
 * Two read-only feeds, both server-authorized:
 *  - Security activity (login/logout/suspension/lifecycle events —
 *    `carelink_admin_list_security_activity`..
 *  - Audit log (privileged operations — `carelink_admin_list_audit`)..
 * Neither feed exposes credentials or medical content; payloads stay minimal..
 */

import { useCallback, useState } from 'react';
import { adminListAudit, adminListSecurityActivity } from '../../services/health-data/adminRepository';
import type { AdminActivityRow, AdminAuditRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill, AdminTable, AdminMuted } from './AdminBits';

const EVENT_TONE: Record<string, string> = {
  login_success: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100',
  logout_success: 'border-white/10 bg-white/10 text-ink-200',
  account_suspended: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
  account_reactivated: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-100',
  account_disabled: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
  role_granted: 'border-amber-400/25 bg-amber-500/15 text-amber-100',
};

export function AdminSecurityPage() {
  const [tab, setTab] = useState<'activity' | 'audit'>('activity');
  const loadActivity = useCallback(() => adminListSecurityActivity(), []);
  const loadAudit = useCallback(() => adminListAudit(), []);
  const activity = useAdminList<AdminActivityRow>({ load: loadActivity, deps: [tab] });
  const audit = useAdminList<AdminAuditRow>({ load: loadAudit, deps: [tab] });

  const active = tab === 'activity' ? activity : audit;

  return (
    <div>
      <AdminModuleHeader
        title="Security"
        description="Server-authorized security activity and audit trail. No credentials or medical content are ever logged."
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={['rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200', tab === 'activity' ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'].join(' ')}
          onClick={() => setTab('activity')}
        >
          Activity feed
        </button>
        <button
          type="button"
          className={['rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200', tab === 'audit' ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'].join(' ')}
          onClick={() => setTab('audit')}
        >
          Audit log
        </button>
      </div>

      {!active.readiness ? (
        <AdminNotConfigured onRetry={active.retry} />
      ) : active.loading ? (
        <AdminLoading />
      ) : active.error ? (
        <AdminError message={active.error} onRetry={active.retry} />
      ) : tab === 'activity' ? (
        activity.data && activity.data.length > 0 ? (
          <AdminTable headers={['Event', 'User', 'Metadata', 'Time']}>
            {activity.data.map((row) => (
              <tr key={row.id}>
                <td className="px-3.5 py-3">
                  <span className={['inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]', EVENT_TONE[row.event] ?? 'border-white/10 bg-white/10 text-ink-200'].join(' ')}>
                    {row.event}
                  </span>
                </td>
                <td className="px-3.5 py-3 text-xs text-ink-400">{row.user_id.slice(0, 8)}…</td>
                <td className="px-3.5 py-3 text-xs text-ink-400">
                  {row.metadata && typeof row.metadata === 'object' ? (
                    <span className="max-w-56 truncate inline-block align-middle">{JSON.stringify(row.metadata)}</span>
                  ) : <AdminMuted>—</AdminMuted>}
                </td>
                <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
              </tr>
            ))}
          </AdminTable>
        ) : (
          <AdminEmpty message="No security activity events are tracked yet." />
        )
      ) : audit.data && audit.data.length > 0 ? (
        <AdminTable headers={['Action', 'Actor', 'Target', 'Message', 'Time']}>
          {audit.data.map((row) => (
            <tr key={row.id}>
              <td className="px-3.5 py-3"><AdminStatusPill status={row.action} /></td>
              <td className="px-3.5 py-3 text-xs text-ink-400">{row.actor_id ? row.actor_id.slice(0, 8) + '…' : <AdminMuted>—</AdminMuted>}</td>
              <td className="px-3.5 py-3 text-xs text-ink-400">
                {row.target_table ? `${row.target_table}${row.target_id ? ` · ${row.target_id.slice(0, 8)}…` : ''}` : <AdminMuted>—</AdminMuted>}
              </td>
              <td className="px-3.5 py-3 text-xs text-ink-300">{row.safe_message ?? <AdminMuted>—</AdminMuted>}</td>
              <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
            </tr>
          ))}
        </AdminTable>
      ) : (
        <AdminEmpty message="No audit events are tracked yet." />
      )}
    </div>
  );
}