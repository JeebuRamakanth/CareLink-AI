/**
 * Home page data access (no invented values).
 *
 * Every value surfaced on the Home page is derived from an existing CareLink
 * module. Mock/demo figures (distance, ETA) are explicitly flagged so the UI
 * never presents them as live data.
 */
import { hospitalsData } from '../../../data/hospitals';
import { doctorsData } from '../../../data/doctors';
import {
  pharmacyRecommendations,
  labRecommendations,
  recoverySeed,
  vaccinationSchedules,
  patientProfiles,
} from '../../../features/health-agent/data/mockData';
import type {
  HospitalRecommendation,
  DoctorRecommendation,
} from '../../../features/health-agent/types';
import type { Review } from '../../../types';

export type {
  HospitalRecommendation,
  DoctorRecommendation,
};

export interface PlatformStat {
  label: string;
  value: string;
  hint: string;
}

const avgRating = (() => {
  const rated = hospitalsData.filter((h) => h.rating > 0);
  if (rated.length === 0) return '—';
  return (rated.reduce((sum, h) => sum + h.rating, 0) / rated.length).toFixed(1);
})();

const specialtySet = new Set<string>();
hospitalsData.forEach((h) => h.specialties.forEach((s) => specialtySet.add(s)));
doctorsData.forEach((d) => specialtySet.add(d.specialty));

/**
 * Adapt a sourced directory Hospital record to the Home page's recommendation
 * shape. NO ratings/distance are invented: unrated facilities show 0 and the UI
 * renders them honestly (StarRow 0.0, "Distance unavailable").
 */
function toHospitalRecommendation(h: (typeof hospitalsData)[number]): HospitalRecommendation {
  return {
    id: h.id,
    detailSlug: h.id,
    name: h.name,
    rating: h.rating ?? 0,
    reviewCount: h.review_count ?? 0,
    specialties: h.specialties ?? [],
    distanceKm: h.distance_km ?? 0,
    estimatedTravelTimeMin: 0,
    isOpen: h.availability_status === 'open' || h.availability_status === 'busy',
    hasEmergency: Boolean(h.facilities?.emergency),
    address: h.address,
    city: h.city,
  };
}

/**
 * Adapt a sourced directory Doctor record to the Home page's recommendation
 * shape. Nothing is invented: experience/fee/availability that a source did not
 * publish render as their honest "unlisted" states.
 */
function toDoctorRecommendation(d: (typeof doctorsData)[number]): DoctorRecommendation {
  const primaryHospital = hospitalsData.find((h) => h.id === (d.hospital_ids?.[0] ?? ''));
  return {
    id: d.id,
    detailSlug: d.id,
    fullName: d.full_name,
    specialty: d.specialty,
    hospitalName: primaryHospital?.name ?? d.city,
    rating: d.rating ?? 0,
    reviewCount: d.review_count ?? 0,
    yearsOfExperience: d.years_of_experience ?? 0,
    languages: d.languages ?? [],
    availabilityStatus: d.availability_status ?? 'offline',
    nextAvailableSlot: d.next_available_at ?? 'Not listed',
    acceptsNewPatients: d.accepts_new_patients ?? false,
  };
}

export const platformStats: PlatformStat[] = [
  { label: 'Hospitals', value: String(hospitalsData.length), hint: 'Sourced care partners' },
  { label: 'Doctors', value: String(doctorsData.length), hint: 'Across specialties' },
  { label: 'Specialties', value: String(specialtySet.size), hint: 'Covered today' },
  { label: 'Avg. rating', value: avgRating, hint: avgRating === '—' ? 'Awaiting patient reviews' : 'From recorded reviews' },
];

export interface FeatureTile {
  icon: 'sparkle' | 'report' | 'calendar' | 'family' | 'heart' | 'location';
  title: string;
  description: string;
  cta: string;
  href: string;
}

