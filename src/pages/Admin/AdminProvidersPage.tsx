/**
 * CareLink-AI — Admin Providers module.
 *
 * Renders the server-authorized provider registry (`carelink_admin_list_providers`)
 * with kind tabs (hospitals/doctors/pharmacies/labs.. Verification status is
 * presented honestly from the DB (dev-seeded records are PENDING, never
 * verified). When a real admin gateway is configured, a super admin may
 * verify a provider server-side (update rides the caller's own JWT; the edge
 * function re-checks the DB guard.. Without the gateway, verification stays
 * read-only and the UI explains it honestly..
 */

import { useCallback, useMemo, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, isSuperAdmin } from '../../services/auth/authorization';
import { adminListProviders } from '../../services/health-data/adminRepository';
import type { AdminProviderRow } from '../../services/health-data/adminRepository';
import { env } from '../../config';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill, AdminTable } from './AdminBits';
import { cn } from '../../components/common/cn';

type ProviderKind = 'hospital' | 'doctor' | 'pharmacy' | 'lab';

const KINDS: { value: ProviderKind; label: string }[] = [
  { value: 'hospital', label: 'Hospitals' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'pharmacy', label: 'Pharmacies' },
  { value: 'lab', label: 'Labs' },
];

export function AdminProvidersPage() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const canView = hasPermission(user, 'providers.view');
  const gatewayConfigured = env.admin.configured;

  const [kind, setKind] = useState<ProviderKind>('hospital');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => adminListProviders(kind), [kind]);
  const { data, error, loading, retry, readiness } = useAdminList<AdminProviderRow>({ load, deps: [kind] });

  const rows = useMemo(() => {
    if (!data) return [];
    if (!query.trim()) return data;
    const q = query.trim().toLowerCase();
    return data.filter((r) =>
      r.name.toLowerCase().includes(q) ||
      (r.city ?? '').toLowerCase().includes(q) ||
      r.slug.toLowerCase().includes(q)
    );
  }, [data, query]);

  void superAdmin;
  void canView;

  const verifyProvider = async (row: AdminProviderRow) => {
    if (!gatewayConfigured) return;
    setActionError(null);
    setActionMessage(null);
    setBusyId(row.id);
    const { verifyProvider: verify } = await import('../../services/admin/adminGateway');
    const res = await verify(kind, row.id);
    setBusyId(null);
    if (res.ok) {
      setActionMessage(`Verification requested for ${row.name}.`);
      retry();
    } else {
      setActionError('Verification failed on the server: ' + (res.detail ?? res.error ?? 'unknown'));
    }
  };

  return (
    <div>
      <AdminModuleHeader
        title="Providers"
        description="Server-authorized provider registry with provenance. Broken by kind tabs."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setKind(k.value)}
                className={cn(
                  'rounded-full border px-4 py-1.5 text-sm font-medium transition-all duration-200',
                  kind === k.value
                    ? 'border-brand-400/50 bg-brand-500/20 text-white'
                    : 'border-white/10 bg-white/5 text-ink-300 hover:bg-white/10 hover:text-white'
                )}
              >
                {k.label}
              </button>
            ))}
            <div className="ml-auto w-full sm:w-64">
              <Input placeholder="Search name, city, slug" value={query} onChange={(e) => setQuery(e.target.value)} />
            </div>
          </div>

          {actionMessage ? (
            <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">{actionMessage}</div>
          ) : null}
          {actionError ? (
            <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">{actionError}</div>
          ) : null}

          {loading ? (
            <AdminLoading />
          ) : error ? (
            <AdminError message={error} onRetry={retry} />
          ) : rows.length === 0 ? (
            <AdminEmpty message={`No ${kind} records match the current filters.`} />
          ) : (
            <AdminTable headers={['Name', 'City', 'Data status', 'Verification', 'Slug', 'Created', 'Actions']}>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3.5 py-3 font-medium text-white">{row.name}</td>
                  <td className="px-3.5 py-3 text-ink-300">{row.city ?? '—'}</td>
                  <td className="px-3.5 py-3"><AdminStatusPill status={row.data_status} /></td>
                  <td className="px-3.5 py-3"><AdminStatusPill status={row.verification_status} /></td>
                  <td className="px-3.5 py-3 text-xs text-ink-400">{row.slug}</td>
                  <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
                  <td className="px-3.5 py-3">
                    {superAdmin && gatewayConfigured ? (
                      row.verification_status === 'verified' ? (
                        <span className="text-xs text-ink-400">Verified</span>
                      ) : (
                        <Button size="sm" variant="secondary" loading={busyId === row.id} disabled={busyId === row.id} onClick={() => verifyProvider(row)}>
                          Verify
                        </Button>
                      )
                    ) : (
                      <span className="text-xs text-ink-500">
                        {superAdmin ? 'Needs gateway' : 'View only'}
                      </span>
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