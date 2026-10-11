-- ===========================================================================
-- 250 — Step 22: appointment REQUEST workflow (honest pending → confirmed),
--       server-side validation, idempotency, concurrency and authorization.
--
-- Fixtures reused: doctor 7f300001-...  is affiliated ONLY with hospital
-- 7f100007-... ; doctor 7f300002-... is affiliated with 7f10000c and 7f100005.
-- Users A/B/C carry harness roles; this suite adds two CLEAN patients
--   D (44444444-...) and E (55555555-...) with NO roles and active accounts,
-- so permission checks are exercised against an ordinary patient.
-- ===========================================================================

insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'patient-d@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'patient-e@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, account_status) values
  ('44444444-4444-4444-4444-444444444444', 'Patient D', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'Patient E', 'active')
on conflict (id) do update set account_status = 'active';

-- ---------------------------------------------------------------------------
-- 1. A patient can REQUEST an appointment with an affiliated doctor; it is
--    persisted as PENDING (never auto-confirmed).
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_ok(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-01', '10:00', 'Consultation', 'Persistent cough',
      null, null, 'req-key-A-1')$$,
  'req: patient can request an appointment with an affiliated doctor'
);
select harness.ok(
  (select status = 'pending' from public.appointment_requests
    where owner_id = '44444444-4444-4444-4444-444444444444' and request_key = 'req-key-A-1'),
  'req: a new request is PENDING (not auto-confirmed)'
);
select harness.ok(
  (select count(*) = 0 from public.appointments
    where owner_id = '44444444-4444-4444-4444-444444444444'
      and scheduled_date = '2026-12-01' and scheduled_time = '10:00'),
  'req: a pending request creates NO confirmed appointment row'
);

-- Idempotency: same request_key returns the same row (no duplicate).
select harness.ok(
  ((select id from public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-01', '10:00', 'Consultation', 'Persistent cough',
      null, null, 'req-key-A-1'))
   = (select id from public.appointment_requests
        where owner_id = '44444444-4444-4444-4444-444444444444' and request_key = 'req-key-A-1')),
  'req: repeated submission with the same key is idempotent'
);
select harness.ok(
  (select count(*) = 1 from public.appointment_requests
    where owner_id = '44444444-4444-4444-4444-444444444444' and request_key = 'req-key-A-1'),
  'req: idempotent repeat did not create a duplicate row'
);

