/**
 * CareLink-AI — service coverage boundary.
 *
 * The initial coverage area is the practical healthcare travel corridor between
 * Machilipatnam and Vijayawada, Andhra Pradesh, India. This module is the single
 * source of truth for "is this facility in coverage?", so the boundary can be
 * widened later without touching UI or ingestion logic.
 *
 * The boundary is intentionally TWO-part rather than a bare text search for two
 * city names:
 *
 *   1. A geographic corridor — every point within `CORRIDOR_BUFFER_KM` of the
 *      Machilipatnam→Vijayawada path. This admits intermediate settlements and
 *      roadside facilities that a city-name filter would silently drop.
 *   2. An explicit locality allow-list — the towns, mandals and settlements
 *      along that corridor, used when a record has a locality but no usable
 *      coordinates. Locality matching never requires coordinates.
 *
 * A facility is in coverage when EITHER test passes. Records outside coverage
 * are still imported into the raw source dataset but flagged, never displayed.
 *
 * HONESTY: this is a *documented interpretation*, not an official administrative
 * boundary. Krishna and NTR district government directories are the sources for
 * the first import; facilities in adjacent districts are included only when they
 * fall inside the corridor (e.g. Tadepalli/Mangalagiri next to Vijayawada).
 */

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/** The two anchor cities that define the corridor. */
export const CORRIDOR_ANCHORS: Record<'machilipatnam' | 'vijayawada', GeoPoint> = {
  machilipatnam: { latitude: 16.1875, longitude: 81.1389 },
  vijayawada: { latitude: 16.5062, longitude: 80.648 },
};

/** Maximum distance from the corridor path for a coordinate-bearing record. */
export const CORRIDOR_BUFFER_KM = 25;

/**
 * Localities (towns, mandals, settlements) on or immediately beside the
 * Machilipatnam–Vijayawada corridor. Lower-cased for matching. Krishna and NTR
 * district localities dominate; the last few are adjacent to Vijayawada.
 */
export const CORRIDOR_LOCALITIES: readonly string[] = [
  // Machilipatnam urban + immediate surroundings
  'machilipatnam',
  'chilakalapudi',
  'chinnapuram',
  'pedana',
  'guduru',
  'nagayalanka',
  'koduru',
  'challapalli',
  'ghantasala',
  'movva',
  'bandar',
  // Krishna district corridor belt (Machilipatnam → Vijayawada)
  'pamidimukkala',
  'pamarru',
  'thotlavalluru',
  'vuyyuru',
  'kankipadu',
  'penamaluru',
  'gudivada',
  'mudinepalli',
  'kaikalur',
  'mandavalli',
  'gannavaram',
  'unguturu',
  'nunna',
  'tadigadapa',
  'poranki',
  'kanuru',
  'yanamalakuduru',
  'gunadala',
  'patamata',
  'benz circle',
  // Vijayawada urban
  'vijayawada',
  'ibrahimpatnam',
  'kondapalli',
  'g konduru',
  'g.konduru',
  'mylavaram',
  'tadepalli',
  'mangalagiri',
  // Other Krishna district mandal headquarters that fall inside the buffer
  'avani gadda',
  'avanigadda',
  'mopidevi',
  'nandivada',
  'pedaparupudi',
  'vemuru',
  'tenali',
  'duggirala',
];

/** Districts whose facilities are considered for the first import. */
export const COVERAGE_DISTRICTS: readonly string[] = ['Krishna', 'NTR', 'Guntur'];

/**
 * Postal-code prefixes that are unambiguously inside the corridor, because they
 * are the two anchor cities' own urban delivery areas. A pincode is published by
 * the source and is real administrative geography, so it classifies a record
 * without needing coordinates. Only the anchor cities are listed here — a rural
 * pincode is NOT assumed to be on the corridor.
 *
 *   520xxx — Vijayawada urban (NTR district)
 *   521001–521005 — Machilipatnam urban (Krishna district)
 */
export const CORRIDOR_PINCODE_PREFIXES: readonly string[] = ['520'];
export const CORRIDOR_PINCODE_RANGES: ReadonlyArray<readonly [number, number]> = [[521001, 521005]];

