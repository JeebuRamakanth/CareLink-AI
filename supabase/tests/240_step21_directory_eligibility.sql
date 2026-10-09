-- ===========================================================================
-- 240 — Step 21: Machilipatnam directory provenance/relationships,
--       review eligibility floor, and booking concurrency.
--
-- Covers Phase 13 scenarios:
--   1/2 real sourced directory + honest government/private classification
--   3   hospital profile data belongs to that hospital
--   4   hospital shows only correctly linked doctors
--   5   doctor shows the correct hospital associations
--   8   a patient can book a valid available slot (persisted)
--   9   concurrent booking cannot double-book an exclusive slot
--   10  ineligible patients cannot submit reviews
--   11  duplicate reviews rejected
--   12  reviews appear only against the eligible target
--   14  ordinary patients cannot read another patient's appointments
--   15  ordinary users cannot self-grant admin
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1/2. Directory provenance + honest classification
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) >= 4 from public.hospitals
    where slug like 'mph-%' and city = 'Machilipatnam'),
  '240: Machilipatnam hospitals seeded'
);
select harness.ok(
  (select data_status = 'VERIFIED' and data_source = 'krishna.ap.gov.in'
     from public.hospitals where id = '7f100001-0000-0000-0000-000000000001'),
  '240: government district hospital marked VERIFIED from the official source'
);
select harness.ok(
  (select data_status = 'THIRD_PARTY_DIRECTORY'
     from public.hospitals where id = '7f100009-0000-0000-0000-000000000009'),
  '240: third-party directory listing is NOT marked verified'
);
select harness.ok(
  (select provider_country_is_india from (
     select (h.city = 'Machilipatnam' and h.data_source is not null) as provider_country_is_india
     from public.hospitals h where h.id = '7f100005-0000-0000-0000-000000000005') x),
  '240: private facility carries an explicit data source'
);
select harness.ok(
  (select count(*) = 0 from public.hospitals where slug like 'mph-%' and rating is not null),
  '240: no fabricated ratings on imported directory facilities'
);
select harness.ok(
  (select count(*) = 0 from public.doctors d
     join public.doctor_verification v on v.doctor_id = d.id
    where d.slug like 'mph-%' and v.status = 'verified'),
  '240: imported doctors are never auto-marked verified'
);

-- ---------------------------------------------------------------------------
-- 3/4/5. Relationships: a hospital only shows its linked doctors; a doctor
--        shows only its linked hospitals.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) = 1 from public.doctor_hospitals
    where doctor_id = '7f300001-0000-0000-0000-000000000001'),
  '240: doctor 1 is linked to exactly one hospital'
);
select harness.ok(
  (select hospital_id = '7f100007-0000-0000-0000-000000000007' from public.doctor_hospitals
    where doctor_id = '7f300001-0000-0000-0000-000000000001'),
  '240: doctor 1 belongs to the expected hospital'
);
select harness.ok(
  (select count(*) = 0 from public.doctor_hospitals
    where doctor_id = '7f300001-0000-0000-0000-000000000001'
      and hospital_id = '7f100005-0000-0000-0000-000000000005'),
  '240: a doctor does NOT appear at a hospital they are not linked to'
);
select harness.ok(
  (select count(*) = 2 from public.doctor_hospitals
    where doctor_id = '7f300002-0000-0000-0000-000000000002'),
  '240: a multi-site doctor is linked to both hospitals'
);
select harness.ok(
  (select count(*) = 2 from public.doctors d
     join public.doctor_hospitals dh on dh.doctor_id = d.id
    where dh.hospital_id = '7f100008-0000-0000-0000-000000000008'),
  '240: hospital roster shows exactly its linked doctors'
);
-- The compat view exposes the same canonical link.
select harness.ok(
  (select count(*) = (select count(*) from public.doctor_hospitals) from public.hospital_doctors),
  '240: hospital_doctors view mirrors doctor_hospitals'
);