-- ---------------------------------------------------------------------------
-- 2. Server-side validation: past date, unknown doctor, non-affiliated pair.
-- ---------------------------------------------------------------------------
select harness.expect_error(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2000-01-01', '10:00', 'Consultation', null, null, null, 'req-key-past')$$,
  'req: a past appointment date is rejected'
);
select harness.expect_error(
  $$select public.carelink_request_appointment(
      'no-such-doctor', '7f100007-0000-0000-0000-000000000007',
      '2026-12-02', '10:00', 'Consultation', null, null, null, 'req-key-unknown')$$,
  'req: an unknown doctor is rejected'
);
select harness.expect_error(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100005-0000-0000-0000-000000000005',
      '2026-12-02', '10:00', 'Consultation', null, null, null, 'req-key-unaff')$$,
  'req: a doctor/hospital pair that is NOT affiliated is rejected'
);
select harness.expect_error(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-02', '10:00', 'Consultation',
      repeat('x', 600), null, null, 'req-key-long')$$,
  'req: an over-long reason is rejected'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 3. Authorization: patient E cannot read patient D's request (IDOR blocked).
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.ok(
  (select count(*) = 0 from public.appointment_requests
    where owner_id = '44444444-4444-4444-4444-444444444444'),
  'req: another patient cannot read the request (RLS/IDOR blocked)'
);
-- E cannot cancel D's request either (function checks ownership).
select harness.expect_error(
  $$select public.carelink_cancel_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-A-1'), 'nope')$$,
  'req: another patient cannot cancel the request'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 4. Confirmation is an authorized, audited, idempotent operator action.
-- ---------------------------------------------------------------------------
-- A plain patient cannot confirm their own request.
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_error(
  $$select public.carelink_decide_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-A-1'), 'confirmed', 'self')$$,
  'req: a patient cannot confirm their own request (no appointments.manage)'
);
reset role;
reset request.jwt.claims;

-- Super admin (C) confirms -> a real appointment row is created and linked.
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_ok(
  $$select public.carelink_decide_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-A-1'), 'confirmed', 'Confirmed by staff')$$,
  'req: an authorized operator confirms the request'
);
-- Idempotent: a second decision does not create a second appointment.
select harness.expect_ok(
  $$select public.carelink_decide_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-A-1'), 'confirmed', 'again')$$,
  'req: a repeat decision is accepted (no-op)'
);
reset role;
reset request.jwt.claims;

-- Assert the persisted linkage as the service owner (RLS would hide another
-- patient's appointment row from the operator, which is correct).
select harness.ok(
  (select status = 'confirmed' and confirmed_appointment_id is not null
     from public.appointment_requests where request_key = 'req-key-A-1'),
  'req: confirmation sets status=confirmed and links the appointment'
);
select harness.ok(
  (select count(*) = 1 from public.appointments a
     join public.appointment_requests r on r.confirmed_appointment_id = a.id
    where r.request_key = 'req-key-A-1'
      and a.owner_id = '44444444-4444-4444-4444-444444444444'
      and a.status = 'confirmed'),
  'req: the confirmed appointment belongs to the requester'
);
select harness.ok(
  (select count(*) = 1 from public.appointments a
     join public.appointment_requests r on r.confirmed_appointment_id = a.id
    where r.request_key = 'req-key-A-1'),
  'req: a repeat decision does not duplicate the appointment'
);

-- ---------------------------------------------------------------------------
-- 5. Rejection path.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_ok(
  $$select public.carelink_request_appointment(
      '7f300002-0000-0000-0000-000000000002',
      '7f10000c-0000-0000-0000-00000000000c',
      '2026-12-03', '11:00', 'Consultation', 'Knee pain',
      null, null, 'req-key-B-1')$$,
  'req: a second patient can request an appointment'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_ok(
  $$select public.carelink_decide_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-B-1'), 'rejected', 'Slot unavailable')$$,
  'req: an authorized operator rejects a request'
);
select harness.ok(
  (select status = 'rejected' and confirmed_appointment_id is null
     from public.appointment_requests where request_key = 'req-key-B-1'),
  'req: rejection leaves the request unconfirmed (no appointment row)'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 6. Owner cancellation of a still-pending request.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_ok(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-05', '09:00', 'Consultation', null, null, null, 'req-key-A-2')$$,
  'req: a patient creates a second (pending) request'
);
select harness.expect_ok(
  $$select public.carelink_cancel_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-A-2'), 'changed plans')$$,
  'req: the owner can cancel their own pending request'
);
-- A confirmed request can no longer be cancelled by the owner.
select harness.expect_error(
  $$select public.carelink_cancel_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-A-1'), 'too late')$$,
  'req: a confirmed request cannot be cancelled by the owner'
);
-- Owner read returns only their own requests.
select harness.ok(
  (select count(*) >= 1 and bool_and(owner_id = auth.uid())
     from public.carelink_list_my_appointment_requests()),
  'req: owner list returns only the caller''s requests'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 7. Provider scoped read: the linked doctor's user can see requests for their
--    own doctor scope. (Harness user B is the approved doctor link for
--    Doctor One 5e111111 in 050; here we link patient E to doctor 7f300002.)
-- ---------------------------------------------------------------------------
insert into public.doctor_user_links (user_id, doctor_id, status)
values ('55555555-5555-5555-5555-555555555555', '7f300002-0000-0000-0000-000000000002', 'approved')
on conflict (user_id, doctor_id) do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.ok(
  (select count(*) >= 1 from public.appointment_requests
    where doctor_id = '7f300002-0000-0000-0000-000000000002'),
  'req: the linked doctor can read requests addressed to their own doctor scope'
);
-- ...but NOT requests addressed to a DIFFERENT doctor.
select harness.ok(
  (select count(*) = 0 from public.appointment_requests
    where doctor_id = '7f300001-0000-0000-0000-000000000001'
      and owner_id <> '55555555-5555-5555-5555-555555555555'),
  'req: the linked doctor cannot read another doctor''s requests'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 8. Suspended accounts cannot create requests.
-- ---------------------------------------------------------------------------
insert into public.profiles (id, display_name, account_status) values
  ('44444444-4444-4444-4444-444444444444', 'Patient D', 'suspended')
on conflict (id) do update set account_status = 'suspended';

set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_error(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-09', '09:00', 'Consultation', null, null, null, 'req-key-susp')$$,
  'req: a suspended account cannot create a request'
);
reset role;
reset request.jwt.claims;
update public.profiles set account_status = 'active'
  where id = '44444444-4444-4444-4444-444444444444';

-- ---------------------------------------------------------------------------
-- 9. Anonymous users cannot call the request RPCs at all.
-- ---------------------------------------------------------------------------
set role anon;
select harness.expect_error(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-10', '09:00', 'Consultation', null, null, null, 'req-key-anon')$$,
  'req: anonymous cannot create a request'
);
reset role;

-- ---------------------------------------------------------------------------
-- 10. Concurrency: two requests for the SAME doctor/date/time can both be
--     created (pending), but only ONE can be confirmed — the second
--     confirmation is rejected by the DB unique guard, never silently
--     overbooked.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_ok(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-20', '10:00', 'Consultation', null, null, null, 'req-key-C-1')$$,
  'req: first request for a contested slot is created'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_ok(
  $$select public.carelink_request_appointment(
      '7f300001-0000-0000-0000-000000000001',
      '7f100007-0000-0000-0000-000000000007',
      '2026-12-20', '10:00', 'Consultation', null, null, null, 'req-key-C-2')$$,
  'req: second request for the same contested slot is also accepted as pending'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_ok(
  $$select public.carelink_decide_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-C-1'), 'confirmed', 'first')$$,
  'req: the first contested request is confirmed'
);
select harness.expect_error(
  $$select public.carelink_decide_appointment_request(
      (select id from public.appointment_requests where request_key = 'req-key-C-2'), 'confirmed', 'second')$$,
  'req: the second confirmation for the SAME slot is rejected (no overbooking)'
);
reset role;
reset request.jwt.claims;

-- The second request stays PENDING (truthful status) and produced no appointment.
select harness.ok(
  (select status = 'pending' and confirmed_appointment_id is null
     from public.appointment_requests where request_key = 'req-key-C-2'),
  'req: the unconfirmed request remains pending with no appointment row'
);
