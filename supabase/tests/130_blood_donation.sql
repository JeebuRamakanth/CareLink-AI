-- ===========================================================================
-- 130 — Blood donation network: 4-month cooldown + YES/NO privacy flow.
--   Fixtures: B and C become donors (O+, Hyderabad). A raises a request.
-- ===========================================================================

-- B and C register as donors
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_ok(
  $$insert into public.donor_profiles (id, owner_id, blood_group_code, city, phone)
    values ('b0000016-0000-0000-0000-000000000016', auth.uid(), 'O+', 'Hyderabad', '9000000002')$$,
  'blood: B registers as donor'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_ok(
  $$insert into public.donor_profiles (id, owner_id, blood_group_code, city, phone)
    values ('c0000016-0000-0000-0000-000000000016', auth.uid(), 'O+', 'Hyderabad', '9000000003')$$,
  'blood: C registers as donor'
);
reset role;
reset request.jwt.claims;

-- donor identity is NOT cross-user readable
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  (select count(*) = 0 from public.donor_profiles),
  'blood: A sees zero donor profiles (privacy by default)'
);

-- A raises an O+ request in Hyderabad
select harness.expect_ok(
  $$insert into public.blood_requests (id, owner_id, blood_group_code, units_needed, city, urgency)
    values ('a0000017-0000-0000-0000-000000000017', auth.uid(), 'O+', 2, 'Hyderabad', 'urgent')$$,
  'blood: A creates blood request'
);

-- Matching: requester-only, excludes self and ineligible
select harness.ok(
  public.carelink_match_donors('a0000017-0000-0000-0000-000000000017') = 2,
  'blood: matching finds both eligible O+ donors'
);
select harness.ok(
  (select count(*) = 2 from public.donor_match_results where blood_request_id = 'a0000017-0000-0000-0000-000000000017'),
  'blood: match rows visible to requester'
);

-- send donor requests to both matches
select harness.expect_ok(
  $$select public.carelink_send_donor_request('a0000017-0000-0000-0000-000000000017', 'b0000016-0000-0000-0000-000000000016')$$,
  'blood: donor request sent to B'
);
select harness.expect_ok(
  $$select public.carelink_send_donor_request('a0000017-0000-0000-0000-000000000017', 'c0000016-0000-0000-0000-000000000016')$$,
  'blood: donor request sent to C'
);

