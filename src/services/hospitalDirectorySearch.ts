import type { Hospital } from '../types';

const normalize = (value: string) => value.trim().toLocaleLowerCase();

export function matchesHospitalSearch(hospital: Hospital, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  const searchable = [
    hospital.name,
    hospital.city,
    hospital.address,
    hospital.description,
    hospital.facility_type ?? '',
    hospital.specialties.join(' '),
    hospital.departments.join(' '),
    hospital.tags?.join(' ') ?? '',
  ].join(' ');
  return normalize(searchable).includes(term);
}

export function matchesHospitalDirectoryFilters(
  hospital: Hospital,
  filters: { locality?: string; facilityType?: string; specialty?: string },
): boolean {
  const matchesLocality = !filters.locality
    || normalize(`${hospital.city} ${hospital.address}`).includes(normalize(filters.locality));
  const matchesType = !filters.facilityType
    || normalize(hospital.facility_type ?? '').includes(normalize(filters.facilityType));
  const matchesSpecialty = !filters.specialty
    || hospital.specialties.some((specialty) => normalize(specialty).includes(normalize(filters.specialty ?? '')));
  return matchesLocality && matchesType && matchesSpecialty;
}
