/**
 * CareLink-AI — directory → agent recommendation bridge.
 *
 * The Health Agent must surface the SAME hospital and doctor records the
 * directory pages show (Supabase registry when configured, otherwise the
 * sourced Machalipatnam directory), never a private, disconnected demo set.
 * This module adapts the `Hospital` / `Doctor` domain models into the agent's
 * `HospitalRecommendation` / `DoctorRecommendation` card shapes, carrying the
 * real stable ids so the existing `/hospitals/:id` and `/doctors/:id` routes
 * resolve.
 *
 * HONESTY CONTRACT (non-negotiable):
 *   - `rating` / `reviewCount` are copied verbatim from the record (0 when the
 *     record has no real reviews) — never fabricated to look "nice".
 *   - Distance is only reported when the record carries coordinates AND a
 *     patient location exists; otherwise `distanceAvailable: false` and the UI
 *     says "Distance unavailable".
 *   - Availability is never invented: without real hours/slot data the card
 *     shows "Availability unlisted".
 *   - A doctor is only linked to a hospital that the record explicitly lists in
 *     `hospital_ids` — never by name/city matching.
 */

import { getHospitals, getDoctors } from '../../../services';
import { haversineKm } from '../../../lib';
import { resolveSpecialty, textMentionsSpecialty, isSameSpecialty } from '../data/specialtyTaxonomy';
import { directionsUrl } from '../../../services/maps/mapsService';
import type { Doctor, Hospital } from '../../../types';
import type { DoctorRecommendation, HospitalRecommendation } from '../types';

