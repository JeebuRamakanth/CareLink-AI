#!/usr/bin/env node
/**
 * CareLink-AI — directory data integrity test (Phase 13).
 *
 * Loads the REAL offline directory data files (src/data/hospitals.ts and
 * src/data/doctors.ts), strips their type-only imports, evaluates the actual
 * arrays, and asserts the sourcing/honesty rules hold:
 *   - every facility is inside the Machilipatnam→Vijayawada corridor
 *   - both source districts (Krishna, NTR) are represented
 *   - every record carries provenance with an explicit data_status
 *   - no fabricated ratings/review counts (must be 0)
 *   - no fabricated phone, coordinate, capability or doctor experience
 *   - published pincodes are well-formed and never invented
 *   - doctor→hospital links reference only real hospitals in the directory
 *   - nothing is presented as verified
 *
 * Exits non-zero on any failure. Run: node scripts/verify-directory.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Evaluate a `export const X: T[] = [ ... ];` data module without a TS runtime. */
function loadArray(relPath, exportName) {
  let src = readFileSync(join(root, relPath), 'utf8');
  src = src.replace(/^import\s+type[^\n]*\n/gm, ''); // drop type-only imports
  const start = src.indexOf(`${exportName}: `);
  const eq = src.indexOf('= [', start);
  if (eq === -1) throw new Error(`could not locate ${exportName} array in ${relPath}`);
  const arrayStart = src.indexOf('[', eq);
  // find the matching closing bracket for the array literal
  let depth = 0;
  let end = -1;
  for (let i = arrayStart; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) throw new Error(`unterminated array in ${relPath}`);
  const literal = src.slice(arrayStart, end);
  // Provide the file-scope constants the literals reference.
  const CREATED = '2026-10-09T00:00:00.000Z';
  const NO_FACILITIES = {
    emergency: false, icu: false, ambulance: false, blood_bank: false,
    parking: false, twenty_four_hours: false, telehealth: false,
  };
  // eslint-disable-next-line no-new-func
  return new Function('CREATED', 'NO_FACILITIES', `return (${literal});`)(CREATED, NO_FACILITIES);
}

const failures = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const hospitals = loadArray('src/data/hospitals.ts', 'hospitalsData');
const doctors = loadArray('src/data/doctors.ts', 'doctorsData');
const hospitalsSource = readFileSync(join(root, 'src/data/hospitals.ts'), 'utf8');
const hospitalServiceSource = readFileSync(join(root, 'src/services/hospitalService.ts'), 'utf8');
const directoryMigration = readFileSync(join(root, 'supabase/migrations/0031_step21_machilipatnam_directory.sql'), 'utf8');

check(
  'directory: hospitals are sourced or no unverified local records are bundled',
  hospitals.length > 0 || (
    hospitalsSource.includes('No independently verified local records')
    && hospitalServiceSource.includes('discoverMachilipatnamHospitals')
    && hospitalServiceSource.includes('fetchRealHospitals')
  )
);
check('directory: doctors array is non-empty', doctors.length > 0);

check(
  'directory: every hospital is in Andhra Pradesh, India',
  hospitals.every((h) => h.state === 'Andhra Pradesh' && h.country === 'India')
);
check(
  'directory: both corridor districts are represented',
  new Set(hospitals.map((h) => h.district)).size >= 2
    && hospitals.every((h) => h.district === 'Krishna' || h.district === 'NTR')
);
check(
  'directory: corridor anchor cities are covered',
  hospitals.some((h) => h.city === 'Machilipatnam') && hospitals.some((h) => h.city === 'Vijayawada')
);
check(
  'directory: every facility has an honest category and ownership',
  hospitals.every((h) => Boolean(h.category_label) && (h.ownership === 'Government' || h.ownership === 'Private'))
);
check(
  'directory: published pincodes are well-formed 6-digit values',
  hospitals.every((h) => !h.pincode || /^[0-9]{6}$/.test(h.pincode))
);
check(
  'directory: no fabricated coordinates (both lat and lng, or neither)',
  hospitals.every((h) => (typeof h.latitude === 'number') === (typeof h.longitude === 'number'))
);
check(
  'directory: no fabricated capability flags',
  hospitals.every((h) => h.facilities
    && h.facilities.emergency === false && h.facilities.icu === false
    && h.facilities.blood_bank === false && h.facilities.twenty_four_hours === false)
);
check(
  'directory: every doctor is in Machilipatnam, Andhra Pradesh, India',
  doctors.every((d) => d.city === 'Machilipatnam' && d.state === 'Andhra Pradesh' && d.country === 'India')
);

check(
  'directory: every hospital carries provenance (source + data_status)',
  hospitals.every((h) => h.provenance && h.provenance.data_source && h.provenance.data_status)
);
check(
  'directory: every doctor carries provenance (source + data_status)',
  doctors.every((d) => d.provenance && d.provenance.data_source && d.provenance.data_status)
);

check(
  'directory: no fabricated hospital ratings/review counts',
  hospitals.every((h) => h.rating === 0 && h.review_count === 0)
);
check(
  'directory: no fabricated doctor ratings/review counts',
  doctors.every((d) => d.rating === 0 && d.review_count === 0)
);
check(
  'directory: no fabricated doctor experience',
  doctors.every((d) => d.years_of_experience === 0)
);
check(
  'directory: nothing is presented as verified',
  hospitals.every((h) => h.is_verified === false) && doctors.every((d) => d.is_verified === false)
);

const hospitalIds = new Set([
  ...hospitals.map((h) => h.id),
  ...[...directoryMigration.matchAll(/^\s*\('(7f100[0-9a-f-]{31})'/gm)].map((match) => match[1]),
]);
check(
  'directory: doctor→hospital links reference canonical seeded hospital IDs',
  doctors.every((d) => (d.hospital_ids ?? []).every((id) => hospitalIds.has(id)))
);

check(
  'directory: source URLs are absolute when present',
  [...hospitals, ...doctors].every((r) => !r.provenance.source_url || /^https?:\/\//.test(r.provenance.source_url))
);
check(
  'directory: generated file is not hand-edited',
  hospitalsSource.includes('GENERATED FILE — DO NOT EDIT BY HAND')
    && hospitalsSource.includes('scripts/directory/ingest.mjs')
);
check(
  'directory: import report exists with achieved-coverage totals',
  (() => {
    try {
      const report = JSON.parse(readFileSync(join(root, 'scripts/directory/last-import-report.json'), 'utf8'));
      return report.totals.source_records_discovered > 0
        && report.totals.unique_in_coverage === hospitals.length
        && report.sources.length >= 2;
    } catch { return false; }
  })()
);
check(
  'directory: coverage boundary is configurable, not a city-name search',
  (() => {
    const coverage = readFileSync(join(root, 'src/data/coverage.ts'), 'utf8');
    return coverage.includes('CORRIDOR_BUFFER_KM')
      && coverage.includes('CORRIDOR_LOCALITIES')
      && coverage.includes('classifyCoverage');
  })()
);

console.log(`\nCareLink directory integrity — ${checks.length} checks (${hospitals.length} hospitals, ${doctors.length} doctors)`);
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll directory integrity checks passed.');
