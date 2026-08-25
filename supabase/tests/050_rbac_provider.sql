-- ===========================================================================
-- 050 — RBAC + provider membership scope.
--   Hospital/Pharmacy/Lab admins reach ONLY their own entity.
--   Doctors reach ONLY their approved doctor link.
--   Role/membership writes only via audited guarded functions.
-- ===========================================================================

-- Seed providers + master data (service path)
insert into public.specialties (id, slug, name) values
  ('5c111111-1111-1111-1111-111111111111', 'cardiology', 'Cardiology');
insert into public.hospitals (id, slug, name) values
  ('5a111111-1111-1111-1111-111111111111', 'hospital-one', 'Hospital One'),
  ('5a222222-2222-2222-2222-222222222222', 'hospital-two', 'Hospital Two');
insert into public.pharmacies (id, slug, name) values
  ('5b111111-1111-1111-1111-111111111111', 'pharmacy-one', 'Pharmacy One'),
  ('5b222222-2222-2222-2222-222222222222', 'pharmacy-two', 'Pharmacy Two');
insert into public.labs (id, slug, name) values
  ('5d111111-1111-1111-1111-111111111111', 'lab-one', 'Lab One'),
  ('5d222222-2222-2222-2222-222222222222', 'lab-two', 'Lab Two');
insert into public.doctors (id, slug, name) values
  ('5e111111-1111-1111-1111-111111111111', 'doctor-one', 'Doctor One'),
  ('5e222222-2222-2222-2222-222222222222', 'doctor-two', 'Doctor Two');
insert into public.hospital_verification (hospital_id, status) values
  ('5a111111-1111-1111-1111-111111111111', 'pending'),
  ('5a222222-2222-2222-2222-222222222222', 'verified');

-- Grant roles/memberships through the service path (simulating pre-granted state):
--   A -> hospital_admin of Hospital One + pharmacy_admin of Pharmacy One
--   B -> lab_admin of Lab One
--   C -> super_admin
insert into public.user_roles (user_id, role_id) values
  ('11111111-1111-1111-1111-111111111111', 'hospital_admin'),
  ('11111111-1111-1111-1111-111111111111', 'pharmacy_admin'),
  ('22222222-2222-2222-2222-222222222222', 'lab_admin'),
  ('33333333-3333-3333-3333-333333333333', 'super_admin');
insert into public.provider_memberships (user_id, provider_kind, hospital_id, pharmacy_id, lab_id) values
  ('11111111-1111-1111-1111-111111111111', 'hospital', '5a111111-1111-1111-1111-111111111111', null, null),
  ('11111111-1111-1111-1111-111111111111', 'pharmacy', null, '5b111111-1111-1111-1111-111111111111', null),
  ('22222222-2222-2222-2222-222222222222', 'lab', null, null, '5d111111-1111-1111-1111-111111111111');
insert into public.doctor_user_links (user_id, doctor_id, status) values
  ('22222222-2222-2222-2222-222222222222', '5e111111-1111-1111-1111-111111111111', 'approved');

-- ---------------------------------------------------------------------------
-- Public discovery: anonymous can read provider + master data
-- ---------------------------------------------------------------------------
set role anon;
select harness.ok((select count(*) >= 2 from public.hospitals), 'rbac: anon reads hospitals (public discovery)');
select harness.ok((select count(*) >= 1 from public.specialties), 'rbac: anon reads specialties');
select harness.ok((select count(*) = 0 from public.hospital_verification), 'rbac: anon sees zero verification rows');
reset role;

-- ---------------------------------------------------------------------------
-- Master data writes: authenticated non-admin is rejected
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$insert into public.specialties (slug, name) values ('forged', 'Forged')$$,
  'rbac: non-super-admin cannot write master data'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Hospital admin scoping (A -> Hospital One only)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.ok(
  public.carelink_is_hospital_admin('5a111111-1111-1111-1111-111111111111'),
  'rbac: A is hospital admin of Hospital One'
);
select harness.ok(
  not public.carelink_is_hospital_admin('5a222222-2222-2222-2222-222222222222'),
  'rbac: A is NOT hospital admin of Hospital Two'
);

select harness.expect_ok(
  $$update public.hospitals set description = 'updated by A' where id = '5a111111-1111-1111-1111-111111111111'$$,
  'rbac: A updates own hospital'
);
-- cross-hospital update silently matches 0 rows; verified unchanged below
update public.hospitals set description = 'hijacked' where id = '5a222222-2222-2222-2222-222222222222';

select harness.expect_ok(
  $$insert into public.hospital_services (hospital_id, service_name) values ('5a111111-1111-1111-1111-111111111111', 'Cardiac ICU')$$,
  'rbac: A adds service to own hospital'
);
select harness.expect_error(
  $$insert into public.hospital_services (hospital_id, service_name) values ('5a222222-2222-2222-2222-222222222222', 'Forged ICU')$$,
  'rbac: A cannot add service to Hospital Two'
);

