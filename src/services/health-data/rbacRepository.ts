/**
 * CareLink-AI — RBAC / provider membership repository (Step 10.5 §3/§22).
 *
 * Read-side access to the caller's own roles, memberships and doctor links.
 * Role/membership MUTATIONS only exist as the audited DB functions and are
 * super_admin-only — this repository deliberately exposes no client write
 * helpers for them. Empty when Supabase is unavailable.
 */

import { withClient } from './repository';
import type {
  DoctorUserLinkRow,
  ProviderKind,
  ProviderMembershipRow,
  UserRoleRow,
} from './types';

/** The current user's own granted roles (transparency; not authorization). */
export async function listMyRoles(): Promise<UserRoleRow[]> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return [];
    const res = await client.from('user_roles').select('*').eq('user_id', authData.user.id);
    if (res.error) throw res.error;
    return (res.data as UserRoleRow[]) ?? [];
  });
  return data ?? [];
}

/** The current user's own provider memberships (own-hospital/pharmacy/lab scope). */
export async function listMyProviderMemberships(): Promise<ProviderMembershipRow[]> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return [];
    const res = await client.from('provider_memberships').select('*').eq('user_id', authData.user.id);
    if (res.error) throw res.error;
    return (res.data as ProviderMembershipRow[]) ?? [];
  });
  return data ?? [];
}

/** Convenience: ids of providers of a given kind the caller is a member of. */
export async function listMyProviderIds(kind: ProviderKind): Promise<string[]> {
  const memberships = await listMyProviderMemberships();
  const column = kind === 'hospital' ? 'hospital_id' : kind === 'pharmacy' ? 'pharmacy_id' : 'lab_id';
  return memberships
    .filter((m) => m.provider_kind === kind)
    .map((m) => m[column])
    .filter((id): id is string => typeof id === 'string');
}

/** The current user's own doctor link (/status for doctor dashboards). */
export async function getMyDoctorLink(): Promise<DoctorUserLinkRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return null;
    const res = await client
      .from('doctor_user_links')
      .select('*')
      .eq('user_id', authData.user.id)
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data as DoctorUserLinkRow | null) ?? null;
  });
  return data;
}

/**
 * Role predicate helpers — these only REPORT about the caller themself (the
 * DB helpers reveal nothing beyond a boolean about auth.uid()). Use for UI
 * conditional rendering only; authorization is ALWAYS enforced by RLS.
 */
export async function isSuperAdmin(): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_is_super_admin');
    if (res.error) throw res.error;
    return res.data === true;
  });
  return data ?? false;
}

export async function isHospitalAdmin(hospitalId: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_is_hospital_admin', { hospital_uuid: hospitalId });
    if (res.error) throw res.error;
    return res.data === true;
  });
  return data ?? false;
}

export async function isPharmacyAdmin(pharmacyId: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_is_pharmacy_admin', { pharmacy_uuid: pharmacyId });
    if (res.error) throw res.error;
    return res.data === true;
  });
  return data ?? false;
}

export async function isLabAdmin(labId: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_is_lab_admin', { lab_uuid: labId });
    if (res.error) throw res.error;
    return res.data === true;
  });
  return data ?? false;
}

export async function isDoctorLinked(doctorId: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_is_doctor_linked', { doctor_uuid: doctorId });
    if (res.error) throw res.error;
    return res.data === true;
  });
  return data ?? false;
}
