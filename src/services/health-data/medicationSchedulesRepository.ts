/**
 * CareLink-AI — medication scheduling repository (Step 10.5 §10/§22).
 *
 * Patient-owned schedules/logs/reminders. The T-30 reminder offset is enforced
 * by a database trigger — this repository never computes reminder_time itself.
 * dosage_source is constrained (clinician | verified | user_entered_prescription);
 * the AI never writes here. Null/empty on Supabase outage → local fallback.
 */

import { withClient, generateId } from './repository';
import type {
  MedicationLogRow,
  MedicationLogStatus,
  MedicationScheduleRow,
  MedicineMasterRow,
  DosageSource,
  MedicationFrequency,
  ScheduledMedicationReminderRow,
} from './types';

export async function searchMedicineCatalog(query: string): Promise<MedicineMasterRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('medicine_master')
      .select('*')
      .eq('is_active', true)
      .ilike('name', `%${query}%`)
      .limit(20);
    if (res.error) throw res.error;
    return (res.data as MedicineMasterRow[]) ?? [];
  });
  return data ?? [];
}

export interface MedicationScheduleInput {
  familyProfileId?: string | null;
  medicineMasterId?: string | null;
  medicineName: string;
  dosageLabel?: string | null;
  dosageSource: DosageSource;
  frequency: MedicationFrequency;
  timesOfDay: string[];
  startDate?: string;
  endDate?: string | null;
  notes?: string | null;
}

export async function listMedicationSchedules(): Promise<MedicationScheduleRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('medication_schedules').select('*').order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as MedicationScheduleRow[]) ?? [];
  });
  return data ?? [];
}

export async function createMedicationSchedule(
  input: MedicationScheduleInput
): Promise<MedicationScheduleRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('medication_schedules')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        medicine_master_id: input.medicineMasterId ?? null,
        medicine_name: input.medicineName,
        dosage_label: input.dosageLabel ?? null,
        dosage_source: input.dosageSource,
        frequency: input.frequency,
        times_of_day: input.timesOfDay,
        ...(input.startDate ? { start_date: input.startDate } : {}),
        end_date: input.endDate ?? null,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as MedicationScheduleRow;
  });
  return data;
}

export async function setMedicationScheduleActive(id: string, active: boolean): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('medication_schedules').update({ active }).eq('id', id).select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

export async function logDose(
  scheduleId: string,
  scheduledFor: string,
  status: MedicationLogStatus,
  familyProfileId?: string | null
): Promise<MedicationLogRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('medication_logs')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: familyProfileId ?? null,
        medication_schedule_id: scheduleId,
        scheduled_for: scheduledFor,
        taken_at: status === 'taken' ? new Date().toISOString() : null,
        status,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as MedicationLogRow;
  });
  return data;
}

export async function listMedicationLogs(scheduleId: string): Promise<MedicationLogRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('medication_logs')
      .select('*')
      .eq('medication_schedule_id', scheduleId)
      .order('scheduled_for', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as MedicationLogRow[]) ?? [];
  });
  return data ?? [];
}

/**
 * Create a reminder for a dose. The database trigger overrides any supplied
 * reminder_time to exactly schedule_time - 30 minutes — never bypass it.
 */
export async function createMedicationReminder(
  scheduleId: string,
  scheduleTime: string,
  familyProfileId?: string | null
): Promise<ScheduledMedicationReminderRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('scheduled_medication_reminders')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: familyProfileId ?? null,
        medication_schedule_id: scheduleId,
        schedule_time: scheduleTime,
        // placeholder; DB trigger rewrites to schedule_time - 30 min
        reminder_time: scheduleTime,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as ScheduledMedicationReminderRow;
  });
  return data;
}

export async function listUpcomingMedicationReminders(): Promise<ScheduledMedicationReminderRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('scheduled_medication_reminders')
      .select('*')
      .eq('status', 'scheduled')
      .gte('reminder_time', new Date().toISOString())
      .order('reminder_time', { ascending: true });
    if (res.error) throw res.error;
    return (res.data as ScheduledMedicationReminderRow[]) ?? [];
  });
  return data ?? [];
}
