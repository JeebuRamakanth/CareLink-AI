/**
 * CareLink-AI — emergency + saved-providers + audit repositories (Step 10).
 *
 * Emergency events are persisted ONLY when an emergency intent was explicitly
 * detected — ordinary symptom searches never create a permanent record.
 */

import { withClient, generateId } from './repository';
import type {
  AuditEventRow,
  EmergencyEventRow,
  SavedDoctorRow,
  SavedHospitalRow,
  SavedLabRow,
  SavedPharmacyRow,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Emergency (minimum data, only on real emergency intent) --------------

export interface EmergencyEventInput {
  family_profile_id?: string | null;
  severity?: string | null;
  indicator_label?: string | null;
  guidance?: unknown[];
  contacts?: unknown[];
  metadata?: Record<string, unknown>;
}

export async function recordEmergencyEvent(input: EmergencyEventInput): Promise<EmergencyEventRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('emergency_events')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        severity: input.severity ?? null,
        indicator_label: input.indicator_label ?? null,
        guidance: input.guidance ?? [],
        contacts: input.contacts ?? [],
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as EmergencyEventRow;
  });
  return data;
}

// --- Saved providers -----------------------------------------------------

export async function listSavedHospitals(): Promise<SavedHospitalRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('saved_hospitals').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as SavedHospitalRow[]) ?? [];
  });
  return data ?? [];
}

export async function saveHospital(input: { hospital_id: string; detail_slug: string; name?: string | null; family_profile_id?: string | null }): Promise<SavedHospitalRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('saved_hospitals')
      .insert({ id: generateId(), owner_id: userId, family_profile_id: input.family_profile_id ?? null, hospital_id: input.hospital_id, detail_slug: input.detail_slug, name: input.name ?? null })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as SavedHospitalRow;
  });
  return data;
}

export async function listSavedDoctors(): Promise<SavedDoctorRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('saved_doctors').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as SavedDoctorRow[]) ?? [];
  });
  return data ?? [];
}

export async function listSavedPharmacies(): Promise<SavedPharmacyRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('saved_pharmacies').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as SavedPharmacyRow[]) ?? [];
  });
  return data ?? [];
}

export async function listSavedLabs(): Promise<SavedLabRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('saved_labs').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as SavedLabRow[]) ?? [];
  });
  return data ?? [];
}

// --- Audit (server-side normally; read-only here) ------------------------

export async function listAuditEvents(): Promise<AuditEventRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('audit_events').select('*').order('created_at', { ascending: false }).limit(100);
    if (res.error) throw res.error;
    return (res.data as AuditEventRow[]) ?? [];
  });
  return data ?? [];
}
