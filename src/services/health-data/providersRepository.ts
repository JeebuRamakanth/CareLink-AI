/**
 * CareLink-AI — provider ecosystem repository (Step 10.5 §4/§5/§22).
 *
 * Public provider DISCOVERY reads (hospitals/doctors/pharmacies/labs, master
 * condition/symptom/specialty data). These tables are public-read via RLS;
 * no patient data is exposed here. Returns null/empty when Supabase is
 * unavailable — callers keep using the existing mock provider data.
 */

import { withClient } from './repository';
import type {
  ConditionRow,
  ConsultationFeeRow,
  DoctorAvailabilityRow,
  DoctorRow,
  EmergencyCapabilitiesRow,
  HospitalHourRow,
  HospitalLocationRow,
  HospitalRow,
  HospitalServiceRow,
  LabRow,
  PharmacyRow,
  SpecialtyRow,
  SymptomRow,
} from './types';

export async function listHospitals(query?: string): Promise<HospitalRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client.from('hospitals').select('*').order('name');
    if (query) q = q.ilike('name', `%${query}%`);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as HospitalRow[]) ?? [];
  });
  return data ?? [];
}

export interface HospitalSearchFilters {
  specialty?: string;
  service?: string;
  emergency?: boolean;
}

export interface HospitalDetailRow extends HospitalRow {
  locations: HospitalLocationRow[];
  services: HospitalServiceRow[];
  specialties: Array<{ specialty_name: string }>;
  hours: HospitalHourRow[];
  emergency_capability: EmergencyCapabilitiesRow | null;
  conditions: Array<{ condition_name: string }>;
  verification_status: string | null;
}

export interface DoctorDetailRow extends DoctorRow {
  specialties: Array<{ specialty_name: string }>;
  conditions: Array<{ condition_name: string }>;
  hospitals: Array<{ id: string; slug: string; name: string; city: string | null }>;
  availability: DoctorAvailabilityRow[];
  qualifications: Array<{ degree: string; institution: string | null; year: number | null }>;
  certifications: Array<{ title: string; issuer: string | null; year: number | null }>;
  fees: ConsultationFeeRow[];
  doctor_profiles: Array<{ about: string | null; education_summary: string | null; experience_summary: string | null }>;
  verification_status: string | null;
}

/** Server-side hospital search (joins specialty/service/emergency tables). */
export async function searchHospitalsByFilters(filters: HospitalSearchFilters): Promise<HospitalDetailRow[]> {
  const { data } = await withClient(async (client) => {
    const select = [
      '*',
      'hospital_locations(*)',
      'hospital_services(service_name)',
      'hospital_specialties(specialties(name))',
      'hospital_hours(day_of_week,open_time,close_time,is_24_hours)',
      'emergency_capabilities(has_emergency_department,has_ambulance,has_icu,capabilities)',
      'hospital_condition_services(conditions(name))',
    ].join(',');
    let q = client.from('hospitals').select(select);
    if (filters.specialty) q = q.ilike('hospital_specialties.specialties.name', `%${filters.specialty}%`);
    if (filters.service) q = q.ilike('hospital_services.service_name', `%${filters.service}%`);
    if (filters.emergency) q = q.eq('emergency_capabilities.has_emergency_department', true);
    const res = await q.order('name').limit(50);
    if (res.error) throw res.error;
    return ((res.data ?? []) as unknown as HospitalDetailRow[]).map(h => ({
      ...(h as object),
      specialties: ((h as any).specialties ?? []).map((s: any) => ({ specialty_name: s.specialties?.name, title: s.specialties?.name ?? null })),
      conditions: ((h as any).conditions ?? []).map((c: any) => ({ condition_name: c.conditions?.name ?? null })),
      emergency_capability: (h as any).emergency_capabilities?.[0] ?? null,
      verification_status: (h as any).hospital_verification?.[0]?.status ?? null,
    })) as HospitalDetailRow[];
  });
  return data ?? [];
}

