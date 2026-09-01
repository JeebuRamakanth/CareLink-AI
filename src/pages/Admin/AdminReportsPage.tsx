/**
 * CareLink-AI — Admin Reports module.
 *
 * Aggregates the real operational counts (`carelink_admin_stats`) into a plain,
 * honest report table. No charts or trends are fabricated — only actual DB
 * counts at query time are shown. The same server-authorized RPC backs the
 * Overview module; this view presents it as a printable report..
 */

import { useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { adminGetStats } from '../../services/health-data/adminRepository';
import type { AdminStatRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminTable } from './AdminBits';

const METRIC_LABELS: Record<string, string> = {
  users: 'Total users',
  suspended_users: 'Suspended accounts',
  active_appointments: 'Active appointments',
  published_reviews: 'Published reviews',
  pending_reviews: 'Pending review moderation',
  providers_hospitals: 'Hospitals',
  providers_doctors: 'Doctors',
  providers_pharmacies: 'Pharmacies',
  providers_labs: 'Labs',
  notifications: 'Notification events',
};

export function AdminReportsPage() {
  const load = useCallback(() => adminGetStats(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminStatRow>({ load });

  const rows = (data ?? []).slice().sort((a, b) => a.metric.localeCompare(b.metric));

  return (
    <div>
      <AdminModuleHeader
        title="Reports"
        description="Aggregate operational counts from the database — real data only, no fabricated trends."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={retry} />
      ) : rows.length === 0 ? (
        <AdminNotConfigured onRetry={retry} />
      ) : (
        <Card>
          <AdminTable headers={['Metric', 'Count']}>
            {rows.map((row) => (
              <tr key={row.metric}>
                <td className="px-3.5 py-3 font-medium text-white">{METRIC_LABELS[row.metric] ?? row.metric.replace(/_/g, ' ')}</td>
                <td className="px-3.5 py-3 text-ink-200">{Number(row.value).toLocaleString()}</td>
              </tr>
            ))}
          </AdminTable>
          <p className="mt-3 text-xs text-ink-400">
            Report generated at <AdminDate value={new Date().toISOString()} />. Counts reflect the current database state.

          </p>
        </Card>
      )}
    </div>
  );
}