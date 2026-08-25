/**
 * CareLink-AI — appointment expansion repository (Step 10.5 §9/§22).
 *
 * Slots (public availability discovery), slot-linked booking (double-booking
 * is rejected by the DB partial unique indexes — surfaced as a safe error),
 * status history, cancellation records, reschedule events and reminders.
 * Step 10 appointments persistence is untouched; these are additive helpers.
 */

import { withClient, generateId } from './repository';
import type {
  AppointmentRow,
  AppointmentSlotRow,
  AppointmentStatusHistoryRow,
  AppointmentType,
  ReminderRow,
} from './types';

/* ----------------------------------- slots ----------------------------------- */

/** Public: open slots for a doctor from a date forward. */
export async function listOpenSlots(doctorId: string, fromDate?: string): Promise<AppointmentSlotRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client
      .from('appointment_slots')
      .select('*')
      .eq('doctor_id', doctorId)
      .eq('status', 'open')
      .order('slot_date', { ascending: true })
      .order('start_time', { ascending: true });
    if (fromDate) q = q.gte('slot_date', fromDate);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as AppointmentSlotRow[]) ?? [];
  });
  return data ?? [];
}

export interface SlotBookingInput {
  slot: AppointmentSlotRow;
  familyProfileId?: string | null;
  doctorName?: string | null;
  specialty?: string | null;
  hospitalName?: string | null;
  appointmentType?: AppointmentType | null;
  notes?: string | null;
}

/**
 * Book a slot. The DB unique indexes (active slot / active doctor moment)
 * reject double bookings — this returns a safe error instead of throwing.
 */
export async function bookSlot(
  input: SlotBookingInput
): Promise<{ appointment: AppointmentRow | null; error: string | null }> {
  const { data, error } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const id = generateId();
    const res = await client
      .from('appointments')
      .insert({
        id,
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        doctor_id: input.slot.doctor_id,
        doctor_name: input.doctorName ?? null,
        specialty: input.specialty ?? null,
        hospital_id: input.slot.hospital_id,
        hospital_name: input.hospitalName ?? null,
        appointment_type: input.appointmentType ?? null,
        scheduled_date: input.slot.slot_date,
        scheduled_time: input.slot.start_time,
        status: 'confirmed',
        slot_id: input.slot.id,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;

    await client.from('appointment_events').insert({
      id: generateId(),
      appointment_id: id,
      owner_id: userId,
      event_type: 'booked',
    });

    return res.data as AppointmentRow;
  });
  return { appointment: data, error: error?.message ?? null };
}

/* ------------------------------ lifecycle records ------------------------------ */

export async function listStatusHistory(appointmentId: string): Promise<AppointmentStatusHistoryRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('appointment_status_history')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('changed_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as AppointmentStatusHistoryRow[]) ?? [];
  });
  return data ?? [];
}

/** One cancellation record per appointment (DB unique); owner-scoped. */
export async function recordCancellation(appointmentId: string, reason?: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client.from('cancellation_records').insert({
      id: generateId(),
      owner_id: userId,
      appointment_id: appointmentId,
      reason: reason ?? null,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

export async function recordReschedule(
  appointmentId: string,
  newDate: string,
  newTime: string,
  reason?: string
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client.from('reschedule_events').insert({
      id: generateId(),
      owner_id: userId,
      appointment_id: appointmentId,
      new_date: newDate,
      new_time: newTime,
      reason: reason ?? null,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

/* --------------------------------- reminders --------------------------------- */

export async function createAppointmentReminder(appointmentId: string, remindAt: string): Promise<ReminderRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('reminders')
      .insert({
        id: generateId(),
        owner_id: userId,
        appointment_id: appointmentId,
        remind_at: remindAt,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as ReminderRow;
  });
  return data;
}

export async function listAppointmentReminders(appointmentId: string): Promise<ReminderRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('reminders')
      .select('*')
      .eq('appointment_id', appointmentId)
      .order('remind_at', { ascending: true });
    if (res.error) throw res.error;
    return (res.data as ReminderRow[]) ?? [];
  });
  return data ?? [];
}
