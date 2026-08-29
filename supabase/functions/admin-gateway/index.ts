/**
 * CareLink Admin Gateway - Supabase Edge Function.

 * Thin authenticated facade over the database-level guarded admin functions.

 * All authorization, verification transitions, role/membership grants,
 * media updates and audit happen INSIDE the database RLS + security-definer
 * guarded functions. This function binds the caller's Supabase JWT (so
 * auth.uid() is the real user), validates a whitelist-of actions, and
 * forwards typed arguments. No arbitrary SQL.
   *
 * SECURITY:
 * - Requires a valid Supabase JWT. No anonymous admin actions.
 * - ANON key with caller's authorization header. NO service role. The
 *   database RLS + guarded functions remain the enforcement layer.
   *
 * - Bootstrap: assigning the FIRST super_admin requires the optional
 *   SUPER_ADMIN_BOOTSTRAP_SECRET edge-function secret. When that secret is
 *   NOT set, bootstrap is disabled entirely. No admin can ever be created
 *   insecurely. Usage:
 *     curl -X POST .../functions/v1/admin-gateway
 *       -H "Authorization: Bearer $USER_JWT"
 *       -H "x-bootstrap-secret: $SUPER_ADMIN_BOOTSTRAP_SECRET"
 *       --data '{"action":"bootstrap","email":"owner@example.com"}'
 *   Re-runs are no-ops. The DB guard raises 'only super_admin can grant
 *   roles' once a super_admin already exists, so re-calling returns
 *   bootstrap-already-completed (409).
 * - Whitelisted actions only; no arbitrary SQL. No PHI is logged.
*/

 import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
 const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
 const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
 const BOOTSTRAP_SECRET = Deno.env.get('SUPER_ADMIN_BOOTSTRAP_SECRET') ?? '';
 const ACTIONS = new Set([
   'bootstrap',
   'grant_role',
   'revoke_role',
   'add_provider_membership',
   'remove_provider_membership',
   'verify_provider',
   'set_media_verified',
   'remove_media',
 ]);
 const PROVIDER_KINDS = new Set(['hospital', 'doctor', 'pharmacy', 'lab']);
 interface AdminRequest {
   action?: string;
   email?: string;
   targetUser?: string;
   role?: string;
   providerKind?: string;
   providerId?: string;
   membershipId?: string;
   mediaId?: string;
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
 function isEmail(v: unknown): v is string {
   return typeof v === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
 }
 Deno.serve(async (req: Request): Promise<Response> => {
   if (req.method !== 'POST') return jsonResponse({ error: 'method-not-allowed' }, 405);
   if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return jsonResponse({ error: 'not-configured' }, 503);
   const authHeader = req.headers.get('authorization') ?? '';
   if (!authHeader.startsWith('Bearer ')) return jsonResponse({ error: 'unauthorized' }, 401);
   const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
     global: { headers: { authorization: authHeader } },
   });
   const { data: userData, error: authError } = await supabase.auth.getUser();
   if (authError || !userData?.user) return jsonResponse({ error: 'unauthorized' }, 401);
   if (!userData.user.email) return jsonResponse({ error: 'unauthorized' }, 401);
   let payload: AdminRequest;
   try {
     payload = (await req.json()) as AdminRequest;
   } catch {
     return jsonResponse({ error: 'malformed-request' }, 400);
   }
   if (!payload.action || !ACTIONS.has(payload.action)) {
     return jsonResponse({ error: 'unknown-action' }, 400);
   }
   const callerId = userData.user.id;
   try {
     switch (payload.action) {
       case 'bootstrap': {
         if (!BOOTSTRAP_SECRET) {
           return jsonResponse({ error: 'bootstrap-disabled' }, 403);
         }
         const headerSecret = req.headers.get('x-bootstrap-secret') ?? '';
         if (headerSecret !== BOOTSTRAP_SECRET) {
           return jsonResponse({ error: 'unauthorized' }, 401);
         }
         if (!isEmail(payload.email)) {
           return jsonResponse({ error: 'malformed-request' }, 400);
         }
         if (userData.user.email.toLowerCase() !== payload.email.trim().toLowerCase()) {
           return jsonResponse({ error: 'unauthorized' }, 401);
         }
         const grantRes = await supabase.rpc('carelink_grant_role', {
           target_user: callerId,
           role_name: 'super_admin',
         });
         if (grantRes.error) {
           if (/only super_admin/i.test(grantRes.error.message)) {
             return jsonResponse({ error: 'bootstrap-already-completed' }, 409);
           }
           return jsonResponse({ error: 'forbidden' }, 403);
         }
         return jsonResponse({ ok: true, roleId: grantRes.data });
       }
       case 'grant_role': {
        if (!isUuid(payload.targetUser) || !payload.role) return jsonResponse({ error: 'malformed-request' }, 400);
         const grantRes = await supabase.rpc('carelink_grant_role', {
           target_user: payload.targetUser,
           role_name: payload.role,
         });
         if (grantRes.error) return jsonResponse({ error: 'forbidden' }, 403);
         return jsonResponse({ ok: true, id: grantRes.data });
       }
       case 'revoke_role': {
        if (!isUuid(payload.targetUser) || !payload.role) return jsonResponse({ error: 'malformed-request' }, 400);
        const revokeRes = await supabase.rpc('carelink_revoke_role', {
          target_user: payload.targetUser,
          role_name: payload.role,
        });
        if (revokeRes.error) return jsonResponse({ error: 'forbidden' }, 403);
        return jsonResponse({ ok: true });
      }
      case 'add_provider_membership': {
         if (
           !isUuid(payload.targetUser) ||
           !payload.providerKind ||
           !PROVIDER_KINDS.has(payload.providerKind) ||
           !isUuid(payload.providerId)
         ) {
           return jsonResponse({ error: 'malformed-request' }, 400);
         }
         if (payload.providerKind === 'doctor') {
           return jsonResponse({ error: 'unsupported' }, 400);
         }
         const membershipRes = await supabase.rpc('carelink_add_provider_membership', {
           target_user: payload.targetUser,
           kind: payload.providerKind,
           provider_uuid: payload.providerId,
         });
         if (membershipRes.error) return jsonResponse({ error: 'forbidden' }, 403);
         return jsonResponse({ ok: true, id: membershipRes.data });
       }
       case 'remove_provider_membership': {
         if (!isUuid(payload.membershipId)) return jsonResponse({ error: 'malformed-request' }, 400);
         const removeRes = await supabase.rpc('carelink_remove_provider_membership', {
           membership_id: payload.membershipId,
         });
         if (removeRes.error) return jsonResponse({ error: 'forbidden' }, 403);
         return jsonResponse({ ok: true });
       }
       case 'verify_provider': {
         if (
           !payload.providerKind ||
           !PROVIDER_KINDS.has(payload.providerKind) ||
           !isUuid(payload.providerId)
         ) {
           return jsonResponse({ error: 'malformed-request' }, 400);
         }
         const isDoctor = payload.providerKind === 'doctor';
         const table = isDoctor ? 'doctor_verification' : `${payload.providerKind}_verification`;
         const idColumn = isDoctor ? 'doctor_id' : `${payload.providerKind}_id`;
         const verifyRes = await supabase
           .from(table)
           .update({
             status: 'verified',
             verified_at: new Date().toISOString(),
             verified_by: callerId,
           })
           .eq(idColumn, payload.providerId);
         if (verifyRes.error) return jsonResponse({ error: 'forbidden' }, 403);
         return jsonResponse({ ok: true });
       }
       case 'set_media_verified': {
         if (!isUuid(payload.mediaId)) return jsonResponse({ error: 'malformed-request' }, 400);
         const mediaVRes = await supabase
           .from('provider_media')
           .update({ verified_media: true, uploaded_by: callerId })
           .eq('id', payload.mediaId);
         if (mediaVRes.error) return jsonResponse({ error: 'forbidden' }, 403);
         return jsonResponse({ ok: true });
       }
       case 'remove_media': {
         if (!isUuid(payload.mediaId)) return jsonResponse({ error: 'malformed-request' }, 400);
         const removeMediaRes = await supabase
           .from('provider_media')
           .delete()
           .eq('id', payload.mediaId);
         if (removeMediaRes.error) return jsonResponse({ error: 'forbidden' }, 403);
         return jsonResponse({ ok: true });
       }
     }
     return jsonResponse({ error: 'unknown-action' }, 400);
   } catch {
     return jsonResponse({ error: 'admin-error' }, 500);
   }
 });
