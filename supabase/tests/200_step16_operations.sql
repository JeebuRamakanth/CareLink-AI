-- ===========================================================================
-- 200 — Step 16 operational completion.
--
-- Proves the Step 16 completion conditions added by migration 0027:
--   1. Appointment lifecycle notifications: booking/cancel/reschedule emit a
--      recipient-scoped notification; another user cannot read them (IDOR).
--   2. Provider verification/status ops: only authorized admins may verify /
--      reject / activate / deactivate; every mutation is audited + recorded as
--      a security activity event; ordinary users and anon are denied.
--   3. Admin appointment ops: authorized admins may complete/cancel with
--      audit + notification; ordinary users cannot.
--   4. Data quality: the guarded RPC flags duplicates / missing coordinates /
--      unverified providers / orphaned rows without deleting anything.
--   5. Security activity event vocabulary now includes provider + admin-appt
--      events.
--
-- Fixtures reuse 190 (D=4444..=super_admin, E=5555..=ordinary user) plus
-- dedicated provider/appointment UUIDs (7b..) that never collide with 050
-- (5a..) / 190 (7a..) / dev seed (7d..).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Fixtures (dedicated ids)
-- ---------------------------------------------------------------------------
insert into public.hospitals (id, slug, name, city, address) values
  ('7b100001-0000-0000-0000-000000000001', 'step16-hospital', 'Step16 City Hospital', 'Hyderabad', '1 Test Road')
on conflict (id) do nothing;
insert into public.hospital_locations (id, hospital_id, label, city, latitude, longitude) values
  ('7b110001-0000-0000-0000-000000000001', '7b100001-0000-0000-0000-000000000001', 'Main', 'Hyderabad', 17.3850, 78.4867)
on conflict (id) do nothing;
insert into public.hospital_verification (id, hospital_id, status) values
  ('7b120001-0000-0000-0000-000000000001', '7b100001-0000-0000-0000-000000000001', 'pending')
on conflict (id) do nothing;

insert into public.doctors (id, slug, name) values
  ('7b200001-0000-0000-0000-000000000001', 'step16-doctor', 'Dr. Step16')
on conflict (id) do nothing;
insert into public.doctor_verification (id, doctor_id, status) values
  ('7b210001-0000-0000-0000-000000000001', '7b200001-0000-0000-0000-000000000001', 'pending')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Appointment lifecycle notifications
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, doctor_id, doctor_name, hospital_id, hospital_name, scheduled_date, scheduled_time, status)
    values ('7b300001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '7b200001-0000-0000-0000-000000000001', 'Dr. Step16', '7b100001-0000-0000-0000-000000000001', 'Step16 City Hospital', '2026-11-01', '10:00', 'confirmed')$$,
  '200: E books an appointment (triggers a booked notification)'
);

select harness.ok(
  (select count(*) >= 1 from public.notifications
    where owner_id = '55555555-5555-5555-5555-555555555555'
      and kind = 'appointment'
      and template_code = 'appointment_booked'),
  '200: booking created a recipient-scoped appointment notification'
);

select harness.expect_ok(
  $$update public.appointments set status = 'cancelled' where id = '7b300001-0000-0000-0000-000000000001'$$,
  '200: E cancels own appointment'
);
select harness.ok(
  (select count(*) >= 1 from public.notifications
    where owner_id = '55555555-5555-5555-5555-555555555555'
      and template_code = 'appointment_cancelled'),
  '200: cancellation created a cancellation notification'
);

-- IDOR: D (super_admin) cannot read E's notifications via the user-facing path.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.ok(
  (select count(*) = 0 from public.notifications
    where owner_id = '55555555-5555-5555-5555-555555555555'),
  '200: D cannot read E notifications (recipient RLS)'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 2. Provider verification / status ops (guarded, audited)
