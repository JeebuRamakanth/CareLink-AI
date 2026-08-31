/**
 * CareLink-AI  Step 15 provider discovery mapping.
 *
 * Thin adapter between the Supabase provider repositories and the frontend
 * Hospital/Doctor domain shapes used by the directory pages. Runs real-first
 * when Supabase is configured (falls back to null/empty so callers keep
 * the existing static provider data).
 *
 * SECURITY: discovery tables are public-read via RLS; no patient data is
 * fetched or mapped here. Verification tables stay admin/owner-only and are
 * never exposed to anon clients.
 */

import { env } from '../../config';
import {
  getDoctorDetail,
  getHospitalDetail,
  listDoctors,
  listDoctorsAtHospital,
  listDoctorsByHospital,
  listHospitals,
  listRelevantDoctorsForHospital,
} from './index';
import { isSupabaseConfigured } from '../supabase/client';
import type { HospitalDetailRow, DoctorDetailRow, DoctorRow, HospitalRow } from './index';
import type { Hospital, Doctor } from '../../types/models';

const isConfigured = (): boolean =>
  env.supabase.configured && isSupabaseConfigured();

const nowIso = (): string => new Date().toISOString();

/** Map a backend hospital row onto the frontend Hospital discovery shape. */
export function toHospital(row: HospitalRow): Hospital {
  const city = row.city ?? '';
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    status: 'active',
    type: 'hospital',
    description: row.description ?? '',
    address: row.address ?? '',
    city,
    state: '',
    country: city === '' ? '' : 'India',
    phone: row.phone_number ?? '',
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    specialties: [],
    departments: [],
    facilities: {
      emergency: false,
      icu: false,
      ambulance: false,
      blood_bank: false,
      parking: false,
      twenty_four_hours: false,
      telehealth: false,
    },
    rating: (row.rating ?? 0) as number,
    review_count: 0,
    /** Live availability is not carried by the real registry — wait for a
     *  real-time source rather than fabricating "open"/"closed". */
    availability_status: null,
    created_at: row.created_at ?? nowIso(),
    updated_at: row.updated_at ?? nowIso(),
  };
}

/** Map a backend doctor row onto the frontend Doctor discovery shape. */
export function toDoctor(row: DoctorRow): Doctor {
  const full = row.name ?? '';
  const parts = full.trim().split(/\s+/);
  const last = parts.pop() ?? '';
  const first = parts.join(' ');
  return {
    id: row.id,
    first_name: first,
    last_name: last,
    full_name: full,
    specialty: '',
    sub_specialties: [],
    bio: row.bio ?? '',
    hospital_ids: [],
    location: '',
    city: '',
    state: '',
    country: 'India',
    years_of_experience: row.years_experience ?? 0,
    education: [],
    languages: row.languages ?? [],
    consultation_modes: ['In-person'],
    rating: row.rating ?? 0,
    review_count: 0,
    /** Live availability is not carried by the real registry — wait for a
     *  real-time source rather than fabricating "available". */
    availability_status: null,
    is_verified: false,
    accepts_new_patients: true,
    status: 'active',
    created_at: row.created_at ?? nowIso(),
    updated_at: row.updated_at ?? nowIso(),
  };
}

/** Real hospital list; falls back to empty so the caller uses static data. */
export async function fetchRealHospitals(): Promise<Hospital[]> {
  if (!isConfigured()) return [];
  const rows = await listHospitals();
  return rows.map(toHospital);
}

/** Real doctor list; falls back to empty so the caller uses static data. */
export async function fetchRealDoctors(): Promise<Doctor[]> {
  if (!isConfigured()) return [];
  const rows = await listDoctors();
  return rows.map(toDoctor);
}

const specialtyNames = (items: Array<{ specialty_name: string | null }>): string[] =>
  (items ?? []).map((s) => s.specialty_name ?? '' );