export const platformFeatures: FeatureTile[] = [
  {
    icon: 'sparkle',
    title: 'AI Health Command Center',
    description: 'Ask about symptoms, medicines or reports and get structured next-step guidance — never a diagnosis.',
    cta: 'Open command center',
    href: '/ai',
  },
  {
    icon: 'report',
    title: 'Secure medical documents',
    description: 'Upload lab reports, prescriptions and medicine photos. Owner-scoped storage with private references.',
    cta: 'My documents',
    href: '/documents',
  },
  {
    icon: 'calendar',
    title: 'Appointments',
    description: 'Track confirmed, upcoming and completed visits in one place with prep notes.',
    cta: 'View appointments',
    href: '/appointments',
  },
  {
    icon: 'family',
    title: 'Family & patient context',
    description: 'Switch between self, parent, child and spouse profiles. Each keeps its own protected context.',
    cta: 'Manage profile',
    href: '/profile',
  },
  {
    icon: 'heart',
    title: 'Recovery tracking',
    description: 'Daily check-ins with trend history and a gentle follow-up reminder placeholder.',
    cta: 'Open command center',
    href: '/ai',
  },
  {
    icon: 'location',
    title: 'Care near you',
    description: 'Find hospitals, doctors, pharmacies and labs ranked by distance from your location.',
    cta: 'Find care near me',
    href: '/hospitals',
  },
];

export interface ProcessStep {
  step: string;
  title: string;
  description: string;
  icon: 'sparkle' | 'hospital' | 'route' | 'calendar' | 'heart';
}

export const howItWorksSteps: ProcessStep[] = [
  {
    step: '01',
    title: 'Understand',
    description: 'Describe a symptom or upload a report. CareLink AI returns clearly-labelled guidance, not a diagnosis.',
    icon: 'sparkle',
  },
  {
    step: '02',
    title: 'Find',
    description: 'Discover hospitals, doctors, pharmacies and labs matched to your need and location.',
    icon: 'hospital',
  },
  {
    step: '03',
    title: 'Navigate',
    description: 'Get directions deep-links to the chosen facility — no sensitive health data in the URL.',
    icon: 'route',
  },
  {
    step: '04',
    title: 'Book & follow up',
    description: 'Book an appointment, then track recovery with daily check-ins and reminders.',
    icon: 'calendar',
  },
];

/** Emergency-capable hospitals from the real sourced directory. */
export const emergencyHospitals: HospitalRecommendation[] = hospitalsData
  .filter((h) => h.facilities?.emergency)
  .map(toHospitalRecommendation)
  .slice(0, 3);

/** Directory hospitals shown on the Home page (sourced, not fabricated). */
export const nearestHospitals: HospitalRecommendation[] = hospitalsData
  .map(toHospitalRecommendation)
  .slice(0, 3);

export const featuredDoctors: DoctorRecommendation[] = doctorsData.slice(0, 3).map(toDoctorRecommendation);

/**
 * SAMPLE patient voices for the Home page. These are clearly-labelled demo
 * content attached to REAL directory subjects — never presented as verified
 * reviews. Real reviews come from the reviews table (RLS + eligibility gate).
 */
export const featuredReviews: Review[] = [
  {
    id: 'sample-review-1',
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    patient_name: 'Sample patient',
    patient_initials: 'SP',
    patient_verified: false,
    subject_type: 'Hospital',
    subject_name: 'District Hospital, Machilipatnam',
    rating: 4.0,
    title: 'Sample review content',
    comment: 'Illustrative text showing how a patient voice appears on CareLink. Not a real patient review.',
    reviewed_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'sample-review-2',
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    patient_name: 'Sample patient',
    patient_initials: 'SP',
    patient_verified: false,
    subject_type: 'Doctor',
    subject_name: 'Dr. K. Murali Krishna',
    rating: 4.0,
    title: 'Sample review content',
    comment: 'Illustrative text showing how a patient voice appears on CareLink. Not a real patient review.',
    reviewed_at: '2026-09-01T00:00:00.000Z',
  },
  {
    id: 'sample-review-3',
    status: 'active',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    patient_name: 'Sample patient',
    patient_initials: 'SP',
    patient_verified: false,
    subject_type: 'Hospital',
    subject_name: 'Andhra Hospitals, Machilipatnam',
    rating: 4.0,
    title: 'Sample review content',
    comment: 'Illustrative text showing how a patient voice appears on CareLink. Not a real patient review.',
    reviewed_at: '2026-09-01T00:00:00.000Z',
  },
];

/** Hospitals that report a blood bank facility (real data field, not a live count). */
export const bloodBankHospitals = hospitalsData.filter((h) => h.facilities?.blood_bank).slice(0, 3);

export const pharmacyCount = pharmacyRecommendations.length;
export const labCount = labRecommendations.length;

export const recoverySummary = recoverySeed;
export const vaccinationReminders = vaccinationSchedules.filter((v) => v.status !== 'completed');
export const familyProfileCount = patientProfiles.length;
