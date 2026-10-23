#!/usr/bin/env node
/**
 * CareLink-AI — emit the Step 25 migration (departments, doctor affiliations,
 * blood centres) from the SAME evidence the app renders.
 *
 * Reading `src/data/directoryEvidence.ts` and `src/data/bloodCentres.ts` — the
 * single source of truth for what the UI displays — means the database and the
 * app cannot drift apart.
 *
 * Output: supabase/migrations/0035_step25_departments_affiliations_blood_centres.sql
 *
 * ADDITIVE + IDEMPOTENT: `create table if not exists`, `on conflict … do
 * nothing`, so replaying the chain never duplicates a row.
 *
 * USAGE: node scripts/directory/emit-step25-migration.mjs
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'supabase', 'migrations', '0035_step25_departments_affiliations_blood_centres.sql');

const { buildDepartments, buildDoctors } = await import(join(ROOT, 'src', 'data', 'directoryEvidence.ts'));
const { bloodCentresData } = await import(join(ROOT, 'src', 'data', 'bloodCentres.ts'));

const sqlString = (value) => (value == null || value === ''
  ? 'null'
  : `'${String(value).replace(/'/g, "''")}'`);

/**
 * Deterministic UUID for a doctor so the migration is stable across runs and
 * cannot collide with the migration-0031 seed ids ('7f30…') or the facility
 * ids ('7f10…' / '7f20…'). New doctors use the '7f40…' space.
 */
function doctorUuid(id) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < id.length; i += 1) {
    const c = id.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0;
  }
  const hex = (n) => n.toString(16).padStart(8, '0');
  return `7f400000-0000-4000-8000-${hex(h1)}${hex(h2).slice(0, 4)}`;
}

/** Curated doctors already seeded by migration 0031, by evidence id. */
const SEEDED_DOCTOR_IDS = {
  'doc-murali-krishna': '7f300001-0000-0000-0000-000000000001',
  'doc-sandeep-vemu': '7f300004-0000-0000-0000-000000000004',
  'doc-praveena-madasu': '7f300005-0000-0000-0000-000000000005',
};

const doctorIdOf = (evidenceId) => SEEDED_DOCTOR_IDS[evidenceId] ?? doctorUuid(evidenceId);

const departments = buildDepartments();
const doctors = buildDoctors();

const slugify = (value) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// --- Departments ------------------------------------------------------------
const departmentRows = departments.map((department) => `  (${[
  sqlString(department.hospital_id),
  sqlString(department.name),
  sqlString(department.specialty_category),
  sqlString(department.description),
  `'${JSON.stringify(department.services)}'::jsonb`,
  department.appointment_capable ? 'true' : 'false',
  sqlString(department.evidence_status),
  sqlString(department.provenance?.data_source),
  sqlString(department.provenance?.source_url),
  sqlString(department.provenance?.data_status ?? 'THIRD_PARTY_DIRECTORY'),
  sqlString(department.provenance?.fetched_at),
].join(',')})`).join(',\n');

