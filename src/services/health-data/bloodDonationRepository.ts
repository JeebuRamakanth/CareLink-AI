/**
 * CareLink-AI — blood donation network repository (Step 10.5 §15/§22).
 *
 * Donor identity is NEVER cross-user readable — matches show only opaque ids;
 * contact details are exchanged exclusively through the guarded, audited
 * disclosure RPCs after donor consent. The 4-month cooldown is enforced in
 * the database (function + trigger) and cannot be bypassed from here.
 */

import { withClient, generateId } from './repository';
import type {
  BloodGroupCode,
  BloodRequestRow,
  BloodRequestUrgency,
  DonorMatchResultRow,
  DonorNotificationRow,
  DonorProfileRow,
  DonorRequestRow,
} from './types';

/* --------------------------------- donor side --------------------------------- */

export async function getMyDonorProfile(): Promise<DonorProfileRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return null;
    const res = await client
      .from('donor_profiles')
      .select('*')
      .eq('owner_id', authData.user.id)
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data as DonorProfileRow | null) ?? null;
  });
  return data;
}

export async function registerAsDonor(input: {
  bloodGroupCode: BloodGroupCode;
  city?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
}): Promise<DonorProfileRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('donor_profiles')
      .insert({
        id: generateId(),
        owner_id: userId,
        blood_group_code: input.bloodGroupCode,
        city: input.city ?? null,
        phone: input.phone ?? null,
        date_of_birth: input.dateOfBirth ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as DonorProfileRow;
  });
  return data;
}

export async function setDonorActive(isActive: boolean): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return false;
    const res = await client
      .from('donor_profiles')
      .update({ is_active: isActive })
      .eq('owner_id', authData.user.id)
      .select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

/** Record the caller's own donation. Rejected by DB when within the 4-month cooldown. */
export async function recordDonation(donorProfileId: string, donatedOn: string, hospitalId?: string | null): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_record_donation', {
      donor_profile_uuid: donorProfileId,
      p_donated_on: donatedOn,
      hospital_uuid: hospitalId ?? null,
    });
    if (res.error) throw res.error;
    return (res.data as string | null) ?? null;
  });
  return data;
}

/** Requests addressed to the caller as a donor (minimal fields, no patient identity). */
export async function listMyDonorRequests(): Promise<DonorRequestRow[]> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return [];
    const profile = await client.from('donor_profiles').select('id').eq('owner_id', authData.user.id).maybeSingle();
    if (profile.error || !profile.data) return [];
    const res = await client
      .from('donor_requests')
      .select('*')
      .eq('donor_profile_id', (profile.data as Pick<DonorProfileRow, 'id'>).id)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as DonorRequestRow[]) ?? [];
  });
  return data ?? [];
}

export async function listMyDonorNotifications(): Promise<DonorNotificationRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('donor_notifications')
      .select('*')
      .order('sent_at', { ascending: false })
      .limit(50);
    if (res.error) throw res.error;
    return (res.data as DonorNotificationRow[]) ?? [];
  });
  return data ?? [];
}

/** Donor answers YES/NO. NO discloses nothing; YES unlocks minimum disclosure. */
export async function respondToDonorRequest(donorRequestId: string, accept: boolean): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_donor_respond', {
      donor_request_uuid: donorRequestId,
      accept,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

/** Donor: requester's minimum contact — only after own YES, audited. */
export async function getRequesterContact(donorRequestId: string): Promise<Record<string, unknown> | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_get_requester_contact', {
      donor_request_uuid: donorRequestId,
    });
    if (res.error) throw res.error;
    return (res.data as Record<string, unknown> | null) ?? null;
  });
  return data;
}

/* ------------------------------- requester side ------------------------------- */

export async function listMyBloodRequests(): Promise<BloodRequestRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('blood_requests').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as BloodRequestRow[]) ?? [];
  });
  return data ?? [];
}

export async function createBloodRequest(input: {
  bloodGroupCode: BloodGroupCode;
  unitsNeeded: number;
  city?: string | null;
  urgency?: BloodRequestUrgency;
  hospitalId?: string | null;
  familyProfileId?: string | null;
}): Promise<BloodRequestRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('blood_requests')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        blood_group_code: input.bloodGroupCode,
        units_needed: input.unitsNeeded,
        city: input.city ?? null,
        urgency: input.urgency ?? 'routine',
        hospital_id: input.hospitalId ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as BloodRequestRow;
  });
  return data;
}

export async function cancelBloodRequest(bloodRequestId: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('blood_requests')
      .update({ status: 'cancelled' })
      .eq('id', bloodRequestId)
      .select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

/** Run matching for the caller's own open request. Returns the NEW match count. */
export async function matchDonors(bloodRequestId: string): Promise<number> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_match_donors', { blood_request_uuid: bloodRequestId });
    if (res.error) throw res.error;
    return typeof res.data === 'number' ? res.data : 0;
  });
  return data ?? 0;
}

/** Match results for own requests — opaque donor ids only, no identity. */
export async function listDonorMatches(bloodRequestId: string): Promise<DonorMatchResultRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('donor_match_results')
      .select('*')
      .eq('blood_request_id', bloodRequestId)
      .order('matched_at');
    if (res.error) throw res.error;
    return (res.data as DonorMatchResultRow[]) ?? [];
  });
  return data ?? [];
}

export async function sendDonorRequest(bloodRequestId: string, donorProfileId: string): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_send_donor_request', {
      blood_request_uuid: bloodRequestId,
      donor_profile_uuid: donorProfileId,
    });
    if (res.error) throw res.error;
    return (res.data as string | null) ?? null;
  });
  return data;
}

/** Requester: status of requests they sent (no donor identity columns exist). */
export async function listOutgoingDonorRequests(bloodRequestId: string): Promise<DonorRequestRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('donor_requests')
      .select('*')
      .eq('blood_request_id', bloodRequestId)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as DonorRequestRow[]) ?? [];
  });
  return data ?? [];
}

/** Requester: donor minimum contact — only after donor YES, audited. */
export async function getDonorContact(donorRequestId: string): Promise<Record<string, unknown> | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_get_donor_contact', {
      donor_request_uuid: donorRequestId,
    });
    if (res.error) throw res.error;
    return (res.data as Record<string, unknown> | null) ?? null;
  });
  return data;
}
