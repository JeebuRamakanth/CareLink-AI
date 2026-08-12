/**
 * RecommendationRankingEngine — scores and explains facility recommendations.
 *
 * Pure, UI-agnostic scoring. Each candidate is scored 0–100 across:
 *   1. query/symptom/disease relevance
 *   2. distance / proximity
 *   3. specialty match
 *   4. rating
 *   5. verified review quality/count
 *   6. availability (open/closed, accepts new patients, next slot)
 *   7. estimated cost (where available)
 *   8. urgency/emergency relevance
 *
 * The engine never picks "the first one" — it sorts by score and attaches a
 * human-readable rationale (`recommendationScore`, `matchedReasons`, `topReason`)
 * to each result. A future real backend can populate the same fields.
 */

import type {
  DoctorRecommendation,
  HospitalRecommendation,
  LabRecommendation,
  PharmacyRecommendation,
  RecommendationReason,
  UrgencyLevel,
} from '../types';
import type { ConversationContext } from '../types';

/** Normalized 0–100 clamp. */
const clamp = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

const distanceScore = (km: number): number => {
  if (km <= 0) return 100; // home collection / same place
  if (km <= 1) return 96;
  if (km <= 2) return 90;
  if (km <= 4) return 80;
  if (km <= 6) return 68;
  if (km <= 10) return 54;
  return 38;
};

const ratingScore = (rating: number): number => clamp(((rating - 3.5) / 1.5) * 100);

const reviewScore = (count: number): number => {
  if (count <= 0) return 30;
  if (count >= 300) return 100;
  return clamp(30 + (count / 300) * 70);
};

const openScore = (isOpen: boolean): number => (isOpen ? 100 : 28);

interface RankInput {
  context: ConversationContext;
  urgency: UrgencyLevel;
  /** Optional explicit specialty / condition from the current query. */
  specialty?: string;
  /** Optional medicine name (for pharmacy/medicine relevance). */
  medicine?: string;
}

const relevanceForSpecialty = (candidateSpecialties: string[], specialty?: string, context?: ConversationContext): { score: number; matched: boolean } => {
  if (!specialty && !context?.specialties.length && !context?.conditions.length) {
    return { score: 60, matched: false }; // neutral when no signal
  }
  const signals = [specialty, ...(context?.specialties ?? []), ...(context?.conditions ?? [])]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase());
  const candidate = candidateSpecialties.map((s) => s.toLowerCase());
  const matched = signals.some((sig) => candidate.some((c) => c.includes(sig) || sig.includes(c)));
  return { score: matched ? 100 : 35, matched };
};

/* ----------------------------------------------------------------------------
 * Hospitals
 * ------------------------------------------------------------------------- */