// --- New doctors (not already seeded by 0031) -------------------------------
const newDoctors = doctors.filter((doctor) => !SEEDED_DOCTOR_IDS[doctor.id]);
const doctorRows = newDoctors.map((doctor) => {
  const qualifications = doctor.qualifications.join('; ');
  return `  (${[
    sqlString(doctorUuid(doctor.id)),
    sqlString(`mph-${slugify(doctor.name)}`),
    sqlString(doctor.name),
    'null',
    'null',
    sqlString(`${doctor.specialty} specialist listed on the facility's published roster.${qualifications ? ` Qualifications: ${qualifications}.` : ''}`),
    `'[]'::jsonb`,
    "'[]'::jsonb",
    'null',
    sqlString(doctor.sourceLabel),
    sqlString(doctor.sourceUrl),
    sqlString('PROVIDER_LISTED'),
    sqlString('2026-10-22'),
  ].join(',')})`;
}).join(',\n');

// --- Affiliations -----------------------------------------------------------
const affiliationRows = doctors.flatMap((doctor) => doctor.affiliations.map((affiliation) => `  (${[
  sqlString(doctorIdOf(doctor.id)),
  sqlString(affiliation.hospital_id),
  sqlString(affiliation.department_name),
  sqlString(affiliation.status),
  sqlString(affiliation.role),
  sqlString(affiliation.schedule_note),
  sqlString(affiliation.provenance?.data_source),
  sqlString(affiliation.provenance?.source_url),
  sqlString(affiliation.provenance?.data_status ?? 'THIRD_PARTY_DIRECTORY'),
  sqlString(affiliation.provenance?.fetched_at),
  sqlString(affiliation.last_verified_at),
].join(',')})`)).join(',\n');

// --- Blood centres ----------------------------------------------------------
const bloodRows = bloodCentresData.map((centre) => `  (${[
  sqlString(centre.id),
  sqlString(centre.slug),
  sqlString(centre.name),
  sqlString(centre.hospital_id),
  sqlString(centre.address),
  sqlString(centre.locality),
  sqlString(centre.district),
  sqlString(centre.pincode),
  sqlString(centre.state),
  sqlString(centre.country),
  sqlString(centre.phone),
  sqlString(centre.phone_alt),
  sqlString(centre.email),
  sqlString(centre.website),
  sqlString(centre.registration_id),
  sqlString(centre.ownership),
  sqlString(centre.category_label),
  typeof centre.latitude === 'number' ? centre.latitude : 'null',
  typeof centre.longitude === 'number' ? centre.longitude : 'null',
  sqlString(centre.operational_status),
  sqlString(centre.stock_source ?? 'not_integrated'),
  sqlString(centre.provenance?.data_source),
  sqlString(centre.provenance?.source_url),
  sqlString(centre.provenance?.data_status ?? 'THIRD_PARTY_DIRECTORY'),
  sqlString(centre.provenance?.fetched_at),
  sqlString(centre.last_verified_at),
].join(',')})`).join(',\n');

const sql = `-- ===========================================================================
-- CareLink-AI — Step 25: hospital departments, doctor affiliations and blood
-- centres for the Machilipatnam → Vijayawada corridor.
--
-- GENERATED by \`node scripts/directory/emit-step25-migration.mjs\` from
-- src/data/directoryEvidence.ts and src/data/bloodCentres.ts — the same evidence
-- the app renders. Do not edit by hand; re-run the generator instead.
--
-- ADDITIVE + IDEMPOTENT. Reuses the provider registry from migration 0005
-- (hospitals / doctors / doctor_hospitals) and the provenance columns added in
-- 0024/0031/0034. Every insert is \`on conflict … do nothing\`, so replaying the
-- chain never duplicates a row.
--
-- SECURITY: all three tables are provider DISCOVERY data → public read, exactly
-- like hospitals. No write policy for anon/authenticated; seeding is by
-- migration and admin writes go through the guarded RPCs. No patient data.
--
-- HONESTY
--   - \`evidence_status\` is 'published' only when a facility-specific source
--     names the department.
--   - \`appointment_capable\` records whether the facility publishes a booking
--     path — never that a slot is currently free.
--   - blood_centres has NO stock column: live stock is not integrated, so no
--     figure can be stored, fabricated or shown stale.
--   - No phone, floor, opening hour, rating or doctor count is invented.
--
-- SOURCES (checked 2026-10-22)
--   https://www.gmcmachilipatnam-ap-gov.com/departments/
--   https://muralikrishnahospital.com/doctors  ·  /services
--   https://savehospitalmachilipatnam.com/en/services  ·  /team
--   https://madhuneuro.com/machilipatnam/
--   https://www.indianredcross.org/ircsbloodbanks/
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Hospital departments.
-- ---------------------------------------------------------------------------
create table if not exists public.hospital_departments (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  specialty_category text,
  description text,
  services jsonb not null default '[]'::jsonb,
  phone text,
  location_note text,
  opening_hours text,
  appointment_capable boolean not null default false,
  evidence_status text not null default 'published'
    check (evidence_status in ('published','unverified_suggestion')),
  data_source text,
  source_url text,
  data_status text not null default 'THIRD_PARTY_DIRECTORY',
  fetched_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name)
);
create index if not exists hospital_departments_hospital_id_idx on public.hospital_departments(hospital_id);
create index if not exists hospital_departments_name_idx on public.hospital_departments(lower(name));

-- ---------------------------------------------------------------------------
-- 2. Doctor ↔ hospital ↔ department affiliations.
--
--    Reuses doctor_hospitals (0005) for the plain hospital link; this table
--    carries the department and the published role/timing. A doctor with no
--    department stated simply has no row here — never an invented department.
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_department_affiliations (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  department_id uuid references public.hospital_departments(id) on delete set null,
  department_name text,
  status text not null default 'current'
    check (status in ('current','historical','uncertain')),
  role text,
  schedule_note text,
  data_source text,
  source_url text,
  data_status text not null default 'THIRD_PARTY_DIRECTORY',
  fetched_at date,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, hospital_id, department_name)
);
create index if not exists doctor_dept_aff_doc_idx on public.doctor_department_affiliations(doctor_id);
create index if not exists doctor_dept_aff_hosp_idx on public.doctor_department_affiliations(hospital_id);
create index if not exists doctor_dept_aff_dept_idx on public.doctor_department_affiliations(department_id);

-- ---------------------------------------------------------------------------
-- 3. Blood centres — separate identity from hospitals, NO stock column.
-- ---------------------------------------------------------------------------
create table if not exists public.blood_centres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  hospital_id uuid references public.hospitals(id) on delete set null,
  address text,
  locality text,
  district text,
  pincode text,
  state text default 'Andhra Pradesh',
  country text default 'India',
  phone text,
  phone_alt text,
  email text,
  website text,
  registration_id text,
  ownership text check (ownership is null or ownership in ('Government','Private','Charitable')),
  category_label text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  operational_status text,
  stock_source text not null default 'not_integrated' check (stock_source in ('live','not_integrated')),
  data_source text,
  source_url text,
  data_status text not null default 'THIRD_PARTY_DIRECTORY',
  fetched_at date,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blood_centres_locality_idx on public.blood_centres(locality);
create index if not exists blood_centres_district_idx on public.blood_centres(district);
create index if not exists blood_centres_hospital_idx on public.blood_centres(hospital_id);

-- ---------------------------------------------------------------------------
-- 4. RLS — public read, no client writes.
-- ---------------------------------------------------------------------------
alter table public.hospital_departments enable row level security;
alter table public.doctor_department_affiliations enable row level security;
alter table public.blood_centres enable row level security;

drop policy if exists hospital_departments_public_read on public.hospital_departments;
create policy hospital_departments_public_read on public.hospital_departments for select using (true);

drop policy if exists doctor_dept_aff_public_read on public.doctor_department_affiliations;
create policy doctor_dept_aff_public_read on public.doctor_department_affiliations for select using (true);

drop policy if exists blood_centres_public_read on public.blood_centres;
create policy blood_centres_public_read on public.blood_centres for select using (true);

revoke insert, update, delete on public.hospital_departments from anon, authenticated;
revoke insert, update, delete on public.doctor_department_affiliations from anon, authenticated;
revoke insert, update, delete on public.blood_centres from anon, authenticated;
grant select on public.hospital_departments to anon, authenticated;
grant select on public.doctor_department_affiliations to anon, authenticated;
grant select on public.blood_centres to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Departments (${departments.length} rows).
-- ---------------------------------------------------------------------------
insert into public.hospital_departments
  (hospital_id, name, specialty_category, description, services, appointment_capable,
   evidence_status, data_source, source_url, data_status, fetched_at)
values
${departmentRows}
on conflict (hospital_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Doctors not already seeded by 0031 (${newDoctors.length} rows).
-- ---------------------------------------------------------------------------
insert into public.doctors
  (id, slug, name, gender, years_experience, bio, photo_url, languages, rating,
   data_source, source_url, data_status, fetched_at)
values
${doctorRows}
on conflict (id) do nothing;

-- Link every doctor to its hospital in the canonical doctor_hospitals table.
insert into public.doctor_hospitals (doctor_id, hospital_id, is_primary)
select distinct a.doctor_id, a.hospital_id, true
from public.doctor_department_affiliations a
on conflict (doctor_id, hospital_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Doctor affiliations (${affiliationRows.split('\n').length} rows).
-- ---------------------------------------------------------------------------
insert into public.doctor_department_affiliations
  (doctor_id, hospital_id, department_name, status, role, schedule_note,
   data_source, source_url, data_status, fetched_at, last_verified_at)
values
${affiliationRows}
on conflict (doctor_id, hospital_id, department_name) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Blood centres (${bloodCentresData.length} rows).
-- ---------------------------------------------------------------------------
insert into public.blood_centres
  (id, slug, name, hospital_id, address, locality, district, pincode, state, country,
   phone, phone_alt, email, website, registration_id, ownership, category_label,
   latitude, longitude, operational_status, stock_source,
   data_source, source_url, data_status, fetched_at, last_verified_at)
values
${bloodRows}
on conflict (id) do nothing;
`;

writeFileSync(OUT, sql);
console.log(`  wrote ${departments.length} departments, ${newDoctors.length} new doctors, `
  + `${affiliationRows.split('\n').length} affiliations, ${bloodCentresData.length} blood centres`);
console.log(`  → ${OUT.replace(`${ROOT}/`, '')}`);
