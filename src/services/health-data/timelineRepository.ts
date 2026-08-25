/**
 * CareLink-AI — health timeline repository (Step 10.5 §12/§22).
 *
 * Patient-scoped chronological event stream. FK references are
 * ownership-enforced by DB triggers; this repository only links objects the
 * caller already owns. Null/empty when Supabase is unavailable.
 */

import { withClient, generateId } from './repository';
import type { HealthTimelineEventRow, HealthTimelineEventType } from './types';

export interface TimelineEventInput {
  familyProfileId?: string | null;
  eventType: HealthTimelineEventType;
  title: string;
  summary?: string | null;
  occurredAt?: string;
  medicalDocumentId?: string | null;
  medicalReportId?: string | null;
  appointmentId?: string | null;
  vaccinationRecordId?: string | null;
  recoveryCheckinId?: string | null;
  medicationScheduleId?: string | null;
  metadata?: Record<string, unknown>;
}

export async function listTimelineEvents(familyProfileId?: string): Promise<HealthTimelineEventRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client
      .from('health_timeline_events')
      .select('*')
      .order('occurred_at', { ascending: false });
    if (familyProfileId) q = q.eq('family_profile_id', familyProfileId);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as HealthTimelineEventRow[]) ?? [];
  });
  return data ?? [];
}

export async function addTimelineEvent(input: TimelineEventInput): Promise<HealthTimelineEventRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('health_timeline_events')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        event_type: input.eventType,
        title: input.title,
        summary: input.summary ?? null,
        ...(input.occurredAt ? { occurred_at: input.occurredAt } : {}),
        medical_document_id: input.medicalDocumentId ?? null,
        medical_report_id: input.medicalReportId ?? null,
        appointment_id: input.appointmentId ?? null,
        vaccination_record_id: input.vaccinationRecordId ?? null,
        recovery_checkin_id: input.recoveryCheckinId ?? null,
        medication_schedule_id: input.medicationScheduleId ?? null,
        metadata: input.metadata ?? {},
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as HealthTimelineEventRow;
  });
  return data;
}
