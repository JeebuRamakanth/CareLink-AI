import { hospitalsData } from '../data/hospitals';
import { fetchRealHospitalDetail, fetchRealHospitals } from './health-data';
import type { Hospital, HospitalFilters } from '../types';

const normalizeText = (value: string): string => value.trim().toLowerCase();

const sortHospitals = (items: Hospital[], sortBy?: HospitalFilters['sort_by']): Hospital[] => {
  if (!sortBy) {
    return items;
  }

  const sorted = [...items];

  switch (sortBy) {
    case 'highest_rated':
      return sorted.sort((left, right) => right.rating - left.rating || right.review_count - left.review_count);
    case 'nearest':
      return sorted.sort((left, right) => (left.distance_km ?? Number.POSITIVE_INFINITY) - (right.distance_km ?? Number.POSITIVE_INFINITY));
    case 'twenty_four_hours':
      return sorted.sort((left, right) => Number(right.facilities.twenty_four_hours) - Number(left.facilities.twenty_four_hours));
    case 'recommended':
    default:
      return sorted.sort((left, right) => right.rating - left.rating);
  }
};

export async function getHospitals(): Promise<Hospital[]> {
  const real = await fetchRealHospitals();
  if (real.length > 0) return real;
  return [...hospitalsData];
}

export async function getHospitalById(id: string): Promise<Hospital | null> {
  const real = await fetchRealHospitalDetail(id);
  if (real) return real;
  return hospitalsData.find((hospital) => hospital.id === id) ?? null;
}

export async function searchHospitals(query: string): Promise<Hospital[]> {
  const normalizedQuery = normalizeText(query);

  const all = await getHospitals();
  if (!normalizedQuery) return all;

  return all.filter((hospital) => {
    const haystack = [
      hospital.name,
      hospital.city,
      hospital.state,
      hospital.description,
      hospital.specialties.join(' '),
      hospital.departments.join(' '),
      hospital.tags?.join(' ') ?? '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export async function filterHospitals(filters: HospitalFilters = {}): Promise<Hospital[]> {
  const all = await getHospitals();
  const result = all.filter((hospital) => {
    const matchesCity = !filters.city || normalizeText(hospital.city).includes(normalizeText(filters.city));
    const matchesDepartment = !filters.department || hospital.departments.some((department) => normalizeText(department).includes(normalizeText(filters.department ?? '')));
    const matchesSpecialty = !filters.specialty || hospital.specialties.some((specialty) => normalizeText(specialty).includes(normalizeText(filters.specialty ?? '')));
    const matchesEmergency = filters.emergency === undefined || hospital.facilities.emergency === filters.emergency;
    const matchesTwentyFourHours = filters.twenty_four_hours === undefined || hospital.facilities.twenty_four_hours === filters.twenty_four_hours;
    const matchesIcu = filters.icu === undefined || hospital.facilities.icu === filters.icu;
    const matchesAmbulance = filters.ambulance === undefined || hospital.facilities.ambulance === filters.ambulance;
    const matchesBloodBank = filters.blood_bank === undefined || hospital.facilities.blood_bank === filters.blood_bank;
    const matchesParking = filters.parking === undefined || hospital.facilities.parking === filters.parking;
    const matchesInsurance = filters.insurance === undefined || (filters.insurance ? (hospital.insurance_partners?.length ?? 0) > 0 : (hospital.insurance_partners?.length ?? 0) === 0);
    const matchesRating = filters.rating_min === undefined || hospital.rating >= filters.rating_min;
    const matchesDistance = filters.distance_max_km === undefined || (hospital.distance_km ?? Number.POSITIVE_INFINITY) <= filters.distance_max_km;

    return matchesCity && matchesDepartment && matchesSpecialty && matchesEmergency && matchesTwentyFourHours && matchesIcu && matchesAmbulance && matchesBloodBank && matchesParking && matchesInsurance && matchesRating && matchesDistance;
  });

  return sortHospitals(result, filters.sort_by);
}
