/**
 * CareLink-AI — Admin Roles & Permissions (Super Admin).
 *
 * Super-admin-only module. Renders the role/permission matrix from the real
 * database (roles, permissions, role_permissions) and exposes guarded role
 * assignment through the existing `carelink_admin_grant_user_role` /
 * `carelink_admin_revoke_user_role` RPCs (roles.manage gate, audited).
 *
 * The matrix is read-only for display; role membership changes happen per-user
 * from the Users module (server-gated). This view never mutates permissions.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, isSuperAdmin } from '../../services/auth/authorization';
import { adminListUsers, adminGrantRole, adminRevokeRole } from '../../services/health-data/adminRepository';
import type { AdminResult, AdminUserRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill } from './AdminBits';

const ROLE_CODES = ['patient', 'doctor', 'hospital_admin', 'pharmacy_admin', 'lab_admin', 'admin', 'super_admin'] as const;

const ROLE_LABELS: Record<string, string> = {
  patient: 'Patient',
  doctor: 'Doctor',
  hospital_admin: 'Hospital Admin',
  pharmacy_admin: 'Pharmacy Admin',
  lab_admin: 'Lab Admin',
  admin: 'Admin',
  super_admin: 'Super Admin',
};

export function AdminRolesPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const canManageRoles = hasPermission(user, 'roles.manage');

  const load = useCallback(() => adminListUsers(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminUserRow>({ load });

  const [busy, setBusy] = useState<{ id: string; role: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;
    const t = window.setTimeout(() => setMessage(null), 3000);
    return () => window.clearTimeout(t);
  }, [message]);

  const toggleRole = async (row: AdminUserRow, role: string) => {
    if (busy || !canManageRoles) return;
    setActionError(null);
    setMessage(null);
    setBusy({ id: row.id, role });
    const has = row.roles.includes(role);
    const res: AdminResult<null> = has
      ? await adminRevokeRole(row.id, role)
      : await adminGrantRole(row.id, role);
    setBusy(null);
    if (!res.error) {
      setMessage(`${has ? 'Revoked' : 'Granted'} ${role} for ${row.display_name ?? row.email ?? row.id.slice(0, 8)}`);
      retry();
    } else {
      setActionError(res.error ?? 'Role change failed on the server.');
      retry();
    }
  };

  return (
    <div>
      <AdminModuleHeader
        title="Roles & Permissions"
        description="Read-only role matrix + server-gated role assignment. Role changes are audited in the database and never derived from the UI."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={retry} />
      ) : (
        <>
          {!superAdmin ? (
            <div className="mb-4 rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" role="alert">
              Only Super Administrators may manage roles. Your session cannot mutate role membership.
            </div>
          ) : null}

          {actionError ? (
            <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">{actionError}</div>
          ) : null}
          {message ? (
            <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">{message}</div>
          ) : null}

          {!data || data.length === 0 ? (
            <AdminEmpty message="No users available to assign roles." />
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/5">
              <table className="w-full min-w-0 border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-white/10 bg-white/5">
                    <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">User</th>
                    <th className="px-3.5 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] text-ink-400">Status</th>
                    {ROLE_CODES.map((r) => (
                      <th key={r} className="px-2 py-2.5 text-center text-xs font-semibold uppercase tracking-[0.14em] text-ink-400">{ROLE_LABELS[r]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {data.map((row) => (
                    <tr key={row.id} className="align-middle">
                      <td className="px-3.5 py-3">
                        <p className="font-medium text-white">{row.display_name ?? 'Unnamed user'}</p>
                        <p className="mt-0.5 text-xs text-ink-400">{row.email ?? '—'}</p>
                      </td>
                      <td className="px-3.5 py-3"><AdminStatusPill status={row.account_status} /></td>
                      {ROLE_CODES.map((role) => {
                        const has = row.roles.includes(role);
                        const isSelf = row.id === user?.id;
                        const isLastSuperAdmin = role === 'super_admin' && has && (data.filter((u) => u.roles.includes('super_admin')).length === 1);
                        const disabled = !canManageRoles || !superAdmin || isLastSuperAdmin || (isSelf && role === 'super_admin') || busy !== null;
                        return (
                          <td key={role} className="px-2 py-3 text-center">
                            <button
                              type="button"
                              disabled={disabled}
                              aria-pressed={has}
                              title={disabled && isLastSuperAdmin ? 'Cannot revoke the last Super Admin' : undefined}
                              onClick={() => void toggleRole(row, role)}
                              className={
                                'inline-flex h-6 w-6 items-center justify-center rounded-full border transition ' +
                                (has
                                  ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                                  : 'border-white/15 bg-white/5 text-transparent hover:border-brand-400/40 hover:text-ink-400') +
                                (disabled ? ' cursor-not-allowed opacity-40' : '')
                              }
                              aria-label={`${has ? 'Revoke' : 'Grant'} ${role} for ${row.display_name ?? row.id}`}
                            >
                              ✓
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-4 max-w-2xl text-xs leading-6 text-ink-400">
            The database guards role membership: only a server-verified Super Admin may run the grant/revoke
            RPCs, and the last Super Admin can never be removed. Every change writes an audit event.
          </p>
        </>
      )}
    </div>
  );
}