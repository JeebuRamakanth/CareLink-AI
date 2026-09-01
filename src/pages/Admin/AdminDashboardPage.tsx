/**
 * CareLink-AI — Admin Overview (real DB counts only).
 *
 * Renders the server-authorized `carelink_admin_stats()` rows; when the backend is
 * unavailable or an RPC fails, the view shows an honest loading/empty/error
 * state — never fabricated numbers..
 */

import { useCallback } from 'react';
import { Card } from '../../components/ui/Card';
import { adminGetStats } from '../../services/health-data/adminRepository';
import type { AdminStatRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured } from './AdminBits';

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

const METRIC_TONES: Record<string, string> = {
  users: 'from-brand-500/20 to-accent-500/10 text-brand-100',
  suspended_users: 'border-rose-400/20 bg-rose-500/15 text-rose-200',
  active_appointments: 'border-emerald-400/20 bg-emerald-500/15 text-emerald-100',
  published_reviews: 'border-emerald-400/20 bg-emerald-500/15 text-emerald-100',
  pending_reviews: 'border-amber-400/20 bg-amber-500/15 text-amber-100',
  providers_hospitals: 'border-white/10 bg-white/10 text-ink-200',
  providers_doctors: 'border-white/10 bg-white/10 text-ink-200',
  providers_pharmacies: 'border-white/10 bg-white/10 text-ink-200',
  providers_labs: 'border-white/10 bg-white/10 text-ink-200',
  notifications: 'border-white/10 bg-white/10 text-ink-200',
};

export function AdminDashboardPage() {
  const load = useCallback(() => adminGetStats(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminStatRow>({ load });

  return (
    <div>
      <AdminModuleHeader
        title="Operational dashboard"
        description="Real counts from the CareLink database, authorized for your session. No figures are invented."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={retry} />
      ) : !data || data.length === 0 ? (
        <AdminNotConfigured onRetry={retry} />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((row) => {
            const label = METRIC_LABELS[row.metric] ?? row.metric.replace(/_/g, ' ');
            const tone = METRIC_TONES[row.metric] ?? 'border-white/10 bg-white/10 text-ink-200';
            return (
              <Card key={row.metric} className="p-5">
                <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-400">{label}</p>
                <p className={['mt-3 text-3xl font-semibold text-white'].join(' ')}>{Number(row.value).toLocaleString()}</p>
                <span className={['mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]', tone].join(' ')}>
                  {row.metric.replace(/_/g, ' ')}
                </span>
              </Card>
            );
          })}
        </div>
      )}

      <p className="mt-6 max-w-2xl text-xs leading-6 text-ink-400">
        Counts reflect the current database state at query time. Pending provider verification,
        review moderation queues, and account status changes are handled from their dedicated modules.
      </p>
    </div>
  );
}