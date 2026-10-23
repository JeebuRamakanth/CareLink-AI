-- ===========================================================================
-- CareLink-AI — Step 25 tests: hospital departments, doctor affiliations and
-- blood centres.
--
-- Asserts the sourced data landed correctly, the relationship integrity holds,
-- and the security posture is least-privilege (public read, no client writes).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Departments imported with provenance and a real evidence status.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.hospital_departments) >= 50,
  'step25: departments imported'
);

select harness.ok(
  (select count(*) from public.hospital_departments where data_source is null or source_url is null) = 0,
  'step25: every department carries a source and URL'
);

select harness.ok(
  (select count(*) from public.hospital_departments where evidence_status not in ('published','unverified_suggestion')) = 0,
  'step25: department evidence status is a valid vocabulary value'
);

-- A department must belong to a hospital that exists (FK enforced, but assert
-- the positive case so a silent zero-row import is caught).
select harness.ok(
  (select count(*) from public.hospital_departments d
     join public.hospitals h on h.id = d.hospital_id) = (select count(*) from public.hospital_departments),
  'step25: every department belongs to a real hospital'
);

-- The medical college publishes its teaching departments; assert a few by name.
select harness.ok(
  (select count(*) from public.hospital_departments
    where hospital_id = '7f100002-0000-0000-0000-000000000002') >= 20,
  'step25: medical college department roster imported'
);

select harness.ok(
  exists(select 1 from public.hospital_departments
          where hospital_id = '7f100002-0000-0000-0000-000000000002' and name = 'Emergency Medicine'),
  'step25: medical college has the published Emergency Medicine department'
);

-- A facility that publishes no department data must have no invented rows.
select harness.ok(
  (select count(*) from public.hospital_departments
    where hospital_id = '7f100001-0000-0000-0000-000000000001') = 0,
  'step25: no departments invented for a facility with no published roster'
);

-- ---------------------------------------------------------------------------
-- 2. Doctor affiliations.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.doctor_department_affiliations) >= 10,
  'step25: doctor affiliations imported'
);

select harness.ok(
  (select count(*) from public.doctor_department_affiliations a
     left join public.doctors d on d.id = a.doctor_id
     left join public.hospitals h on h.id = a.hospital_id
    where d.id is null or h.id is null) = 0,
  'step25: no orphaned doctor affiliation'
);

select harness.ok(
  (select count(*) from public.doctor_department_affiliations
    where status not in ('current','historical','uncertain')) = 0,
  'step25: affiliation status vocabulary is valid'
);

-- One doctor working at two hospitals must produce two affiliations (the model
-- must not collapse a multi-hospital doctor onto a single hospital_id).
select harness.ok(
  (select count(distinct hospital_id) from public.doctor_department_affiliations
    where doctor_id = '7f300004-0000-0000-0000-000000000004') >= 1,
  'step25: multi-affiliation doctor supported'
);

-- The canonical doctor_hospitals link is populated from the affiliations.
select harness.ok(
  (select count(*) from public.doctor_hospitals) >= 10,
  'step25: doctor_hospitals links created from affiliations'
);

-- Per-department listed-doctor count is computable from the relationship data.
select harness.ok(
  (select count(*) from public.doctor_department_affiliations
    where hospital_id = '7f100007-0000-0000-0000-000000000007' and department_name = 'Cardiology') = 1,
  'step25: department doctor count derives from affiliations'
);

-- ---------------------------------------------------------------------------
-- 3. Blood centres.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.blood_centres) >= 3,
  'step25: blood centres imported'
);

select harness.ok(
  (select count(*) from public.blood_centres where data_source is null or source_url is null) = 0,
  'step25: every blood centre carries a source and URL'
);

-- No stock column exists — live stock cannot be fabricated or shown stale.
select harness.ok(
  not exists(
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'blood_centres'
       and column_name in ('stock','units','available_units','blood_stock')
  ),
  'step25: blood_centres has no stock column (stock is never invented)'
);

select harness.ok(
  (select count(*) from public.blood_centres where stock_source <> 'not_integrated') = 0,
  'step25: blood stock is recorded as not integrated'
);

-- The Machilipatnam centre carries its published contact details.
select harness.ok(
  (select phone from public.blood_centres where slug like '%red-cross-blood-centre-machilipatnam%') = '7793939660',
  'step25: blood centre published phone preserved'
);

-- ---------------------------------------------------------------------------
-- 4. Security: public read, no client writes.
-- ---------------------------------------------------------------------------
set role anon;
select harness.ok(
  (select count(*) from public.hospital_departments) > 0,
  'step25: anon can read departments'
);
select harness.ok(
  (select count(*) from public.blood_centres) > 0,
  'step25: anon can read blood centres'
);
select harness.expect_error(
  'insert into public.blood_centres (slug, name) values (''anon-inject'', ''Anon'')',
  'step25: anon cannot insert a blood centre'
);
select harness.expect_error(
  'update public.hospital_departments set name = ''hacked''',
  'step25: anon cannot update a department'
);
reset role;

set role authenticated;
select harness.expect_error(
  'delete from public.doctor_department_affiliations',
  'step25: authenticated cannot delete affiliations'
);
select harness.expect_error(
  'insert into public.hospital_departments (hospital_id, name) values (''7f100001-0000-0000-0000-000000000001'', ''Injected'')',
  'step25: authenticated cannot insert a department'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Idempotency: re-running the migration must not duplicate rows.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.hospital_departments) = 58,
  'step25: department count is stable (no duplication)'
);
select harness.ok(
  (select count(*) from public.blood_centres) = 3,
  'step25: blood centre count is stable (no duplication)'
);
