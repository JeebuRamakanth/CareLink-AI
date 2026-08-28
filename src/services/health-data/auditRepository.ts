/**
 * CareLink-AI — audit repository (Step 10.5 §18/§22).
 *
 * Self-select read of the caller's own audit rows + guarded access-audit
 * entry points (document/health). audit_events is immutable for clients: no
 * insert/update/delete helpers exist here by design.
 */

import { withClient } from './repository';
import type { AuditEventRow } from './types';

/** The caller's own audit events (RLS self-select). */
export async function listMyAuditEvents(options?: { action?: string; limit?: number }): Promise<AuditEventRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client
      .from('audit_events')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(options?.limit ?? 100);
    if (options?.action) q = q.eq('action', options.action);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as AuditEventRow[]) ?? [];
  });
  return data ?? [];
}

/** Audit a document access (view/sign/download/delete) — guarded in the DB. */
export async function auditDocumentAccess(
  documentId: string,
  action: 'view' | 'sign' | 'download' | 'delete'
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_audit_document_access', {
      document_uuid: documentId,
      action,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

/** Audit a health-record access on a whitelisted owner table — guarded in the DB. */
export async function auditHealthAccess(
  targetTable: 'health_context' | 'medical_reports' | 'medicines' | 'vaccination_records' | 'recovery_checkins' | 'conversations',
  targetId: string,
  action: 'read' | 'export' | 'share' = 'read'
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_audit_health_access', {
      target_table: targetTable,
      target_id: targetId,
      action,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}
