import { fetchRealHospitalDetail, fetchRealHospitals } from './health-data';
import { discoverCorridorHospitals, fetchGooglePlaceHospital } from './maps/googlePlacesService';
import { isSupabaseConfigured } from './supabase/client';
import { hospitalsData } from '../data/hospitals';
import { geocodedLocalities } from '../data/geocodedLocalities';
import { classifyCoverage, coverageScopeLabel, type LocalityLookup } from '../data/coverage';
import type { Hospital, HospitalFilters } from '../types';
import { env } from '../config';
import { isEligibleForDirectory, matchesHospitalSearch } from './hospitalDirectorySearch';
import { enrichHospital, enrichHospitals } from './providerDirectoryService';

const normalizeText = (value: string): string => value.trim().toLowerCase();
let directoryNotice: string | null = null;

/**
 * Locality centres resolved by `scripts/directory/geocode-localities.mjs`, so a
 * live registry record in a village the allow-list does not name is still
 * classified against the corridor rather than silently dropped.
 */
const geocodedLocalityIndex: ReadonlyMap<string, { latitude: number; longitude: number; inCoverage: boolean }> =
  new Map(geocodedLocalities.map((entry) => [
    entry.locality.toLowerCase(),
    { latitude: entry.latitude, longitude: entry.longitude, inCoverage: entry.inCoverage },
  ]));

const lookupLocality: LocalityLookup | undefined = geocodedLocalityIndex.size
  ? (name) => geocodedLocalityIndex.get(name.trim().toLowerCase()) ?? null
  : undefined;

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

/**
 * Coverage test for a record that came from a live source (registry or Places).
 * Uses the shared corridor boundary rather than a bare city-name match, so
 * Vijayawada and every intermediate corridor settlement is included and an
 * out-of-area record is excluded with a reason.
 */
function isInCoverage(hospital: Hospital): boolean {
  return classifyCoverage({
    latitude: hospital.latitude ?? null,
    longitude: hospital.longitude ?? null,
    locality: `${hospital.city} ${hospital.address}`,
    address: hospital.address,
    district: hospital.district ?? null,
    pincode: hospital.pincode ?? null,
  }, lookupLocality).inCoverage;
}

/**
 * The bundled, source-attributed corridor directory produced by
 * `scripts/directory/ingest.mjs`. Always available offline so the Hospitals page
 * shows real facilities instead of an empty list when no live provider is
 * configured.
 */
export function getBundledHospitals(): Hospital[] {
  return enrichHospitals(hospitalsData);
}

export async function getHospitals(): Promise<Hospital[]> {
  const [registryResult, placesResult] = await Promise.allSettled([
    fetchRealHospitals(),
    discoverCorridorHospitals(),
  ]);
  const registry = registryResult.status === 'fulfilled'
    ? registryResult.value.filter(isInCoverage)
    : [];
  const places = placesResult.status === 'fulfilled' ? placesResult.value.hospitals : [];

  const warnings: string[] = [];
  if (registryResult.status === 'rejected') warnings.push('The public provider registry could not be loaded.');
  if (placesResult.status === 'rejected') {
    warnings.push(placesResult.reason instanceof Error ? placesResult.reason.message : 'Google Places discovery failed.');
  } else if (placesResult.value.warning) {
    warnings.push(placesResult.value.warning);
  }

  // The notice states the ACTUAL source state, derived from configuration — not
  // a fixed string. When Places is configured but returned nothing, that is said
  // explicitly rather than claimed as "not configured".
  const liveSources: string[] = [];
  if (isSupabaseConfigured()) liveSources.push('the provider registry');
  if (env.maps.googlePlacesConfigured) liveSources.push('Google Places discovery');
  const bundledCount = getBundledHospitals().length;
  if (liveSources.length === 0) {
    directoryNotice = `Google Places discovery and the provider registry are not configured. Showing the bundled government-sourced directory (${bundledCount} facilities).`;
  } else if (liveSources.length === 1) {
    directoryNotice = `Showing ${liveSources[0]} plus the bundled government-sourced directory (${bundledCount} facilities).`;
  } else {
    directoryNotice = `Showing the provider registry and Google Places discovery, with the bundled government-sourced directory (${bundledCount} facilities) filling any gaps.`;
  }
  if (warnings.length) directoryNotice = `${warnings.join(' ')} ${directoryNotice}`;

  const hasConfiguredSource = env.maps.googlePlacesConfigured || isSupabaseConfigured();
  const hasSourceFailure = registryResult.status === 'rejected' || placesResult.status === 'rejected';
  if (hasConfiguredSource && hasSourceFailure && registry.length + places.length === 0) {
    throw new Error(directoryNotice ?? 'Unable to load hospital directory data.');
  }

  const byId = new Map<string, Hospital>();
  for (const hospital of [...registry, ...places]) {
    if (!byId.has(hospital.id)) byId.set(hospital.id, hospital);
  }
  // Live records win over the bundled copy; the bundled directory only fills in
  // facilities the live sources did not return, so the page is never empty.
  for (const bundled of getBundledHospitals()) {
    if (!byId.has(bundled.id)) byId.set(bundled.id, bundled);
  }
  // Phase 3.1 — an empty search shows the whole ELIGIBLE directory. Inactive and
  // permanently-closed records are excluded; everything else is returned (the
  // page paginates), never a silent sample.
  const eligible = [...byId.values()].filter(isEligibleForDirectory);
  return sortHospitals(enrichHospitals(eligible), 'recommended');
}

export async function getHospitalById(id: string): Promise<Hospital | null> {
  if (id.startsWith('google-')) return fetchGooglePlaceHospital(id);
  const real = await fetchRealHospitalDetail(id);
  if (real && isInCoverage(real)) return enrichHospital(real);
  // Fall back to the bundled directory so every listed facility has a detail
  // page that resolves (id OR public slug).
  const bundled = hospitalsData.find((h) => h.id === id || h.slug === id);
  return bundled ? enrichHospital(bundled) : null;
}

export function getHospitalDirectoryNotice(): string | null {
  return directoryNotice;
}

/**
 * The real configured coverage scope, for page copy. Derived from the corridor
 * boundary so the UI cannot advertise a stale search area.
 */
export function getCoverageScopeLabel(): string {
  return coverageScopeLabel();
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
