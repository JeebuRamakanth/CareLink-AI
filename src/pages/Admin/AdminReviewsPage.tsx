/**
 * CareLink-AI — Admin Reviews moderation queue..
 *
 * Renders the server-authorized `carelink_admin_list_reviews` rowsand exposes
 * moderation actions (publish/hide/remove) via the guarded
 * `carelink_moderate_review` RPC (admin + not-suspended only, audited). No
 * optimistic success — the UI waits for the RPC to return before claiming an
 * action completed..
 */

import { useCallback, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission } from '../../services/auth/authorization';
import { adminListReviews } from '../../services/health-data/adminRepository';
import { moderateReview } from '../../services/health-data';
import type { AdminReviewRow } from '../../services/health-data/adminRepository';
import { useAdminList } from './useAdminList';
import { AdminDate, AdminEmpty, AdminError, AdminLoading, AdminModuleHeader, AdminNotConfigured, AdminStatusPill, AdminTable, AdminMuted } from './AdminBits';

export function AdminReviewsPage() {
  const { user } = useAuth();
  const canModerate = hasPermission(user, 'reviews.moderate');

  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(() => adminListReviews(), []);
  const { data, error, loading, retry, readiness } = useAdminList<AdminReviewRow>({ load });

  const moderate = async (row: AdminReviewRow, action: 'publish' | 'hide' | 'remove') => {
    if (busyId) return;
    setMessage(null);
    setActionError(null);
    setBusyId(row.id);
    const res = await moderateReview(row.id, action);
    setBusyId(null);
    if (res.ok) {
      setMessage(`Review ${action === 'publish' ? 'published' : action === 'hide' ? 'hidden' : 'removed'}.`);
      retry();
    } else {
      setActionError(res.error ?? 'Moderation failed on the server.');
      retry();
    }
  };

  return (
    <div>
      <AdminModuleHeader
        title="Review moderation"
        description="Server-authorized review queue. Publishing, hiding, or removing a review is audited in the database."
      />

      {!readiness ? (
        <AdminNotConfigured onRetry={retry} />
      ) : loading ? (
        <AdminLoading />
      ) : error ? (
        <AdminError message={error} onRetry={retry} />
      ) : (
        <>
          {message ? (
            <div className="mb-3 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100" role="status">{message}</div>
          ) : null}
          {actionError ? (
            <div className="mb-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100" role="alert">{actionError}</div>
          ) : null}

          {!data || data.length === 0 ? (
            <AdminEmpty message="No reviews are tracked in the moderation queue yet." />
          ) : (
            <AdminTable headers={['Review', 'Rating', 'Status', 'Author', 'Created', 'Actions']}>
              {data.map((row) => (
                <tr key={row.id} className="align-top">
                  <td className="px-3.5 py-3">
                    <p className="text-sm font-medium text-white">{row.title ?? 'Untitled review'}</p>
                    <p className="mt-0.5 text-xs text-ink-400">{row.id.slice(0, 8)}…</p>
                  </td>
                  <td className="px-3.5 py-3 text-ink-200">{row.rating ? `${row.rating} / 5` : <AdminMuted>—</AdminMuted>}</td>
                  <td className="px-3.5 py-3"><AdminStatusPill status={row.status} /></td>
                  <td className="px-3.5 py-3 text-xs text-ink-400">{row.owner_id.slice(0, 8)}…</td>
                  <td className="px-3.5 py-3"><AdminDate value={row.created_at} /></td>
                  <td className="px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-1">
                      {canModerate ? (
                        <>
                          {row.status !== 'published' ? (
                            <Button size="sm" variant="secondary" loading={busyId === row.id} disabled={busyId === row.id} onClick={() => moderate(row, 'publish')}>Publish</Button>
                          ) : null}
                          {row.status !== 'hidden' ? (
                            <Button size="sm" variant="ghost" loading={busyId === row.id} disabled={busyId === row.id} onClick={() => moderate(row, 'hide')}>Hide</Button>
                          ) : null}
                          <Button size="sm" variant="danger" loading={busyId === row.id} disabled={busyId === row.id} onClick={() => moderate(row,'remove')}>Remove</Button>
                        </>
                      ) : (
                        <span className="text-xs text-ink-500">View only</span>
                      )}
                    </div>
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