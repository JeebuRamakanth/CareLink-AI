/**
 * CareLink Emergency Workflow — Supabase Edge Function (Step 10.5 §14/§21).
 *
 * Thin authenticated facade over the database-level guarded SOS functions
 * (carelink_notify_hospital_for_emergency / carelink_respond_emergency_
 * notification / carelink_create_ambulance_request / carelink_transition_
 * ambulance). ALL authorization, membership, history and audit logic lives in
 * the database — this function only binds the caller's JWT so auth.uid() is
 * the real user, and forwards whitelisted actions.
 *
 * SECURITY:
 * - Requires a valid Supabase JWT (no anonymous emergency actions).
 * - Uses the ANON key with the caller's authorization header — NO service
 *   role, so database RLS + guarded functions remain the enforcement layer.
 * - Whitelisted actions only; no arbitrary SQL. No PHI is logged.
 *
 * Deploy:
 *   supabase functions deploy emergency-workflow
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const ACTIONS = new Set(['notify', 'respond', 'ambulance_request', 'ambulance_transition']);

interface WorkflowRequest {
  action?: string;
  emergencyEventId?: string;
  notificationId?: string;
  hospitalId?: string;
  ambulanceRequestId?: string;
  respondAction?: string;
  status?: string;
  note?: string;
}

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
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return jsonResponse({ error: 'not-configured' }, 503);

  const authHeader = req.headers.get('authorization') ?? '';
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { authorization: authHeader } },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);

  let payload: WorkflowRequest;
  try {
    payload = (await req.json()) as WorkflowRequest;
  } catch {
    return jsonResponse({ error: 'malformed-request' }, 400);
  }
  if (!payload.action || !ACTIONS.has(payload.action)) {
    return jsonResponse({ error: 'unknown-action' }, 400);
  }

  // Each RPC re-checks authorization against the caller (auth.uid()) inside
  // the database; a failure returns a Postgres error which we map to 403.
  try {
    switch (payload.action) {
      case 'notify': {
        if (!isUuid(payload.emergencyEventId) || !isUuid(payload.hospitalId)) {
          return jsonResponse({ error: 'malformed-request' }, 400);
        }
        const { data, error } = await supabase.rpc('carelink_notify_hospital_for_emergency', {
          emergency_event_uuid: payload.emergencyEventId,
          hospital_uuid: payload.hospitalId,
        });
        if (error) return jsonResponse({ error: 'forbidden' }, 403);
        return jsonResponse({ notificationId: data });
      }
      case 'respond': {
        if (!isUuid(payload.notificationId) || !['accepted', 'rejected'].includes(payload.respondAction ?? '')) {
          return jsonResponse({ error: 'malformed-request' }, 400);
        }
        const { error } = await supabase.rpc('carelink_respond_emergency_notification', {
          notification_uuid: payload.notificationId,
          action: payload.respondAction,
        });
        if (error) return jsonResponse({ error: 'forbidden' }, 403);
        return jsonResponse({ ok: true });
      }
      case 'ambulance_request': {
        if (!isUuid(payload.emergencyEventId) || !isUuid(payload.hospitalId)) {
          return jsonResponse({ error: 'malformed-request' }, 400);
        }
        const { data, error } = await supabase.rpc('carelink_create_ambulance_request', {
          emergency_event_uuid: payload.emergencyEventId,
          hospital_uuid: payload.hospitalId,
        });
        if (error) return jsonResponse({ error: 'forbidden' }, 403);
        return jsonResponse({ ambulanceRequestId: data });
      }
      case 'ambulance_transition': {
        const allowed = ['requested', 'assigned', 'en_route', 'arrived', 'completed', 'cancelled'];
        if (!isUuid(payload.ambulanceRequestId) || !allowed.includes(payload.status ?? '')) {
          return jsonResponse({ error: 'malformed-request' }, 400);
        }
        const { error } = await supabase.rpc('carelink_transition_ambulance', {
          ambulance_request_uuid: payload.ambulanceRequestId,
          new_status: payload.status,
          note: typeof payload.note === 'string' ? payload.note.slice(0, 200) : null,
        });
        if (error) return jsonResponse({ error: 'forbidden' }, 403);
        return jsonResponse({ ok: true });
      }
    }
  } catch {
    return jsonResponse({ error: 'workflow-error' }, 500);
  }
});
