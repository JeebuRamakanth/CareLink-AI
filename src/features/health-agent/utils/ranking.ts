/**
 * Explainable ranking for healthcare search (Step 9 §6).
 *
 * Provider-independent. Takes a list of recommendations + a RankingContext and
 * attaches a score + human-readable "Why this result?" reasons to each item.
 *
 * The system NEVER simply returns the first result — every list is scored and
 * sorted by a composite of: distance, query/specialty relevance, rating,
 * availability, open-now, and contextual requirements.
 */

import type {
  DoctorRecommendation,
  HospitalRecommendation,
  LabRecommendation,
  PharmacyRecommendation,
  RankReason,
  RankReasonTag,
  RankedRecommendation,
  RankingContext,
} from '../types';

interface Rankable {
  rating?: number;
  distanceKm?: number;
  isOpen?: boolean;
  specialties?: string[];
  availabilityStatus?: string;
  acceptsNewPatients?: boolean;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function scoreDistance(distanceKm: number | undefined): number {
  if (distanceKm == null) return 0.2;
  if (distanceKm <= 0) return 1;
  // Closer is better; decays past ~10 km.
  return clamp01(1 - distanceKm / 10);
}

function scoreRating(rating: number | undefined): number {
  if (rating == null || rating <= 0) return 0.3;
  return clamp01((rating - 3) / 2); // 3★ → 0, 5★ → 1
}

function matchesSpecialty(specialties: string[] | undefined, requested?: string): boolean {
  if (!requested) return false;
  const term = requested.toLowerCase();
  return (specialties ?? []).some((s) => s.toLowerCase().includes(term));
}

function buildReasons(item: Rankable, ctx: RankingContext, scoreBreakdown: Record<string, number>): RankedRecommendation {
  const reasons: RankReason[] = [];

  if (scoreBreakdown.distance >= 0.6) {
    reasons.push({ tag: 'near-you', label: item.distanceKm != null ? `Near you (${item.distanceKm.toFixed(1)} km)` : 'Near you', weight: scoreBreakdown.distance });
  }
  if (scoreBreakdown.rating >= 0.6) {
    reasons.push({ tag: 'highly-rated', label: `Highly rated (${item.rating?.toFixed(1) ?? '—'})`, weight: scoreBreakdown.rating });
  }
  if (scoreBreakdown.specialty > 0) {
    reasons.push({ tag: 'relevant-specialty', label: `Relevant specialty — ${ctx.requestedSpecialty ?? 'your need'}`, weight: scoreBreakdown.specialty });
  }
  if (scoreBreakdown.treatment > 0) {
    reasons.push({ tag: 'matches-treatment', label: 'Matches requested treatment', weight: scoreBreakdown.treatment });
  }
  if (scoreBreakdown.availability > 0 && item.availabilityStatus === 'available') {
    reasons.push({ tag: 'doctor-availability', label: 'Doctor available now', weight: scoreBreakdown.availability });
  }
  if (item.isOpen) {
    reasons.push({ tag: 'open-now', label: 'Open now', weight: 0.4 });
  }
  if (item.acceptsNewPatients) {
    reasons.push({ tag: 'accepts-new-patients', label: 'Accepts new patients', weight: 0.2 });
  }

  const score = Object.values(scoreBreakdown).reduce<number>((sum, v) => sum + v, 0);
  return { score: Math.round(score * 100) / 100, reasons: reasons.sort((a, b) => b.weight - a.weight) };
}

function baseBreakdown(item: Rankable, ctx: RankingContext): Record<string, number> {
  const specialty = matchesSpecialty(item.specialties, ctx.requestedSpecialty) ? 1 : 0;
  const treatment = ctx.requestedTreatment
    ? (item.specialties ?? []).some((s) => s.toLowerCase().includes(ctx.requestedTreatment!.toLowerCase())) ? 1 : 0
    : 0;
  return {
    distance: scoreDistance(item.distanceKm) * 0.9,
    rating: scoreRating(item.rating) * 0.8,
    specialty: specialty * 0.7,
    treatment: treatment * 0.6,
    availability: item.availabilityStatus === 'available' ? 0.6 : item.availabilityStatus === 'limited' ? 0.3 : 0,
  };
}

function attachRank<T extends Rankable & { rank?: RankedRecommendation }>(item: T, ctx: RankingContext): T {
  const breakdown = baseBreakdown(item, ctx);
  return { ...item, rank: buildReasons(item, ctx, breakdown) };
}

export function rankHospitals(items: HospitalRecommendation[], ctx: RankingContext): HospitalRecommendation[] {
  const ranked = items.map((h) => attachRank(h, ctx));
  return ranked.sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0));
}

export function rankDoctors(items: DoctorRecommendation[], ctx: RankingContext): DoctorRecommendation[] {
  const ranked = items.map((d) => attachRank(d, ctx));
  return ranked.sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0));
}

export function rankPharmacies(items: PharmacyRecommendation[], ctx: RankingContext): PharmacyRecommendation[] {
  const ranked = items.map((p) => attachRank(p, ctx));
  return ranked.sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0));
}

export function rankLabs(items: LabRecommendation[], ctx: RankingContext): LabRecommendation[] {
  const ranked = items.map((l) => attachRank(l, ctx));
  return ranked.sort((a, b) => (b.rank?.score ?? 0) - (a.rank?.score ?? 0));
}

export type { RankReason, RankReasonTag, RankedRecommendation };
