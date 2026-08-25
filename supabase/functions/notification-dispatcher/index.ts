/**
 * CareLink Notification Dispatcher — Supabase Edge Function (Step 10.5 §13/§21).
 *
 * Cron-invoked worker that dispatches due notifications:
 *   notifications WHERE status IN ('scheduled','pending') AND scheduled_for <= now()
 *   → sent + delivery event, per row.
 *
 * SECURITY:
 * - Invocable ONLY with the CRON_SECRET bearer header (set via Edge Function
 *   secrets; called from Supabase cron/pg_net). No user JWT accepted.
 * - Uses SUPABASE_SERVICE_ROLE_KEY server-side only — never exposed to the
 *   browser. The client bundle never references this function.
 * - No PHI is logged: only notification ids and counts.
 *
 * Deploy:
 *   supabase functions deploy notification-dispatcher
 *   supabase secrets set CRON_SECRET=...
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const CRON_SECRET = Deno.env.get('CRON_SECRET') ?? '';
const BATCH_LIMIT = 100;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, 405);
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !CRON_SECRET) {
    return jsonResponse({ error: 'not-configured' }, 503);
  }
  const auth = req.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${CRON_SECRET}`) return jsonResponse({ error: 'unauthorized' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const now = new Date().toISOString();

  const { data: due, error: readError } = await admin
    .from('notifications')
    .select('id, owner_id')
    .in('status', ['scheduled', 'pending'])
    .lte('scheduled_for', now)
    .limit(BATCH_LIMIT);
  if (readError) return jsonResponse({ error: 'read-failed' }, 500);

  let sent = 0;
  let failed = 0;
  for (const row of due ?? []) {
    const { error: updateError } = await admin
      .from('notifications')
      .update({ status: 'sent', sent_at: now })
      .eq('id', row.id)
      .in('status', ['scheduled', 'pending']); // optimistic guard against double dispatch
    if (updateError) {
      failed += 1;
      continue;
    }
    await admin.from('notification_delivery_events').insert({
      notification_id: row.id,
      owner_id: row.owner_id,
      event: 'sent',
    });
    sent += 1;
  }

  return jsonResponse({ dispatched: sent, failed, batch: (due ?? []).length });
});