/** Patient origin used to compute a real distance; null when unavailable. */
export interface RecommendationOrigin {
  lat: number;
  lng: number;
  label?: string;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

const cityLabel = (hospital: Hospital): string =>
  [hospital.city, hospital.state].filter(Boolean).join(', ');

function computeDistance(
  hospital: Hospital,
  origin: RecommendationOrigin | null
): { distanceKm: number; eta: number; available: boolean } {
  if (
    origin &&
    typeof hospital.latitude === 'number' &&
    typeof hospital.longitude === 'number'
  ) {
    const km = haversineKm(origin, { lat: hospital.latitude, lng: hospital.longitude });
    if (km != null) {
      // ~30 km/h urban average → a clearly-labelled estimate, not a live ETA.
      return { distanceKm: round1(km), eta: Math.max(1, Math.round((km / 30) * 60)), available: true };
    }
  }
  return { distanceKm: 0, eta: 0, available: false };
}

/** Convert a directory hospital into an agent recommendation card. */
export function toHospitalRecommendation(
  hospital: Hospital,
  origin: RecommendationOrigin | null = null
): HospitalRecommendation {
  const { distanceKm, eta, available } = computeDistance(hospital, origin);
  const city = cityLabel(hospital);
  const address = hospital.address ?? '';
  return {
    id: hospital.id,
    detailSlug: hospital.slug ?? hospital.id,
    name: hospital.name,
    rating: hospital.rating ?? 0,
    reviewCount: hospital.review_count ?? 0,
    specialties: hospital.specialties ?? [],
    distanceKm,
    estimatedTravelTimeMin: eta,
    // Live open/closed is unknown for the sourced directory — never invented.
    isOpen: false,
    hasEmergency: Boolean(hospital.facilities?.emergency),
    address,
    city,
    distanceAvailable: available,
    availabilityLabel: 'Availability unlisted',
    provenanceStatus: hospital.provenance?.data_status,
    route: available
      ? {
          destinationName: hospital.name,
          destinationAddress: [address, city].filter(Boolean).join(', '),
          distanceKm,
          estimatedTravelTimeMin: eta,
          transportMode: 'driving',
          deepLink: { kind: 'hospital', id: hospital.slug ?? hospital.id },
        }
      : undefined,
  };
}

/** Convert a directory doctor into an agent recommendation card. */
export function toDoctorRecommendation(
  doctor: Doctor,
  hospitalsById: Map<string, Hospital>
): DoctorRecommendation {
  const primaryHospitalId = doctor.hospital_ids?.[0];
  const primaryHospital = primaryHospitalId ? hospitalsById.get(primaryHospitalId) : undefined;
  const hospitalName = primaryHospital?.name ?? doctor.city ?? '';

  return {
    id: doctor.id,
    detailSlug: doctor.id,
    fullName: doctor.full_name,
    specialty: doctor.specialty,
    hospitalName,
    hospitalDetailSlug: primaryHospital?.slug ?? primaryHospital?.id,
    rating: doctor.rating ?? 0,
    reviewCount: doctor.review_count ?? 0,
    yearsOfExperience: doctor.years_of_experience ?? 0,
    languages: doctor.languages ?? [],
    // No real slot data exists in the sourced directory — never claim "available".
    availabilityStatus: 'offline',
    nextAvailableSlot: '',
    consultationFee: undefined,
    acceptsNewPatients: doctor.accepts_new_patients ?? true,
    availabilityLabel: 'Availability unlisted',
    provenanceStatus: doctor.provenance?.data_status,
    hospitalIds: doctor.hospital_ids ?? [],
  };
}

function buildHospitalsById(hospitals: Hospital[]): Map<string, Hospital> {
  return new Map(hospitals.map((h) => [h.id, h]));
}

/** Every directory hospital, adapted for the agent, optionally distance-ranked. */
export async function getHospitalRecommendations(origin: RecommendationOrigin | null = null): Promise<HospitalRecommendation[]> {
  const hospitals = await getHospitals();
  return hospitals.map((h) => toHospitalRecommendation(h, origin));
}

/** Every directory doctor, adapted for the agent (with linked-hospital names). */
export async function getDoctorRecommendations(): Promise<DoctorRecommendation[]> {
  const [doctors, hospitals] = await Promise.all([getDoctors(), getHospitals()]);
  const byId = buildHospitalsById(hospitals);
  return doctors.map((d) => toDoctorRecommendation(d, byId));
}

/** Hospital haystack used for free-text / specialty matching. */
const hospitalHaystack = (h: HospitalRecommendation): string =>
  [h.name, h.city, h.address, ...(h.specialties ?? [])].join(' ').toLowerCase();

/** Doctor haystack used for free-text / specialty matching. */
const doctorHaystack = (d: DoctorRecommendation): string =>
  [d.fullName, d.specialty, d.hospitalName, ...(d.languages ?? [])].join(' ').toLowerCase();

/**
 * Hospitals matching a specialty (canonical taxonomy aware) OR a free-text
 * query. Returns [] when nothing matches — callers must handle the empty state
 * rather than falling back to unrelated records.
 */
export function filterHospitalsBySpecialty(
  hospitals: HospitalRecommendation[],
  specialty: string | undefined
): HospitalRecommendation[] {
  if (!specialty) return hospitals;
  return hospitals.filter((h) => textMentionsSpecialty(hospitalHaystack(h), specialty));
}

export function filterDoctorsBySpecialty(
  doctors: DoctorRecommendation[],
  specialty: string | undefined
): DoctorRecommendation[] {
  if (!specialty) return doctors;
  return doctors.filter((d) => isSameSpecialty(d.specialty, specialty));
}

/** Free-text hospital search across name/city/specialty. */
export function searchHospitalsInList(
  hospitals: HospitalRecommendation[],
  query: string
): HospitalRecommendation[] {
  const q = query.trim().toLowerCase();
  if (!q) return hospitals;
  return hospitals.filter((h) => hospitalHaystack(h).includes(q));
}

/** Free-text doctor search across name/specialty/hospital. */
export function searchDoctorsInList(
  doctors: DoctorRecommendation[],
  query: string
): DoctorRecommendation[] {
  const q = query.trim().toLowerCase();
  if (!q) return doctors;
  return doctors.filter((d) => doctorHaystack(d).includes(q));
}

/** Doctors explicitly affiliated with one hospital (by id) — never name matching. */
export function doctorsAtHospital(
  doctors: DoctorRecommendation[],
  hospitalId: string,
  hospitals: Hospital[]
): DoctorRecommendation[] {
  const hospital = hospitals.find((h) => h.id === hospitalId || h.slug === hospitalId);
  if (!hospital) return [];
  return doctors.filter((d) => (d.hospitalIds ?? []).includes(hospital.id));
}

/**
 * Extract a city/district/PIN hint from free text so location-aware search can
 * work without assuming a stale location. Returns undefined when none present.
 */
export function extractLocationHint(text: string): string | undefined {
  const t = text.toLowerCase();
  // PIN code (6 digits) or an explicit "<place> in <City>" pattern.
  const pin = t.match(/\b(\d{6})\b/);
  if (pin) return pin[1];
  const inCity = t.match(/\b(?:in|near|at|around)\s+([a-z][a-z\s]{2,30})/);
  if (inCity) {
    const candidate = inCity[1].trim().replace(/\s+(hospital|hospitals|doctor|doctors|clinic)$/i, '').trim();
    if (candidate.length >= 3) return candidate;
  }
  return undefined;
}

/** Resolve the canonical specialty name (or undefined) for a free-text term. */
export function canonicalSpecialty(term: string | undefined): string | undefined {
  return resolveSpecialty(term)?.name;
}

export { directionsUrl };
