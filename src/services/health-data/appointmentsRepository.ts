/**
 * CareLink-AI — appointments repository (Step 10).
 *
 * Persists appointment records to Supabase with RLS-scoped ownership. Returns
 * null/empty when Supabase is unavailable, so the existing localStorage-backed
 * AppointmentContext continues to work as the fallback source of truth.
 *
 * The existing Reviews → Hospital → Doctor → Booking → Appointments flow is
 * NOT changed — this repository is an optional persistence layer.
 */

import { withClient, generateId } from './repository';
import type {
  AppointmentEventRow,
  AppointmentEventType,
  AppointmentRow,
  AppointmentStatus,
  AppointmentType,
} from './types';
import type { SupabaseClient } from '@supabase/supabase-js';

export async function listAppointments(): Promise<AppointmentRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client.from('appointments').select('*').order('scheduled_date', { ascending: true });
    if (res.error) throw res.error;
    return (res.data as AppointmentRow[]) ?? [];
  });
  return data ?? [];
}

export interface AppointmentInput {
  family_profile_id?: string | null;
  doctor_id?: string | null;
  doctor_name?: string | null;
  specialty?: string | null;
  hospital_id?: string | null;
  hospital_name?: string | null;
  appointment_type?: AppointmentType | null;
  scheduled_date: string;
  scheduled_time: string;
  status?: AppointmentStatus;
  consultation_fee?: string | null;
  notes?: string | null;
  preparation_notes?: string | null;
  consultation_mode?: string | null;
  location?: string | null;
}

export async function createAppointment(
  input: AppointmentInput
): Promise<{ appointment: AppointmentRow | null; error: string | null }> {
  const { data, error } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const id = generateId();
    const res = await client
      .from('appointments')
      .insert({
        id,
        owner_id: userId,
        family_profile_id: input.family_profile_id ?? null,
        doctor_id: input.doctor_id ?? null,
        doctor_name: input.doctor_name ?? null,
        specialty: input.specialty ?? null,
        hospital_id: input.hospital_id ?? null,
        hospital_name: input.hospital_name ?? null,
        appointment_type: input.appointment_type ?? null,
        scheduled_date: input.scheduled_date,
        scheduled_time: input.scheduled_time,
        status: input.status ?? 'confirmed',
        consultation_fee: input.consultation_fee ?? null,
        notes: input.notes ?? null,
        preparation_notes: input.preparation_notes ?? null,
        consultation_mode: input.consultation_mode ?? null,
        location: input.location ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;

    // Append-only lifecycle event.
    await client.from('appointment_events').insert({
      id: generateId(),
      appointment_id: id,
      owner_id: userId,
      event_type: 'booked' satisfies AppointmentEventType,
    });

    return res.data as AppointmentRow;
  });
  return { appointment: data, error: error?.message ?? null };
}

export async function rescheduleAppointment(
  id: string,
  date: string,
  time: string
): Promise<AppointmentRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const prev = await client.from('appointments').select('scheduled_date,scheduled_time').eq('id', id).maybeSingle();
    const res = await client
      .from('appointments')
      .update({ scheduled_date: date, scheduled_time: time, status: 'rescheduled' })
      .eq('id', id)
      .select('*')
      .single();
    if (res.error) throw res.error;

    const prevRow = prev.data as { scheduled_date: string; scheduled_time: string } | null;
    await client.from('appointment_events').insert({
      id: generateId(),
      appointment_id: id,
      owner_id: userId,
      event_type: 'rescheduled' satisfies AppointmentEventType,
      previous_date: prevRow?.scheduled_date ?? null,
      previous_time: prevRow?.scheduled_time ?? null,
    });

    return res.data as AppointmentRow;
  });
  return data;
}

export async function cancelAppointment(
  id: string,
  reason: string
): Promise<AppointmentRow | null> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('appointments')
      .update({ status: 'cancelled', notes: reason })
      .eq('id', id)
      .select('*')
      .single();
    if (res.error) throw res.error;
    await client.from('appointment_events').insert({
      id: generateId(),
      appointment_id: id,
      owner_id: userId,
      event_type: 'cancelled' satisfies AppointmentEventType,
      reason,
    });
    return res.data as AppointmentRow;
  });
  return data;
}

export async function listAppointmentEvents(appointmentId: string): Promise<AppointmentEventRow[]> {
  const { data } = await withClient(async (client: SupabaseClient) => {
    const res = await client
      .from('appointment_events')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('occurred_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as AppointmentEventRow[]) ?? [];
  });
  return data ?? [];
}
