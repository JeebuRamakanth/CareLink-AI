#!/usr/bin/env node
/**
 * CareLink-AI — emit the doctor directory data module.
 *
 * `src/data/directoryEvidence.ts` is the reviewed, source-attributed evidence for
 * departments and doctors. This script turns its doctor entries into
 * `src/data/doctors.ts`, a plain literal array, so:
 *   - the app renders one doctor set (no second hand-authored dataset), and
 *   - the offline integrity test (scripts/verify-directory.mjs) can still
 *     evaluate the array without a TypeScript runtime.
 *
 * Run after editing directoryEvidence.ts:  node scripts/directory/emit-doctors.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'src', 'data', 'doctors.ts');

const { buildDoctors } = await import(join(ROOT, 'src', 'data', 'directoryEvidence.ts'));
const doctors = buildDoctors();

const CHECKED = '2026-10-22';
const CREATED = `${CHECKED}T00:00:00.000Z`;

const splitName = (fullName) => {
  const cleaned = fullName.replace(/^Dr\.?\s*/i, '').trim();
  const parts = cleaned.split(/\s+/);
  return { first: parts[0] ?? cleaned, last: parts.slice(1).join(' ') };
};

const items = doctors.map((doctor) => {
  const { first, last } = splitName(doctor.name);
  const hospitalIds = doctor.affiliations.map((affiliation) => affiliation.hospital_id);
  const city = 'Machilipatnam';
  const fields = [
    `    id: ${JSON.stringify(doctor.id)},`,
    `    created_at: CREATED,`,
    `    updated_at: CREATED,`,
    `    status: 'active',`,
    `    first_name: ${JSON.stringify(first)},`,
    `    last_name: ${JSON.stringify(last)},`,
    `    full_name: ${JSON.stringify(doctor.name)},`,
    `    specialty: ${JSON.stringify(doctor.specialty)},`,
    `    sub_specialties: ${JSON.stringify(doctor.subSpecialties)},`,
    `    bio: ${JSON.stringify(doctor.bio)},`,
    `    hospital_ids: ${JSON.stringify(hospitalIds)},`,
    `    location: ${JSON.stringify(`${city}, Andhra Pradesh`)},`,
    `    city: ${JSON.stringify(city)},`,
    `    state: 'Andhra Pradesh',`,
    `    country: 'India',`,
    `    years_of_experience: 0,`,
    `    education: ${JSON.stringify(doctor.qualifications)},`,
    `    languages: [],`,
    `    consultation_modes: ['In-person'],`,
    `    rating: 0,`,
    `    review_count: 0,`,
    `    availability_status: null,`,
    `    is_verified: false,`,
    `    accepts_new_patients: true,`,
  ];
  if (doctor.phone) fields.push(`    phone: ${JSON.stringify(doctor.phone)},`);
  fields.push(
    `    image_url: undefined,`,
    `    provenance: {`,
    `      data_source: ${JSON.stringify(doctor.sourceLabel)},`,
    `      source_url: ${JSON.stringify(doctor.sourceUrl)},`,
    `      data_status: 'PROVIDER_LISTED',`,
    `      fetched_at: ${JSON.stringify(CHECKED)},`,
    `    },`,
  );
  return `  {\n${fields.join('\n')}\n  },`;
});

writeFileSync(OUT, `import type { Doctor } from '../types';

/**
 * CareLink-AI — doctor directory (GENERATED FILE — DO NOT EDIT BY HAND).
 *
 * Produced by \`node scripts/directory/emit-doctors.mjs\` from the reviewed,
 * source-attributed evidence in src/data/directoryEvidence.ts. Re-run that
 * generator after editing the evidence.
 *
 * SOURCING & HONESTY RULES (non-negotiable):
 *   - Every doctor is named on the cited facility's OWN published page; the
 *     qualification and role shown are what that page states.
 *   - A visiting specialist's schedule is reproduced verbatim; nothing inferred.
 *   - \`is_verified\` is false for every record: a provider listing is NOT proof
 *     of credentials. Real verification only happens in the database via the
 *     guarded verification workflow.
 *   - \`rating\` / \`review_count\` are 0 until real, eligible patient reviews exist.
 *   - No portraits are fabricated; \`image_url\` is omitted so the UI shows the
 *     existing fallback avatar rather than a random person's photo.
 *
 * Generated: ${new Date().toISOString()}
 * Doctors: ${doctors.length}
 */
const CREATED = '${CREATED}';

export const doctorsData: Doctor[] = [
${items.join('\n')}
];
`);

console.log(`  wrote ${doctors.length} doctors → src/data/doctors.ts`);
