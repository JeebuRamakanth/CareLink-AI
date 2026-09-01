/**
 * CareLink-AI — reviews repository (Step 10.5 §6/§22).
 *
 * Backend for the (previously mock-only) review system. All writes go through
 * RLS + guarded DB functions: authors manage only their own reviews, verified
 * status is set only by carelink_verify_review(), moderation only by admins
 * via carelink_moderate_review(). Returns null/empty when Supabase is
 * unavailable — the existing mock reviews flow remains the fallback.
 */

import { withClient, generateId } from './repository';
import type { ReviewRow, ReviewVerificationRow, ProviderResponseRow } from './types';

export type ReviewTarget =
  | { kind: 'hospital'; id: string }
  | { kind: 'doctor'; id: string }
  | { kind: 'pharmacy'; id: string }
  | { kind: 'lab'; id: string };

const targetColumn = (target: ReviewTarget) =>
  ({ hospital: 'hospital_id', doctor: 'doctor_id', pharmacy: 'pharmacy_id', lab: 'lab_id' } as const)[target.kind];

/** Published reviews for a provider target (public). */
export async function listReviews(target: ReviewTarget): Promise<ReviewRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('reviews')
      .select('*')
      .eq(targetColumn(target), target.id)
      .eq('status', 'published')
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as ReviewRow[]) ?? [];
  });
  return data ?? [];
}

/** The current user's own reviews (any status). */
export async function listMyReviews(): Promise<ReviewRow[]> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) return [];
    const res = await client
      .from('reviews')
      .select('*')
      .eq('owner_id', authData.user.id)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as ReviewRow[]) ?? [];
  });
  return data ?? [];
}

export interface CreateReviewInput {
  target: ReviewTarget;
  overallRating: number;
  title?: string | null;
  body?: string | null;
  familyProfileId?: string | null;
  appointmentId?: string | null;
}

export async function createReview(
  input: CreateReviewInput
): Promise<{ review: ReviewRow | null; error: string | null }> {
  const { data, error } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client
      .from('reviews')
      .insert({
        id: generateId(),
        owner_id: userId,
        family_profile_id: input.familyProfileId ?? null,
        hospital_id: input.target.kind === 'hospital' ? input.target.id : null,
        doctor_id: input.target.kind === 'doctor' ? input.target.id : null,
        pharmacy_id: input.target.kind === 'pharmacy' ? input.target.id : null,
        lab_id: input.target.kind === 'lab' ? input.target.id : null,
        appointment_id: input.appointmentId ?? null,
        title: input.title ?? null,
        body: input.body ?? null,
        overall_rating: input.overallRating,
        status: 'published',
      })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as ReviewRow;
  });
  return { review: data, error: error?.message ?? null };
}

export async function updateMyReview(
  id: string,
  patch: { title?: string | null; body?: string | null; overallRating?: number }
): Promise<ReviewRow | null> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('reviews')
      .update({
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.overallRating !== undefined ? { overall_rating: patch.overallRating } : {}),
      })
      .eq('id', id)
      .select('*')
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data as ReviewRow | null) ?? null;
  });
  return data;
}

export async function deleteMyReview(id: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('reviews').delete().eq('id', id).select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}

export async function reportReview(reviewId: string, reason: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) throw new Error('unauthorized');
    const res = await client.from('review_reports').insert({
      id: generateId(),
      review_id: reviewId,
      reporter_id: authData.user.id,
      reason: reason.slice(0, 500),
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

/**
 * Admin moderation action (publish / hide / remove)..
 *
 * Rides `carelink_moderate_review` — a SECURITY DEFINER RPC that re-checks
 * admin membership + suspension inside the database before mutating. Returns
 * true only when the RPC succeeded; errors surface as a safe generic string..
 */
export async function moderateReview(
  reviewId: string,
  action: 'publish' | 'hide' | 'remove',
  reason?: string
): Promise<{ ok: boolean; error?: string }> {
  const { data, error } = await withClient(async (client) => {
    const res = await client.rpc('carelink_moderate_review', {
      review_uuid: reviewId,
      action,
      reason: reason ?? null,
    });
    if (res.error) throw res.error;
    return { ok: true };
  });
  if (data) return data;
  const normalized = error && typeof error === 'string' ? error : error?.message ?? 'Moderation failed on the server.';
  return { ok: false, error: normalized };
}

/**
 * Request verified-interaction status. Returns true only when the DB proves a
 * completed appointment belonging to the author (carelink_verify_review).
 */
export async function verifyReview(reviewId: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_verify_review', { review_uuid: reviewId });
    if (res.error) throw res.error;
    return res.data === true;
  });
  return data ?? false;
}

export async function getReviewVerification(reviewId: string): Promise<ReviewVerificationRow | null> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('review_verification')
      .select('*')
      .eq('review_id', reviewId)
      .maybeSingle();
    if (res.error) throw res.error;
    return (res.data as ReviewVerificationRow | null) ?? null;
  });
  return data;
}

/** Provider response — only an actual member/linked doctor of the target may respond (RLS). */
export async function respondToReview(reviewId: string, body: string): Promise<ProviderResponseRow | null> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    if (!authData.user) throw new Error('unauthorized');
    const res = await client
      .from('provider_responses')
      .insert({ id: generateId(), review_id: reviewId, responder_id: authData.user.id, body: body.slice(0, 2000) })
      .select('*')
      .single();
    if (res.error) throw res.error;
    return res.data as ProviderResponseRow;
  });
  return data;
}