-- one donor profile per user (unique owner_id)
select harness.expect_ok(
  $$insert into public.donor_profiles (id, owner_id, blood_group_code, city) values ('a0000016-0000-0000-0000-000000000016', auth.uid(), 'AB+', 'Hyderabad')$$,
  'blood: A registers as donor (first profile)'
);
select harness.expect_error(
  $$insert into public.donor_profiles (owner_id, blood_group_code) values (auth.uid(), 'A+')$$,
  'blood: second donor profile for same user rejected'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- BEFORE YES: no contact disclosure to either side
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$select public.carelink_get_donor_contact((select id from public.donor_requests where blood_request_id = 'a0000017-0000-0000-0000-000000000017' and donor_profile_id = 'b0000016-0000-0000-0000-000000000016'))$$,
  'blood: requester cannot read donor contact before YES'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Donor B: NO — nothing disclosed, audited
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok(
  (select count(*) = 1 from public.donor_requests where status = 'sent'),
  'blood: donor B sees pending request (minimal row, no patient identity fields)'
);
select harness.expect_ok(
  $$select public.carelink_donor_respond((select id from public.donor_requests where donor_profile_id = 'b0000016-0000-0000-0000-000000000016'), false)$$,
  'blood: donor B answers NO'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  (select status = 'declined' from public.donor_requests where donor_profile_id = 'b0000016-0000-0000-0000-000000000016'),
  'blood: requester sees declined status'
);
select harness.expect_error(
  $$select public.carelink_get_donor_contact((select id from public.donor_requests where donor_profile_id = 'b0000016-0000-0000-0000-000000000016'))$$,
  'blood: donor NO -> contact stays hidden'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Donor C: YES — minimum disclosure both ways, audited
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_ok(
  $$select public.carelink_donor_respond((select id from public.donor_requests where donor_profile_id = 'c0000016-0000-0000-0000-000000000016'), true)$$,
  'blood: donor C answers YES'
);
-- donor reads requester minimum contact after YES
select harness.ok(
  (public.carelink_get_requester_contact((select id from public.donor_requests where donor_profile_id = 'c0000016-0000-0000-0000-000000000016')) is not null),
  'blood: donor reads requester minimum contact after YES'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  (public.carelink_get_donor_contact((select id from public.donor_requests where donor_profile_id = 'c0000016-0000-0000-0000-000000000016')) ->> 'donor_phone') = '9000000003',
  'blood: requester reads donor minimum contact after YES'
);
reset role;
reset request.jwt.claims;

-- disclosure events audited
select harness.ok(
  (select count(*) >= 2 from public.audit_events
    where action in ('donor_contact_disclosed','requester_contact_disclosed','donor_consent_yes','donor_consent_no')),
  'blood: consent + disclosure events audited'
);

-- ---------------------------------------------------------------------------
-- 4-MONTH COOLDOWN (mandatory, DB-enforced)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_ok(
  $$select public.carelink_record_donation('c0000016-0000-0000-0000-000000000016', '2026-08-01', null)$$,
  'blood: C donation recorded'
);
reset role;
reset request.jwt.claims;

-- eligibility computed by trigger: donated 2026-08-01 -> eligible 2026-12-01
select harness.ok(
  (select eligible_until = '2026-12-01'::date and is_eligible = false
     from public.donor_eligibility where donor_profile_id = 'c0000016-0000-0000-0000-000000000016'),
  'blood: eligibility trigger sets eligible_until = donation + 4 months'
);

-- another donation inside the window is rejected
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_error(
  $$select public.carelink_record_donation('c0000016-0000-0000-0000-000000000016', '2026-10-01', null)$$,
  'blood: donation inside 4-month cooldown rejected'
);
select harness.expect_ok(
  $$select public.carelink_record_donation('c0000016-0000-0000-0000-000000000016', '2026-12-02', null)$$,
  'blood: donation after cooldown allowed'
);
reset role;
reset request.jwt.claims;

-- after cooldown donation, eligible_until advanced to 2027-04-02
select harness.ok(
  (select eligible_until = '2027-04-02'::date from public.donor_eligibility where donor_profile_id = 'c0000016-0000-0000-0000-000000000016'),
  'blood: eligibility advanced by later donation'
);

-- ineligible donor is excluded from matching (C in cooldown until 2027-04)
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$insert into public.blood_requests (id, owner_id, blood_group_code, units_needed, city, urgency)
    values ('a0000018-0000-0000-0000-000000000018', auth.uid(), 'O+', 1, 'Hyderabad', 'routine')$$,
  'blood: second request created'
);
select harness.ok(
  public.carelink_match_donors('a0000018-0000-0000-0000-000000000018') = 1,
  'blood: in-cooldown donor excluded from new match'
);

-- direct table bypass attempts
select harness.expect_error(
  $$insert into public.donation_records (donor_profile_id, donated_on) values ('c0000016-0000-0000-0000-000000000016', '2026-11-01')$$,
  'blood: direct donation_records insert rejected (no client policy)'
);
select harness.ok(
  (select count(*) = 0 from public.donor_eligibility),
  'blood: A cannot read eligibility table directly'
);
select harness.ok(
  (select count(*) = 0 from public.donation_records),
  'blood: A cannot read donation records directly'
);
reset role;
reset request.jwt.claims;

-- requester cannot respond as the donor
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$select public.carelink_donor_respond((select id from public.donor_requests where donor_profile_id = 'c0000016-0000-0000-0000-000000000016' and status = 'accepted'), true)$$,
  'blood: requester cannot answer on behalf of donor'
);
reset role;
reset request.jwt.claims;
