#!/usr/bin/env node
/**
 * CareLink-AI — directory data integrity test (Phase 13).
 *
 * Loads the REAL offline directory data files (src/data/hospitals.ts and
 * src/data/doctors.ts), strips their type-only imports, evaluates the actual
 * arrays, and asserts the sourcing/honesty rules hold:
 *   - every facility is located in Machilipatnam, Andhra Pradesh, India
 *   - every record carries provenance with an explicit data_status
 *   - no fabricated ratings/review counts (must be 0)
 *   - no fabricated doctor experience (must be 0 when unlisted)
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

check('directory: hospitals array is non-empty', hospitals.length > 0);
check('directory: doctors array is non-empty', doctors.length > 0);

check(
  'directory: every hospital is in Machilipatnam, Andhra Pradesh, India',
  hospitals.every((h) => h.city === 'Machilipatnam' && h.state === 'Andhra Pradesh' && h.country === 'India')
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

const hospitalIds = new Set(hospitals.map((h) => h.id));
check(
  'directory: doctor→hospital links reference only real directory hospitals',
  doctors.every((d) => (d.hospital_ids ?? []).every((id) => hospitalIds.has(id)))
);

check(
  'directory: source URLs are absolute when present',
  [...hospitals, ...doctors].every((r) => !r.provenance.source_url || /^https?:\/\//.test(r.provenance.source_url))
);

console.log(`\nCareLink directory integrity — ${checks.length} checks (${hospitals.length} hospitals, ${doctors.length} doctors)`);
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll directory integrity checks passed.');