/** Hospital detail + linked relationships (locations/services/specialties/hours/emergency/conditions). */
export async function getHospitalDetail(id: string): Promise<HospitalDetailRow | null> {
  const { data } = await withClient(async (client) => {
    const select = [
      '*',
      'hospital_locations(*)',
      'hospital_services(*)',
      'hospital_specialties(specialties(name))',
      'hospital_hours(*)',
      'emergency_capabilities(*)',
      'hospital_condition_services(conditions(id,name,slug,description))',
      'hospital_verification(status)',
    ].join(',');
    const res = await client.from('hospitals').select(select).eq('id', id).maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return null;
    const d = res.data as any;
    return {
      ...(d as object),
      specialties: (d.specialties ?? []).map((s: any) => ({ specialty_name: s.specialties?.name ?? null })),
      conditions: (d.conditions ?? []).map((c: any) => ({ condition_name: c.conditions?.name ?? null })),
      emergency_capability: d.emergency_capabilities?.[0] ?? null,
      verification_status: d.hospital_verification?.[0]?.status ?? null,
    } as HospitalDetailRow;
  });
  return data ?? null;
}

/** All doctors linked to a hospital via the canonical doctor_hospitals join. */
export async function listDoctorsByHospital(hospitalId: string): Promise<DoctorDetailRow[]> {
  const { data } = await withClient(async (client) => {
    const select = [
      'doctor_id',
      'hospital_id',
      'doctors(id,slug,name,gender,years_experience,bio,photo_url,languages,rating,created_at,updated_at,doctor_specialties(specialties(name)),doctor_condition_expertise(conditions(name)),doctor_profiles(about,education_summary,experience_summary),doctor_availability(*),qualifications(degree,institution,year),certifications(title,issuer,year),consultation_fees(*),doctor_verification(status))',
    ].join(',');
    const res = await client.from('doctor_hospitals').select(select).eq('hospital_id', hospitalId);
    if (res.error) throw res.error;
return ((res.data ?? []) as any[]).map((r: any) => ({
      ...(r.doctors ?? {}),
      specialties: (r.doctors?.doctor_specialties ?? []).map((s: any) => ({ specialty_name: s.specialties?.name ?? null })),
      conditions: (r.doctors?.doctor_condition_expertise ?? []).map((c: any) => ({ condition_name: c.conditions?.name ?? null })),
      hospitals: [{ id: r.hospital_id, slug: '', name: '', city: null }],
      availability: r.doctors?.doctor_availability ?? [],
      qualifications: r.doctors?.qualifications ?? [],
      certifications: r.doctors?.certifications ?? [],
      fees: r.doctors?.consultation_fees ?? [],
      doctor_profiles: r.doctors?.doctor_profiles ?? [],
      verification_status: r.doctors?.doctor_verification?.[0]?.status ?? null,
    })) as DoctorDetailRow[];
  });
return data ?? [];
}

export async function getDoctorDetail(id: string): Promise<DoctorDetailRow | null> {
  const { data } = await withClient(async (client) => {
    const select = [
      '*',
      'doctor_specialties(specialties(name))',
      'doctor_condition_expertise(conditions(id,name,slug,description))',
      'doctor_hospitals(hospitals(id,name,slug,city,address,phone_number))',
      'doctor_availability(*)',
      'qualifications(degree,institution,year)',
      'certifications(title,issuer,year)',
      'consultation_fees(*)',
      'doctor_profiles(*)',
      'doctor_verification(status)',
    ].join(',');
    const res = await client.from('doctors').select(select).eq('id', id).maybeSingle();
    if (res.error) throw res.error;
    if (!res.data) return null;
    const d = res.data as any;
    return {
      ...(d as object),
      specialties: (d.doctor_specialties ?? []).map((s: any) => ({ specialty_name: s.specialties?.name ?? null })),
      conditions: (d.doctor_condition_expertise ?? []).map((c: any) => ({ condition_name: c.conditions?.name ?? null })),
      hospitals: (d.doctor_hospitals ?? []).map((dh: any) => ({ ...dh.hospitals })),
      availability: d.doctor_availability ?? [],
      qualifications: d.qualifications ?? [],
      certifications: d.certifications ?? [],
      fees: d.consultation_fees ?? [],
      doctor_profiles: d.doctor_profiles ?? [],
      verification_status: d.doctor_verification?.[0]?.status ?? null,
    } as DoctorDetailRow;

  });
  return data ?? null;
}

