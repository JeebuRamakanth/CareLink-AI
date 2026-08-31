/**
 * CareLink-AI — admin data repository (server-authorized real-data reads).
 *
 * Every read rides the caller's own Supabase JWT through SECURITY DEFINER RPCs that
 * re-check role membership + permission codes + suspension inside the database.
 *
 * The UI only renders what the DB authorizes; there are no client-invented roles,
 * metrics, or fallback fake datasets. When a call fails or the backend is not
 * configured, every view shows an honest loading/empty/error state.
 */

import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';

export interface AdminUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  account_status: string;
  roles: string[];
  last_login_at: string | null;
  created_at: string;
}

export interface AdminAuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  target_table: string | null;
  target_id: string | null;
  safe_message: string | null;
  created_at: string;
}

export interface AdminActivityRow {
  id: string;
  user_id: string;
  event: string;
  metadata: unknown;
  created_at: string;
}

export interface AdminProviderRow {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  data_status: string | null;
  verification_status: string | null;
  created_at: string;
}

export interface AdminReviewRow {
  id: string;
  owner_id: string;
  rating: number | null;
  status: string;
  title: string | null;
  created_at: string;
}

export interface AdminAppointmentRow {
  id: string;
  owner_id: string;
  doctor_name: string | null;
  hospital_name: string | null;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  created_at: string;
}

export interface AdminNotificationRow {
  id: string;
  owner_id: string;
  kind: string;
  title: string;
  status: string;
  created_at: string;
}

export interface AdminStatRow {
  metric: string;
  value: number;
}

export type AdminResult<T> = { data: T; error: null } | { data: null; error: string };

const notConfigured = (): AdminResult<never> => ({ data: null, error: 'Admin backend is not configured.' });

async function rpc<T>(name: string, params?: Record<string, unknown>): Promise<T | null> {
  if (!isSupabaseConfigured()) return null;
  const client = await getSupabaseClient();
  if (!client) return null;
try { const { data, error } = await (client as any).rpc(name, params); if (error) return null; return (data as T) ?? null; } catch { return null; }
}

async function listRows<T>(name: string): Promise<AdminResult<T[]>> {
  if (!isSupabaseConfigured()) return notConfigured();
  const data = await rpc<T[]>(name);
  if (!data) return { data: null, error: 'Unable to load data. The admin gateway may be unavailable.' };
  return { data, error: null };
}

/** List every user (super_admin + users.manage only; enforced server-side). */
export function adminListUsers(): Promise<AdminResult<AdminUserRow[]>> {
  return listRows<AdminUserRow>('carelink_admin_list_users');
}

export function adminListSecurityActivity(): Promise<AdminResult<AdminActivityRow[]>> {
  return listRows<AdminActivityRow>('carelink_admin_list_security_activity');
}

export function adminListAudit(): Promise<AdminResult<AdminAuditRow[]>> {
  return listRows<AdminAuditRow>('carelink_admin_list_audit');
}

export function adminListProviders(kind: string): Promise<AdminResult<AdminProviderRow[]>> {
  return listRows<AdminProviderRow>(`carelink_admin_list_${kind}`);
}

export function adminListReviews(): Promise<AdminResult<AdminReviewRow[]>> {
  return listRows<AdminReviewRow>('carelink_admin_list_reviews');
}

export function adminListAppointments(): Promise<AdminResult<AdminAppointmentRow[]>> {
  return listRows<AdminAppointmentRow>('carelink_admin_list_appointments');
}

export function adminListNotifications(): Promise<AdminResult<AdminNotificationRow[]>> {
  return listRows<AdminNotificationRow>('carelink_admin_list_notifications');
}

export async function adminGetStats(): Promise<AdminResult<AdminStatRow[]>> {
  return listRows<AdminStatRow>('carelink_admin_stats');
}

/** Server-enforced account status change (suspend / reactivate / disable). */
export async function adminSetAccountStatus(
  userId: string,
  status: 'active' | 'suspended' | 'disabled'
): Promise<AdminResult<null>> {
  const data = await rpc<null>('carelink_admin_set_account_status', { target_user_id: userId, new_status: status });
  if (!isSupabaseConfigured()) return notConfigured();
  if (data === undefined) return { data: null, error: 'Status change failed on the server.' };
  return { data: null, error: null };
}

/** Server-enforced role grant (super_admin only; user_roles unique constraint). */
export async function adminGrantRole(targetUser: string, roleCode: string): Promise<AdminResult<null>> {
  const data = await rpc<null>('carelink_grant_role', { target_user: targetUser, role_code: roleCode });
  if (!isSupabaseConfigured()) return notConfigured();
  if (data === undefined) return { data: null, error: 'Role grant failed on the server.' };
  return { data: null, error: null };
}

export async function adminRevokeRole(targetUser: string, roleCode: string): Promise<AdminResult<null>> {
  const data = await rpc<null>('carelink_revoke_role', { target_user: targetUser, role_code: roleCode });
  if (!isSupabaseConfigured()) return notConfigured();
  if (data === undefined) return { data: null, error: 'Role revoke failed on the server.' };
  return { data: null, error: null };
}