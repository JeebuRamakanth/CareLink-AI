/**
 * CareLink-AI — Admin Overview (real DB counts only).
 *
 * Renders the server-authorized `carelink_admin_stats()` rows; when the backend is
 * unavailable or an RPC fails, the view shows an honest loading/empty/error
 * state — never fabricated numbers..
 */

import { useCallback, useMemo } from 'react';
import { Card } from '../../components/ui/Card';
import { adminGetStats } from '../../services/health-data/adminRepository';
import type { AdminStatRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured } from './AdminBits';
import { useAuth } from '../../contexts/AuthContext';
import { isSuperAdmin } from '../../services/auth/authorization';
import { cn } from '../../components/common/cn';

const METRIC_LABELS: Record<string, string> = {
  users: 'Total users',
  active_users: 'Active users',
  suspended_users: 'Suspended accounts',
  providers_hospitals: 'Hospitals',
  providers_doctors: 'Doctors',
  providers_pharmacies: 'Pharmacies',
  providers_labs: 'Labs',
  total_appointments: 'Total appointments',
  active_appointments: 'Active appointments',
  pending_appointments: 'Pending appointments',
  completed_appointments: 'Completed appointments',
  cancelled_appointments: 'Cancelled appointments',
  total_reviews: 'Total reviews',
  published_reviews: 'Published reviews',
  pending_reviews: 'Pending review moderation',
  blood_donors: 'Active blood donors',
  ai_conversations: 'AI conversations',
  ai_messages: 'AI messages',
  ai_tool_actions: 'AI tool actions',
  verification_verified: 'Providers verified',
  verification_pending: 'Providers pending',
  verification_rejected: 'Providers rejected',
  notifications: 'Notification events',
  notifications_sent: 'Notifications sent',
  notifications_pending: 'Notifications queued',
};

const METRIC_TONES: Record<string, string> = {
  users: 'border-brand-400/25 bg-brand-500/12 text-brand-100',
  active_users: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
  suspended_users: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
  providers_hospitals: 'border-white/10 bg-white/10 text-ink-200',
  providers_doctors: 'border-white/10 bg-white/10 text-ink-200',
  providers_pharmacies: 'border-white/10 bg-white/10 text-ink-200',
  providers_labs: 'border-white/10 bg-white/10 text-ink-200',
  total_appointments: 'border-white/10 bg-white/10 text-ink-200',
  active_appointments: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
  pending_appointments: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
  completed_appointments: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
  cancelled_appointments: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
  total_reviews: 'border-white/10 bg-white/10 text-ink-200',
  published_reviews: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
  pending_reviews: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
  blood_donors: 'border-rose-400/25 bg-rose-500/15 text-rose-100',
  ai_conversations: 'border-violet-400/25 bg-violet-500/12 text-violet-100',
  ai_messages: 'border-violet-400/25 bg-violet-500/12 text-violet-100',
  ai_tool_actions: 'border-violet-400/25 bg-violet-500/12 text-violet-100',
  verification_verified: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
  verification_pending: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
  verification_rejected: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
  notifications: 'border-white/10 bg-white/10 text-ink-200',
  notifications_sent: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-100',
  notifications_pending: 'border-amber-400/25 bg-amber-500/12 text-amber-100',
};

const GROUPS: { label: string; metrics: string[] }[] = [
  { label: 'Patients & accounts', metrics: ['users', 'active_users', 'suspended_users'] },
  { label: 'Providers', metrics: ['providers_hospitals', 'providers_doctors', 'providers_pharmacies', 'providers_labs'] },
  { label: 'Appointments', metrics: ['total_appointments', 'active_appointments', 'pending_appointments', 'completed_appointments', 'cancelled_appointments'] },
  { label: 'Reviews', metrics: ['total_reviews', 'published_reviews', 'pending_reviews'] },
  { label: 'Blood donation', metrics: ['blood_donors'] },
  { label: 'CareLink AI', metrics: ['ai_conversations', 'ai_messages', 'ai_tool_actions'] },
  { label: 'Provider verification', metrics: ['verification_verified', 'verification_pending', 'verification_rejected'] },
  { label: 'Notifications', metrics: ['notifications', 'notifications_sent', 'notifications_pending'] },
];

export function AdminDashboardPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const load = useCallback(() => adminGetStats(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminStatRow>({ load });

  const byMetric = useMemo(() => {
    const m = new Map<string, number>();
    (data ?? []).forEach((r) => m.set(r.metric, Number(r.value) || 0));
    return m;
  }, [data]);

  const valueOf = (metric: string): number => byMetric.get(metric) ?? 0;

  return (
    <div>
      <AdminModuleHeader
        title={superAdmin ? 'Super Admin command center' : 'Operational dashboard'}
        description={
          superAdmin
            ? 'Real database-backed metrics across patients, providers, appointments, reviews, donors, AI and verification — no fabricated figures.'
            : 'Real counts from the CareLink database, authorized for your session. No figures are invented.'
        }
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
        <div className="space-y-8">
          {/* Hero band — only for Super Admin */}
          {superAdmin ? (
            <div className="overflow-hidden rounded-[1.75rem] border border-white/10 bg-gradient-to-br from-brand-500/15 via-slate-950/60 to-accent-500/10 p-6 sm:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">CareLink Command Center</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">Healthcare operations at a glance</h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-300">
                    Every number below is computed live from the database at query time. Pending queues,
                    verification states, and account statuses reflect real rows — nothing is invented.
                  </p>
                </div>
                <div className="grid shrink-0 grid-cols-2 gap-3 sm:grid-cols-4">
                  {[
                    { label: 'Active users', value: valueOf('active_users') },
                    { label: 'Active appointments', value: valueOf('active_appointments') },
                    { label: 'Published reviews', value: valueOf('published_reviews') },
                    { label: 'AI conversations', value: valueOf('ai_conversations') },
                  ].map((s) => (
                    <div key={s.label} className="rounded-2xl border border-white/10 bg-slate-950/60 px-4 py-3 text-center">
                      <p className="text-2xl font-semibold text-white">{s.value.toLocaleString()}</p>
                      <p className="mt-1 text-[0.66rem] uppercase tracking-[0.16em] text-ink-400">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {GROUPS.map((group) => {
            const present = group.metrics.filter((m) => byMetric.has(m));
            if (present.length === 0) return null;
            return (
              <section key={group.label}>
                <h3 className="mb-3 text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-400">{group.label}</h3>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {present.map((metric) => {
                    const label = METRIC_LABELS[metric] ?? metric.replace(/_/g, ' ');
                    const tone = METRIC_TONES[metric] ?? 'border-white/10 bg-white/10 text-ink-200';
                    return (
                      <Card key={metric} className="p-5">
                        <p className="text-xs font-medium uppercase tracking-[0.2em] text-ink-400">{label}</p>
                        <p className="mt-3 text-3xl font-semibold text-white">{valueOf(metric).toLocaleString()}</p>
                        <span className={cn('mt-2 inline-flex rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em]', tone)}>
                          {metric.replace(/_/g, ' ')}
                        </span>
                      </Card>
                    );
                  })}
                </div>
              </section>
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