export function rankHospitals(
  hospitals: HospitalRecommendation[],
  input: RankInput
): HospitalRecommendation[] {
  return hospitals
    .map((h) => {
      const rel = relevanceForSpecialty(h.specialties, input.specialty, input.context);
      const dist = distanceScore(h.distanceKm);
      const rate = ratingScore(h.rating);
      const rev = reviewScore(h.reviewCount);
      const open = openScore(h.isOpen);
      const emergencyBoost = input.urgency === 'emergency' && h.hasEmergency ? 100 : input.urgency === 'emergency' ? 30 : 60;

      const score = clamp(
        rel.score * 0.28 + dist * 0.22 + rate * 0.16 + rev * 0.1 + open * 0.14 + emergencyBoost * 0.1
      );

      const reasons: string[] = [];
      if (rel.matched) reasons.push(`relevant ${input.specialty ?? input.context.specialties[0]} specialists`);
      reasons.push(`${h.distanceKm.toFixed(1)} km away`);
      reasons.push(`rated ${h.rating.toFixed(1)}/5`);
      if (h.hasEmergency) reasons.push('has emergency services');
      reasons.push(h.isOpen ? 'currently open' : 'currently closed');

      const reason: RecommendationReason = {
        recommendationScore: score,
        matchedReasons: reasons.slice(0, 4),
        topReason: reasons[0],
      };
      return { ...h, ...reason };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);
}

/* ----------------------------------------------------------------------------
 * Doctors
 * ------------------------------------------------------------------------- */

export function rankDoctors(
  doctors: DoctorRecommendation[],
  input: RankInput
): DoctorRecommendation[] {
  return doctors
    .map((d) => {
      const rel = relevanceForSpecialty([d.specialty, d.hospitalName], input.specialty, input.context);
      const dist = distanceScore(d.route?.distanceKm ?? 5);
      const rate = ratingScore(d.rating);
      const rev = reviewScore(d.reviewCount);
      const availability =
        d.availabilityStatus === 'available' ? 100 : d.availabilityStatus === 'limited' ? 70 : d.availabilityStatus === 'busy' ? 48 : 20;
      const accepts = d.acceptsNewPatients ? 100 : 40;

      const score = clamp(
        rel.score * 0.34 + dist * 0.12 + rate * 0.18 + rev * 0.08 + availability * 0.18 + accepts * 0.1
      );

      const reasons: string[] = [];
      if (rel.matched) reasons.push(`${d.specialty} specialist matches your need`);
      reasons.push(`rated ${d.rating.toFixed(1)}/5`);
      reasons.push(`${d.yearsOfExperience} yrs experience`);
      reasons.push(d.nextAvailableSlot);
      if (d.acceptsNewPatients) reasons.push('accepts new patients');

      const reason: RecommendationReason = {
        recommendationScore: score,
        matchedReasons: reasons.slice(0, 4),
        topReason: reasons[0],
      };
      return { ...d, ...reason };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);
}

/* ----------------------------------------------------------------------------
 * Pharmacies
 * ------------------------------------------------------------------------- */

export function rankPharmacies(
  pharmacies: PharmacyRecommendation[],
  input: RankInput
): PharmacyRecommendation[] {
  void input;
  return pharmacies
    .map((p) => {
      const dist = distanceScore(p.distanceKm);
      const open = openScore(p.isOpen);
      const cost = p.estimatedPrice ? costScore(p.estimatedPrice) : 70;

      const score = clamp(dist * 0.45 + open * 0.4 + cost * 0.15);

      const reasons: string[] = [];
      reasons.push(`${p.distanceKm.toFixed(1)} km away`);
      reasons.push(p.isOpen ? 'open now' : 'currently closed');
      if (p.estimatedPrice) reasons.push(`~${p.estimatedPrice}`);

      const reason: RecommendationReason = {
        recommendationScore: score,
        matchedReasons: reasons.slice(0, 3),
        topReason: reasons[0],
      };
      return { ...p, ...reason };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);
}

const costScore = (price: string): number => {
  const n = parseFloat(price.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return 60;
  if (n <= 11) return 100;
  if (n <= 13) return 80;
  if (n <= 16) return 60;
  return 40;
};

/* ----------------------------------------------------------------------------
 * Labs
 * ------------------------------------------------------------------------- */

export function rankLabs(
  labs: LabRecommendation[],
  input: RankInput
): LabRecommendation[] {
  const testSignals = [input.specialty, ...(input.context?.specialties ?? []), ...(input.context?.conditions ?? [])]
    .filter((s): s is string => Boolean(s))
    .map((s) => s.toLowerCase());

  return labs
    .map((l) => {
      const dist = distanceScore(l.distanceKm);
      const open = openScore(l.isOpen);
      const homeCollection = l.homeCollectionAvailable ? 100 : 55;
      const rel = relevanceForSpecialty(l.testsOffered, input.specialty, input.context);

      const score = clamp(rel.score * 0.2 + dist * 0.4 + open * 0.2 + homeCollection * 0.2);

      const reasons: string[] = [];
      reasons.push(l.homeCollectionAvailable ? 'home collection available' : 'visit required');
      reasons.push(l.distanceKm <= 0 ? 'comes to you' : `${l.distanceKm.toFixed(1)} km away`);
      reasons.push(l.isOpen ? 'open now' : 'currently closed');
      if (rel.matched && testSignals.length) reasons.push('offers relevant tests');

      const reason: RecommendationReason = {
        recommendationScore: score,
        matchedReasons: reasons.slice(0, 3),
        topReason: reasons[0],
      };
      return { ...l, ...reason };
    })
    .sort((a, b) => b.recommendationScore - a.recommendationScore);
}

/**
 * Compose a single human-readable rationale line for a ranked result, e.g.
 * "Recommended #1 because it is 2.3 km away, rated 4.8/5 and has relevant
 * specialists available."
 */
export function explainRecommendation(rank: number, r: RecommendationReason): string {
  if (!r.matchedReasons.length) return `Recommended #${rank}.`;
  const detail = r.matchedReasons.slice(0, 3).join(', ');
  return `Recommended #${rank} because it is ${detail}.`;
}

export type { RankInput };
