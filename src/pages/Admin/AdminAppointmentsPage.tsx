/**
 * CareLink-AI — Admin Appointments module.
 *
 * Renders the server-authorized operational appointment directory
 * (`carelink_admin_list_appointments`). Read-only ops view: no cross-user
 * mutation is offered here — booking/cancel/reschedule flows stay user-scoped
 * through the RLS-protected appointment repository. Status values reflect the
 * DB; nothing is invented..
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../services/auth/authorization';
import { adminListAppointments, adminSetAppointmentStatus } from '../../services/health-data/adminRepository';
import type { AdminAppointmentRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill, AdminTable } from './AdminBits';

const STATUSES: string[] = ['upcoming', 'confirmed', 'completed', 'cancelled', 'rescheduled', 'no_show'];

export function AdminAppointmentsPage() {
  const { user } = useAuth();
  const canManage = hasPermission(user, 'appointments.manage');

  const [statusFilter, setStatusFilter] = useState<string>('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const load = useCallback(() => adminListAppointments(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminAppointmentRow>({ load });

  const rows = useMemo(() => {
    if (!data) return [];
    if (!statusFilter) return data;
    return data.filter((r) => r.status === statusFilter);
  }, [data, statusFilter]);

  const setStatus = async (row: AdminAppointmentRow, newStatus: 'completed' | 'cancelled') => {
    if (busyId) return;
    setMessage(null);
    setActionError(null);
    setBusyId(row.id);
    const res = await adminSetAppointmentStatus(row.id, newStatus);
    setBusyId(null);
    if (!res.error) {
      setMessage(`Appointment marked ${newStatus}. The recipient is notified.`);
      retry();
    } else {
      setActionError(res.error ?? 'Appointment update failed on the server.');
      retry();
    }
  };

  return (
    <div>
      <AdminModuleHeader
        title="Appointments"
        description="Operational appointment directory (read-only ops view). Status transitions remain user-scoped and RLS-protected."
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

          {message ? (
            <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">{message}</div>
          ) : null}
          {actionError ? (
            <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">{actionError}</div>
          ) : null}

          {loading ? (
            <AdminLoading />
          ) : error ? (
            <AdminError message={error} onRetry={retry} />
          ) : rows.length === 0 ? (
            <AdminEmpty message="No appointments match the current filters." />
          ) : (
            <AdminTable headers={['Patient owner', 'Doctor', 'Hospital', 'Date', 'Time', 'Status', 'Created', 'Actions']}>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3.5 py-3 text-xs text-ink-400">{row.owner_id.slice(0, 8)}…</td>
                  <td className="px-3.5 py-3 font-medium text-white">{row.doctor_name ?? '—'}</td>
                  <td className="px-3.5 py-3 text-ink-300">{row.hospital_name ?? '—'}</td>
                  <td className="px-3.5 py-3 text-ink-300">{row.scheduled_date ?? '—'}</td>
                  <td className="px-3.5 py-3 text-ink-300">{row.scheduled_time ?? '—'}</td>
                  <td className="px-3.5 py-3"><AdminStatusPill status={row.status} /></td>
                  <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
                  <td className="px-3.5 py-3">
                    {canManage ? (
                      <div className="flex flex-wrap items-center gap-1">
                        {row.status !== 'completed' && row.status !== 'cancelled' ? (
                          <>
                            <Button size="sm" variant="secondary" loading={busyId === row.id} disabled={busyId === row.id} onClick={() => void setStatus(row, 'completed')}>
                              Complete
                            </Button>
                            <Button size="sm" variant="ghost" loading={busyId === row.id} disabled={busyId === row.id} onClick={() => void setStatus(row, 'cancelled')}>
                              Cancel
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs text-ink-500">—</span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-ink-500">View only</span>
                    )}
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
        </>
      )}
    </div>
  );
}