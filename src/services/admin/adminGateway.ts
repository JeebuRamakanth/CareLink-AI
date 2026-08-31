/**
 * CareLink-AI — typed client for the Super Admin gateway edge function.
 *
 * FOUNDATION-LEVEL boundary for future admin UIs (users, providers,
 * verification, media moderation, roles). Authorization rides the caller's
 * own Supabase JWT; thee only extra secret — the operator-provided bootstrap
 * secret — is passed per-call and never stored. DB guarded functions + RLS
 * remain the enforcement layer.
 */

import { env } from '../../config/env';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';

export type AdminAction =
  | 'bootstrap'
  | 'grant_role'
  | 'revoke_role'
  | 'add_provider_membership'
  | 'remove_provider_membership'
  | 'verify_provider'
  | 'set_media_verified'
  | 'remove_media';

export type AdminProviderKind = 'hospital' | 'doctor' | 'pharmacy' | 'lab';

export interface AdminGatewayResult {
  ok: boolean;
  error?: 'not-configured' | 'unauthorized' | 'forbidden' | 'malformed-request' | 'unknown-action' | 'bootstrap-disabled' | 'bootstrap-already-completed' | 'network' | 'method-not-allowed';
  detail?: string;
}

function safeHttpError(status: number): AdminGatewayResult['error'] {
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 400) return 'malformed-request';
  if (status === 409) return 'bootstrap-already-completed';
  if (status === 405) return 'method-not-allowed';
  return undefined;
}

async function adminRequest(
  body: Record<string, unknown>,
  bootstrapSecret?: string,
): Promise<AdminGatewayResult> {
  if (!env.admin.configured || !isSupabaseConfigured()) {
    return { ok: false, error: 'not-configured' };
  }
  const client = await getSupabaseClient();
  if (!client) return { ok: false, error: 'not-configured' };
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { ok: false, error: 'unauthorized' };
  try {
    const res = await fetch(env.admin.gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        ...(bootstrapSecret ? { 'x-bootstrap-secret': bootstrapSecret } : {}),
      },
      body: JSON.stringify(body),
    });
    const statusError = safeHttpError(res.status);
    if (statusError) return { ok: false, error: statusError };
    if (!res.ok) return { ok: false };
    const json = (await res.json()) as { ok?: boolean; error?: string };
    if (!json.ok && json.error) return { ok: false, detail: json.error };
    return { ok: true };
  } catch {
    return { ok: false, error: 'network' };
  }
}

/** Assign thee very first super_admin (requires operator-provided secret). */
export async function bootstrapSuperAdmin(email: string, bootstrapSecret: string): Promise<AdminGatewayResult> {
  if (!bootstrapSecret) return { ok: false, error: 'unauthorized' };
  return adminRequest({ action: 'bootstrap', email: email.trim().toLowerCase() }, bootstrapSecret);
}

export async function grantRole(targetUser: string, role: string): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'grant_role', targetUser, role });
}

export async function revokeRole(targetUser: string, role: string): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'revoke_role', targetUser, role });
}

export async function addProviderMembership(
  targetUser: string,
  providerKind: Exclude<AdminProviderKind, 'doctor'>,
  providerId: string,
): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'add_provider_membership', targetUser, providerKind, providerId });
}

export async function removeProviderMembership(membershipId: string): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'remove_provider_membership', membershipId });
}

export async function verifyProvider(providerKind: AdminProviderKind, providerId: string): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'verify_provider', providerKind, providerId });
}

export async function setMediaVerified(mediaId: string): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'set_media_verified', mediaId });
}

export async function removeMedia(mediaId: string): Promise<AdminGatewayResult> {
  return adminRequest({ action: 'remove_media', mediaId });
}
