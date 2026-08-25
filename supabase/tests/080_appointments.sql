-- ===========================================================================
-- 080 — Appointment expansion: slots, double-booking protection, status
-- lifecycle, notes/cancellation/reschedule/reminders ownership.
--   (Fixtures: Doctor One 5e111111-..., B has approved doctor link,
--    A appointment a0000002-... 'confirmed' 2026-09-01 10:00 doctor_name only)
-- ===========================================================================

-- Slots for Doctor One (service fixture)
insert into public.appointment_slots (id, doctor_id, slot_date, start_time, end_time)
values
  ('5f111111-1111-1111-1111-111111111111', '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:00', '09:30'),
  ('5f222222-2222-2222-2222-222222222222', '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:30', '10:00');

-- Public read of slots + types
set role anon;
select harness.ok((select count(*) >= 2 from public.appointment_slots), 'appt: anon reads slots');
select harness.ok((select count(*) >= 3 from public.appointment_types), 'appt: anon reads appointment types');
reset role;

-- Non-linked user cannot create slots for Doctor One
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$insert into public.appointment_slots (doctor_id, slot_date, start_time, end_time)
    values ('5e111111-1111-1111-1111-111111111111', '2026-09-11', '09:00', '09:30')$$,
  'appt: non-linked user cannot create doctor slots'
);
reset role;
reset request.jwt.claims;

-- Linked doctor (B) manages slots; duplicate doctor+date+start rejected
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_ok(
  $$insert into public.appointment_slots (doctor_id, slot_date, start_time, end_time)
    values ('5e111111-1111-1111-1111-111111111111', '2026-09-11', '09:00', '09:30')$$,
  'appt: linked doctor creates slot'
);
select harness.expect_error(
  $$insert into public.appointment_slots (doctor_id, slot_date, start_time, end_time)
    values ('5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:00', '10:00')$$,
  'appt: duplicate doctor/date/start_time slot rejected'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Double-booking protection
-- ---------------------------------------------------------------------------

-- A books slot 1 (active) — linked via slot_id AND doctor/date/time text cols
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, slot_id, doctor_id, scheduled_date, scheduled_time, status)
    values ('a0000008-0000-0000-0000-000000000008', auth.uid(), '5f111111-1111-1111-1111-111111111111', '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:00', 'confirmed')$$,
  'appt: A books slot 1'
);
reset role;
reset request.jwt.claims;

-- B double-books: same slot (active) AND same doctor/date/time -> both guards fire
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$insert into public.appointments (owner_id, slot_id, doctor_id, scheduled_date, scheduled_time, status)
    values (auth.uid(), '5f111111-1111-1111-1111-111111111111', '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:00', 'confirmed')$$,
  'appt: double booking same slot rejected (unique active slot)'
);
select harness.expect_error(
  $$insert into public.appointments (owner_id, doctor_id, scheduled_date, scheduled_time, status)
    values (auth.uid(), '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:00', 'upcoming')$$,
  'appt: double booking same doctor/date/time without slot link rejected'
);
-- Cancelled status does NOT block (partial unique index excludes it)
select harness.expect_ok(
  $$insert into public.appointments (owner_id, doctor_id, scheduled_date, scheduled_time, status)
    values (auth.uid(), '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:00', 'cancelled')$$,
  'appt: cancelled booking at same moment allowed'
);
-- Different slot is fine
select harness.expect_ok(
  $$insert into public.appointments (owner_id, slot_id, doctor_id, scheduled_date, scheduled_time, status)
    values (auth.uid(), '5f222222-2222-2222-2222-222222222222', '5e111111-1111-1111-1111-111111111111', '2026-09-10', '09:30', 'confirmed')$$,
  'appt: B books the other slot'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Status lifecycle: history written by trigger, visible to owner only
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$update public.appointments set status = 'completed' where id = 'a0000008-0000-0000-0000-000000000008'$$,
  'appt: A completes own appointment'
);
select harness.ok(
  (select count(*) = 1 and bool_and(old_status = 'confirmed' and new_status = 'completed')
     from public.appointment_status_history where appointment_id = 'a0000008-0000-0000-0000-000000000008'),
  'appt: status history recorded and owner-readable'
);

-- Lifecycle tables ownership
select harness.expect_ok(
  $$insert into public.appointment_notes (owner_id, appointment_id, note) values (auth.uid(), 'a0000008-0000-0000-0000-000000000008', 'bring reports')$$,
  'appt: A adds note to own appointment'
);
select harness.expect_error(
  $$insert into public.appointment_notes (owner_id, appointment_id, note) values (auth.uid(), 'b0000002-0000-0000-0000-000000000002', 'forged')$$,
  'appt: A cannot add note to B appointment'
);
select harness.expect_ok(
  $$insert into public.reschedule_events (owner_id, appointment_id, new_date, new_time)
    values (auth.uid(), 'a0000002-0000-0000-0000-000000000002', '2026-09-02', '10:00')$$,
  'appt: A records reschedule for own appointment'
);
select harness.expect_error(
  $$insert into public.reminders (owner_id, appointment_id, remind_at)
    values (auth.uid(), 'b0000002-0000-0000-0000-000000000002', '2026-09-04 08:00')$$,
  'appt: A cannot create reminder for B appointment'
);
select harness.expect_ok(
  $$insert into public.reminders (owner_id, appointment_id, remind_at)
    values (auth.uid(), 'a0000002-0000-0000-0000-000000000002', '2026-08-31 08:00')$$,
  'appt: A creates reminder for own appointment'
);
reset role;
reset request.jwt.claims;

-- B cannot see A's lifecycle rows
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok((select count(*) = 0 from public.appointment_status_history where owner_id = '11111111-1111-1111-1111-111111111111'), 'appt: B cannot see A status history');
select harness.ok((select count(*) = 0 from public.appointment_notes where owner_id = '11111111-1111-1111-1111-111111111111'), 'appt: B cannot see A notes');
select harness.ok((select count(*) = 0 from public.reminders where owner_id = '11111111-1111-1111-1111-111111111111'), 'appt: B cannot see A reminders');
reset role;
reset request.jwt.claims;

-- cancellation_records: one per appointment
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$insert into public.cancellation_records (owner_id, appointment_id, reason) values (auth.uid(), 'a0000002-0000-0000-0000-000000000002', 'schedule conflict')$$,
  'appt: A records cancellation'
);
select harness.expect_error(
  $$insert into public.cancellation_records (owner_id, appointment_id, reason) values (auth.uid(), 'a0000002-0000-0000-0000-000000000002', 'duplicate')$$,
  'appt: duplicate cancellation record rejected'
);
reset role;
reset request.jwt.claims;
