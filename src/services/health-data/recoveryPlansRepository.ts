/**
 * CareLink-AI — recovery plans repository (Step 10.5 §11/§22).
 *
 * Patient-scoped plans, follow-up questions, escalation events. Step 10
 * recovery_checkins is untouched. Null/empty when Supabase unavailable.
 */

import { withClient, generateId } from './repository';
import type {
  RecoveryEscalationEventRow,
  RecoveryFollowupQuestionRow,
  RecoveryPlanRow,
  RecoveryTrend,
} from './types';

export async function listRecoveryPlans(): Promise<RecoveryPlanRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('recovery_plans').select('*').order('started_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as RecoveryPlanRow[]) ?? [];
  });
  return data ?? [];
}

export interface RecoveryPlanInput {
  familyProfileId?: string | null;
  appointmentId?: string | null;
  conditionLabel?: string | null;
  plan?: Record<string, unknown>;
}

export async function createRecoveryPlan(input: RecoveryPlanInput): Promise<RecoveryPlanRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('recovery_plans')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        appointment_id: input.appointmentId ?? null,
        condition_label: input.conditionLabel ?? null,
        plan: input.plan ?? {},
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as RecoveryPlanRow;
  });
  return data;
}

export async function completeRecoveryPlan(id: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('recovery_plans')
      .update({ status: 'completed', ended_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

export async function listFollowupQuestions(planId: string): Promise<RecoveryFollowupQuestionRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('recovery_followup_questions')
      .select('*')
      .eq('recovery_plan_id', planId)
      .order('asked_at');
    if (res.error) throw res.error;
    return (res.data as RecoveryFollowupQuestionRow[]) ?? [];
  });
  return data ?? [];
}

export async function addFollowupQuestion(
  planId: string,
  question: string
): Promise<RecoveryFollowupQuestionRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('recovery_followup_questions')
      .insert({ id: generateId(), owner_id: userId, recovery_plan_id: planId, question })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as RecoveryFollowupQuestionRow;
  });
  return data;
}

export async function answerFollowupQuestion(id: string, answer: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('recovery_followup_questions')
      .update({ answer, answered_at: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

export interface EscalationInput {
  familyProfileId?: string | null;
  planId?: string | null;
  checkinId?: string | null;
  trendSnapshot?: RecoveryTrend | null;
  reason?: string | null;
}

export async function recordEscalation(input: EscalationInput): Promise<RecoveryEscalationEventRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('recovery_escalation_events')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        recovery_plan_id: input.planId ?? null,
        checkin_id: input.checkinId ?? null,
        trend_snapshot: input.trendSnapshot ?? null,
        reason: input.reason ?? null,
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as RecoveryEscalationEventRow;
  });
  return data;
}
