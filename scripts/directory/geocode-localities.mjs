#!/usr/bin/env node
/**
 * CareLink-AI — corridor locality geocoder.
 *
 * The government district directories publish a pincode but no coordinates, so
 * a facility in a village the corridor allow-list does not name cannot be placed
 * on the map. That is why 71 sourced records sit in the "requires review" queue.
 *
 * This script resolves each unresolved locality through OpenStreetMap Nominatim
 * (public, no key, rate-limited to 1 request/second as the usage policy
 * requires) and records the REAL coordinates plus the distance from the
 * Machilipatnam→Vijayawada corridor path. A locality whose published centre is
 * inside the corridor buffer is added to the coverage evidence; one outside it
 * is recorded as outside and never displayed.
 *
 * Output: src/data/geocodedLocalities.ts — a GENERATED evidence file, reviewed
 * into the coverage boundary. Nothing is invented: a locality with no geocoding
 * result stays unresolved and its facilities stay in the review queue.
 *
 * USAGE
 *   node scripts/directory/geocode-localities.mjs           # resolve + write
 *   node scripts/directory/geocode-localities.mjs --offline # reuse the cache
 *
 * ACCESS POLICY: one HTTP GET per second to a public geocoding endpoint, with an
 * identifying User-Agent. No authentication bypass.
 */

import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CACHE_DIR = join(ROOT, 'scripts', 'directory', '.cache');
const CACHE_FILE = join(CACHE_DIR, 'geocode.json');
const OUT = join(ROOT, 'src', 'data', 'geocodedLocalities.ts');

const UA = 'CareLinkDirectoryBot/1.0 (healthcare coverage audit; +https://carelink.ai)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

const { CORRIDOR_BUFFER_KM, distanceToCorridorKm } =
  await import(join(ROOT, 'src', 'data', 'coverage.ts'));

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const cache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf8')) : {};

/**
 * Cache format version. Bumped when the query strategy changes so that stale
 * `null` results recorded under a weaker query form are retried instead of
 * being trusted forever.
 */
const CACHE_VERSION = 3;

/**
 * Query forms, tried in order. A locality record published by a district
 * directory often names a village that the geocoder only knows WITHOUT the
 * district qualifier (or vice versa), so a single query form produced false
 * negatives that left real corridor facilities stuck in the review queue.
 * Nothing is invented: the hit's own coordinates decide coverage.
 */
const queryForms = (locality, district) => [
  `${locality}, ${district} district, Andhra Pradesh, India`,
  `${locality}, Andhra Pradesh, India`,
  `${locality}, India`,
];

/**
 * Nominatim result classes/types that describe an actual SETTLEMENT or
 * administrative area. A same-named water body, road or building must never be
 * used as a village's location evidence — e.g. "Kesarapalli Minor" (a canal)
 * would otherwise admit a facility on a canal's coordinates.
 */
const SETTLEMENT_TYPES = new Set([
  'village', 'hamlet', 'town', 'city', 'suburb', 'neighbourhood', 'locality',
  'municipality', 'administrative', 'quarter', 'isolated_dwelling', 'farm',
  'residential', 'borough', 'county', 'state_district',
]);

const isSettlement = (entry) =>
  entry?.class === 'place' || entry?.class === 'boundary'
  || SETTLEMENT_TYPES.has(entry?.type);

/**
 * A settlement hit is only usable as corridor evidence when it is actually in
 * Andhra Pradesh. Same-named villages exist in other Indian states, and a
 * wrong-state hit would otherwise be scored against the corridor at random.
 */
const isInAndhraPradesh = (entry) =>
  /andhra pradesh/i.test(String(entry?.display_name ?? ''));

