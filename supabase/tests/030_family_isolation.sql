-- ===========================================================================
-- 030 — Family-profile isolation + owner-scoped RLS on Step 10 core tables.
--
-- For every table carrying owner_id + family_profile_id:
--   1. valid owner + own family profile        -> allowed
--   2. valid owner + OTHER USER'S profile      -> rejected (trigger)
--   3. forged owner_id of another user         -> rejected (RLS WITH CHECK)
--   4. cross-user row visibility               -> denied
-- ===========================================================================

-- Seed family profiles via the users' own sessions (validates INSERT RLS).
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
insert into public.family_profiles (id, owner_id, relation, label)
values ('a1111111-1111-1111-1111-111111111111', auth.uid(), 'self', 'A self');
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
insert into public.family_profiles (id, owner_id, relation, label)
values ('b2222222-2222-2222-2222-222222222222', auth.uid(), 'self', 'B self');
reset role;
reset request.jwt.claims;

-- Helper sanity: A's view of the ownership helper.
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  public.carelink_is_family_profile_owner('a1111111-1111-1111-1111-111111111111'),
  'family: helper returns true for own profile'
);
select harness.ok(
  not public.carelink_is_family_profile_owner('b2222222-2222-2222-2222-222222222222'),
  'family: helper returns false for other user profile'
);

-- A can read only own family profiles.
select harness.ok(
  (select count(*) = 1 from public.family_profiles),
  'family: User A sees only own family profiles'
);

-- ---------------------------------------------------------------------------
-- Per-table isolation matrix (Step 10 core tables with family_profile_id)
-- ---------------------------------------------------------------------------

-- health_context
select harness.expect_ok(
  $$insert into public.health_context (owner_id, family_profile_id) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111')$$,
  'health_context: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.health_context (owner_id, family_profile_id) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222')$$,
  'health_context: other user family profile rejected'
);
select harness.expect_error(
  $$insert into public.health_context (owner_id) values ('22222222-2222-2222-2222-222222222222')$$,
  'health_context: forged owner_id rejected'
);

-- medical_documents (storage consistency: path must start with owner id)
select harness.expect_ok(
  $$insert into public.medical_documents (id, owner_id, family_profile_id, file_name, mime_type, file_size, storage_path)
    values ('a0000001-0000-0000-0000-000000000001', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'r.pdf', 'application/pdf', 100, '11111111-1111-1111-1111-111111111111/doc1/r.pdf')$$,
  'medical_documents: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.medical_documents (owner_id, family_profile_id, file_name, mime_type, file_size, storage_path)
    values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'r.pdf', 'application/pdf', 100, '11111111-1111-1111-1111-111111111111/doc2/r.pdf')$$,
  'medical_documents: other user family profile rejected'
);

-- medical_reports
select harness.expect_ok(
  $$insert into public.medical_reports (owner_id, family_profile_id, report_title) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'A report')$$,
  'medical_reports: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.medical_reports (owner_id, family_profile_id, report_title) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'x')$$,
  'medical_reports: other user family profile rejected'
);

-- medicines
select harness.expect_ok(
  $$insert into public.medicines (owner_id, family_profile_id, name) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'Med A')$$,
  'medicines: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.medicines (owner_id, family_profile_id, name) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'x')$$,
  'medicines: other user family profile rejected'
);

-- appointments
select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, family_profile_id, doctor_name, scheduled_date, scheduled_time)
    values ('a0000002-0000-0000-0000-000000000002', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'Dr A', '2026-09-01', '10:00')$$,
  'appointments: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.appointments (owner_id, family_profile_id, doctor_name, scheduled_date, scheduled_time)
    values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'x', '2026-09-02', '11:00')$$,
  'appointments: other user family profile rejected'
);

-- recovery_checkins
select harness.expect_ok(
  $$insert into public.recovery_checkins (owner_id, family_profile_id, trend) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'better')$$,
  'recovery_checkins: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.recovery_checkins (owner_id, family_profile_id, trend) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'same')$$,
  'recovery_checkins: other user family profile rejected'
);

-- vaccination_records
select harness.expect_ok(
  $$insert into public.vaccination_records (owner_id, family_profile_id, vaccine_name) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'Flu')$$,
  'vaccination_records: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.vaccination_records (owner_id, family_profile_id, vaccine_name) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'x')$$,
  'vaccination_records: other user family profile rejected'
);

