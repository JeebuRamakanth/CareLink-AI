-- ===========================================================================
-- 090 — Medicine master + medication scheduling.
--   MANDATORY: reminder_time is ALWAYS schedule_time - 30 minutes, enforced
--   by trigger (cannot be overridden by any caller).
--   dosage_source constrained to clinician | verified | user_entered_prescription.
-- ===========================================================================

-- Master catalog seed (service path)
insert into public.medicine_master (id, name, common_purpose) values
  ('6a111111-1111-1111-1111-111111111111', 'Metformin', 'Blood sugar management');

-- Public read, non-admin write rejected
set role anon;
select harness.ok((select count(*) = 1 from public.medicine_master), 'med: anon reads medicine catalog');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$insert into public.medicine_master (name) values ('ForgedDrug')$$,
  'med: non-super-admin cannot write catalog'
);

-- Schedule with allowed dosage source
select harness.expect_ok(
  $$insert into public.medication_schedules (id, owner_id, family_profile_id, medicine_master_id, medicine_name, dosage_label, dosage_source, frequency, times_of_day)
    values ('a0000009-0000-0000-0000-000000000009', auth.uid(), 'a1111111-1111-1111-1111-111111111111', '6a111111-1111-1111-1111-111111111111', 'Metformin', '500 mg', 'user_entered_prescription', 'twice_daily', '["08:00","20:00"]')$$,
  'med: A creates schedule with prescription-sourced dosage'
);
-- AI/unknown dosage source rejected
select harness.expect_error(
  $$insert into public.medication_schedules (owner_id, medicine_name, dosage_source, frequency)
    values (auth.uid(), 'X', 'ai_suggested', 'once_daily')$$,
  'med: AI-sourced dosage rejected by CHECK'
);
-- Family isolation on schedules
select harness.expect_error(
  $$insert into public.medication_schedules (owner_id, family_profile_id, medicine_name, dosage_source, frequency)
    values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'X', 'clinician', 'once_daily')$$,
  'med: schedule with B family profile rejected'
);

-- ---------------------------------------------------------------------------
-- T-30 rule: reminder_time is recomputed by trigger regardless of input
-- ---------------------------------------------------------------------------
select harness.expect_ok(
  $$insert into public.scheduled_medication_reminders (id, owner_id, family_profile_id, medication_schedule_id, schedule_time, reminder_time)
    values ('a0000010-0000-0000-0000-000000000010', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000009-0000-0000-0000-000000000009', '2026-09-01 08:00+00', '2026-09-01 08:00+00')$$,
  'med: reminder insert accepted (caller tried T+0 offset)'
);
select harness.ok(
  (select reminder_time = schedule_time - interval '30 minutes'
     from public.scheduled_medication_reminders where id = 'a0000010-0000-0000-0000-000000000010'),
  'med: reminder_time forced to schedule_time - 30 minutes'
);

-- UPDATE cannot break the rule either
update public.scheduled_medication_reminders
  set reminder_time = '2026-09-01 07:55+00'
  where id = 'a0000010-0000-0000-0000-000000000010';
select harness.ok(
  (select reminder_time = schedule_time - interval '30 minutes'
     from public.scheduled_medication_reminders where id = 'a0000010-0000-0000-0000-000000000010'),
  'med: reminder_time still T-30 after hostile UPDATE'
);

-- Duplicate schedule_time per schedule rejected
select harness.expect_error(
  $$insert into public.scheduled_medication_reminders (owner_id, medication_schedule_id, schedule_time)
    values (auth.uid(), 'a0000009-0000-0000-0000-000000000009', '2026-09-01 08:00+00')$$,
  'med: duplicate reminder slot rejected'
);

-- Logs: own schedule ok; invalid status rejected
select harness.expect_ok(
  $$insert into public.medication_logs (owner_id, family_profile_id, medication_schedule_id, scheduled_for, status, taken_at)
    values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000009-0000-0000-0000-000000000009', '2026-09-01 08:00+00', 'taken', '2026-09-01 08:05+00')$$,
  'med: A logs dose for own schedule'
);
select harness.expect_error(
  $$insert into public.medication_logs (owner_id, medication_schedule_id, scheduled_for, status)
    values (auth.uid(), 'a0000009-0000-0000-0000-000000000009', '2026-09-01 20:00+00', 'bogus')$$,
  'med: invalid log status rejected'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- B isolation + cross-schedule references
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok((select count(*) = 0 from public.medication_schedules where owner_id = '11111111-1111-1111-1111-111111111111'), 'med: B cannot see A schedules');
select harness.ok((select count(*) = 0 from public.medication_logs where owner_id = '11111111-1111-1111-1111-111111111111'), 'med: B cannot see A logs');
select harness.ok((select count(*) = 0 from public.scheduled_medication_reminders where owner_id = '11111111-1111-1111-1111-111111111111'), 'med: B cannot see A reminders');
select harness.expect_error(
  $$insert into public.medication_logs (owner_id, medication_schedule_id, scheduled_for, status)
    values (auth.uid(), 'a0000009-0000-0000-0000-000000000009', '2026-09-01 08:00+00', 'taken')$$,
  'med: B cannot log against A schedule'
);
select harness.expect_error(
  $$insert into public.scheduled_medication_reminders (owner_id, medication_schedule_id, schedule_time)
    values (auth.uid(), 'a0000009-0000-0000-0000-000000000009', '2026-09-02 08:00+00')$$,
  'med: B cannot create reminder against A schedule'
);
reset role;
reset request.jwt.claims;

-- A reminder row truly is T-30 (service view, absolute assertion)
select harness.ok(
  (select extract(epoch from (schedule_time - reminder_time)) = 1800
     from public.scheduled_medication_reminders where id = 'a0000010-0000-0000-0000-000000000010'),
  'med: reminder offset is exactly 1800 seconds (T-30)'
);