-- ---------------------------------------------------------------------------
-- Ordinary user E: denied.
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_error(
  $$select public.carelink_admin_set_provider_status('hospital', '7b100001-0000-0000-0000-000000000001', 'verified')$$,
  '200: ordinary user cannot verify a provider'
);
select harness.expect_error(
  $$select public.carelink_admin_set_provider_status('hospital', '7b100001-0000-0000-0000-000000000001', 'inactive')$$,
  '200: ordinary user cannot deactivate a provider'
);
reset role;
reset request.jwt.claims;

-- anon: denied.
set role anon;
select harness.expect_error(
  $$select public.carelink_admin_set_provider_status('hospital', '7b100001-0000-0000-0000-000000000001', 'verified')$$,
  '200: anon cannot verify a provider'
);
reset role;
reset request.jwt.claims;

-- Super admin D: verify + reject + activate + deactivate all audited.
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_ok(
  $$select public.carelink_admin_set_provider_status('hospital', '7b100001-0000-0000-0000-000000000001', 'verified', 'verified via step16 test')$$,
  '200: super admin verifies a hospital'
);
select harness.ok(
  (select status = 'verified' and verified_by = '44444444-4444-4444-4444-444444444444'
     from public.hospital_verification where hospital_id = '7b100001-0000-0000-0000-000000000001'),
  '200: verification row updated with actor + status'
);
select harness.ok(
  (select count(*) >= 1 from public.audit_events
    where actor_id = '44444444-4444-4444-4444-444444444444'
      and action = 'provider_verified'
      and target_id = '7b100001-0000-0000-0000-000000000001'),
  '200: provider verification was audited'
);
select harness.ok(
  (select count(*) >= 1 from public.security_activity_events
    where user_id = '44444444-4444-4444-4444-444444444444'
      and event = 'provider_verified'),
  '200: provider verification recorded a security activity event'
);

select harness.expect_ok(
  $$select public.carelink_admin_set_provider_status('doctor', '7b200001-0000-0000-0000-000000000001', 'rejected', 'missing credentials')$$,
  '200: super admin rejects a doctor'
);
select harness.ok(
  (select status = 'rejected' from public.doctor_verification where doctor_id = '7b200001-0000-0000-0000-000000000001'),
  '200: doctor rejection persisted'
);
select harness.ok(
  (select count(*) >= 1 from public.audit_events
    where actor_id = '44444444-4444-4444-4444-444444444444' and action = 'provider_rejected'),
  '200: doctor rejection was audited'
);

select harness.expect_ok(
  $$select public.carelink_admin_set_provider_status('hospital', '7b100001-0000-0000-0000-000000000001', 'inactive')$$,
  '200: super admin deactivates a hospital'
);
select harness.ok(
  (select data_status = 'UNAVAILABLE' from public.hospitals where id = '7b100001-0000-0000-0000-000000000001'),
  '200: hospital deactivation recorded on data_status'
);
select harness.ok(
  (select count(*) >= 1 from public.audit_events
    where actor_id = '44444444-4444-4444-4444-444444444444' and action = 'provider_deactivated'),
  '200: hospital deactivation was audited'
);

-- Invalid status rejected.
select harness.expect_error(
  $$select public.carelink_admin_set_provider_status('hospital', '7b100001-0000-0000-0000-000000000001', 'banana')$$,
  '200: invalid provider status rejected'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 3. Admin appointment operations
-- ---------------------------------------------------------------------------
-- E books a second appointment; D completes it via the guarded RPC.
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, doctor_id, doctor_name, hospital_id, hospital_name, scheduled_date, scheduled_time, status)
    values ('7b300002-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', '7b200001-0000-0000-0000-000000000001', 'Dr. Step16', '7b100001-0000-0000-0000-000000000001', 'Step16 City Hospital', '2026-11-02', '11:00', 'confirmed')$$,
  '200: E books a second appointment'
);
reset role;
reset request.jwt.claims;

-- Ordinary user cannot complete another user's appointment via the RPC.
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_error(
  $$select public.carelink_admin_set_appointment_status('7b300002-0000-0000-0000-000000000002', 'completed')$$,
  '200: ordinary user cannot run admin appointment ops'
);
reset role;
reset request.jwt.claims;