-- ---------------------------------------------------------------------------
-- 8. A patient can book a valid slot (persisted) and read it back.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, doctor_id, hospital_id, scheduled_date, scheduled_time, status)
    values ('7f900001-0000-0000-0000-000000000001', auth.uid(), '7f300001-0000-0000-0000-000000000001',
            '7f100007-0000-0000-0000-000000000007', '2026-11-01', '10:00', 'confirmed')$$,
  '240: patient books a valid available slot'
);
select harness.ok(
  (select count(*) = 1 from public.appointments where id = '7f900001-0000-0000-0000-000000000001'),
  '240: booked appointment is persisted and retrievable by its owner'
);
reset role;
reset request.jwt.claims;

-- 14. Another patient cannot read that appointment (RLS).
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok(
  (select count(*) = 0 from public.appointments where id = '7f900001-0000-0000-0000-000000000001'),
  '240: another patient cannot read the appointment (IDOR blocked)'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 9. Concurrent booking cannot double-book the same doctor + slot.
--    (appointments_active_slot_uq; cancelled bookings free the slot.)
-- ---------------------------------------------------------------------------
select harness.expect_error(
  $$insert into public.appointments (id, owner_id, doctor_id, scheduled_date, scheduled_time, status)
    values ('7f900001-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222',
            '7f300001-0000-0000-0000-000000000001', '2026-11-01', '10:00', 'confirmed')$$,
  '240: double-booking the same doctor + slot is rejected'
);
-- Cancel the first booking, then the slot is reusable.
update public.appointments set status = 'cancelled' where id = '7f900001-0000-0000-0000-000000000001';
select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, doctor_id, scheduled_date, scheduled_time, status)
    values ('7f900001-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222',
            '7f300001-0000-0000-0000-000000000001', '2026-11-01', '10:00', 'confirmed')$$,
  '240: a cancelled slot can be rebooked'
);

-- ---------------------------------------------------------------------------
-- 10/11/12. Review eligibility + duplicate protection + correct target.
-- ---------------------------------------------------------------------------
-- A has no completed appointment for hospital 7f100006 yet -> blocked.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$insert into public.reviews (owner_id, hospital_id, overall_rating, appointment_id)
    values (auth.uid(), '7f100006-0000-0000-0000-000000000006', 5, '7f900001-0000-0000-0000-000000000002')$$,
  '240: ineligible patient cannot review (not a completed appointment of theirs)'
);
-- A gets a completed appointment at that hospital -> review allowed.
reset role;
reset request.jwt.claims;
insert into public.appointments (id, owner_id, doctor_id, hospital_id, scheduled_date, scheduled_time, status)
  values ('7f900001-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111',
          '7f300003-0000-0000-0000-000000000003', '7f100006-0000-0000-0000-000000000006', '2026-09-01', '09:00', 'completed');
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$insert into public.reviews (id, owner_id, hospital_id, overall_rating, body, appointment_id)
    values ('7f900002-0000-0000-0000-000000000001', auth.uid(), '7f100006-0000-0000-0000-000000000006', 4,
            'Eligible review', '7f900001-0000-0000-0000-000000000004')$$,
  '240: eligible patient (completed appointment) can review'
);
-- Duplicate review of the same target rejected.
select harness.expect_error(
  $$insert into public.reviews (owner_id, hospital_id, overall_rating, appointment_id)
    values (auth.uid(), '7f100006-0000-0000-0000-000000000006', 3, '7f900001-0000-0000-0000-000000000004')$$,
  '240: duplicate review of same target rejected'
);
-- Review belongs to the correct target only.
select harness.ok(
  (select hospital_id = '7f100006-0000-0000-0000-000000000006' and doctor_id is null
     from public.reviews where id = '7f900002-0000-0000-0000-000000000001'),
  '240: review is attached to the correct hospital target'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 15. Ordinary users cannot self-grant admin.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$insert into public.user_roles (user_id, role_id)
    select auth.uid(), id from public.roles where code = 'super_admin' limit 1$$,
  '240: ordinary user cannot self-grant super_admin'
);
reset role;
reset request.jwt.claims;
