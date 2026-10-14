import { env } from '../../config';
import type { Hospital } from '../../types';
import {
  deduplicateGooglePlaces,
  MACHILIPATNAM_CENTER,
  mapGooglePlaceToHospital,
  SEARCH_RADIUS_METERS,
  type GooglePlace,
} from './hospitalPlaceMapping';
import { googlePlacesRequestError } from './googlePlacesErrors';

const SEARCH_URL = 'https://places.googleapis.com/v1/places:searchText';
const MAX_PAGES_PER_QUERY = 2;
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.primaryType',
  'places.types',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.googleMapsUri',
  'places.rating',
  'places.userRatingCount',
  'places.regularOpeningHours',
  'places.businessStatus',
  'places.attributions',
  'nextPageToken',
].join(',');
const DETAIL_FIELD_MASK = FIELD_MASK.replaceAll('places.', '').replace(',nextPageToken', '');

const SEARCH_QUERIES = [
  'hospitals in Machilipatnam, Andhra Pradesh, India',
  'government hospital in Machilipatnam, Andhra Pradesh, India',
  'private and multispecialty hospitals in Machilipatnam, Andhra Pradesh, India',
  'maternity and children hospitals in Machilipatnam, Andhra Pradesh, India',
  'eye and dental hospitals in Machilipatnam, Andhra Pradesh, India',
  'orthopaedic, cardiac and neurological hospitals in Machilipatnam, Andhra Pradesh, India',
  'clinics and nursing homes in Machilipatnam, Andhra Pradesh, India',
  'emergency and trauma hospitals in Machilipatnam, Andhra Pradesh, India',
];

type SearchResponse = {
  places?: GooglePlace[];
  nextPageToken?: string;
};

async function requestPlaces<T>(url: string, body: object | undefined, fieldMask: string): Promise<T> {
  if (!env.maps.googlePlacesConfigured) {
    throw new Error('Google Places is not configured.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      method: body ? 'POST' : 'GET',
      headers: {
        'X-Goog-Api-Key': env.maps.apiKey,
        'X-Goog-FieldMask': fieldMask,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw googlePlacesRequestError(response.status);
    }

    return await response.json() as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Google Places request timed out. Please retry.');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function searchQuery(query: string): Promise<GooglePlace[]> {
  const results: GooglePlace[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES_PER_QUERY; page += 1) {
    const result = await requestPlaces<SearchResponse>(SEARCH_URL, {
      textQuery: query,
      regionCode: 'IN',
      languageCode: 'en',
      pageSize: 20,
      locationBias: {
        circle: {
          center: MACHILIPATNAM_CENTER,
          radius: SEARCH_RADIUS_METERS,
        },
      },
      ...(pageToken ? { pageToken } : {}),
    }, FIELD_MASK);

    results.push(...(result.places ?? []));
    pageToken = result.nextPageToken;
    if (!pageToken) break;
  }
  return results;
}

let discoveryInFlight: Promise<{ hospitals: Hospital[]; warning: string | null }> | null = null;

async function runDiscovery(): Promise<{ hospitals: Hospital[]; warning: string | null }> {
  const outcomes: PromiseSettledResult<GooglePlace[]>[] = [];
  for (let index = 0; index < SEARCH_QUERIES.length; index += 3) {
    const queries = SEARCH_QUERIES.slice(index, index + 3);
    outcomes.push(...await Promise.allSettled(queries.map(searchQuery)));
  }
  const places: GooglePlace[] = [];
  let failureCount = 0;
  for (const outcome of outcomes) {
    if (outcome.status === 'fulfilled') places.push(...outcome.value);
    else failureCount += 1;
  }
  if (failureCount === outcomes.length) {
    const firstError = outcomes.find((outcome) => outcome.status === 'rejected');
    throw firstError?.status === 'rejected' ? firstError.reason : new Error('Google Places search failed.');
  }

  const hospitals: Hospital[] = [];
  const checkedAt = new Date().toISOString();
  for (const place of deduplicateGooglePlaces(places)) {
    const hospital = mapGooglePlaceToHospital(place, checkedAt);
    if (hospital) hospitals.push(hospital);
  }

  return {
    hospitals,
    warning: failureCount
      ? `${failureCount} of ${outcomes.length} category searches could not be completed. Results are partial.`
      : null,
  };
}

/** Searches a 12 km radius around Machilipatnam; results are not exhaustive. */
export function discoverMachilipatnamHospitals(): Promise<{ hospitals: Hospital[]; warning: string | null }> {
  if (!env.maps.googlePlacesConfigured) return Promise.resolve({ hospitals: [], warning: null });
  if (!discoveryInFlight) {
    discoveryInFlight = runDiscovery().finally(() => {
      discoveryInFlight = null;
    });
  }
  return discoveryInFlight;
}

export async function fetchGooglePlaceHospital(id: string): Promise<Hospital | null> {
  if (!id.startsWith('google-')) return null;
  const placeId = id.slice('google-'.length);
  if (!placeId || !env.maps.googlePlacesConfigured) return null;

  const place = await requestPlaces<GooglePlace>(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}?languageCode=en`,
    undefined,
    DETAIL_FIELD_MASK,
  );
  return mapGooglePlaceToHospital(place);
}