/** Map a backend hospital detail row (with relationships) onto frontend Hospital shape. */
export function toHospitalDetail(row: HospitalDetailRow): Hospital {
  const base = toHospital(row as HospitalRow);
  const location = row.locations?.[0];
  return {
    ...base,
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    phone: row.phone_number ?? '',
    email: row.email ?? undefined,
    website: row.website ?? undefined,
    rating: row.rating ?? 0,
    specialties: specialtyNames(row.specialties),
    departments: specialtyNames(row.specialties),
    facilities: {
      emergency: row.emergency_capability?.has_emergency_department ?? false,
      icu: row.emergency_capability?.has_icu ?? false,
      ambulance: row.emergency_capability?.has_ambulance ?? false,
      blood_bank: (row.services ?? []).some((s) => /blood/i.test(s.service_name ?? '')),
      parking: (row.services ?? []).some((s) => /parking/i.test(s.service_name ?? '')),
      twenty_four_hours: (row.hours ?? []).some((h) => h.is_24_hours),
      telehealth: (row.services ?? []).some((s) => /tele/i.test(s.service_name ?? '')),
    },
    ...(row.locations?.length ? { location: location?.label ?? location?.city ?? '' } : { location: row.city ?? '' }),
  };
}


export function toDoctorDetail(row: DoctorDetailRow): Doctor {
  const base = toDoctor(row as DoctorRow);
  const firstHospital = row.hospitals?.[0];
  return {
    ...base,
    id: row.id,
    full_name: row.name ?? '',
    first_name: row.name?.split(/\s+/).slice(0,-1).join(' ') ?? '',
    last_name: row.name?.split(/\s+/).pop() ?? '',
    bio: row.doctor_profiles?.[0]?.about ?? row.bio ?? '',
    education: (row.qualifications ?? []).map((q: { degree: string; institution: string | null }) => `${q.degree}${q.institution ? `, ${q.institution}` : ''}`),
    specialty: specialtyNames(row.specialties)[0] ?? '',
    sub_specialties: specialtyNames(row.specialties),
    hospital_ids: (row.hospitals ?? []).map((h: { id: string }) => h.id),
    city: firstHospital?.city ?? '',
    location: firstHospital?.city ?? (row.hospitals?.[0]?.city ?? ''),
    years_of_experience: row.years_experience ?? 0,
    languages: row.languages ?? [],
    rating: row.rating ?? 0,
    availability_status: null,
    is_verified: row.verification_status === 'verified',
    ...(row.availability ?? []).length ? { next_available_at: formatNextAvailable(row.availability?.[0]) } : {},
  };
}
const weekdays = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

const formatNextAvailable = (slot?: NonNullable<DoctorDetailRow['availability']>[number]): string | undefined =>
  slot ? `${weekdays[slot.day_of_week] ?? ''} ${slot.start_time?.slice(0,5) ?? ''}` : undefined;

/** Real hospital detail + relationships; falls back to null so the caller keeps static data. */
export async function fetchRealHospitalDetail(id: string): Promise<Hospital | null> {
  if (!isConfigured()) return null;
  const row = await getHospitalDetail(id);
  return row ? toHospitalDetail(row) : null;
}

/** Real doctor detail + relationships; falls back to null so the caller keeps static data. */
export async function fetchRealDoctorDetail(id: string): Promise<Doctor | null> {
  if (!isConfigured()) return null;
  const row = await getDoctorDetail(id);
  return row ? toDoctorDetail(row) : null;
}

/** Real doctors linked to a hospital (hospital to  show-all-doctors flow). */
export async function fetchRealDoctorsByHospital(hospitalId: string): Promise<Doctor[]> {
  if (!isConfigured()) return [];
  const rows = await listDoctorsByHospital(hospitalId);
  return rows.map(toDoctorDetail);
}

/** MODE A: doctors relevant to a hospital for a specific condition (real). */
export async function fetchRelevantDoctorsForHospital(
  hospitalId: string,
  conditionId: string
): Promise<Doctor[]> {
  if (!isConfigured()) return [];
  const rows = await listRelevantDoctorsForHospital(hospitalId, conditionId);
  return rows.map(toDoctor);
}

/** MODE B: every doctor linked to a hospital (real; unfiltered show-all). */
export async function fetchAllDoctorsAtHospital(hospitalId: string): Promise<Doctor[]> {
  if (!isConfigured()) return [];
  const rows = await listDoctorsAtHospital(hospitalId);
  return rows.map(toDoctor);
}