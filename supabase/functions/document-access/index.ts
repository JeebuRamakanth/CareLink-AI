/**
 * CareLink Document Access — Supabase Edge Function (Step 10.5 §17/§21).
 *
 * Issues short-lived SIGNED URLs for private medical documents after an
 * ownership check, and audits every access through
 * carelink_audit_document_access() (0018). The medical_documents bucket stays
 * private; no public URLs ever exist.
 *
 * SECURITY:
 * - Requires a valid Supabase JWT.
 * - Ownership is verified in the database (carelink_can_access_document as
 *   the caller; super_admin bypass reserved) BEFORE any URL is signed.
 * - Service role is used ONLY to sign the storage URL (server-side secret),
 *   never for data queries — RLS stays the enforcement layer.
 * - Access is audited with action 'sign'. No file contents or paths logged.
 *
 * Deploy:
 *   supabase functions deploy document-access
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SIGNED_URL_TTL_SECONDS = 120;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, 405);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'not-configured' }, 503);
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: userData, error: authError } = await userClient.auth.getUser();
  if (authError || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

  let payload: { documentId?: string };
  try {
    payload = (await req.json()) as { documentId?: string };
  } catch {
    return jsonResponse({ error: 'malformed-request' }, 400);
  }
  if (!isUuid(payload.documentId)) return jsonResponse({ error: 'malformed-request' }, 400);

  // Ownership check runs AS THE CALLER (RLS + guarded helper).
  const { data: allowed, error: checkError } = await userClient.rpc('carelink_can_access_document', {
    document_id: payload.documentId,
  });
  if (checkError || allowed !== true) return jsonResponse({ error: 'forbidden' }, 403);

  // Metadata read as the caller (RLS-scoped) — never trust client paths.
  const { data: doc, error: docError } = await userClient
    .from('medical_documents')
    .select('id, storage_bucket, storage_path')
    .eq('id', payload.documentId)
    .maybeSingle();
  if (docError || !doc) return jsonResponse({ error: 'not-found' }, 404);

  // Sign with the service role — the only privileged operation here.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: signed, error: signError } = await admin.storage
    .from(doc.storage_bucket)
    .createSignedUrl(doc.storage_path, SIGNED_URL_TTL_SECONDS);
  if (signError || !signed?.signedUrl) return jsonResponse({ error: 'sign-failed' }, 500);

  // Audit the access (guarded function re-verifies authorization).
  const { error: auditError } = await userClient.rpc('carelink_audit_document_access', {
    document_uuid: payload.documentId,
    action: 'sign',
  });
  if (auditError) return jsonResponse({ error: 'audit-failed' }, 500);

  return jsonResponse({ signedUrl: signed.signedUrl, expiresIn: SIGNED_URL_TTL_SECONDS });
});
