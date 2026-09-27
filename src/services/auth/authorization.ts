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
  return user?.accountStatus === 'suspended' || user?.accountStatus === 'disabled';
}

/**
 * Role hierarchy ranks — the SINGLE source of truth for "at least this role"
 * checks in the UI. Mirrors the database hierarchy enforced by
 * `carelink_has_permission_or_higher` (patient < … < admin < super_admin).
 */
export const ROLE_RANK: Record<string, number> = {
  patient: 0,
  doctor: 1,
  hospital_admin: 2,
  lab_admin: 2,
  pharmacy_admin: 2,
  admin: 3,
  super_admin: 4,
};

/** Highest rank among the user's server-resolved roles (0 when none). */
function highestRank(user: CareLinkUser | null): number {
  const roles = Array.isArray(user?.roles) ? (user?.roles as string[]) : [];
  return roles.reduce((max, r) => Math.max(max, ROLE_RANK[r] ?? 0), 0);
}

/**
 * Centralized "role or higher" check. SUPER_ADMIN satisfies ADMIN; ADMIN does
 * NOT satisfy SUPER_ADMIN. Never derived from localStorage/URL/user_metadata —
 * only from server-resolved `user.roles`; a suspended/disabled account always
 * fails (matching the backend status-aware predicates).
 */
export function hasRoleOrHigher(user: CareLinkUser | null, requiredRole: string): boolean {
  if (!user || isSuspended(user)) return false;
  return highestRank(user) >= (ROLE_RANK[requiredRole] ?? 0);
}

export function hasAdminRole(user: CareLinkUser | null): boolean {
  // Admin area = admin floor or higher (super_admin inherits it).
  return hasRoleOrHigher(user, 'admin');
}

export function isSuperAdmin(user: CareLinkUser | null): boolean {
  return hasRoleOrHigher(user, 'super_admin');
}

export function hasPermission(user: CareLinkUser | null, code: string): boolean {
  if (!user || isSuspended(user)) return false;
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

/** Login lanes are intent only; they gate the destination, never authorization. */
export type LoginLane = 'patient' | 'admin' | 'super_admin';

/**
 * Record a login security event server-side (real mode only; mock no-ops).
 *
 * The recorded event is determined by the SELECTED LANE plus the server-verified
 * authorization — never by role alone:
 *   - suspended/disabled account        → `suspended_login_denied`
 *   - lane=admin, user lacks admin      → `admin_login_denied`
 *   - lane=super_admin, user lacks SA   → `super_admin_login_denied`
 *   - lane=admin, authorized            → `admin_login_success`
 *   - lane=super_admin, authorized      → `super_admin_login_success`
 *   - lane=patient (or none)            → `login_success`
 * Returns the event name recorded (useful for the caller/UX).
 */
export async function recordLoginActivity(
  user: CareLinkUser | null,
  lane: LoginLane = 'patient',
  metadata?: Record<string, unknown>,
): Promise<string> {
  let event: string;
  if (!user) return '';
  if (isSuspended(user)) {
    event = 'suspended_login_denied';
  } else if (lane === 'super_admin') {
    event = isSuperAdmin(user) ? 'super_admin_login_success' : 'super_admin_login_denied';
  } else if (lane === 'admin') {
    event = hasAdminRole(user) ? 'admin_login_success' : 'admin_login_denied';
  } else {
    event = 'login_success';
  }
  await recordActivity(event, { ...(metadata ?? {}), lane, roles: (user.roles ?? []).join(',') });
  return event;
}

/** Record a denied admin-area access attempt (server-side, auditable). */
export async function recordAdminAccessDenied(metadata?: Record<string, unknown>): Promise<void> {
  await recordActivity('admin_access_denied', metadata);
}

/**
 * Record a denied ADMIN or SUPER-ADMIN login-lane attempt. The UI never
 * authorizes; it only records the intent so operators can audit who tried to
 * enter an administrative lane without a server-side role. Distinguishes the
 * two lanes via the DB-approved `denied_admin_access` /
 * `denied_super_admin_access` event vocabulary (Step 17) and the lane-specific
 * `admin_login_denied` / `super_admin_login_denied` events (Step 19).
 */
export async function recordDeniedAdminAccess(
  requested: 'admin' | 'super_admin',
  metadata?: Record<string, unknown>
): Promise<void> {
  const legacy = requested === 'super_admin' ? 'denied_super_admin_access' : 'denied_admin_access';
  const laneEvent = requested === 'super_admin' ? 'super_admin_login_denied' : 'admin_login_denied';
  await recordActivity(legacy, { ...(metadata ?? {}), requested } as Record<string, unknown>);
  await recordActivity(laneEvent, { ...(metadata ?? {}), requested } as Record<string, unknown>);
}

/**
 * Record an AI tool attempt/action security event (Step 17 §46). The DB
 * vocabulary accepts `ai_tool_attempt` (every attempt incl. denials) and
 * `ai_tool_action` (successful mutations). Safe metadata only — never PHI.
 */
export async function recordAIActivity(
  event: 'ai_tool_attempt' | 'ai_tool_action',
  metadata?: Record<string, unknown>
): Promise<void> {
  await recordActivity(event, metadata);
}

/** Record a logout security event server-side (real mode only; mock no-ops. */
export async function recordLogoutActivity(): Promise<void> {
  await recordActivity('logout');
}