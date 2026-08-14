/**
 * Home page data access (no invented values).
 *
 * Every value surfaced on the Home page is derived from an existing CareLink
 * module. Mock/demo figures (distance, ETA) are explicitly flagged so the UI
 * never presents them as live data.
 */
import { hospitalsData } from '../../../data/hospitals';
import { doctorsData } from '../../../data/doctors';
import { sampleReviews } from '../../Reviews/data/reviewData';
import {
  hospitalRecommendations,
  doctorRecommendations,
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

const avgRating = (
  hospitalsData.reduce((sum, h) => sum + h.rating, 0) / (hospitalsData.length || 1)
).toFixed(1);

const specialtySet = new Set<string>();
hospitalsData.forEach((h) => h.specialties.forEach((s) => specialtySet.add(s)));
doctorsData.forEach((d) => specialtySet.add(d.specialty));

export const platformStats: PlatformStat[] = [
  { label: 'Hospitals', value: String(hospitalsData.length), hint: 'Verified care partners' },
  { label: 'Doctors', value: String(doctorsData.length), hint: 'Across specialties' },
  { label: 'Specialties', value: String(specialtySet.size), hint: 'Covered today' },
  { label: 'Avg. rating', value: avgRating, hint: `${sampleReviews.length}+ patient voices` },
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

/** Emergency-capable hospitals from the Step 12 mock discovery network. */
export const emergencyHospitals: HospitalRecommendation[] = hospitalRecommendations
  .filter((h) => h.hasEmergency && h.isOpen)
  .slice(0, 3);

export const nearestHospitals: HospitalRecommendation[] = [...hospitalRecommendations]
  .sort((a, b) => a.distanceKm - b.distanceKm)
  .slice(0, 3);

export const featuredDoctors: DoctorRecommendation[] = doctorRecommendations.slice(0, 3);

export const featuredReviews: Review[] = sampleReviews
  .slice()
  .sort((a, b) => b.rating - a.rating)
  .slice(0, 3);

/** Hospitals that report a blood bank facility (real data field, not a live count). */
export const bloodBankHospitals = hospitalsData.filter((h) => h.facilities?.blood_bank).slice(0, 3);

export const pharmacyCount = pharmacyRecommendations.length;
export const labCount = labRecommendations.length;

export const recoverySummary = recoverySeed;
export const vaccinationReminders = vaccinationSchedules.filter((v) => v.status !== 'completed');
export const familyProfileCount = patientProfiles.length;
