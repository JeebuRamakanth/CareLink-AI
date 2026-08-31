/**
 * CareLink-AI — server-side authorization resolution for the authenticated user.
 *
 * Enriches a raw auth user with the server-authoritative profile, account
 * status, role codes, and permission codes. The UI never infers roles; it
 * only reads what the DB RLS/definer functions return for the authenticated row.
 *
 * SECURITY:
 * - Never trusts client-supplied roles/status. Only `carelink_current_user_roles()`
 *   and `carelink_current_user_permissions()` (security definer, keyed to
 *   auth.uid() inside the database) count as authorization inputs.
 * - RPC failures degrade gracefully (empty roles/permissions, unknown status)
 *   so the UI never invents privileges; administrators simply see an honest
 *   "role lookup unavailable" state when the backend is unreachable.
 *
 * - Login/logout security activity is recorded server-side via
 *   `carelink_record_login_activity`; failures are non-fatal for the auth UX.

 */

import { log } from '../../lib/security';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';
import type { CareLinkUser } from './authService';

export type AccountStatus = 'active' | 'suspended' | 'disabled';

/**
 * Resolve server-side profile + roles + permissions for the given auth user.
 *
 * Real Supabase mode uses RPCs (RLS/definer keyed to auth.uid()。. In mock
 * mode the UI stays honest: no server roles are invented, status defaults to
 * 'active', and the page indicators explain that real admin access requires a
 * configured backend with a server-provisioned role.
 */
export async function loadUserAuthorization(user: CareLinkUser  | null): Promise<CareLinkUser | null> {
  if (!user) return null;
  if (!isSupabaseConfigured()) {
    return { ...user, accountStatus: 'active', roles: [], permissions: [] };
  }

  const client = await getSupabaseClient();
  if (!client) {
    log.warn('auth', 'authorization lookup skipped: supabase client unavailable');
    return { ...user, roles: [], permissions: [] };
  }

  let profile: { display_name?: string | null; account_status?: string | null } | null = null;
  let roles: string[] = [];
  let permissions: string[] = [];

  try {
    const { data } = await client
      .from('profiles')
      .select('display_name, account_status')
      .eq('id', user.id)
      .maybeSingle();
    profile = ((data as unknown) as { display_name?: string | null; account_status?: string | null }) ?? null;
  } catch (err) {
    log.warn('auth', 'profile lookup failed', err);
  }

  try {
    const { data: r } = await client.rpc('carelink_current_user_roles');
    if (Array.isArray(r)) roles = (r as string[]).filter(Boolean);
  } catch (err) {
    log.warn('auth', 'role lookup failed', err);
  }

  try {
    const { data: p } = await client.rpc('carelink_current_user_permissions');
    if (Array.isArray(p)) permissions = (p as string[]).filter(Boolean);
  } catch (err) {
    log.warn('auth', 'permission lookup failed', err);
  }

  const statusRaw = profile?.account_status ?? null;
  const accountStatus: AccountStatus | undefined =
    statusRaw === 'suspended' || statusRaw === 'disabled' || statusRaw === 'active'
      ? statusRaw
      : undefined;

  return {
    ...user,
    displayName: profile?.display_name ?? user.displayName,
    accountStatus,
    roles,
    permissions,
  };
}

export function isSuspended(user: CareLinkUser | null): boolean {
  return user?.accountStatus === 'suspended';
}

export function hasAdminRole(user: CareLinkUser | null): boolean {
  return Array.isArray(user?.roles) && (user.roles as string[]).some((r) => r === 'admin' || r === 'super_admin');
}

export function isSuperAdmin(user: CareLinkUser | null): boolean {
  return Array.isArray(user?.roles) && (user.roles as string[]).includes('super_admin');
}

export function hasPermission(user: CareLinkUser | null, code: string): boolean {
  if (isSuperAdmin(user)) return true;
  return Array.isArray(user?.permissions) ? (user.permissions as string[]).includes(code) : false;
}

async function recordActivity(event: string, metadata?: Record<string, unknown>): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const client = await getSupabaseClient();
  if (!client) return;
  try {
    await  (client as any).rpc('carelink_record_login_activity', { event, metadata: (metadata ?? {}) });
  } catch (err) {
    log.warn('auth', `activity ${event} recording failed`, err);
  }
}

/** Record a login security event server-side (real mode only; mock no-ops). */
export async function recordLoginActivity(metadata?: Record<string, unknown>): Promise<void> {
  await recordActivity('login_success', metadata);
}

/** Record a logout security event server-side (real mode only; mock no-ops). */
export async function recordLogoutActivity(): Promise<void> {
  await recordActivity('logout_success');
}