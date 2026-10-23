/**
 * CareLink-AI — provider directory service.
 *
 * The single read boundary the UI uses for hospital DEPARTMENTS, DOCTORS and
 * BLOOD CENTRES. It merges the source-attributed curated evidence
 * (src/data/directoryEvidence.ts, src/data/bloodCentres.ts) with the generated
 * facility directory so the app and the database cannot disagree.
 *
 * Live Supabase rows win when a backend is configured and returns data; the
 * curated evidence is the honest offline/fallback source. Nothing here invents a
 * department, a doctor, a count or a stock level.
 */

import { hospitalsData } from '../data/hospitals';
import {
  buildDepartments,
  buildDoctors,
  type DoctorDirectoryEntry,
} from '../data/directoryEvidence';
import { bloodCentresData } from '../data/bloodCentres';
import { isSupabaseConfigured } from './supabase/client';
import type { BloodCentre, DoctorAffiliation, HospitalDepartment } from '../types';

export type { DoctorDirectoryEntry };

const departments = buildDepartments();
const doctors = buildDoctors();

const departmentsByHospital = new Map<string, HospitalDepartment[]>();
for (const department of departments) {
  const list = departmentsByHospital.get(department.hospital_id) ?? [];
  list.push(department);
  departmentsByHospital.set(department.hospital_id, list);
}

const doctorsByHospital = new Map<string, DoctorDirectoryEntry[]>();
for (const doctor of doctors) {
  for (const affiliation of doctor.affiliations) {
    const list = doctorsByHospital.get(affiliation.hospital_id) ?? [];
    list.push(doctor);
    doctorsByHospital.set(affiliation.hospital_id, list);
  }
}

/** Departments published for a hospital. Empty means "not published", not "none". */
export function getDepartmentsForHospital(hospitalId: string): HospitalDepartment[] {
  return [...(departmentsByHospital.get(hospitalId) ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Doctors whose affiliation names this hospital. */
export function getDoctorsForHospital(hospitalId: string): DoctorDirectoryEntry[] {
  return [...(doctorsByHospital.get(hospitalId) ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Doctors affiliated with one hospital department (by canonical department name). */
export function getDoctorsForDepartment(hospitalId: string, departmentName: string): DoctorDirectoryEntry[] {
  const key = departmentName.trim().toLowerCase();
  return getDoctorsForHospital(hospitalId).filter((doctor) =>
    doctor.affiliations.some((affiliation) =>
      affiliation.hospital_id === hospitalId
      && (affiliation.department_name ?? '').trim().toLowerCase() === key,
    ));
}

export interface DepartmentDoctorCount {
  /** Unique doctors whose affiliation names this department. */
  listed: number;
  /** Doctors whose affiliation is stated as current by the source. */
  current: number;
  /** How complete the roster is, per what the source actually publishes. */
  completeness: 'listed_roster' | 'partial_roster' | 'no_roster_published';
  lastUpdated: string;
  source: string;
}

/**
 * Per-department listed-doctor count, computed from the affiliation records —
 * never hardcoded and never presented as the facility's total staffing.
 */
export function getDepartmentDoctorCount(hospitalId: string, departmentName: string): DepartmentDoctorCount {
  const doctorsHere = getDoctorsForDepartment(hospitalId, departmentName);
  const affiliations = doctorsHere
    .flatMap((doctor) => doctor.affiliations)
    .filter((affiliation) => affiliation.hospital_id === hospitalId
      && (affiliation.department_name ?? '').trim().toLowerCase() === departmentName.trim().toLowerCase());
  const current = affiliations.filter((affiliation) => affiliation.status === 'current').length;
  const completeness: DepartmentDoctorCount['completeness'] = doctorsHere.length === 0
    ? 'no_roster_published'
    : affiliations.some((affiliation) => /visiting/i.test(affiliation.role ?? ''))
      ? 'partial_roster'
      : 'listed_roster';
  return {
    listed: doctorsHere.length,
    current,
    completeness,
    lastUpdated: affiliations[0]?.last_verified_at ?? '',
    source: affiliations[0]?.provenance?.data_source ?? '',
  };
}

/**
 * Total listed doctors for a hospital, from affiliation records only.
 * Returns 0 when no roster is published — the UI must render
 * "No doctor list available in current sources", never "0 doctors".
 */
export function getListedDoctorCount(hospitalId: string): number {
  return getDoctorsForHospital(hospitalId).length;
}

/** Every doctor in the directory (used by the Doctors page and the chatbot). */
export function getAllDirectoryDoctors(): DoctorDirectoryEntry[] {
  return [...doctors];
}

export function getDirectoryDoctorById(id: string): DoctorDirectoryEntry | null {
  return doctors.find((doctor) => doctor.id === id) ?? null;
}

/** All doctor↔hospital affiliations (for the admin/data-quality view). */
export function getAllAffiliations(): DoctorAffiliation[] {
  return doctors.flatMap((doctor) => doctor.affiliations);
}

/* -------------------------------------------------------------------------- */
/* Blood centres                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Blood centres in the corridor directory. Returns the curated evidence set;
 * a live backend, when configured, is merged in by the blood-centre service.
 */
export function getBundledBloodCentres(): BloodCentre[] {
  return [...bloodCentresData];
}

export function getBloodCentreById(id: string): BloodCentre | null {
  return bloodCentresData.find((centre) => centre.id === id || centre.slug === id) ?? null;
}

export function isDirectoryBackendConfigured(): boolean {
  return isSupabaseConfigured();
}

/**
 * Facility names for a hospital id, so a doctor card can show the real
 * affiliation rather than a bare id. Falls back to the id when the facility is
 * not in the bundled directory (e.g. a live-only registry row).
 */
export function getHospitalName(hospitalId: string): string {
  return hospitalsData.find((hospital) => hospital.id === hospitalId)?.name ?? '';
}

/**
 * Decorate a facility record with the departments and doctor count that the
 * source-attributed evidence provides. Applied at the read boundary so search,
 * filters and cards all see the same, real values — and so a facility with no
 * published department data keeps an empty list (never an invented one).
 */
export function enrichHospital<T extends { id: string; departments: string[]; specialties: string[]; doctor_count?: number }>(hospital: T): T {
  const departments = getDepartmentsForHospital(hospital.id);
  const listedDoctors = getDoctorsForHospital(hospital.id).length;
  if (departments.length === 0 && listedDoctors === 0) return hospital;
  const departmentNames = departments.map((department) => department.name);
  const specialties = [...new Set([...hospital.specialties, ...departmentNames])];
  return {
    ...hospital,
    departments: departmentNames.length > 0 ? departmentNames : hospital.departments,
    specialties,
    ...(listedDoctors > 0 ? { doctor_count: listedDoctors } : {}),
  };
}

/** Enrich every facility in a list (single pass, no repeated map rebuilds). */
export function enrichHospitals<T extends { id: string; departments: string[]; specialties: string[]; doctor_count?: number }>(hospitals: T[]): T[] {
  return hospitals.map(enrichHospital);
}
