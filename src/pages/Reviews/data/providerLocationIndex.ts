/**
 * CareLink-AI — provider location index for the Reviews "Near me" sort (Step 28).
 *
 * A review row carries only a provider kind + slug/name, so proximity must be
 * resolved from the sourced directory. This index maps the identifiers a review
 * row exposes to real published coordinates — and returns `null` when the source
 * published none. Nothing is estimated: a provider without coordinates simply has
 * no distance, and the UI says so instead of inventing one.
 *
 * Coordinates come from:
 *   - hospitals  → their published latitude/longitude (mostly absent, honestly)
 *   - pharmacies → their published latitude/longitude
 *   - labs       → their published latitude/longitude
 *   - doctors    → the hospital they are affiliated with (never a guess)
 */

import { hospitalsData } from '../../../data/hospitals';
import { pharmaciesData } from '../../../data/pharmacies';
import { laboratoriesData } from '../../../data/laboratories';
import { getAllDirectoryDoctors } from '../../../services/providerDirectoryService';
import { haversineKm } from '../../../lib';

export interface ProviderCoordinates {
  lat: number;
  lng: number;
}

export interface ProviderIdentity {
  kind: 'hospital' | 'doctor' | 'pharmacy' | 'lab' | 'provider';
  slug: string;
  name: string;
}

const index = new Map<string, ProviderCoordinates>();

function key(kind: string, slug: string): string {
  return `${kind}::${slug.toLowerCase()}`;
}

function put(kind: string, slug: string, lat?: number | null, lng?: number | null): void {
  if (typeof lat !== 'number' || typeof lng !== 'number') return;
  index.set(key(kind, slug), { lat, lng });
}

for (const h of hospitalsData) {
  put('hospital', h.slug || h.id, h.latitude, h.longitude);
}
for (const p of pharmaciesData) {
  put('pharmacy', p.slug || p.id, p.latitude, p.longitude);
}
for (const l of laboratoriesData) {
  put('lab', l.slug || l.id, l.latitude, l.longitude);
}

// Doctors inherit the coordinates of a hospital they are affiliated with.
const hospitalCoordsById = new Map<string, ProviderCoordinates>();
for (const h of hospitalsData) {
  if (typeof h.latitude === 'number' && typeof h.longitude === 'number') {
    hospitalCoordsById.set(h.id, { lat: h.latitude, lng: h.longitude });
  }
}
for (const d of getAllDirectoryDoctors()) {
  for (const affiliation of d.affiliations) {
    const coords = hospitalCoordsById.get(affiliation.hospital_id);
    if (coords) {
      index.set(key('doctor', d.id), coords);
      break;
    }
  }
}

/** Real published coordinates for a provider, or null when none were published. */
export function providerCoordinates(identity: ProviderIdentity): ProviderCoordinates | null {
  return index.get(key(identity.kind, identity.slug)) ?? null;
}

/** Distance in km from an origin, or null when the provider has no coordinates. */
export function providerDistanceKm(
  identity: ProviderIdentity,
  origin: ProviderCoordinates | null | undefined,
): number | null {
  if (!origin) return null;
  const coords = providerCoordinates(identity);
  if (!coords) return null;
  return haversineKm({ lat: origin.lat, lng: origin.lng }, { lat: coords.lat, lng: coords.lng });
}

/** How many directory providers have a published location (used for honest copy). */
export function locatedProviderCount(): number {
  return index.size;
}
