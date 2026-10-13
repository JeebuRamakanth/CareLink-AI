import { fetchRealHospitalDetail, fetchRealHospitals } from './health-data';
import { discoverMachilipatnamHospitals, fetchGooglePlaceHospital } from './maps/googlePlacesService';
import { isSupabaseConfigured } from './supabase/client';
import type { Hospital, HospitalFilters } from '../types';
import { env } from '../config';
import { matchesHospitalSearch } from './hospitalDirectorySearch';

const normalizeText = (value: string): string => value.trim().toLowerCase();
let directoryNotice: string | null = null;

const sortHospitals = (items: Hospital[], sortBy?: HospitalFilters['sort_by']): Hospital[] => {
  if (!sortBy) {
    return items;
  }

  const sorted = [...items];

  switch (sortBy) {
    case 'highest_rated':
      return sorted.sort((left, right) =>
        Number(right.rating > 0) - Number(left.rating > 0)
        || right.rating - left.rating
        || right.review_count - left.review_count,
      );
    case 'nearest':
      return sorted.sort((left, right) => (left.distance_km ?? Number.POSITIVE_INFINITY) - (right.distance_km ?? Number.POSITIVE_INFINITY));
    case 'twenty_four_hours':
      return sorted.sort((left, right) => Number(right.facilities.twenty_four_hours) - Number(left.facilities.twenty_four_hours));
    case 'recommended':
    default:
      return sorted.sort((left, right) => left.name.localeCompare(right.name));
  }
};

function isMachilipatnamRecord(hospital: Hospital): boolean {
  const locality = `${hospital.city} ${hospital.address}`.toLowerCase();
  return locality.includes('machilipatnam');
}

export async function getHospitals(): Promise<Hospital[]> {
  directoryNotice = env.maps.googlePlacesConfigured
    ? null
    : 'Google Places discovery is not configured. Configure VITE_GOOGLE_MAPS_API_KEY to search live listings.';

  const [registryResult, placesResult] = await Promise.allSettled([
    fetchRealHospitals(),
    discoverMachilipatnamHospitals(),
  ]);
  const registry = registryResult.status === 'fulfilled'
    ? registryResult.value.filter(isMachilipatnamRecord)
    : [];
  const places = placesResult.status === 'fulfilled' ? placesResult.value.hospitals : [];

  const warnings: string[] = [];
  if (registryResult.status === 'rejected') warnings.push('The public provider registry could not be loaded.');
  if (placesResult.status === 'rejected') {
    warnings.push(placesResult.reason instanceof Error ? placesResult.reason.message : 'Google Places discovery failed.');
  } else if (placesResult.value.warning) {
    warnings.push(placesResult.value.warning);
  }
  if (warnings.length) directoryNotice = warnings.join(' ');

  const hasConfiguredSource = env.maps.googlePlacesConfigured || isSupabaseConfigured();
  const hasSourceFailure = registryResult.status === 'rejected' || placesResult.status === 'rejected';
  if (hasConfiguredSource && hasSourceFailure && registry.length + places.length === 0) {
    throw new Error(directoryNotice ?? 'Unable to load hospital directory data.');
  }

  const byId = new Map<string, Hospital>();
  for (const hospital of [...registry, ...places]) {
    if (!byId.has(hospital.id)) byId.set(hospital.id, hospital);
  }
  return sortHospitals([...byId.values()], 'recommended');
}

export async function getHospitalById(id: string): Promise<Hospital | null> {
  if (id.startsWith('google-')) return fetchGooglePlaceHospital(id);
  const real = await fetchRealHospitalDetail(id);
  return real && isMachilipatnamRecord(real) ? real : null;
}

export function getHospitalDirectoryNotice(): string | null {
  return directoryNotice;
}

export async function searchHospitals(query: string): Promise<Hospital[]> {
  const all = await getHospitals();
  return all.filter((hospital) => matchesHospitalSearch(hospital, query));
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