/** True when a published pincode is inside an anchor city's urban area. */
export function isCorridorPincode(pincode?: string | null): boolean {
  const value = (pincode ?? '').trim();
  if (!/^\d{6}$/.test(value)) return false;
  if (CORRIDOR_PINCODE_PREFIXES.some((prefix) => value.startsWith(prefix))) return true;
  const numeric = Number(value);
  return CORRIDOR_PINCODE_RANGES.some(([from, to]) => numeric >= from && numeric <= to);
}

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in kilometres. */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

/**
 * Perpendicular-ish distance from `point` to the corridor segment, sampled so a
 * long segment is never treated as a single straight line across the delta.
 */
export function distanceToCorridorKm(point: GeoPoint): number {
  const { machilipatnam, vijayawada } = CORRIDOR_ANCHORS;
  const SAMPLES = 24;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= SAMPLES; i += 1) {
    const t = i / SAMPLES;
    const sample = {
      latitude: machilipatnam.latitude + (vijayawada.latitude - machilipatnam.latitude) * t,
      longitude: machilipatnam.longitude + (vijayawada.longitude - machilipatnam.longitude) * t,
    };
    best = Math.min(best, haversineKm(point, sample));
  }
  return best;
}

export type CoverageMethod = 'coordinates' | 'pincode' | 'locality' | 'district' | 'outside';

export interface CoverageResult {
  inCoverage: boolean;
  method: CoverageMethod;
  /** Distance from the corridor path when coordinates are known. */
  corridorDistanceKm?: number;
  matchedLocality?: string;
  reason: string;
}

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * Classify a facility against the corridor boundary. Evidence is used in
 * descending order of reliability: coordinates, then a published pincode inside
 * an anchor city, then corridor locality text. District alone is never enough to
 * claim coverage — it only queues the record for manual review.
 */
export function classifyCoverage(input: {
  latitude?: number | null;
  longitude?: number | null;
  locality?: string | null;
  address?: string | null;
  district?: string | null;
  pincode?: string | null;
}): CoverageResult {
  const { latitude, longitude } = input;

  if (typeof latitude === 'number' && typeof longitude === 'number'
      && Number.isFinite(latitude) && Number.isFinite(longitude)) {
    const distance = distanceToCorridorKm({ latitude, longitude });
    if (distance <= CORRIDOR_BUFFER_KM) {
      return {
        inCoverage: true,
        method: 'coordinates',
        corridorDistanceKm: Number(distance.toFixed(2)),
        reason: `within ${CORRIDOR_BUFFER_KM} km of the Machilipatnam–Vijayawada corridor`,
      };
    }
    // Coordinates exist and put the facility outside — trust them over text.
    return {
      inCoverage: false,
      method: 'outside',
      corridorDistanceKm: Number(distance.toFixed(2)),
      reason: `coordinates are ${distance.toFixed(1)} km from the corridor`,
    };
  }

  // A published pincode inside an anchor city is real administrative geography.
  if (isCorridorPincode(input.pincode)) {
    return {
      inCoverage: true,
      method: 'pincode',
      reason: `published pincode ${input.pincode} is inside a corridor city`,
    };
  }

  const haystack = normalise(`${input.locality ?? ''} ${input.address ?? ''}`);
  const matched = CORRIDOR_LOCALITIES.find((locality) => haystack.includes(locality));
  if (matched) {
    return {
      inCoverage: true,
      method: 'locality',
      matchedLocality: matched,
      reason: `locality "${matched}" is on the corridor`,
    };
  }

  const district = normalise(input.district ?? '');
  if (district && COVERAGE_DISTRICTS.some((d) => normalise(d) === district)) {
    return {
      inCoverage: false,
      method: 'district',
      reason: `district "${input.district}" is covered but the locality could not be matched — requires manual review`,
    };
  }

  return { inCoverage: false, method: 'outside', reason: 'no coordinate, pincode or corridor locality match' };
}

/** Human-readable description of the boundary, for docs and the admin report. */
export function describeCoverage(): string {
  return [
    `Corridor: Machilipatnam (${CORRIDOR_ANCHORS.machilipatnam.latitude}, ${CORRIDOR_ANCHORS.machilipatnam.longitude})`,
    `→ Vijayawada (${CORRIDOR_ANCHORS.vijayawada.latitude}, ${CORRIDOR_ANCHORS.vijayawada.longitude})`,
    `Buffer: ${CORRIDOR_BUFFER_KM} km`,
    `Corridor localities: ${CORRIDOR_LOCALITIES.length}`,
    `Districts: ${COVERAGE_DISTRICTS.join(', ')}`,
  ].join(' | ');
}
