/**
 * CareLink-AI — nearest suitable emergency facility.
 *
 * Used by the document-analysis urgency banner so an emergency can offer a real
 * navigation destination. It reads the SAME sourced corridor directory the rest
 * of the app uses and prefers facilities that genuinely carry an emergency
 * capability.
 *
 * HONESTY RULES:
 * - Distance is only reported when the facility has real published coordinates
 *   AND the patient has a real location. Otherwise distance is `null`.
 * - The directions URL is built through the shared `directionsService`, which
 *   returns null when the record has no usable destination evidence. A null URL
 *   means the UI shows no directions link rather than a fabricated one.
 * - "Nearest by distance" is not asserted to be the clinically appropriate
 *   facility; the label says so.
 */

import { getHospitals } from '../hospitalService';
import { hospitalDirectionsUrl } from '../maps/directionsService';
import { haversineKm } from '../../lib/location';
import type { Hospital } from '../../types/models';

export interface EmergencyFacility {
  id: string;
  name: string;
  /** Real straight-line distance in km, or null when it cannot be computed. */
  distanceKm: number | null;
  /** Real directions URL, or null when no destination evidence exists. */
  directionsUrl: string | null;
  /** True when the directory records an emergency capability. */
  hasEmergency: boolean;
  address: string;
}

export interface PatientPoint {
  lat: number;
  lng: number;
  label?: string;
}

const hasCoords = (h: Hospital): boolean => typeof h.latitude === 'number' && typeof h.longitude === 'number';

/**
 * Find the nearest suitable emergency facility. Emergency-capable records are
 * preferred; a record with a real distance sorts first. Returns null when the
 * directory has no facilities.
 */
export async function findNearestEmergencyFacility(patient?: PatientPoint | null): Promise<EmergencyFacility | null> {
  let hospitals: Hospital[];
  try {
    hospitals = await getHospitals();
  } catch {
    return null;
  }
  if (hospitals.length === 0) return null;

  const withEmergency = hospitals.filter((h) => h.facilities?.emergency);
  const pool = withEmergency.length > 0 ? withEmergency : hospitals;

  const scored = pool.map((h) => {
    const km = patient && hasCoords(h)
      ? haversineKm({ lat: patient.lat, lng: patient.lng }, { lat: h.latitude as number, lng: h.longitude as number })
      : null;
    return { hospital: h, distanceKm: km === null ? null : Number(km.toFixed(1)) };
  });

  scored.sort((a, b) => {
    if (a.distanceKm === null && b.distanceKm === null) return 0;
    if (a.distanceKm === null) return 1;
    if (b.distanceKm === null) return -1;
    return a.distanceKm - b.distanceKm;
  });

  const best = scored[0].hospital;
  const url = hospitalDirectionsUrl({
    name: best.name,
    address: best.address,
    city: best.city,
    district: best.district,
    state: best.state,
    pincode: best.pincode,
    latitude: best.latitude,
    longitude: best.longitude,
    id: best.id,
  });

  return {
    id: best.id,
    name: best.name,
    distanceKm: scored[0].distanceKm,
    directionsUrl: url || null,
    hasEmergency: Boolean(best.facilities?.emergency),
    address: [best.address, best.city].filter(Boolean).join(', '),
  };
}
