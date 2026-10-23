import type { Hospital } from '../../types';

export const MACHILIPATNAM_CENTER = { latitude: 16.18, longitude: 81.13 };
export const SEARCH_RADIUS_METERS = 12_000;

export type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
  primaryType?: string;
  types?: string[];
  nationalPhoneNumber?: string;
  websiteUri?: string;
  googleMapsUri?: string;
  rating?: number;
  userRatingCount?: number;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  attributions?: Array<{ provider?: string; providerUri?: string }>;
};

function distanceMeters(point: { latitude: number; longitude: number }): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = radians(MACHILIPATNAM_CENTER.latitude);
  const lat2 = radians(point.latitude);
  const deltaLat = lat2 - lat1;
  const deltaLng = radians(point.longitude - MACHILIPATNAM_CENTER.longitude);
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function classifyPlace(place: GooglePlace): string {
  const rawType = place.primaryType ?? place.types?.find((type) =>
    /hospital|clinic|doctor|dentist|medical|health|nursing/i.test(type),
  );
  return rawType
    ? rawType.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
    : 'Healthcare facility';
}

export function deduplicateGooglePlaces(places: GooglePlace[]): GooglePlace[] {
  const seen = new Set<string>();
  return places.filter((place) => {
    if (!place.id || seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });
}

export function mapGooglePlaceToHospital(place: GooglePlace, checkedAt = new Date().toISOString()): Hospital | null {
  const id = place.id?.trim();
  const name = place.displayName?.text?.trim();
  const location = place.location;
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  if (!id || !name || !place.formattedAddress || !location
    || typeof latitude !== 'number' || typeof longitude !== 'number'
    || distanceMeters({ latitude, longitude }) > SEARCH_RADIUS_METERS) {
    return null;
  }

  const type = classifyPlace(place);
  const hours = place.regularOpeningHours?.weekdayDescriptions;
  return {
    id: `google-${id}`,
    created_at: checkedAt,
    updated_at: checkedAt,
    status: 'active',
    name,
    slug: id,
    type: /emergency/i.test(type) ? 'emergency_center' : /hospital/i.test(type) ? 'hospital' : 'medical_center',
    facility_type: type,
    description: '',
    address: place.formattedAddress,
    city: '',
    state: place.formattedAddress.includes('Andhra Pradesh') ? 'Andhra Pradesh' : '',
    country: 'India',
    latitude,
    longitude,
    phone: place.nationalPhoneNumber ?? '',
    ...(place.websiteUri ? { website: place.websiteUri } : {}),
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
    rating: place.rating ?? 0,
    review_count: place.userRatingCount ?? 0,
    availability_status: null,
    ...(hours?.length ? { opening_hours: hours } : {}),
    ...(place.googleMapsUri ? { google_maps_url: place.googleMapsUri } : {}),
    ...(place.businessStatus ? { business_status: place.businessStatus } : {}),
    ...(place.attributions?.length ? {
      google_attributions: place.attributions.map((attribution) => ({
        provider: attribution.provider ?? 'Source attribution',
        ...(attribution.providerUri ? { provider_uri: attribution.providerUri } : {}),
      })),
    } : {}),
    tags: place.types ?? [],
    is_verified: false,
    verification_status: 'GOOGLE_PLACES',
    source_label: 'Google Places',
    last_checked_at: checkedAt,
  };
}

/**
 * Directions URLs live in the single tested helper `directionsService.ts`
 * (Place ID > coordinates > address > locality). This module maps Google Place
 * payloads onto the domain record only.
 */

export function hospitalDetailsPath(id: string): string {
  return `/hospitals/${encodeURIComponent(id)}`;
}
