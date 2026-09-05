/**
 * CareLink-AI — Admin Data Quality (Super Admin).
 *
 * Super-admin-only module rendering `carelink_admin_data_quality()` — the
 * server-authorized flag list for duplicate/missing-coordinate/unverified/
 * orphaned records. The report NEVER deletes anything; it flags rows for ops.
 */

import { useCallback } from 'react';
import { Button } from '../../components/ui/Button';
import { adminListDataQuality } from '../../services/health-data/adminRepository';
import type { AdminDataQualityRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminTable } from './AdminBits';

const ISSUE_LABELS: Record<string, string> = {
  duplicate_provider: 'Duplicate provider',
  missing_coordinates: 'Missing coordinates',
  unverified_provider: 'Unverified provider',
  orphaned_appointment: 'Orphaned appointment',
  orphaned_review: 'Orphaned review',
  unverified_media: 'Unverified media',
};

const SEVERITY_TONE: Record<string, string> = {
  high: 'border-rose-400/25 bg-rose-500/15 text-rose-200',
  medium: 'border-amber-400/25 bg-amber-500/15 text-amber-200',
  low: 'border-white/10 bg-white/10 text-ink-200',
};

export function AdminDataQualityPage() {
  const load = useCallback(() => adminListDataQuality(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminDataQualityRow>({ load });

  return (
    <div>
      <AdminModuleHeader
        title="Data quality"
        description="Flag-only report from the database: duplicates, missing coordinates, unverified providers, and orphaned records. Nothing here is deleted."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={retry} />
      ) : !data || data.length === 0 ? (
        <AdminEmpty message="No data-quality flags found. Rows are only flagged when a genuine issue exists." />
      ) : (
        <>
          <AdminTable headers={['Issue', 'Entity', 'Severity', 'Detail', 'Entity ID']}>
            {data.map((row) => (
              <tr key={`${row.issue_kind}-${row.entity_id}`}>
                <td className="px-3.5 py-3 font-medium text-white">{ISSUE_LABELS[row.issue_kind] ?? row.issue_kind.replace(/_/g, ' ')}</td>
                <td className="px-3.5 py-3 text-ink-300">{row.entity}</td>
                <td className="px-3.5 py-3">
                  <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] ${SEVERITY_TONE[row.severity] ?? 'border-white/10 bg-white/10 text-ink-200'}`}>
                    {row.severity}
                  </span>
                </td>
                <td className="px-3.5 py-3 text-ink-300">{row.detail}</td>
                <td className="px-3.5 py-3 text-xs text-ink-400">{row.entity_id.slice(0, 8)}…</td>
              </tr>
            ))}
          </AdminTable>
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-ink-400">
              {data.length} flag{data.length === 1 ? '' : 's'} at query time. Flagged rows are preserved so an operator can act on them.
            </p>
            <Button type="button" variant="secondary" size="sm" onClick={retry}>Refresh</Button>
          </div>
        </>
      )}
    </div>
  );
}