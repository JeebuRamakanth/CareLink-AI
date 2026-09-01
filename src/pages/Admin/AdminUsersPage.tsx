/**
 * CareLink-AI — Admin Users module..
 *
 * Renders the server-authorized `carelink_admin_list_users` rowsand exposes
 * server-guarded actions: account status changes (users.manage) and role
 * grants/revokes (roles.manage — super_admin only).. Every mutation rides
 * the caller's own session through a SECURITY DEFINER RPC that re-checks role
 * membership + suspension inside the database. The UI never invents a role
 * or status; when the action is not permitted for the caller, the RPC denies it
 * and the UI shows the server's error.(No optimistic "success" is rendered..)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { isSuperAdmin, hasPermission } from '../../services/auth/authorization';
import {
  adminGrantRole,
  adminListUsers,
  adminRevokeRole,
  adminSetAccountStatus,
} from '../../services/health-data/adminRepository';
import type { AdminResult, AdminUserRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill, AdminTable, AdminEmpty } from './AdminBits';

const STATUS_OPTIONS: { value: AdminUserRow['account_status'] | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'active', label: 'Active' },
  { value: 'suspended', label: 'Suspended' },
  { value: 'disabled', label: 'Disabled' },
];

export function AdminUsersPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const canManageUsers = hasPermission(user, 'users.manage');
  const canManageRoles = hasPermission(user, 'roles.manage');

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<AdminUserRow['account_status'] | ''>('');
  const [confirmUserId, setConfirmUserId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);

  const load = useCallback(() => adminListUsers(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminUserRow>({ load });

  const rows = useMemo(() => {
    if (!data) return [];
    let out = data;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) =>
        (r.email ?? '').toLowerCase().includes(q) ||
        (r.display_name ?? '').toLowerCase().includes(q)
      );
    }
    if (statusFilter) out = out.filter((r) => r.account_status === statusFilter);
    return out;
  }, [data, query, statusFilter]);

  useEffect(() => {
    if (!actionOk) return;
    const t = window.setTimeout(() => setActionOk(null), 3000);
    return () => window.clearTimeout(t);
  }, [actionOk]);

  const runAction = async (fn: () => Promise<AdminResult<null>>, successMessage: string, userId: string) => {
    setActionError(null);
    setActionOk(null);
    setBusyId(userId);
    const res = await fn();
    setBusyId(null);
    if (!res.error) {
      setActionOk(successMessage);
      retry();
    } else {
      setActionError(res.error ?? 'Action failed on the server.');
      retry();
    }
  };

  const setStatus = (userId: string, status: 'active' | 'suspended' | 'disabled', reason?: string) =>
    runAction(() => adminSetAccountStatus(userId, status, reason), `Account marked ${status}`, userId);

  const grantRole = (userId: string, roleCode: string) =>
    runAction(() => adminGrantRole(userId, roleCode), `Granted ${roleCode}`, userId);

  const revokeRole = (userId: string, roleCode: string) =>
    runAction(() => adminRevokeRole(userId, roleCode), `Revoked ${roleCode}`, userId);

  return (
    <div>
      <AdminModuleHeader
        title="Users"
        description="Server-authorized user directory. Status and role changes are audited in the database."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={retry} />
      ) : (
        <>
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="w-full sm:max-w-xs">
              <Input label="Search" placeholder="Name or email" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
            <label className="flex w-full flex-col gap-2 text-sm sm:max-w-52">
              <span className="text-sm font-medium text-ink-100">Status</span>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as AdminUserRow['account_status'] | '' )}
                className="w-full rounded-[var(--radius-lg)] border border-white/10 bg-slate-950/50 px-4 py-3 text-white outline-none focus:border-brand-400/70 focus:ring-2 focus:ring-brand-400/25"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          {actionError ? (
            <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">{actionError}</div>
          ) : null}
          {actionOk ? (
            <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">{actionOk}</div>
          ) : null}

          {rows.length === 0 ? (
            <AdminEmpty message="No users match the current filters." />
          ) : (
            <AdminTable headers={['User', 'Status', 'Roles', 'Last activity', 'Joined', 'Actions']}>
              {rows.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3.5 py-3">
                    <p className="font-medium text-white">{row.display_name ?? 'Unnamed user'}</p>
                    <p className="mt-0.5 text-xs text-ink-400">{row.email ?? '—'}</p>
                  </td>
                  <td className="px-3.5 py-3"><AdminStatusPill status={row.account_status} /></td>
                  <td className="px-3.5 py-3">
                    <div className="flex max-w-56 flex-wrap gap-1">
                      {row.roles.length ? row.roles.map((r) => (
                        <span key={r} className="rounded-full border border-white/10 bg-white/10 px-2 py-0.5 text-[0.68rem] text-ink-200">{r}</span>
                      )) : <span className="text-xs text-ink-500">—</span>}
                    </div>
                  </td>
                  <td className="px-3.5 py-3"><AdminDate value={row.last_login_at ?? null} /></td>
                  <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
                  <td className="px-3.5 py-3">
                    <div className="flex flex-col items-start gap-1.5">
                      {canManageUsers ? (
                        <div className="flex flex-wrap items-center gap-1">
                          {row.account_status !== 'active' ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              loading={busyId === row.id}
                              disabled={busyId === row.id || !canManageUsers}
                              onClick={() => setStatus(row.id, 'active')}
                            >
                              Activate
                            </Button>
                          ) : null}
                          {row.account_status !== 'suspended' ? (
                            <Button
                              size="sm"
                              variant="danger"
                              loading={busyId === row.id}
                              disabled={busyId === row.id || !canManageUsers}
                              onClick={() => {
                                setConfirmUserId(row.id);
                              }}
                            >
                              Suspend
                            </Button>
                          ) : null}
                          {row.account_status !== 'disabled' ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              loading={busyId === row.id}
                              disabled={busyId === row.id || !canManageUsers}
                              onClick={() => setStatus(row.id, 'disabled')}
                            >
                              Disable
                            </Button>
                          ) : null}
                        </div>
                      ) : null}

                      {canManageRoles ? (
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {!row.roles.includes('admin') ? (
                            <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => grantRole(row.id, 'admin')}>Grant admin</Button>
                          ) : (
                            <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => revokeRole(row.id, 'admin')}>Revoke admin</Button>
                          )}
                          {superAdmin ? (
                            !row.roles.includes('super_admin') ? (
                              <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => grantRole(row.id,'super_admin')}>Grant super admin</Button>
                            ) : (
                              <Button size="sm" variant="ghost" disabled={busyId === row.id} onClick={() => revokeRole(row.id,'super_admin')}>Revoke super admin</Button>
                            )
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}

          {confirmUserId ? (
            <Card className="mt-4 border-rose-400/25">
              <p className="text-sm text-white font-medium">Confirm suspension</p>
              <p className="mt-1 text-sm text-ink-300">
                Suspending disables the account's write access server-side until reactivated. This is audited.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="danger" onClick={() => { setStatus(confirmUserId,'suspended'); setConfirmUserId(null); }}>
                  Confirm suspension
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmUserId(null)}>Cancel</Button>
              </div>
            </Card>
          ) : null}
        </>
      )}
    </div>
  );
}