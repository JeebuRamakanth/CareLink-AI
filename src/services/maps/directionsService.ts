/**
 * CareLink-AI — Google Maps directions helper.
 *
 * The SINGLE place that turns a directory record into a Google Maps directions
 * URL. Every "Directions" action in the app (hospital card, hospital detail,
 * doctor profile, department, blood centre, chatbot cards) calls this, so no
 * card can route to a stale or unrelated destination.
 *
 * Destination evidence, in descending order of reliability:
 *   1. a verified Google Maps Place ID
 *   2. real latitude/longitude
 *   3. the facility's own name plus a specific street address
 *   4. the facility's own name plus locality + district (when no street address)
 *
 * A facility with none of those returns `null`: the UI must then show an honest
 * "Directions unavailable" state instead of routing to a guessed location. This
 * helper never falls back to a shared default coordinate.
 *
 * The universal Maps URL form needs no API key:
 *   https://www.google.com/maps/dir/?api=1&destination=...
 */

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export interface DirectionsOrigin {
  label?: string;
  latitude?: number;
  longitude?: number;
}

/** The location evidence a caller may supply. Every field is optional. */
export interface DirectionsTarget {
  /** Official/display name. Required — a directions request needs a label. */
  name: string;
  address?: string;
  locality?: string;
  district?: string;
  state?: string;
  country?: string;
  latitude?: number | null;
  longitude?: number | null;
  /** Google Maps place id, when a source published one. */
  placeId?: string | null;
}

export interface DirectionsOptions {
  origin?: DirectionsOrigin;
  mode?: TravelMode;
}

export interface DirectionsAvailability {
  available: boolean;
  /** Which evidence level would be used, or why directions are unavailable. */
  method: 'place_id' | 'coordinates' | 'address' | 'locality' | 'unavailable';
  reason: string;
}

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const hasCoordinates = (target: DirectionsTarget): boolean =>
  isFiniteNumber(target.latitude) && isFiniteNumber(target.longitude);

/** Street address that carries more than a restatement of the name. */
function usableAddress(target: DirectionsTarget): string | null {
  const address = (target.address ?? '').trim();
  if (address.length < 6) return null;
  // An address identical to the name adds no destination precision.
  if (address.toLowerCase() === target.name.trim().toLowerCase()) return null;
  return address;
}

/** Locality + district, e.g. "Pedana, Krishna, Andhra Pradesh". */
function localityPhrase(target: DirectionsTarget): string | null {
  const parts = [target.locality, target.district, target.state, target.country]
    .map((part) => (part ?? '').trim())
    .filter((part) => part.length > 0);
  // A locality phrase needs at least a locality and one wider unit to be
  // meaningfully more specific than the name alone.
  if (parts.length < 2) return null;
  return parts.join(', ');
}

/**
 * Describe how (and whether) a directions request can be built for a target.
 * Used by the UI to disable/explain the action honestly.
 */
export function directionsAvailability(target: DirectionsTarget): DirectionsAvailability {
  if (!target.name?.trim()) {
    return { available: false, method: 'unavailable', reason: 'The facility has no published name.' };
  }
  if (target.placeId?.trim()) {
    return { available: true, method: 'place_id', reason: 'A published Google Maps place id is available.' };
  }
  if (hasCoordinates(target)) {
    return { available: true, method: 'coordinates', reason: 'Published coordinates are available.' };
  }
  if (usableAddress(target)) {
    return { available: true, method: 'address', reason: 'A published street address is available.' };
  }
  if (localityPhrase(target)) {
    return { available: true, method: 'locality', reason: 'Only the locality is published; the map may need a manual confirmation.' };
  }
  return {
    available: false,
    method: 'unavailable',
    reason: 'No coordinates, street address or locality are published for this facility, so a destination cannot be determined.',
  };
}

/**
 * Build a Google Maps directions URL for a facility.
 *
 * Returns `null` when the record has no usable destination evidence — callers
 * must render a disabled action with the reason from `directionsAvailability`.
 */
export function buildDirectionsUrl(target: DirectionsTarget, options: DirectionsOptions = {}): string | null {
  const availability = directionsAvailability(target);
  if (!availability.available) return null;

  const params = new URLSearchParams();
  params.set('api', '1');

  // Destination: coordinates are the most precise destination the URL supports;
  // a Place ID is passed alongside the name so Maps resolves the exact listing.
  const placeId = target.placeId?.trim();
  if (availability.method === 'coordinates') {
    params.set('destination', `${target.latitude},${target.longitude}`);
  } else {
    params.set('destination', target.name.trim());
  }
  if (placeId) params.set('destination_place_id', placeId);

  // A place-id-only destination still needs a resolvable query string.
  if (availability.method === 'address' || availability.method === 'locality') {
    const detail = usableAddress(target) ?? localityPhrase(target);
    if (detail) params.set('destination', `${target.name.trim()}, ${detail}`);
  }

  params.set('travelmode', options.mode ?? 'driving');

  const origin = options.origin;
  if (origin) {
    if (isFiniteNumber(origin.latitude) && isFiniteNumber(origin.longitude)) {
      params.set('origin', `${origin.latitude},${origin.longitude}`);
    } else if (origin.label?.trim()) {
      params.set('origin', origin.label.trim());
    }
  }

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A Google Maps place-search URL (a search, not a directions request). */
export function buildPlaceSearchUrl(target: DirectionsTarget): string | null {
  if (!target.name?.trim()) return null;
  const detail = usableAddress(target) ?? localityPhrase(target);
  const query = detail ? `${target.name.trim()}, ${detail}` : target.name.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/**
 * Adapter for the `Hospital` domain record. Lives here (not in the hospital
 * page) so cards, detail pages and the chatbot all resolve identically.
 */
export function hospitalDirectionsUrl(
  hospital: Pick<DirectionsTarget, 'name' | 'address' | 'latitude' | 'longitude'> & {
    id?: string;
    city?: string;
    district?: string;
    state?: string;
    pincode?: string;
  },
): string {
  // `google-<placeId>` ids carry the real Google place id (see
  // hospitalPlaceMapping.mapGooglePlaceToHospital).
  const placeId = hospital.id?.startsWith('google-') ? hospital.id.slice('google-'.length) : null;
  const address = [hospital.address, hospital.city, hospital.pincode]
    .map((part) => (part ?? '').trim())
    .filter(Boolean)
    .join(', ');
  return buildDirectionsUrl({
    name: hospital.name,
    address,
    locality: hospital.city,
    district: hospital.district,
    state: hospital.state,
    latitude: hospital.latitude,
    longitude: hospital.longitude,
    placeId,
  }) ?? buildPlaceSearchUrl({ name: hospital.name, address, locality: hospital.city, district: hospital.district, state: hospital.state })
    ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(hospital.name)}`;
}