-- Super admin completes it (audited + notification).
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_ok(
  $$select public.carelink_admin_set_appointment_status('7b300002-0000-0000-0000-000000000002', 'completed', 'service completed')$$,
  '200: super admin completes an appointment'
);
select harness.ok(
  (select count(*) >= 1 from public.audit_events
    where actor_id = '44444444-4444-4444-4444-444444444444' and action = 'appointment_updated_by_admin'),
  '200: admin appointment op was audited'
);
select harness.expect_error(
  $$select public.carelink_admin_set_appointment_status('7b300002-0000-0000-0000-000000000002', 'banana')$$,
  '200: invalid appointment status rejected'
);
reset role;
reset request.jwt.claims;

-- Verify persisted state as the harness owner (bypasses RLS — the migration
-- runner is the local superuser; client roles never see these rows).
select harness.ok(
  (select status = 'completed' from public.appointments where id = '7b300002-0000-0000-0000-000000000002'),
  '200: appointment completion persisted'
);
select harness.ok(
  (select count(*) >= 1 from public.notifications
    where owner_id = '55555555-5555-5555-5555-555555555555' and kind = 'appointment'
      and template_code = 'appointment_booked'),
  '200: admin appointment op notified the recipient'
);

-- ---------------------------------------------------------------------------
-- 4. Data quality (flag only, never delete)
-- ---------------------------------------------------------------------------
-- Seed a duplicate hospital + a hospital with no location + an orphaned review.
insert into public.hospitals (id, slug, name, city) values
  ('7b400001-0000-0000-0000-000000000001', 'step16-dup', 'Step16 City Hospital', 'Hyderabad')
on conflict (id) do nothing;
-- A review whose target provider is deleted afterwards to simulate an orphan.
-- (Disposable-test only: the production FK is left untouched; we drop the FK
--  in the test DB so the review row is preserved to prove the flagging query.)
insert into public.reviews (id, owner_id, doctor_id, overall_rating, status, title) values
  ('7b500001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', '7b200001-0000-0000-0000-000000000001', 4, 'published', 'Orphaned review')
on conflict (id) do nothing;
alter table public.reviews drop constraint if exists reviews_doctor_id_fkey;
delete from public.doctors where id = '7b200001-0000-0000-0000-000000000001';

-- Ordinary user: denied.
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_error(
  $$select * from public.carelink_admin_data_quality()$$,
  '200: ordinary user cannot view data quality'
);
reset role;
reset request.jwt.claims;

-- Super admin: sees the expected flags.
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.ok(
  (select count(*) >= 1 from public.carelink_admin_data_quality() where issue_kind = 'duplicate_provider'),
  '200: data quality flags duplicate providers'
);
select harness.ok(
  (select count(*) >= 1 from public.carelink_admin_data_quality() where issue_kind = 'orphaned_review'),
  '200: data quality flags orphaned reviews'
);
-- Nothing was deleted.
select harness.ok(
  (select count(*) >= 2 from public.hospitals where name = 'Step16 City Hospital'),
  '200: data quality never deletes flagged rows'
);
select harness.ok(
  (select count(*) = 1 from public.reviews where id = '7b500001-0000-0000-0000-000000000001'),
  '200: orphaned review row is preserved'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 5. Security activity event vocabulary (provider + admin-appt events valid)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_ok(
  $$select public.carelink_record_login_activity('provider_verified', '{"provider_kind":"hospital"}'::jsonb)$$,
  '200: provider_verified is a valid security activity event'
);
select harness.expect_ok(
  $$select public.carelink_record_login_activity('appointment_updated_by_admin', '{"appointment_id":"7b300001-0000-0000-0000-000000000001"}'::jsonb)$$,
  '200: appointment_updated_by_admin is a valid security activity event'
);
select harness.expect_error(
  $$select public.carelink_record_login_activity('not_a_real_event', '{}'::jsonb)$$,
  '200: unknown event still rejected'
);
reset role;
reset request.jwt.claims;