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
  DoctorRow,
  HospitalRow,
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
