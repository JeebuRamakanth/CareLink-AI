/**
 * CareLink-AI — legacy agent workspace → real directory bridge (Step 22).
 *
 * The `/agent` command center predates the Health Agent and consumed a private
 * US demo hospital/doctor set. That data is fabricated and must never be shown.
 * This module adapts the SAME real directory the rest of the app uses
 * (Supabase registry when configured, otherwise the sourced Machilipatnam
 * directory) into the legacy `HospitalRecommendation`/`DoctorRecommendation`
 * shapes, with a small in-memory cache so the synchronous response builders can
 * read it.
 *
 * Until the cache is primed the builders return an EMPTY list — the UI shows an
 * honest "loading / no records" state rather than inventing facilities.
 */

import { getDoctors, getHospitals } from '../index';
import type { Doctor, Hospital } from '../../types';
import type {
  DoctorRecommendation,
  HospitalRecommendation,
  RouteResult,
} from './agentTypes';
import { isSameSpecialty, textMentionsSpecialty } from '../../features/health-agent/data/specialtyTaxonomy';

interface DirectoryCache {
  hospitals: HospitalRecommendation[];
  doctors: DoctorRecommendation[];
  loaded: boolean;
}

const cache: DirectoryCache = { hospitals: [], doctors: [], loaded: false };
let inflight: Promise<void> | null = null;

const buildRoute = (
  name: string,
  address: string,
  distanceKm: number,
  minutes: number,
  kind: 'hospital' | 'doctor',
  id: string
): RouteResult => ({
  destinationName: name,
  destinationAddress: address,
  distanceKm,
  estimatedTravelTimeMin: minutes,
  transportMode: 'driving',
  deepLink: { kind, id },
});

function toLegacyHospital(h: Hospital): HospitalRecommendation {
  const city = [h.city, h.state].filter(Boolean).join(', ');
  const address = h.address ?? '';
  // No live availability or coordinates exist in the sourced directory — never
  // fabricate a distance or an "open now" claim.
  return {
    id: h.id,
    detailSlug: h.slug ?? h.id,
    name: h.name,
    rating: h.rating ?? 0,
    reviewCount: h.review_count ?? 0,
    specialties: h.specialties ?? [],
    distanceKm: 0,
    estimatedTravelTimeMin: 0,
    isOpen: false,
    hasEmergency: Boolean(h.facilities?.emergency),
    hasIcu: Boolean(h.facilities?.icu),
    is24x7: Boolean(h.facilities?.twenty_four_hours),
    address,
    city,
    distanceAvailable: false,
    availabilityLabel: 'Availability unlisted',
    route: undefined,
  };
}

function toLegacyDoctor(d: Doctor, hospitalsById: Map<string, Hospital>): DoctorRecommendation {
  const primary = d.hospital_ids?.[0] ? hospitalsById.get(d.hospital_ids[0]) : undefined;
  return {
    id: d.id,
    detailSlug: d.id,
    fullName: d.full_name,
    specialty: d.specialty,
    hospitalName: primary?.name ?? d.city ?? '',
    hospitalDetailSlug: primary?.slug ?? primary?.id,
    rating: d.rating ?? 0,
    reviewCount: d.review_count ?? 0,
    yearsOfExperience: d.years_of_experience ?? 0,
    languages: d.languages ?? [],
    availabilityStatus: 'offline',
    nextAvailableSlot: 'Availability unlisted',
    consultationFee: undefined,
    acceptsNewPatients: d.accepts_new_patients ?? true,
    availabilityLabel: 'Availability unlisted',
  };
}

/** Prime the cache from the real directory (idempotent, single-flight). */
export async function primeAgentDirectory(): Promise<void> {
  if (cache.loaded) return;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const [hospitals, doctors] = await Promise.all([getHospitals(), getDoctors()]);
      const byId = new Map(hospitals.map((h) => [h.id, h]));
      cache.hospitals = hospitals.map(toLegacyHospital);
      cache.doctors = doctors.map((d) => toLegacyDoctor(d, byId));
      cache.loaded = true;
    } catch {
      // Leave the cache empty — the UI shows an honest empty state.
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function isAgentDirectoryLoaded(): boolean {
  return cache.loaded;
}

export function getDirectoryHospitals(): HospitalRecommendation[] {
  return cache.hospitals;
}

export function getDirectoryDoctors(): DoctorRecommendation[] {
  return cache.doctors;
}

/** Directory hospitals matching a specialty (taxonomy-aware); [] when none. */
export function findDirectoryHospitalsBySpecialty(specialty: string): HospitalRecommendation[] {
  return cache.hospitals.filter((h) =>
    h.specialties.some((s) => isSameSpecialty(s, specialty) || textMentionsSpecialty(s, specialty))
  );
}

/** Directory doctors matching a specialty (taxonomy-aware); [] when none. */
export function findDirectoryDoctorsBySpecialty(specialty: string): DoctorRecommendation[] {
  return cache.doctors.filter((d) => isSameSpecialty(d.specialty, specialty));
}

export function buildDirectoryRoute(hospital: HospitalRecommendation): RouteResult | undefined {
  return hospital.route ?? buildRoute(
    hospital.name,
    `${hospital.address}, ${hospital.city}`,
    hospital.distanceKm,
    hospital.estimatedTravelTimeMin,
    'hospital',
    hospital.detailSlug
  );
}
