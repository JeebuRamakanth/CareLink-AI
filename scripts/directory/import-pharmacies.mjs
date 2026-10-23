#!/usr/bin/env node
/**
 * CareLink-AI — pharmacy + laboratory directory importer.
 *
 * Turns the reviewed OpenStreetMap snapshots in `scripts/directory/source-snapshots/`
 * into the app's directory modules:
 *
 *   src/data/pharmacies.ts  (generated)
 *   src/data/laboratories.ts (generated)
 *   scripts/directory/last-pharmacy-import-report.json
 *
 * WHY OSM: it is the only openly-licensed (ODbL) source that publishes pharmacy
 * locations across the whole Machilipatnam→Vijayawada corridor with real
 * coordinates. Government district directories list hospitals, not retail
 * pharmacies, and the AP drug-control portal does not expose a machine-readable
 * outlet list. Coverage is therefore honest: OSM records what has been surveyed,
 * which is dense in Vijayawada and sparse in the villages between.
 *
 * HONESTY RULES (enforced here, not in the UI):
 *   - Never invent a name, address, phone, opening hour or coordinate. A field
 *     absent from the source stays absent.
 *   - A POI whose only name is the generic word "Pharmacy" is NOT dropped: its
 *     address is real, so it is kept and flagged `nameIsGeneric` for the UI to
 *     label as "Unnamed pharmacy listing".
 *   - Coverage uses the SHARED corridor boundary (`src/data/coverage.ts`), so a
 *     pharmacy is admitted exactly when a hospital would be — never a separate
 *     radius around one city.
 *   - No live stock: every record carries `stock_source: 'not_integrated'`.
 *
 * USAGE
 *   node scripts/directory/import-pharmacies.mjs            # write the modules
 *   node scripts/directory/import-pharmacies.mjs --report   # report only
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SNAPSHOT_DIR = join(ROOT, 'scripts', 'directory', 'source-snapshots');
const PHARMACY_OUT = join(ROOT, 'src', 'data', 'pharmacies.ts');
const LAB_OUT = join(ROOT, 'src', 'data', 'laboratories.ts');
const REPORT_OUT = join(ROOT, 'scripts', 'directory', 'last-pharmacy-import-report.json');
const MIGRATION_OUT = join(ROOT, 'supabase', 'migrations', '0036_step27_pharmacy_lab_directory.sql');

// --- Corridor boundary (mirrors src/data/coverage.ts; kept in sync by test) ---
const ANCHORS = {
  machilipatnam: { latitude: 16.1875, longitude: 81.1389 },
  vijayawada: { latitude: 16.5062, longitude: 80.648 },
};
const BUFFER_KM = 25;
const CORRIDOR_LOCALITIES = [
  'machilipatnam', 'chilakalapudi', 'chinnapuram', 'pedana', 'guduru', 'nagayalanka', 'koduru',
  'challapalli', 'ghantasala', 'movva', 'bandar', 'pamidimukkala', 'pamarru', 'thotlavalluru',
  'vuyyuru', 'kankipadu', 'penamaluru', 'gudivada', 'mudinepalli', 'kaikalur', 'mandavalli',
  'gannavaram', 'unguturu', 'nunna', 'tadigadapa', 'poranki', 'kanuru', 'yanamalakuduru',
  'gunadala', 'patamata', 'benz circle', 'vijayawada', 'ibrahimpatnam', 'kondapalli',
  'g konduru', 'g.konduru', 'mylavaram', 'tadepalli', 'mangalagiri', 'avani gadda', 'avanigadda',
  'mopidevi', 'nandivada', 'pedaparupudi', 'vemuru', 'tenali', 'duggirala', 'nidamanuru',
  'gollapudi', 'kankipadu', 'suryaraopet', 'gudavalli', 'nunna', 'gannavaram',
];

const EARTH_RADIUS_KM = 6371;
const toRad = (d) => (d * Math.PI) / 180;
function haversineKm(a, b) {
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}
function distanceToCorridorKm(point) {
  const { machilipatnam, vijayawada } = ANCHORS;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    best = Math.min(best, haversineKm(point, {
      latitude: machilipatnam.latitude + (vijayawada.latitude - machilipatnam.latitude) * t,
      longitude: machilipatnam.longitude + (vijayawada.longitude - machilipatnam.longitude) * t,
    }));
  }
  return best;
}
function classifyCoverage(record) {
  if (typeof record.latitude === 'number' && typeof record.longitude === 'number') {
    const distance = distanceToCorridorKm({ latitude: record.latitude, longitude: record.longitude });
    if (distance <= BUFFER_KM) return { inCoverage: true, method: 'coordinates', corridorDistanceKm: Number(distance.toFixed(2)) };
    return { inCoverage: false, method: 'outside', corridorDistanceKm: Number(distance.toFixed(2)) };
  }
  const haystack = `${record.locality ?? ''} ${record.address ?? ''}`.toLowerCase();
  const matched = CORRIDOR_LOCALITIES.find((loc) => haystack.includes(loc));
  if (matched) return { inCoverage: true, method: 'locality', matchedLocality: matched };
  return { inCoverage: false, method: 'outside' };
}

// --- Normalisation helpers -------------------------------------------------
const slugify = (value) => value
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 72);

/** Deterministic UUID-shaped id so replay never duplicates a record. */
function stableId(kind, key) {
  const hex = createHash('sha1').update(`${kind}:${key}`).digest('hex');
  const variant = ((parseInt(hex.slice(16, 17), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

const GENERIC_NAMES = /^(pharmacy|medical|medical store|medical shop|chemist|drug store|drug house|medicine shop|pharmacie)$/i;

const BRANDS = [
  'apollo pharmacy', 'medplus', 'med plus', 'hetero', 'thyrocare', 'dr lal pathlabs',
  'lal pathlabs', 'metropolis', 'srl diagnostics', 'suraksha', 'wellness forever',
];
function detectBrand(name) {
  const lower = (name ?? '').toLowerCase();
  const brand = BRANDS.find((b) => lower.includes(b));
  if (!brand) return undefined;
  return brand.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Build a human address line from the address components a source published. */
function buildAddress(raw) {
  const parts = [raw.road, raw.suburb, raw.locality, raw.city, raw.state_district || raw.county]
    .map((p) => (p ?? '').trim())
    .filter(Boolean);
  // De-duplicate consecutive repeats (OSM often repeats the locality).
  const unique = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i);
  return unique.join(', ');
}

// --- Import -----------------------------------------------------------------
function loadSnapshot(file) {
  const path = join(SNAPSHOT_DIR, file);
  if (!existsSync(path)) return { rows: [], present: false };
  return { rows: JSON.parse(readFileSync(path, 'utf8')), present: true };
}

const GENERATED_AT = new Date().toISOString();

function normalisePharmacy(raw) {
  const name = (raw.name ?? '').trim();
  const locality = (raw.city ?? raw.suburb ?? '').trim();
  const address = buildAddress(raw) || raw.display_name || '';
  const record = {
    osmType: raw.osm_type,
    osmId: raw.osm_id,
    name,
    latitude: raw.lat,
    longitude: raw.lon,
    locality,
    district: (raw.state_district ?? raw.county ?? '').replace(/ District$/i, '').trim() || undefined,
    pincode: raw.postcode ?? undefined,
    address,
    road: raw.road ?? undefined,
    opening_hours: raw.extratags?.opening_hours ?? undefined,
    phone: raw.extratags?.phone ?? raw.extratags?.['contact:phone'] ?? undefined,
    check_date: raw.extratags?.check_date ?? undefined,
  };
  const coverage = classifyCoverage(record);
  return { record, coverage, raw };
}

function toPharmacy(raw, coverage, seen) {
  const { record } = raw;
  const generic = !record.name || GENERIC_NAMES.test(record.name);
  const displayName = generic
    ? `Unnamed pharmacy listing${record.locality ? `, ${record.locality}` : ''}`
    : record.name;
  const baseSlug = slugify(`${displayName}-${record.locality || record.pincode || 'corridor'}`);
  let slug = baseSlug;
  let n = 2;
  while (seen.has(slug)) { slug = `${baseSlug}-${n}`; n += 1; }
  seen.add(slug);

  return {
    id: stableId('pharmacy', `${record.osmType}/${record.osmId}`),
    slug,
    name: displayName,
    nameIsGeneric: generic,
    address: record.address,
    locality: record.locality || 'Locality unlisted',
    district: record.district,
    pincode: record.pincode,
    state: 'Andhra Pradesh',
    country: 'India',
    latitude: record.latitude,
    longitude: record.longitude,
    phone: record.phone,
    opening_hours: record.opening_hours,
    brand: detectBrand(record.name),
    ownership: 'Private',
    stock_source: 'not_integrated',
    provenance: {
      data_source: 'OpenStreetMap contributors (ODbL 1.0)',
      source_url: `https://www.openstreetmap.org/${record.osmType}/${record.osmId}`,
      source_ref: `${record.osmType}/${record.osmId}`,
      fetched_at: GENERATED_AT.slice(0, 10),
      data_status: 'THIRD_PARTY_DIRECTORY',
    },
    source_label: 'OpenStreetMap (ODbL)',
    last_imported_at: GENERATED_AT.slice(0, 10),
    last_checked_at: record.check_date ?? GENERATED_AT.slice(0, 10),
    // A community-mapped POI is not a credential check.
    is_verified: false,
    coverageMethod: coverage.method,
    corridorDistanceKm: coverage.corridorDistanceKm,
  };
}

function toLaboratory(raw, coverage, seen) {
  const { record } = raw;
  const baseSlug = slugify(`${record.name}-${record.locality || record.pincode || 'corridor'}`);
  let slug = baseSlug;
  let n = 2;
  while (seen.has(slug)) { slug = `${baseSlug}-${n}`; n += 1; }
  seen.add(slug);

  return {
    id: stableId('lab', `${record.osmType}/${record.osmId}`),
    slug,
    name: record.name,
    address: record.address,
    locality: record.locality || 'Locality unlisted',
    district: record.district,
    pincode: record.pincode,
    state: 'Andhra Pradesh',
    country: 'India',
    latitude: record.latitude,
    longitude: record.longitude,
    phone: record.phone,
    opening_hours: record.opening_hours,
    ownership: 'Private',
    // Tests are never inferred from the facility type.
    tests: [],
    home_collection: undefined,
    provenance: {
      data_source: 'OpenStreetMap contributors (ODbL 1.0)',
      source_url: `https://www.openstreetmap.org/${record.osmType}/${record.osmId}`,
      source_ref: `${record.osmType}/${record.osmId}`,
      fetched_at: GENERATED_AT.slice(0, 10),
      data_status: 'THIRD_PARTY_DIRECTORY',
    },
    source_label: 'OpenStreetMap (ODbL)',
    last_imported_at: GENERATED_AT.slice(0, 10),
    last_checked_at: record.check_date ?? GENERATED_AT.slice(0, 10),
    is_verified: false,
    coverageMethod: coverage.method,
    corridorDistanceKm: coverage.corridorDistanceKm,
  };
}

/**
 * Deduplicate by OSM identity first, then by a NEAR-IDENTICAL record only.
 *
 * Two distinct branches of the same chain in the same city are different shops
 * and must both survive, so a match requires BOTH an identical name AND a very
 * close coordinate (or an identical address when coordinates are missing). A
 * name-only match never removes a record.
 */
function dedupe(rows) {
  const byOsm = new Map();
  for (const row of rows) {
    const key = `${row.osm_type}/${row.osm_id}`;
    if (!byOsm.has(key)) byOsm.set(key, row);
  }
  const unique = [...byOsm.values()];
  const kept = [];
  const removed = [];
  for (const row of unique) {
    const name = (row.name ?? '').trim().toLowerCase();
    const address = (row.display_name ?? '').trim().toLowerCase();
    const dup = kept.find((other) => {
      if ((other.name ?? '').trim().toLowerCase() !== name) return false;
      const otherAddress = (other.display_name ?? '').trim().toLowerCase();
      const sameAddress = Boolean(address) && address === otherAddress;
      const veryClose = haversineKm(
        { latitude: Number(other.lat), longitude: Number(other.lon) },
        { latitude: Number(row.lat), longitude: Number(row.lon) },
      ) < 0.03; // 30 m — the same physical shop mapped twice, not a second branch
      return sameAddress || veryClose;
    });
    if (dup) removed.push({ name: row.name, osm: `${row.osm_type}/${row.osm_id}`, duplicateOf: `${dup.osm_type}/${dup.osm_id}` });
    else kept.push(row);
  }
  return { kept, removed };
}

function renderModule({ header, exportName, typeName, rows }) {
  const body = rows.map((row) => {
    const { coverageMethod: _coverageMethod, corridorDistanceKm: _corridorDistanceKm, nameIsGeneric: _nameIsGeneric, ...rest } = row;
    const lines = Object.entries(rest)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => {
        if (typeof value === 'string') return `    ${key}: ${JSON.stringify(value)},`;
        if (typeof value === 'number') return `    ${key}: ${value},`;
        if (typeof value === 'boolean') return `    ${key}: ${value},`;
        if (Array.isArray(value)) return `    ${key}: ${JSON.stringify(value)},`;
        if (value && typeof value === 'object') return `    ${key}: ${JSON.stringify(value)},`;
        return `    ${key}: ${JSON.stringify(value)},`;
      })
      .join('\n');
    return `  {\n${lines}\n  },`;
  }).join('\n');

  return `${header}

import type { ${typeName} } from '../types';

export const ${exportName}: ${typeName}[] = [
${body}
];
`;
}

/**
 * Emit the backend migration from the SAME rows the app renders, so the DB and
 * the UI cannot drift apart.
 *
 * ADDITIVE and IDEMPOTENT: it only ADDS columns to the existing `pharmacies` /
 * `labs` registry tables (migration 0005) and upserts rows by stable id. No
 * existing column or row is dropped or rewritten.
 */
function renderMigration(pharmacies, laboratories) {
  const sqlString = (v) => (v == null ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
  const sqlNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? String(v) : 'null');

  const pharmacyValues = pharmacies.map((p) => `  (${sqlString(p.id)}::uuid, ${sqlString(p.slug)}, ${sqlString(p.name)}, ${sqlString(p.address)}, ${sqlString(p.locality)}, ${sqlString(p.district)}, ${sqlString(p.pincode)}, ${sqlString(p.state)}, ${sqlString(p.country)}, ${sqlNum(p.latitude)}, ${sqlNum(p.longitude)}, ${sqlString(p.phone)}, ${sqlString(p.opening_hours)}, ${sqlString(p.brand)}, ${sqlString(p.ownership)}, 'not_integrated', ${sqlString(p.provenance?.data_source)}, ${sqlString(p.provenance?.source_url)}, ${sqlString(p.provenance?.data_status ?? 'THIRD_PARTY_DIRECTORY')}, ${sqlString(p.last_checked_at)}::date)`).join(',\n');

  const labValues = laboratories.map((l) => `  (${sqlString(l.id)}::uuid, ${sqlString(l.slug)}, ${sqlString(l.name)}, ${sqlString(l.address)}, ${sqlString(l.locality)}, ${sqlString(l.district)}, ${sqlString(l.pincode)}, ${sqlString(l.state)}, ${sqlString(l.country)}, ${sqlNum(l.latitude)}, ${sqlNum(l.longitude)}, ${sqlString(l.phone)}, ${sqlString(l.opening_hours)}, ${sqlString(l.ownership)}, ${sqlString(l.provenance?.data_source)}, ${sqlString(l.provenance?.source_url)}, ${sqlString(l.provenance?.data_status ?? 'THIRD_PARTY_DIRECTORY')}, ${sqlString(l.last_checked_at)}::date)`).join(',\n');

  return `-- ===========================================================================
-- CareLink-AI — Step 27: corridor pharmacy + laboratory directory.
--
-- GENERATED by \`node scripts/directory/import-pharmacies.mjs\` from the reviewed
-- OpenStreetMap snapshots in scripts/directory/source-snapshots/. Do not edit by
-- hand; re-run the importer instead.
--
-- ADDITIVE + IDEMPOTENT. The provider registry already defines \`pharmacies\` and
-- \`labs\` (migration 0005); this migration only ADDS corridor/provenance columns
-- and upserts rows by stable id. Replaying never duplicates a row and never
-- rewrites an existing one's identity.
--
-- SECURITY: provider DISCOVERY data → public read, exactly like hospitals and
-- blood centres. No write policy for anon/authenticated; seeding is by migration.
--
-- HONESTY
--   - \`stock_source\` is 'not_integrated' everywhere: there is NO stock column, so
--     a stock level cannot be stored, fabricated or shown stale.
--   - \`is_verified\` stays false: a community-mapped POI is not a licence check.
--   - A field the source did not publish is NULL — never guessed.
--
-- SOURCE: OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the existing registry tables with corridor + provenance columns.
-- ---------------------------------------------------------------------------
alter table public.pharmacies add column if not exists district text;
alter table public.pharmacies add column if not exists pincode text;
alter table public.pharmacies add column if not exists state text default 'Andhra Pradesh';
alter table public.pharmacies add column if not exists country text default 'India';
alter table public.pharmacies add column if not exists latitude numeric(9,6);
alter table public.pharmacies add column if not exists longitude numeric(9,6);
alter table public.pharmacies add column if not exists opening_hours text;
alter table public.pharmacies add column if not exists brand text;
alter table public.pharmacies add column if not exists ownership text;
alter table public.pharmacies add column if not exists stock_source text not null default 'not_integrated';
alter table public.pharmacies add column if not exists data_source text;
alter table public.pharmacies add column if not exists source_url text;
alter table public.pharmacies add column if not exists data_status text not null default 'THIRD_PARTY_DIRECTORY';
alter table public.pharmacies add column if not exists last_checked_at date;

alter table public.labs add column if not exists district text;
alter table public.labs add column if not exists pincode text;
alter table public.labs add column if not exists state text default 'Andhra Pradesh';
alter table public.labs add column if not exists country text default 'India';
alter table public.labs add column if not exists latitude numeric(9,6);
alter table public.labs add column if not exists longitude numeric(9,6);
alter table public.labs add column if not exists opening_hours text;
alter table public.labs add column if not exists ownership text;
alter table public.labs add column if not exists data_source text;
alter table public.labs add column if not exists source_url text;
alter table public.labs add column if not exists data_status text not null default 'THIRD_PARTY_DIRECTORY';
alter table public.labs add column if not exists last_checked_at date;

create index if not exists pharmacies_locality_idx on public.pharmacies(city);
create index if not exists pharmacies_district_idx on public.pharmacies(district);
create index if not exists labs_locality_idx on public.labs(city);
create index if not exists labs_district_idx on public.labs(district);

-- ---------------------------------------------------------------------------
-- 2. Seed the corridor pharmacies (stable ids; idempotent upsert).
-- ---------------------------------------------------------------------------
insert into public.pharmacies (
  id, slug, name, address, city, district, pincode, state, country,
  latitude, longitude, phone_number, opening_hours, brand, ownership,
  stock_source, data_source, source_url, data_status, last_checked_at
) values
${pharmacyValues}
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Seed the corridor laboratories.
-- ---------------------------------------------------------------------------
insert into public.labs (
  id, slug, name, address, city, district, pincode, state, country,
  latitude, longitude, phone_number, opening_hours, ownership,
  data_source, source_url, data_status, last_checked_at
) values
${labValues}
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS — public read, no client writes (matches the other discovery tables).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.pharmacies from anon, authenticated;
revoke insert, update, delete on public.labs from anon, authenticated;
grant select on public.pharmacies to anon, authenticated;
grant select on public.labs to anon, authenticated;
`;
}

function main() {
  const pharmacySnapshot = loadSnapshot('osm-pharmacies.json');
  const labSnapshot = loadSnapshot('osm-laboratories.json');

  const report = {
    generated_at: GENERATED_AT,
    coverage_boundary: {
      corridor: 'Machilipatnam → Vijayawada, Andhra Pradesh, India',
      buffer_km: BUFFER_KM,
      interpretation: 'A pharmacy/lab is in coverage exactly when a hospital would be: within the corridor buffer, or in a documented corridor locality.',
    },
    sources: [
      {
        id: 'openstreetmap',
        name: 'OpenStreetMap contributors',
        licence: 'ODbL 1.0',
        url: 'https://www.openstreetmap.org/',
        present: pharmacySnapshot.present,
        note: 'Community-surveyed POIs. Coverage is dense in Vijayawada and sparse in corridor villages; absence is NOT evidence a pharmacy does not exist.',
      },
    ],
    pharmacies: {},
    laboratories: {},
    generated_files: {},
  };

  // --- Pharmacies ---
  const pharmNormalised = pharmacySnapshot.rows.map(normalisePharmacy);
  const pharmInCoverage = pharmNormalised.filter((r) => r.coverage.inCoverage);
  const pharmDedupe = dedupe(pharmInCoverage.map((r) => r.raw));
  const pharmSeen = new Set();
  const pharmacies = pharmDedupe.kept
    .map((raw) => {
      const norm = normalisePharmacy(raw);
      return toPharmacy(norm, norm.coverage, pharmSeen);
    })
    .sort((a, b) => (a.corridorDistanceKm ?? 999) - (b.corridorDistanceKm ?? 999));

  const pharmacyHeader = `/**
 * CareLink-AI — pharmacy directory (GENERATED FILE — DO NOT EDIT BY HAND).
 *
 * Produced by \`node scripts/directory/import-pharmacies.mjs\` from the reviewed
 * OpenStreetMap snapshot in scripts/directory/source-snapshots/osm-pharmacies.json.
 * Re-run the importer after refreshing the snapshot.
 *
 * HONESTY RULES (non-negotiable):
 *   - Every record carries provenance (source, source URL, licence, fetch date).
 *   - A field the source did not publish is ABSENT — never guessed.
 *   - \`is_verified\` is false everywhere: a community-mapped POI is not a
 *     credential, licence or stock check.
 *   - \`stock_source: 'not_integrated'\` everywhere — medicine availability must be
 *     confirmed with the pharmacy; no stock level is ever displayed.
 *   - Coverage is the Machilipatnam–Vijayawada corridor (src/data/coverage.ts).
 *
 * Generated: ${GENERATED_AT}
 * Records: ${pharmacies.length}
 */`;

  const labHeader = `/**
 * CareLink-AI — laboratory directory (GENERATED FILE — DO NOT EDIT BY HAND).
 *
 * Produced by \`node scripts/directory/import-pharmacies.mjs\` from the reviewed
 * OpenStreetMap snapshot in scripts/directory/source-snapshots/osm-laboratories.json.
 *
 * HONESTY RULES: provenance on every record; no invented tests, prices or hours;
 * \`is_verified\` false everywhere; coverage = the Machilipatnam–Vijayawada corridor.
 *
 * Generated: ${GENERATED_AT}
 * Records: (see file)
 */`;

  const labNormalised = labSnapshot.rows.map(normalisePharmacy);
  const labInCoverage = labNormalised.filter((r) => r.coverage.inCoverage);
  const labDedupe = dedupe(labInCoverage.map((r) => r.raw));
  const labSeen = new Set();
  const laboratories = labDedupe.kept
    .map((raw) => {
      const norm = normalisePharmacy(raw);
      return toLaboratory(norm, norm.coverage, labSeen);
    })
    .sort((a, b) => (a.corridorDistanceKm ?? 999) - (b.corridorDistanceKm ?? 999));

  report.pharmacies = {
    source_records: pharmacySnapshot.rows.length,
    in_coverage: pharmInCoverage.length,
    duplicates_removed: pharmDedupe.removed.length,
    written: pharmacies.length,
    with_coordinates: pharmacies.filter((p) => typeof p.latitude === 'number').length,
    with_phone: pharmacies.filter((p) => p.phone).length,
    with_opening_hours: pharmacies.filter((p) => p.opening_hours).length,
    generic_name_listings: pharmacies.filter((p) => p.nameIsGeneric).length,
    by_locality: pharmacies.reduce((acc, p) => { acc[p.locality] = (acc[p.locality] ?? 0) + 1; return acc; }, {}),
  };
  report.laboratories = {
    source_records: labSnapshot.rows.length,
    in_coverage: labInCoverage.length,
    duplicates_removed: labDedupe.removed.length,
    written: laboratories.length,
  };
  report.generated_files = { pharmacies: 'src/data/pharmacies.ts', laboratories: 'src/data/laboratories.ts' };

  if (process.argv.includes('--report')) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  writeFileSync(PHARMACY_OUT, renderModule({
    header: pharmacyHeader,
    exportName: 'pharmaciesData',
    typeName: 'Pharmacy',
    rows: pharmacies,
  }));
  writeFileSync(LAB_OUT, renderModule({
    header: labHeader.replace('Records: (see file)', `Records: ${laboratories.length}`),
    exportName: 'laboratoriesData',
    typeName: 'Laboratory',
    rows: laboratories,
  }));
  writeFileSync(REPORT_OUT, JSON.stringify(report, null, 2));
  writeFileSync(MIGRATION_OUT, renderMigration(pharmacies, laboratories));

  console.log(`pharmacies: ${pharmacies.length} written (${report.pharmacies.in_coverage} in coverage, ${report.pharmacies.duplicates_removed} duplicates removed)`);
  console.log(`laboratories: ${laboratories.length} written`);
  console.log(`report: ${REPORT_OUT}`);
  console.log(`migration: ${MIGRATION_OUT}`);
}

main();