export async function getHospitalBySlug(slug: string): Promise<HospitalRow | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('hospitals').select('*').eq('slug', slug).maybeSingle();
    if (res.error) throw res.error;
    return (res.data as HospitalRow | null) ?? null;
  });
  return data;
}

export async function listDoctors(query?: string): Promise<DoctorRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client.from('doctors').select('*').order('name');
    if (query) q = q.ilike('name', `%${query}%`);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as DoctorRow[]) ?? [];
  });
  return data ?? [];
}

export async function getDoctorBySlug(slug: string): Promise<DoctorRow | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('doctors').select('*').eq('slug', slug).maybeSingle();
    if (res.error) throw res.error;
    return (res.data as DoctorRow | null) ?? null;
  });
  return data;
}

/**
 * Doctors relevant to a hospital + condition context (Step 10.5 §4):
 * doctors linked to the hospital AND with expertise for the condition.
 * Powers "relevant doctors first" with an explicit "show all" fallback
 * (call listDoctorsAtHospital for the unfiltered list).
 */
export async function listRelevantDoctorsForHospital(
  hospitalId: string,
  conditionId: string
): Promise<DoctorRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('doctor_hospitals')
      .select('doctor_id, doctors!inner(*), doctor_condition_expertise!inner(condition_id)')
      .eq('hospital_id', hospitalId)
      .eq('doctor_condition_expertise.condition_id', conditionId);
    if (res.error) throw res.error;
    const rows = (res.data as unknown as { doctors: DoctorRow }[] | null) ?? [];
    return rows.map((r) => r.doctors);
  });
  return data ?? [];
}

export async function listDoctorsAtHospital(hospitalId: string): Promise<DoctorRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('doctor_hospitals')
      .select('doctors!inner(*)')
      .eq('hospital_id', hospitalId);
    if (res.error) throw res.error;
    const rows = (res.data as unknown as { doctors: DoctorRow }[] | null) ?? [];
    return rows.map((r) => r.doctors);
  });
  return data ?? [];
}

/** Symptom → possible conditions → specialties (navigational, not diagnostic). */
export async function findSpecialtiesForSymptom(symptomSlug: string): Promise<SpecialtyRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('symptoms')
      .select('symptom_conditions!inner(condition_id, conditions!inner(condition_specialties!inner(specialties!inner(*))))')
      .eq('slug', symptomSlug);
    if (res.error) throw res.error;
    const out: SpecialtyRow[] = [];
    const seen = new Set<string>();
    for (const row of (res.data as unknown[] | null) ?? []) {
      const symptom = row as {
        symptom_conditions: { conditions: { condition_specialties: { specialties: SpecialtyRow }[] } }[];
      };
      for (const sc of symptom.symptom_conditions ?? []) {
        for (const cs of sc.conditions?.condition_specialties ?? []) {
          const s = cs.specialties;
          if (s && !seen.has(s.id)) {
            seen.add(s.id);
            out.push(s);
          }
        }
      }
    }
    return out;
  });
  return data ?? [];
}

export async function listConditions(): Promise<ConditionRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('conditions').select('*').eq('is_active', true).order('name');
    if (res.error) throw res.error;
    return (res.data as ConditionRow[]) ?? [];
  });
  return data ?? [];
}

export async function listSymptoms(): Promise<SymptomRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('symptoms').select('*').eq('is_active', true).order('name');
    if (res.error) throw res.error;
    return (res.data as SymptomRow[]) ?? [];
  });
  return data ?? [];
}

export async function listSpecialties(): Promise<SpecialtyRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('specialties').select('*').eq('is_active', true).order('name');
    if (res.error) throw res.error;
    return (res.data as SpecialtyRow[]) ?? [];
  });
  return data ?? [];
}

export async function listPharmacies(): Promise<PharmacyRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('pharmacies').select('*').order('name');
    if (res.error) throw res.error;
    return (res.data as PharmacyRow[]) ?? [];
  });
  return data ?? [];
}

export async function listLabs(): Promise<LabRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('labs').select('*').order('name');
    if (res.error) throw res.error;
    return (res.data as LabRow[]) ?? [];
  });
  return data ?? [];
}
