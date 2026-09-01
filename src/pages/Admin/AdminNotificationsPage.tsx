/**
 * CareLink-AI — Admin Notifications module.
 *
 * Renders the server-authorized notification dispatch queue
 * (`carelink_admin_list_notifications`.. Read-only ops view; per-recipient
 * notification bodies are NOT exposed here (they are user-scoped via RLS) —
 * only dispatch metadata (kind, title, status, recipient id) is shown..
 */

import { useCallback, useMemo, useState } from 'react';
import { adminListNotifications } from '../../services/health-data/adminRepository';
import type { AdminNotificationRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill, AdminTable } from './AdminBits';

const STATUSES: string[] = ['scheduled', 'sent', 'read', 'failed'];

export function AdminNotificationsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const load = useCallback(() => adminListNotifications(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminNotificationRow>({ load });

  const rows = useMemo(() => {
    if (!data) return [];
    if (!statusFilter) return data;
    return data.filter((r) => r.status === statusFilter);
  }, [data, statusFilter]);

  return (
    <div>
      <AdminModuleHeader
        title="Notifications"
        description="Notification dispatch queue (recipient-scoped metadata only. No cross-user payload read is offered here."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-[0.18em] text-ink-400">Status</span>
            <button
              type="button"
              className={['rounded-full border px-3.5 py-1 text-sm font-medium transition-all duration-200', !statusFilter ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'].join(' ')}
              onClick={() => setStatusFilter('')}
            >
              All
            </button>
            {STATUSES.map((s) => (
              <button
                key={s}
                type="button"
                className={['rounded-full border px-3.5 py-1 text-sm font-medium transition-all duration-200', statusFilter === s ? 'border-brand-400/50 bg-brand-500/20 text-white' : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'].join(' ')}
                onClick={() => setStatusFilter(s)}
              >
                {s}
              </button>
            ))}
          </div>

          {loading ? (
            <AdminLoading />
          ) : error ? (
            <AdminError message={error} onRetry={retry} />
          ) : rows.length === 0 ? (
            <AdminEmpty message="No notification queue rows match the current filters." />
          ) : (
            <AdminTable headers={['Recipient', 'Kind', 'Title', 'Status', 'Created']}>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3.5 py-3 text-xs text-ink-400">{row.owner_id.slice(0, 8)}…</td>
                  <td className="px-3.5 py-3 text-ink-300">{row.kind}</td>
                  <td className="px-3.5 py-3 font-medium text-white">{row.title ?? '—'}</td>
                  <td className="px-3.5 py-3"><AdminStatusPill status={row.status} /></td>
                  <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
                </tr>
              ))}
            </AdminTable>
          )}
        </>
      )}
    </div>
  );
}