-- conversations
select harness.expect_ok(
  $$insert into public.conversations (id, owner_id, family_profile_id) values ('a0000003-0000-0000-0000-000000000003', auth.uid(), 'a1111111-1111-1111-1111-111111111111')$$,
  'conversations: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.conversations (owner_id, family_profile_id) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222')$$,
  'conversations: other user family profile rejected'
);

-- saved_* bookmarks
select harness.expect_ok(
  $$insert into public.saved_hospitals (owner_id, family_profile_id, hospital_id, detail_slug) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'h1', 'h1')$$,
  'saved_hospitals: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.saved_hospitals (owner_id, family_profile_id, hospital_id, detail_slug) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'h1', 'h1')$$,
  'saved_hospitals: other user family profile rejected'
);
select harness.expect_error(
  $$insert into public.saved_doctors (owner_id, family_profile_id, doctor_id, detail_slug) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'd1', 'd1')$$,
  'saved_doctors: other user family profile rejected'
);
select harness.expect_error(
  $$insert into public.saved_pharmacies (owner_id, family_profile_id, pharmacy_id) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'p1')$$,
  'saved_pharmacies: other user family profile rejected'
);
select harness.expect_error(
  $$insert into public.saved_labs (owner_id, family_profile_id, lab_id) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'l1')$$,
  'saved_labs: other user family profile rejected'
);

-- emergency_events
select harness.expect_ok(
  $$insert into public.emergency_events (owner_id, family_profile_id, severity) values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'high')$$,
  'emergency_events: own profile insert allowed'
);
select harness.expect_error(
  $$insert into public.emergency_events (owner_id, family_profile_id, severity) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'high')$$,
  'emergency_events: other user family profile rejected'
);

reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- User B mirror: cannot see or touch A's rows at all
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok((select count(*) = 0 from public.health_context where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A health_context');
select harness.ok((select count(*) = 0 from public.medical_documents where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A medical_documents');
select harness.ok((select count(*) = 0 from public.medical_reports where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A medical_reports');
select harness.ok((select count(*) = 0 from public.medicines where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A medicines');
select harness.ok((select count(*) = 0 from public.appointments where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A appointments');
select harness.ok((select count(*) = 0 from public.conversations where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A conversations');
select harness.ok((select count(*) = 0 from public.emergency_events where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A emergency_events');
select harness.ok((select count(*) = 0 from public.family_profiles where owner_id = '11111111-1111-1111-1111-111111111111'), 'cross: B cannot see A family_profiles');

-- B attempts to update/delete A's rows: silently affects 0 rows.
update public.health_context set notes = 'hijack' where owner_id = '11111111-1111-1111-1111-111111111111';
delete from public.appointments where owner_id = '11111111-1111-1111-1111-111111111111';

reset role;
reset request.jwt.claims;

-- Service view: A's rows untouched by B's attempts.
select harness.ok(
  (select count(*) = 1 from public.health_context where owner_id = '11111111-1111-1111-1111-111111111111' and notes is null),
  'cross: A health_context unchanged after B update attempt'
);
select harness.ok(
  (select count(*) = 1 from public.appointments where owner_id = '11111111-1111-1111-1111-111111111111'),
  'cross: A appointment unchanged after B delete attempt'
);

-- ---------------------------------------------------------------------------
-- Anonymous: privileged helpers revoked (permission denied, not silent)
-- ---------------------------------------------------------------------------
set role anon;
select harness.expect_error(
  $$select public.carelink_can_access_document('a0000001-0000-0000-0000-000000000001')$$,
  'helpers: anon cannot execute carelink_can_access_document'
);
select harness.expect_error(
  $$select public.carelink_is_family_profile_owner('a1111111-1111-1111-1111-111111111111')$$,
  'helpers: anon cannot execute carelink_is_family_profile_owner'
);
select harness.expect_error(
  $$select public.carelink_record_audit('x')$$,
  'helpers: anon cannot execute carelink_record_audit'
);
reset role;

-- Authenticated non-owner: helper returns false (not an error) for others' objects
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok(
  not public.carelink_can_access_document('a0000001-0000-0000-0000-000000000001'),
  'helpers: B gets false for A document'
);
select harness.ok(
  not public.carelink_can_access_appointment('a0000002-0000-0000-0000-000000000002'),
  'helpers: B gets false for A appointment'
);
select harness.ok(
  not public.carelink_can_access_conversation('a0000003-0000-0000-0000-000000000003'),
  'helpers: B gets false for A conversation'
);
reset role;
reset request.jwt.claims;
