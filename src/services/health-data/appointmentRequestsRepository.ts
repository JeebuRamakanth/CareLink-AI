/**
 * CareLink-AI — appointment REQUESTS repository (Step 22).
 *
 * Client boundary over the guarded RPCs in
 * `supabase/migrations/0033_step22_appointment_request_workflow.sql`:
 *
 *   carelink_request_appointment(...)          → create a PENDING request
 *   carelink_list_my_appointment_requests()    → owner-scoped read
 *   carelink_cancel_appointment_request(...)   → owner cancel (pending only)
 *
 * A REQUEST is NOT a confirmed appointment. This repository never writes to
 * `appointments`; confirmation is an authorized, audited server action. When
 * Supabase is unavailable every function returns null/empty so the UI keeps its
 * honest local fallback instead of pretending a booking was confirmed.
 */

import { withClient, generateId } from './repository';
import { isSupabaseConfigured } from '../supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export type AppointmentRequestStatus = 'pending' | 'confirmed' | 'rejected' | 'cancelled' | 'completed';

export interface AppointmentRequestRow {
  id: string;
  owner_id: string;
  family_profile_id: string | null;
  doctor_id: string | null;
  doctor_name: string | null;
  specialty: string | null;
  hospital_id: string | null;
  hospital_name: string | null;
  appointment_type: string | null;
  scheduled_date: string;
  scheduled_time: string;
  slot_id: string | null;
  reason: string | null;
  status: AppointmentRequestStatus;
  request_key: string;
  confirmed_appointment_id: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppointmentRequestInput {
  doctorId: string;
  hospitalId: string;
  scheduledDate: string;
  scheduledTime: string;
  appointmentType?: string;
  reason?: string | null;
  familyProfileId?: string | null;
  slotId?: string | null;
  /** Client-generated idempotency key; repeated submissions return the same row. */
  requestKey?: string;
}

export interface AppointmentRequestResult {
  request: AppointmentRequestRow | null;
  /** 'created' when persisted server-side, 'unavailable' when no backend. */
  status: 'created' | 'unavailable' | 'error';
  error: string | null;
}

/** Generate a stable idempotency key for a booking attempt. */
export function newRequestKey(): string {
  return generateId();
}

/**
 * Create a pending appointment request. Returns `unavailable` (no throw) when
 * the backend is not configured so the caller can fall back honestly.
 */
export async function requestAppointment(input: AppointmentRequestInput): Promise<AppointmentRequestResult> {
  if (!isSupabaseConfigured()) {
    return { request: null, status: 'unavailable', error: null };
  }
  const key = input.requestKey ?? newRequestKey();
  const { data, error } = await withClient(async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('carelink_request_appointment', {
      p_doctor_id: input.doctorId,
      p_hospital_id: input.hospitalId,
      p_scheduled_date: input.scheduledDate,
      p_scheduled_time: input.scheduledTime,
      p_appointment_type: input.appointmentType ?? 'Consultation',
      p_reason: input.reason ?? null,
      p_family_profile_id: input.familyProfileId ?? null,
      p_slot_id: input.slotId ?? null,
      p_request_key: key,
    });
    if (error) throw error;
    return data as AppointmentRequestRow;
  });
  if (error) return { request: null, status: 'error', error: error.message };
  return { request: data, status: 'created', error: null };
}

/** Owner-scoped list of the caller's appointment requests. */
export async function listMyAppointmentRequests(): Promise<AppointmentRequestRow[]> {
  if (!isSupabaseConfigured()) return [];
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('carelink_list_my_appointment_requests');
    if (error) throw error;
    return (data as AppointmentRequestRow[]) ?? [];
  });
  return data ?? [];
}

/** Cancel a still-pending request owned by the caller. */
export async function cancelAppointmentRequest(
  requestId: string,
  note?: string
): Promise<AppointmentRequestRow | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await withClient(async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('carelink_cancel_appointment_request', {
      p_request_id: requestId,
      p_note: note ?? null,
    });
    if (error) throw error;
    return data as AppointmentRequestRow;
  });
  return data;
}
