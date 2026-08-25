-- ===========================================================================
-- 120 — SOS / emergency workflow.
--   Fixtures: A = patient + hospital_admin of Hospital One (050);
--   Hospital Two exists with NO admin; B = unrelated user (lab admin);
--   C = super_admin.
-- ===========================================================================

-- A creates an SOS event + one location fix
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.expect_ok(
  $$insert into public.emergency_events (id, owner_id, severity, indicator_label)
    values ('a0000015-0000-0000-0000-000000000015', auth.uid(), 'high', 'chest pain')$$,
  'sos: A creates emergency event'
);
select harness.expect_ok(
  $$insert into public.emergency_locations (emergency_event_id, owner_id, latitude, longitude)
    values ('a0000015-0000-0000-0000-000000000015', auth.uid(), 17.3850, 78.4867)$$,
  'sos: A records one location fix'
);
select harness.expect_error(
  $$insert into public.emergency_locations (emergency_event_id, owner_id, latitude, longitude)
    values ('a0000015-0000-0000-0000-000000000015', auth.uid(), 17.39, 78.49)$$,
  'sos: second location fix rejected (no continuous tracking)'
);

-- Patient triggers hospital notification (owner-only guarded function)
select harness.expect_ok(
  $$select public.carelink_notify_hospital_for_emergency('a0000015-0000-0000-0000-000000000015', '5a111111-1111-1111-1111-111111111111')$$,
  'sos: A notifies Hospital One'
);
reset role;
reset request.jwt.claims;

-- B cannot notify about A's event; cannot see notification
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$select public.carelink_notify_hospital_for_emergency('a0000015-0000-0000-0000-000000000015', '5a222222-2222-2222-2222-222222222222')$$,
  'sos: B cannot trigger notification for A event'
);
select harness.ok(
  (select count(*) = 0 from public.hospital_emergency_notifications where owner_id = '11111111-1111-1111-1111-111111111111'),
  'sos: B cannot see A notification (not owner, not hospital member)'
);
reset role;
reset request.jwt.claims;

-- A is Hospital One admin: sees facility inbox for own hospital only
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  (select count(*) = 1 from public.hospital_emergency_notifications where hospital_id = '5a111111-1111-1111-1111-111111111111'),
  'sos: hospital member sees notification in facility inbox'
);

-- B (not a Hospital One member) cannot respond
reset role;
reset request.jwt.claims;
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$select public.carelink_respond_emergency_notification(
      (select id from public.hospital_emergency_notifications where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'), 'accepted')$$,
  'sos: non-member cannot respond to hospital notification'
);
-- C is super_admin but NOT a hospital member: cannot impersonate facility
reset role;
reset request.jwt.claims;
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.expect_error(
  $$select public.carelink_respond_emergency_notification(
      (select id from public.hospital_emergency_notifications where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'), 'accepted')$$,
  'sos: super_admin without membership cannot accept on behalf of hospital'
);
reset role;
reset request.jwt.claims;

-- Hospital One admin (A) accepts → acceptance row + history + audit
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$select public.carelink_respond_emergency_notification(
      (select id from public.hospital_emergency_notifications where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'), 'accepted')$$,
  'sos: hospital member accepts notification'
);
-- double-answer rejected
select harness.expect_error(
  $$select public.carelink_respond_emergency_notification(
      (select id from public.hospital_emergency_notifications where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'), 'rejected')$$,
  'sos: already-answered notification cannot change answer'
);

-- Ambulance: create + advance state (hospital member only)
select harness.expect_ok(
  $$select public.carelink_create_ambulance_request('a0000015-0000-0000-0000-000000000015', '5a111111-1111-1111-1111-111111111111')$$,
  'sos: ambulance request created after acceptance'
);
select harness.expect_ok(
  $$select public.carelink_transition_ambulance(
      (select id from public.ambulance_requests where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'), 'en_route', 'dispatched')$$,
  'sos: ambulance transitioned to en_route'
);
reset role;
reset request.jwt.claims;

-- B cannot transition; terminal-state guard
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$select public.carelink_transition_ambulance(
      (select id from public.ambulance_requests where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'), 'arrived')$$,
  'sos: non-member cannot transition ambulance'
);
select harness.ok(
  (select count(*) = 0 from public.ambulance_requests where owner_id = '11111111-1111-1111-1111-111111111111'),
  'sos: B cannot see A ambulance request'
);
reset role;
reset request.jwt.claims;

-- History + audit + patient visibility (service + owner views)
select harness.ok(
  (select count(*) >= 3 from public.emergency_event_history where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'),
  'sos: event history recorded (notify, accept, ambulance transitions)'
);
select harness.ok(
  (select count(*) >= 3 from public.audit_events
    where target_id = 'a0000015-0000-0000-0000-000000000015'
       or target_id in (select id from public.ambulance_requests where emergency_event_id = 'a0000015-0000-0000-0000-000000000015')),
  'sos: transitions audited'
);
select harness.ok(
  (select count(*) = 1 from public.emergency_admin_acceptance where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'),
  'sos: acceptance recorded once'
);

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  (select count(*) >= 1 from public.ambulance_status where owner_id = auth.uid()),
  'sos: patient A sees own ambulance status'
);
select harness.ok(
  (select status = 'en_route' from public.ambulance_requests where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'),
  'sos: patient A sees current ambulance state'
);
reset role;
reset request.jwt.claims;

-- Direct client writes on workflow tables are impossible (no policies)
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$insert into public.ambulance_requests (emergency_event_id, owner_id, hospital_id)
    values ('a0000015-0000-0000-0000-000000000015', auth.uid(), '5a222222-2222-2222-2222-222222222222')$$,
  'sos: direct ambulance request insert rejected (guarded function only)'
);
-- UPDATE with no UPDATE policy: 0 visible+permitted rows -> silent no-op.
-- Verify state is provably unchanged instead of expecting an error.
update public.hospital_emergency_notifications set status = 'rejected';
reset role;
reset request.jwt.claims;

select harness.ok(
  (select status = 'accepted' from public.hospital_emergency_notifications where emergency_event_id = 'a0000015-0000-0000-0000-000000000015'),
  'sos: B direct update attempt changed nothing (no client update path)'
);
