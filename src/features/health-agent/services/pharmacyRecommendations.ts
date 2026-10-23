/**
 * CareLink-AI — pharmacy/laboratory → agent recommendation bridge.
 *
 * The Health Agent must show the SAME pharmacy and laboratory records the
 * directory pages show (the sourced corridor directory in
 * `src/data/pharmacies.ts` / `laboratories.ts`), never the legacy fabricated US
 * demo set ("Greenline Pharmacy", "$12.40", "Precision Diagnostics Lab").
 *
 * HONESTY CONTRACT
 *   - `isOpen` is false and `hoursLabel` carries the source's own
 *     `opening_hours` string (or null) — the agent never claims a shop is open.
 *   - `distanceAvailable` is false unless the record has real coordinates AND a
 *     patient location exists; the card then shows "Distance unavailable".
 *   - `estimatedPrice` is NEVER set: no source publishes prices.
 *   - `availabilityPlaceholder` states that stock is not integrated.
 *   - Tests are only listed when the source published them (currently none).
 */

import { getPharmacies, getLaboratories } from '../../../services';
import { haversineKm, estimateDriveMinutes } from '../../../lib/location';
import type { Pharmacy, Laboratory } from '../../../types';
import type { LabRecommendation, PharmacyRecommendation } from '../types';

export interface PharmacyRecommendationOrigin {
  lat: number;
  lng: number;
  label?: string;
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

function computeDistance(
  record: { latitude?: number; longitude?: number },
  origin: PharmacyRecommendationOrigin | null,
): { distanceKm: number; eta: number; available: boolean } {
  if (origin && typeof record.latitude === 'number' && typeof record.longitude === 'number') {
    const km = haversineKm(origin, { lat: record.latitude, lng: record.longitude });
    if (km != null) {
      return { distanceKm: round1(km), eta: estimateDriveMinutes(km) ?? 0, available: true };
    }
  }
  return { distanceKm: 0, eta: 0, available: false };
}

function pharmacyToRecommendation(pharmacy: Pharmacy, origin: PharmacyRecommendationOrigin | null): PharmacyRecommendation {
  const { distanceKm, eta, available } = computeDistance(pharmacy, origin);
  const address = [pharmacy.address, pharmacy.locality, pharmacy.pincode].filter(Boolean).join(', ');
  return {
    id: pharmacy.id,
    name: pharmacy.name,
    distanceKm,
    estimatedTravelTimeMin: eta,
    // Live open/closed is unknown for the sourced directory — never invented.
    isOpen: false,
    availabilityPlaceholder: 'Medicine stock is not connected — confirm availability with the pharmacy.',
    address,
    distanceAvailable: available,
    hoursLabel: pharmacy.opening_hours ?? null,
    sourceLabel: pharmacy.source_label ?? pharmacy.provenance?.data_source ?? null,
    sourceUrl: pharmacy.provenance?.source_url ?? null,
    latitude: pharmacy.latitude,
    longitude: pharmacy.longitude,
    route: available
      ? {
          destinationName: pharmacy.name,
          destinationAddress: address,
          distanceKm,
          estimatedTravelTimeMin: eta,
          transportMode: 'driving',
          deepLink: { kind: 'pharmacy', id: pharmacy.slug },
        }
      : undefined,
  };
}

function laboratoryToRecommendation(lab: Laboratory, origin: PharmacyRecommendationOrigin | null): LabRecommendation {
  const { distanceKm, eta, available } = computeDistance(lab, origin);
  const address = [lab.address, lab.locality, lab.pincode].filter(Boolean).join(', ');
  return {
    id: lab.id,
    name: lab.name,
    // Tests are listed only when a source published them — never inferred.
    testsOffered: lab.tests ?? [],
    distanceKm,
    estimatedTravelTimeMin: eta,
    isOpen: false,
    homeCollectionAvailable: lab.home_collection === true,
    address,
    distanceAvailable: available,
    hoursLabel: lab.opening_hours ?? null,
    sourceLabel: lab.source_label ?? lab.provenance?.data_source ?? null,
    sourceUrl: lab.provenance?.source_url ?? null,
    latitude: lab.latitude,
    longitude: lab.longitude,
    route: available
      ? {
          destinationName: lab.name,
          destinationAddress: address,
          distanceKm,
          estimatedTravelTimeMin: eta,
          transportMode: 'driving',
          deepLink: { kind: 'lab', id: lab.slug },
        }
      : undefined,
  };
}

/** Real pharmacies, ranked by distance when a patient location is known. */
export async function getPharmacyRecommendations(
  origin: PharmacyRecommendationOrigin | null = null,
  limit = 4,
): Promise<PharmacyRecommendation[]> {
  const pharmacies = await getPharmacies({ origin, sort: 'nearest' });
  return pharmacies.slice(0, limit).map((pharmacy) => pharmacyToRecommendation(pharmacy, origin));
}

/** Real laboratories from the sourced corridor directory. */
export async function getLaboratoryRecommendations(
  origin: PharmacyRecommendationOrigin | null = null,
  limit = 4,
): Promise<LabRecommendation[]> {
  const labs = await getLaboratories({ origin });
  return labs.slice(0, limit).map((lab) => laboratoryToRecommendation(lab, origin));
}

/** True when a live pharmacy registry is reachable (affects provenance copy). */
export { isPharmacyBackendConfigured } from '../../../services';
