/**
 * Geolocation + distance + map deep-link helpers (Step 9).
 *
 * Pure math + URL builders. The real `useGeolocation` hook + maps adapter live
 * elsewhere; these primitives are provider-independent.
 *
 * Distances are only ever reported when a real provider (browser geo + maps)
 * produced coordinates. When no coordinates exist, callers MUST pass
 * `distanceKm: undefined` so the UI shows "Distance unavailable" rather than a
 * fabricated number.
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

const EARTH_RADIUS_KM = 6371;

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km. Returns null if inputs are invalid. */
export function haversineKm(a: Coordinates, b: Coordinates): number | null {
  if (!Number.isFinite(a?.lat) || !Number.isFinite(a?.lng) || !Number.isFinite(b?.lat) || !Number.isFinite(b?.lng)) {
    return null;
  }
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const h = sinDLat * sinDLat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
  return EARTH_RADIUS_KM * c;
}

/** Rough ETA in minutes for a driving distance (city-driving assumption). */
export function estimateDriveMinutes(distanceKm: number | null | undefined, avgKmh = 30): number | null {
  if (distanceKm == null || !Number.isFinite(distanceKm) || distanceKm < 0) return null;
  if (distanceKm === 0) return 0;
  return Math.max(1, Math.round((distanceKm / avgKmh) * 60));
}

export type TransportMode = 'driving' | 'walking' | 'transit';

/**
 * Build a Google Maps directions deep-link. Always returns a URL (no key needed
 * for the public directions URL). Used for the "Directions"/"Open Map" actions.
 */
export function buildMapsDirectionsUrl(params: {
  destination: string;
  origin?: Coordinates | string | { label?: string; lat?: number; lng?: number };
  mode?: TransportMode;
}): string {
  const { destination, origin, mode = 'driving' } = params;
  const dest = encodeURIComponent(destination);
  const base = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
  if (!origin) return base;
  let originParam: string | null = null;
  if (typeof origin === 'string') {
    originParam = encodeURIComponent(origin);
  } else {
    const o = origin as { label?: string; lat?: number; lng?: number };
    if (o.label) originParam = encodeURIComponent(o.label);
    else if (typeof o.lat === 'number' && typeof o.lng === 'number') originParam = `${o.lat},${o.lng}`;
  }
  return originParam ? `${base}&origin=${originParam}` : base;
}

/** Build a place search deep-link (opens in Google Maps search). */
export function buildMapsPlaceUrl(query: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/** Build a tel: deep-link for the "Call" action. */
export function buildTelHref(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  return digits ? `tel:${digits}` : '';
}

/** Build a geo: deep-link (cross-platform maps pin) from coordinates. */
export function buildGeoHref(coords: Coordinates, label?: string): string {
  const base = `geo:${coords.lat},${coords.lng}`;
  return label ? `${base}?q=${encodeURIComponent(label)}` : base;
}