/** Query Nominatim for one locality, honouring the published usage policy. */
async function geocode(locality, district) {
  const key = `${locality}|${district}`;
  const cached = cache[key];
  if (cached && cached.__v === CACHE_VERSION) return cached;
  let result = null;
  for (const form of queryForms(locality, district)) {
    const url = `${NOMINATIM}?q=${encodeURIComponent(form)}&format=json&limit=1&countrycodes=in`;
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA } });
      if (response.ok) {
        const body = await response.json();
        if (Array.isArray(body) && body.length && isSettlement(body[0]) && isInAndhraPradesh(body[0])) {
          result = {
            __v: CACHE_VERSION,
            latitude: Number(body[0].lat),
            longitude: Number(body[0].lon),
            display_name: body[0].display_name,
            osm_type: body[0].osm_type,
            osm_id: body[0].osm_id,
            query_form: form,
          };
          break;
        }
      }
    } catch (error) {
      result = { __v: CACHE_VERSION, error: error.message };
    }
    await sleep(1100);
  }
  if (!result) result = { __v: CACHE_VERSION, error: 'no_result' };
  cache[key] = result;
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(CACHE_FILE, `${JSON.stringify(cache, null, 2)}\n`);
  await sleep(1100);
  return result;
}

/** Localities still unresolved by the pincode/locality rules, from the report. */
function unresolvedLocalities() {
  const reportPath = join(ROOT, 'scripts', 'directory', 'last-import-report.json');
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const byName = new Map();
  for (const entry of report.requires_review ?? []) {
    // "PHC Gudlavalleru" / "E-UPHC Bapujinagar" → "Gudlavalleru" / "Bapujinagar"
    const locality = String(entry.name ?? '')
      .replace(/^(e[\s.-]*uphc|uphc|uhc|phc|chc|ufwc|amoh[-\s]*[ivx]*|dlo|pp\.?\s*unit|ppu|pp\s*unit|tb\.?\s*clinic|t\.?b\.?\s*control\s*centre|temporary\s+ward|district\s+hospital)[\s./:-]*/i, '')
      .replace(/^[\s.,/-]+|[\s.,/-]+$/g, '')
      .trim();
    if (!locality) continue;
    if (!byName.has(locality.toLowerCase())) {
      byName.set(locality.toLowerCase(), { locality, district: entry.district ?? 'Krishna' });
    }
  }
  return [...byName.values()];
}

const offline = process.argv.includes('--offline');
const targets = unresolvedLocalities();
const resolved = [];

/**
 * Localities resolved on a PREVIOUS run are kept, not dropped. The review queue
 * shrinks as records are admitted, so regenerating from the queue alone would
 * silently discard the evidence that admitted earlier facilities.
 */
function previouslyResolved() {
  if (!existsSync(OUT)) return [];
  const source = readFileSync(OUT, 'utf8');
  const entries = [];
  const block = /\{\s*locality:\s*"((?:[^"\\]|\\.)*)",\s*district:\s*"((?:[^"\\]|\\.)*)",\s*latitude:\s*(-?[\d.]+),\s*longitude:\s*(-?[\d.]+),\s*corridorDistanceKm:\s*([\d.]+),\s*inCoverage:\s*(true|false),\s*geocodeSource:\s*"((?:[^"\\]|\\.)*)",\s*geocodeReference:\s*(?:("((?:[^"\\]|\\.)*)")|undefined),\s*resolvedName:\s*(?:("((?:[^"\\]|\\.)*)")|undefined),?\s*\}/g;
  let match;
  while ((match = block.exec(source))) {
    entries.push({
      locality: JSON.parse(`"${match[1]}"`),
      district: JSON.parse(`"${match[2]}"`),
      latitude: Number(match[3]),
      longitude: Number(match[4]),
      corridor_distance_km: Number(match[5]),
      in_coverage: match[6] === 'true',
      geocode_source: JSON.parse(`"${match[7]}"`),
      geocode_reference: match[9] !== undefined ? JSON.parse(`"${match[9]}"`) : null,
      resolved_name: match[11] !== undefined ? JSON.parse(`"${match[11]}"`) : null,
    });
  }
  return entries;
}

const byKey = new Map();
for (const entry of previouslyResolved()) {
  byKey.set(`${entry.locality}|${entry.district}`.toLowerCase(), entry);
}

