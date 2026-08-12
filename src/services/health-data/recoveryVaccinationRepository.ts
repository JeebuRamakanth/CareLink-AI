/**
 * CareLink-AI — recovery + vaccination repositories (Step 10).
 */

import { withClient, generateId } from './repository';
import type { RecoveryCheckInRow, RecoveryTrend, VaccinationRecordRow } from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

// --- Recovery -------------------------------------------------------------

export async function listRecoveryCheckIns(): Promise<RecoveryCheckInRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('recovery_checkins').select('*').order('recorded_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as RecoveryCheckInRow[]) ?? [];
  });
  return data ?? [];
}

export interface RecoveryCheckInInput {
  family_profile_id?: string | null;
  appointment_id?: string | null;
  condition_label?: string | null;
  trend: RecoveryTrend;
  note?: string | null;
}

export async function addRecoveryCheckIn(input: RecoveryCheckInInput): Promise<RecoveryCheckInRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('recovery_checkins')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        appointment_id: input.appointment_id ?? null,
        condition_label: input.condition_label ?? null,
        trend: input.trend,
        note: input.note ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as RecoveryCheckInRow;
  });
  return data;
}

// --- Vaccination ----------------------------------------------------------

export async function listVaccinationRecords(): Promise<VaccinationRecordRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('vaccination_records').select('*').order('administered_date', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as VaccinationRecordRow[]) ?? [];
  });
  return data ?? [];
}

export interface VaccinationInput {
  family_profile_id?: string | null;
  vaccine_name: string;
  dose_number?: number | null;
  administered_date?: string | null;
  next_due_date?: string | null;
  provider?: string | null;
  notes?: string | null;
}

export async function addVaccinationRecord(input: VaccinationInput): Promise<VaccinationRecordRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('vaccination_records')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        vaccine_name: input.vaccine_name,
        dose_number: input.dose_number ?? null,
        administered_date: input.administered_date ?? null,
        next_due_date: input.next_due_date ?? null,
        provider: input.provider ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as VaccinationRecordRow;
  });
  return data;
}
