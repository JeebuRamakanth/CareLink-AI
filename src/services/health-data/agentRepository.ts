/**
 * CareLink-AI — agent persistence repository (Step 10.5 §7/§8/§22).
 *
 * Owner-scoped persistence for recommendation provenance and AI context
 * backend rows (snapshots/intents/actions/feedback/followups). This is NOT a
 * second AI system — it only persists what the existing Step 13 agent
 * produces. The AI gateway/orchestrator remain the intelligence layer; no
 * arbitrary table access is ever introduced here.
 *
 * Integration points (used by AgentContext/orchestrator when persistence is
 * enabled): persistSnapshot, persistIntent, persistFeedback,
 * persistRecommendation, listFollowups.
 */

import { withClient, generateId } from './repository';
import type {
  AgentActionRow,
  AgentFeedbackRow,
  AgentFollowupRow,
  AgentIntentRow,
  AgentRecommendationRow,
  PatientContextSnapshotRow,
} from './types';

/* ---------------------------------- snapshots ---------------------------------- */

export interface SnapshotInput {
  familyProfileId?: string | null;
  conversationId?: string | null;
  snapshot: Record<string, unknown>;
  language?: string;
}

/** Persist a bounded, redacted snapshot (already built by contextSnapshot.ts). */
export async function persistSnapshot(input: SnapshotInput): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('patient_context_snapshots')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        conversation_id: input.conversationId ?? null,
        snapshot: input.snapshot,
        language: input.language ?? 'English',
      })
      .select('id')
      .single();
    if (res.error) throw res.error;
    return (res.data as Pick<PatientContextSnapshotRow, 'id'>).id;
  });
  return data;
}

export async function listSnapshots(conversationId?: string): Promise<PatientContextSnapshotRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client
      .from('patient_context_snapshots')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20);
    if (conversationId) q = q.eq('conversation_id', conversationId);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as PatientContextSnapshotRow[]) ?? [];
  });
  return data ?? [];
}

/* ----------------------------------- intents ----------------------------------- */

export interface IntentInput {
  conversationId?: string | null;
  messageId?: string | null;
  intent: string;
  confidence?: 'low' | 'medium' | 'high' | null;
}

export async function persistIntent(input: IntentInput): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('agent_intents')
      .insert({
        id: generateId(),
        owner_id: userId,
        conversation_id: input.conversationId ?? null,
        message_id: input.messageId ?? null,
        intent: input.intent,
        confidence: input.confidence ?? null,
      })
      .select('id')
      .single();
    if (res.error) throw res.error;
    return (res.data as Pick<AgentIntentRow, 'id'>).id;
  });
  return data;
}

/* ----------------------------------- actions ----------------------------------- */

export interface ActionInput {
  conversationId?: string | null;
  action: string;
  parameters?: Record<string, unknown>;
  status?: 'suggested' | 'completed' | 'dismissed';
}

export async function persistAction(input: ActionInput): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('agent_actions')
      .insert({
        id: generateId(),
        owner_id: userId,
        conversation_id: input.conversationId ?? null,
        action: input.action,
        parameters: input.parameters ?? {},
        status: input.status ?? 'suggested',
      })
      .select('id')
      .single();
    if (res.error) throw res.error;
    return (res.data as Pick<AgentActionRow, 'id'>).id;
  });
  return data;
}

export async function setActionStatus(
  actionId: string,
  status: 'suggested' | 'completed' | 'dismissed'
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('agent_actions').update({ status }).eq('id', actionId).select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

/* ---------------------------------- feedback ---------------------------------- */

export interface FeedbackInput {
  conversationId?: string | null;
  messageId?: string | null;
  rating: -1 | 0 | 1;
  comment?: string | null;
}

export async function persistFeedback(input: FeedbackInput): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('agent_feedback')
      .insert({
        id: generateId(),
        owner_id: userId,
        conversation_id: input.conversationId ?? null,
        message_id: input.messageId ?? null,
        rating: input.rating,
        comment: input.comment ?? null,
      })
      .select('id')
      .single();
    if (res.error) throw res.error;
    return (res.data as Pick<AgentFeedbackRow, 'id'>).id;
  });
  return data;
}

/* ---------------------------------- follow-ups ---------------------------------- */

export interface FollowupInput {
  conversationId?: string | null;
  question: string;
  sourceIntent?: string | null;
  dueAt?: string | null;
}

export async function persistFollowup(input: FollowupInput): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('agent_followups')
      .insert({
        id: generateId(),
        owner_id: userId,
        conversation_id: input.conversationId ?? null,
        question: input.question,
        source_intent: input.sourceIntent ?? null,
        due_at: input.dueAt ?? null,
      })
      .select('id')
      .single();
    if (res.error) throw res.error;
    return (res.data as Pick<AgentFollowupRow, 'id'>).id;
  });
  return data;
}

export async function listOpenFollowups(): Promise<AgentFollowupRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('agent_followups')
      .select('*')
      .eq('status', 'offered')
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as AgentFollowupRow[]) ?? [];
  });
  return data ?? [];
}

/* ------------------------------ recommendations ------------------------------ */

export interface RecommendationInput {
  patientProfileId?: string | null;
  conversationId?: string | null;
  entityType: 'hospital' | 'doctor' | 'pharmacy' | 'lab';
  entityId: string;
  overallScore?: number | null;
  dimensionScores?: Partial<
    Pick<
      AgentRecommendationRow,
      | 'relevance_score'
      | 'distance_score'
      | 'rating_score'
      | 'availability_score'
      | 'specialty_score'
      | 'emergency_score'
      | 'cost_score'
    >
  >;
  matchedReasons?: string[];
  isMock: boolean;
  source?: string;
}

/**
 * Persist recommendation provenance. Raw scores are stored DB-side only;
 * clients receive matchedReasons (safe explanation text) for display.
 */
export async function persistRecommendation(input: RecommendationInput): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('agent_recommendations')
      .insert({
        id: generateId(),
        owner_id: userId,
        patient_profile_id: input.patientProfileId ?? null,
        conversation_id: input.conversationId ?? null,
        entity_type: input.entityType,
        entity_id: input.entityId,
        relevance_score: input.dimensionScores?.relevance_score ?? null,
        distance_score: input.dimensionScores?.distance_score ?? null,
        rating_score: input.dimensionScores?.rating_score ?? null,
        availability_score: input.dimensionScores?.availability_score ?? null,
        specialty_score: input.dimensionScores?.specialty_score ?? null,
        emergency_score: input.dimensionScores?.emergency_score ?? null,
        cost_score: input.dimensionScores?.cost_score ?? null,
        overall_score: input.overallScore ?? null,
        matched_reasons: input.matchedReasons ?? [],
        is_mock: input.isMock,
        source: input.source ?? 'recommendations',
      })
      .select('id')
      .single();
    if (res.error) throw res.error;
    return (res.data as Pick<AgentRecommendationRow, 'id'>).id;
  });
  return data;
}

export async function listRecommendations(conversationId?: string): Promise<AgentRecommendationRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client
      .from('agent_recommendations')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    if (conversationId) q = q.eq('conversation_id', conversationId);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as AgentRecommendationRow[]) ?? [];
  });
  return data ?? [];
}
