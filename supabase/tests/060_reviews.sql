-- ===========================================================================
-- 060 — Reviews backend: ownership, verification, moderation, responses.
--   (Fixtures from 050 exist: Hospital One/Two, Doctor One, A=H1 admin,
--    C=super_admin.)
-- ===========================================================================

-- A completed appointment for verification path (service fixture for A)
insert into public.appointments (id, owner_id, doctor_name, scheduled_date, scheduled_time, status)
values
  ('a0000005-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Doctor One', '2026-08-01', '10:00', 'completed'),
  ('b0000005-0000-0000-0000-000000000005', '22222222-2222-2222-2222-222222222222', 'Doctor One', '2026-08-02', '11:00', 'upcoming');

-- ---------------------------------------------------------------------------
-- Authoring + duplicate protection
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.expect_ok(
  $$insert into public.reviews (id, owner_id, hospital_id, overall_rating, body, appointment_id)
    values ('a0000006-0000-0000-0000-000000000006', auth.uid(), '5a111111-1111-1111-1111-111111111111', 5, 'Great care', 'a0000005-0000-0000-0000-000000000005')$$,
  'reviews: A publishes review of Hospital One'
);
select harness.expect_error(
  $$insert into public.reviews (owner_id, hospital_id, overall_rating)
    values (auth.uid(), '5a111111-1111-1111-1111-111111111111', 1)$$,
  'reviews: duplicate published review of same target rejected'
);
select harness.expect_error(
  $$insert into public.reviews (owner_id, hospital_id, doctor_id, overall_rating)
    values (auth.uid(), '5a111111-1111-1111-1111-111111111111', '5e111111-1111-1111-1111-111111111111', 4)$$,
  'reviews: multi-target review rejected by CHECK'
);
select harness.expect_error(
  $$insert into public.reviews (owner_id, hospital_id, overall_rating)
    values (auth.uid(), '5a111111-1111-1111-1111-111111111111', 9)$$,
  'reviews: out-of-range rating rejected'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_ok(
  $$insert into public.reviews (id, owner_id, hospital_id, overall_rating, body, appointment_id)
    values ('b0000006-0000-0000-0000-000000000006', auth.uid(), '5a111111-1111-1111-1111-111111111111', 2, 'Meh', 'b0000005-0000-0000-0000-000000000005')$$,
  'reviews: B publishes own review of Hospital One'
);
-- B cannot edit A's review (0 rows); verified unchanged below
update public.reviews set body = 'vandalized', overall_rating = 1 where id = 'a0000006-0000-0000-0000-000000000006';
-- B cannot forge verification directly (no client insert policy)
select harness.expect_error(
  $$insert into public.review_verification (review_id, verified_interaction) values ('b0000006-0000-0000-0000-000000000006', true)$$,
  'reviews: client cannot forge verified status by direct insert'
);
-- B's appointment is not completed -> verification must return false, no row
select harness.ok(
  not public.carelink_verify_review('b0000006-0000-0000-0000-000000000006'),
  'reviews: verification of non-completed appointment returns false'
);
-- B cannot verify A's review (not author, not admin)
select harness.expect_error(
  $$select public.carelink_verify_review('a0000006-0000-0000-0000-000000000006')$$,
  'reviews: non-author cannot trigger verification of another user review'
);
-- B cannot moderate
select harness.expect_error(
  $$select public.carelink_moderate_review('a0000006-0000-0000-0000-000000000006', 'remove')$$,
  'reviews: non-admin cannot moderate'
);
reset role;
reset request.jwt.claims;

select harness.ok(
  (select body = 'Great care' and overall_rating = 5 from public.reviews where id = 'a0000006-0000-0000-0000-000000000006'),
  'reviews: A review unchanged after B edit attempt'
);
select harness.ok(
  (select count(*) = 0 from public.review_verification),
  'reviews: no verification rows from forged/failed attempts'
);

-- A verifies own review (completed appointment) -> verified row created
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  public.carelink_verify_review('a0000006-0000-0000-0000-000000000006'),
  'reviews: A verifies own review against completed appointment'
);
reset role;
reset request.jwt.claims;

select harness.ok(
  (select verified_interaction from public.review_verification where review_id = 'a0000006-0000-0000-0000-000000000006'),
  'reviews: verification row persisted with verified_interaction = true'
);

-- ---------------------------------------------------------------------------
-- Provider response scoping (A is Hospital One admin; C is not a responder)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$insert into public.provider_responses (review_id, responder_id, body)
    values ('b0000006-0000-0000-0000-000000000006', auth.uid(), 'Thanks for the feedback')$$,
  'reviews: hospital admin responds to review of own hospital'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_error(
  $$insert into public.provider_responses (review_id, responder_id, body)
    values ('a0000006-0000-0000-0000-000000000006', auth.uid(), 'impersonating provider')$$,
  'reviews: super_admin without membership cannot pose as provider responder'
);
-- Moderation by super_admin: hide B's review; audited
select harness.expect_ok(
  $$select public.carelink_moderate_review('b0000006-0000-0000-0000-000000000006', 'hide', 'policy violation')$$,
  'reviews: super_admin moderation succeeds'
);
reset role;
reset request.jwt.claims;

select harness.ok(
  (select status = 'hidden' from public.reviews where id = 'b0000006-0000-0000-0000-000000000006'),
  'reviews: moderated review is hidden'
);
select harness.ok(
  (select count(*) = 1 from public.review_moderation where review_id = 'b0000006-0000-0000-0000-000000000006' and action = 'hide'),
  'reviews: moderation action recorded'
);
select harness.ok(
  exists (select 1 from public.audit_events where action = 'review_moderated' and target_id = 'b0000006-0000-0000-0000-000000000006'),
  'reviews: moderation audited in audit_events'
);

-- Public visibility: anon sees only published reviews
set role anon;
select harness.ok(
  (select count(*) = 1 and bool_and(id = 'a0000006-0000-0000-0000-000000000006') from public.reviews),
  'reviews: anon sees only published reviews'
);
reset role;

-- Author still sees own hidden review; unrelated user does not
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok(
  (select count(*) = 2 from public.reviews),
  'reviews: author still sees own hidden review plus published one'
);
reset role;
reset request.jwt.claims;