select harness.ok(
  (select count(*) = 1 and bool_and(hospital_id = '5a111111-1111-1111-1111-111111111111') from public.hospital_verification),
  'rbac: A reads only own hospital verification'
);

-- Pharmacy admin scoping (A -> Pharmacy One only)
select harness.expect_ok(
  $$insert into public.pharmacy_medicines (pharmacy_id, medicine_name) values ('5b111111-1111-1111-1111-111111111111', 'Paracetamol 500')$$,
  'rbac: A adds medicine to own pharmacy'
);
select harness.expect_error(
  $$insert into public.pharmacy_medicines (pharmacy_id, medicine_name) values ('5b222222-2222-2222-2222-222222222222', 'Forged')$$,
  'rbac: A cannot add medicine to Pharmacy Two'
);
reset role;
reset request.jwt.claims;

select harness.ok(
  (select description is null from public.hospitals where id = '5a222222-2222-2222-2222-222222222222'),
  'rbac: Hospital Two unchanged after A update attempt'
);

-- ---------------------------------------------------------------------------
-- Lab admin scoping (B -> Lab One only) + approved doctor link (B -> Doctor One)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.expect_ok(
  $$insert into public.lab_tests (lab_id, test_name) values ('5d111111-1111-1111-1111-111111111111', 'CBC')$$,
  'rbac: B adds test to own lab'
);
select harness.expect_error(
  $$insert into public.lab_tests (lab_id, test_name) values ('5d222222-2222-2222-2222-222222222222', 'Forged')$$,
  'rbac: B cannot add test to Lab Two'
);

select harness.ok(
  public.carelink_is_doctor_linked('5e111111-1111-1111-1111-111111111111'),
  'rbac: B has approved link to Doctor One'
);
select harness.ok(
  not public.carelink_is_doctor_linked('5e222222-2222-2222-2222-222222222222'),
  'rbac: B is NOT linked to Doctor Two'
);
select harness.expect_ok(
  $$insert into public.doctor_profiles (doctor_id, about) values ('5e111111-1111-1111-1111-111111111111', 'by linked doctor')$$,
  'rbac: B creates own doctor profile'
);
select harness.expect_ok(
  $$update public.doctor_profiles set experience_summary = 'updated' where doctor_id = '5e111111-1111-1111-1111-111111111111'$$,
  'rbac: B edits own doctor profile'
);
select harness.expect_error(
  $$insert into public.doctor_profiles (doctor_id, about) values ('5e222222-2222-2222-2222-222222222222', 'forged')$$,
  'rbac: B cannot create profile for Doctor Two'
);

-- Role table self-read: B sees own roles only
select harness.ok(
  (select count(*) = 1 and bool_and(role_id = 'lab_admin') from public.user_roles),
  'rbac: B reads only own user_roles'
);
-- Direct role self-grant is impossible (no client insert policy)
select harness.expect_error(
  $$insert into public.user_roles (user_id, role_id) values (auth.uid(), 'super_admin')$$,
  'rbac: user cannot self-grant super_admin via direct insert'
);
-- Guarded function enforces super_admin-only
select harness.expect_error(
  $$select public.carelink_grant_role(auth.uid(), 'admin')$$,
  'rbac: non-super-admin cannot call carelink_grant_role'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Super-admin (C): guarded actions succeed AND are audited
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';

select harness.expect_ok(
  $$select public.carelink_grant_role('11111111-1111-1111-1111-111111111111', 'doctor')$$,
  'rbac: super_admin grants role via guarded function'
);
select harness.expect_ok(
  $$select public.carelink_add_provider_membership('22222222-2222-2222-2222-222222222222', 'pharmacy', '5b222222-2222-2222-2222-222222222222')$$,
  'rbac: super_admin adds provider membership via guarded function'
);
-- super_admin bypass through helper: C reaches Hospital Two as well
select harness.ok(
  public.carelink_is_hospital_admin('5a222222-2222-2222-2222-222222222222'),
  'rbac: super_admin helper grants provider scope everywhere'
);
reset role;
reset request.jwt.claims;

-- Audit trail must contain the super-admin actions (service view)
select harness.ok(
  (select count(*) >= 2 from public.audit_events where action in ('role_granted','provider_membership_added')),
  'rbac: super-admin role/membership actions are audited'
);

-- Guarded function argument validation
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_error(
  $$select public.carelink_add_provider_membership('22222222-2222-2222-2222-222222222222', 'invalid_kind', '5b222222-2222-2222-2222-222222222222')$$,
  'rbac: invalid provider kind rejected even for super_admin'
);
reset role;
reset request.jwt.claims;

-- audit_events: client cannot insert directly (no policy)
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$insert into public.audit_events (actor_id, action) values (auth.uid(), 'forged_audit')$$,
  'audit: client cannot forge audit rows via direct insert'
);
select harness.ok(
  (select count(*) = 0 from public.audit_events where actor_id = '33333333-3333-3333-3333-333333333333'),
  'audit: A cannot read C audit rows (self-select only)'
);
reset role;
reset request.jwt.claims;