console.log(`  geocoding ${targets.length} unresolved corridor localities …`);
for (const target of targets) {
  const key = `${target.locality}|${target.district}`.toLowerCase();
  if (offline && !cache[`${target.locality}|${target.district}`]) {
    if (byKey.has(key)) resolved.push(byKey.get(key));
    continue;
  }
  const hit = await geocode(target.locality, target.district);
  if (!hit || typeof hit.latitude !== 'number') {
    if (byKey.has(key)) resolved.push(byKey.get(key));
    continue;
  }
  const corridorDistanceKm = Number(distanceToCorridorKm({ latitude: hit.latitude, longitude: hit.longitude }).toFixed(2));
  resolved.push({
    locality: target.locality,
    district: target.district,
    latitude: hit.latitude,
    longitude: hit.longitude,
    corridor_distance_km: corridorDistanceKm,
    in_coverage: corridorDistanceKm <= CORRIDOR_BUFFER_KM,
    geocode_source: 'OpenStreetMap Nominatim',
    geocode_reference: hit.osm_type && hit.osm_id ? `${hit.osm_type}/${hit.osm_id}` : null,
    resolved_name: hit.display_name ?? null,
  });
}

// Re-admit every previously-resolved locality the current queue no longer names.
for (const entry of byKey.values()) {
  if (!resolved.some((r) => r.locality.toLowerCase() === entry.locality.toLowerCase())) {
    resolved.push(entry);
  }
}

resolved.sort((a, b) => a.locality.localeCompare(b.locality));
const inCoverage = resolved.filter((entry) => entry.in_coverage);
const outside = resolved.filter((entry) => !entry.in_coverage);

console.log(`  resolved ${resolved.length} · in corridor ${inCoverage.length} · outside ${outside.length}`);

const render = (entry) => `  {
    locality: ${JSON.stringify(entry.locality)},
    district: ${JSON.stringify(entry.district)},
    latitude: ${entry.latitude},
    longitude: ${entry.longitude},
    corridorDistanceKm: ${entry.corridor_distance_km},
    inCoverage: ${entry.in_coverage},
    geocodeSource: ${JSON.stringify(entry.geocode_source)},
    geocodeReference: ${entry.geocode_reference ? JSON.stringify(entry.geocode_reference) : 'undefined'},
    resolvedName: ${entry.resolved_name ? JSON.stringify(entry.resolved_name) : 'undefined'},
  },`;

writeFileSync(OUT, `import type { GeocodedLocality } from '../types';

/**
 * CareLink-AI — corridor locality coordinates (GENERATED — DO NOT EDIT BY HAND).
 *
 * Produced by \`node scripts/directory/geocode-localities.mjs\`. The government
 * district directories publish a pincode but no coordinates, so an unresolved
 * village locality cannot be placed on the map. Each entry below is the REAL
 * OpenStreetMap centre of a locality that appeared in a sourced facility record,
 * together with its distance from the Machilipatnam→Vijayawada corridor path.
 *
 * HONESTY RULES
 *   - A locality is only listed when a geocoder returned an actual place; no
 *     coordinate is interpolated or guessed.
 *   - \`inCoverage\` is derived from the shared corridor boundary in
 *     src/data/coverage.ts, so the app and the importer cannot disagree.
 *   - A locality that geocodes OUTSIDE the corridor buffer is retained here as
 *     evidence of an exclusion decision, and is never used to include a facility.
 *
 * Generated: ${new Date().toISOString()}
 * Localities: ${resolved.length} (in corridor ${inCoverage.length}, outside ${outside.length})
 */
export const geocodedLocalities: GeocodedLocality[] = [
${resolved.map(render).join('\n')}
];

/** Fast lookup by lower-cased locality name. */
export const geocodedLocalityIndex: ReadonlyMap<string, GeocodedLocality> = new Map(
  geocodedLocalities.map((entry) => [entry.locality.toLowerCase(), entry]),
);
`);

console.log(`  wrote: ${OUT.replace(`${ROOT}/`, '')}`);
