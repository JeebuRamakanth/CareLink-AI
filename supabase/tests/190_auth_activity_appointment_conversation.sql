-- ===========================================================================
-- 190 — Auth activity event names + appointment bridge + conversation persistence.
--
-- Covers the Step 15+ wiring that the domain pages rely on:
--   1. Security activity accepts `logout` (and the old `logout_success` is NOT
--      a user-visible event) plus admin/super-admin login + denied events.
--   2. Appointment persistence: created appointments return a DB row id usable
--      by the UI (dbId bridge = the same id is used by reschedule/cancel).
--   3. Appointment status changes write an audit row + status history.
--   4. Conversations + messages persist with owner-scoped RLS; a user cannot
--      read or write another user's conversation rows.
--   5. Conversation owner isolation (IDOR) holds at the DB layer.
-- ===========================================================================

-- Carve out dedicated UUIDs so this suite never collides with 180 fixtures.
insert into auth.users (id, email) values
  ('44444444-4444-4444-4444-444444444444', 'user-d@test.local'),
  ('55555555-5555-5555-5555-555555555555', 'user-e@test.local')
on conflict (id) do nothing;

insert into public.profiles (id, display_name, account_status) values
  ('44444444-4444-4444-4444-444444444444', 'User D', 'active'),
  ('55555555-5555-5555-5555-555555555555', 'User E', 'active')
on conflict (id) do nothing;

insert into public.user_roles (user_id, role_id) values
  ('44444444-4444-4444-4444-444444444444', 'super_admin')
on conflict (user_id, role_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Activity events (ids match the UI calls: login/admin/denied/logout)
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

select harness.expect_ok(
  $$select public.carelink_record_login_activity('login_success', '{"method":"password"}'::jsonb)$$,
  'activity: E records login_success'
);

select harness.expect_ok(
  $$select public.carelink_record_login_activity('logout')$$,
  'activity: E records logout (UI uses the DB-approved name)'
);

-- The legacy frontend name must be rejected by the DB check constraint (the UI
-- was previously sending logout_success — this asserts the repair holds).
select harness.expect_error(
  $$select public.carelink_record_login_activity('logout_success')$$,
  'activity: logout_success is not a valid event (rejected by constraint)'
);

select harness.expect_ok(
  $$select public.carelink_record_login_activity('password_reset_request')$$,
  'activity: E records password_reset_request'
);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';

-- Super admin login event (role-derived event used by the frontend).
select harness.expect_ok(
  $$select public.carelink_record_login_activity('super_admin_login', '{"roles":"super_admin"}'::jsonb)$$,
  'activity: D records super_admin_login'
);

-- Admin access denial (UI fire-and-forget on the AdminRoute guard).
select harness.expect_ok(
  $$select public.carelink_record_login_activity('admin_access_denied', '{"path":"/admin/users"}'::jsonb)$$,
  'activity: D records admin_access_denied'
);

-- ---------------------------------------------------------------------------
-- 2. Appointment persistence bridge (dbId = created row id)
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

-- Insert a real appointment row exactly as the repository does; the returned
-- id is what the UI stores as `dbId` for later reschedule/cancel.

select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, doctor_id, doctor_name, hospital_id, hospital_name, appointment_type, scheduled_date, scheduled_time, status)
    values ('7a100001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'doc-100', 'Dr. Relay', 'hosp-100', 'Relay Hospital', 'Consultation', '2026-10-01', '09:30', 'confirmed')$$,
  'appointments: E creates an appointment (dbId returned to the UI)'
);

-- The UI reads it back by that id (self read via RLS).
select harness.ok(
  (select count(*) = 1 from public.appointments where id = '7a100001-0000-0000-0000-000000000001' and owner_id = auth.uid()),
  'appointments: E reads own appointment by dbId'
);

-- Status change emits status_history + audit (the app reuses the same row id).
select harness.expect_ok(
  $$update public.appointments set status = 'cancelled' where id = '7a100001-0000-0000-0000-000000000001'$$,
  'appointments: E cancels own appointment (status transition)'
);

select harness.ok(
  (select count(*) >= 1 from public.appointment_status_history where appointment_id = '7a100001-0000-0000-0000-000000000001'),
  'appointments: status change wrote appointment_status_history'
);

select harness.ok(
  (select count(*) >= 1 from public.audit_events where target_table = 'appointments' and target_id = '7a100001-0000-0000-0000-000000000001'),
  'appointments: status change wrote an audit event'
);

-- A different user (D) cannot read E's appointment (IDOR denied by RLS).
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';

select harness.ok(
  (select count(*) = 0 from public.appointments where id = '7a100001-0000-0000-0000-000000000001'),
  'appointments: D cannot read E appointment (IDOR denied)'
);

-- D cannot mutate E's appointment either (RLS yields UPDATE 0 — the row is
-- invisible to a non-owner, so the mutation silently affects nothing).
select harness.expect_ok(
  $$update public.appointments set status = 'completed' where id = '7a100001-0000-0000-0000-000000000001'$$,
  'appointments: D update of E appointment succeeds-as-no-op (RLS filtered)'
);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.ok(
  (select status = 'cancelled' from public.appointments where id = '7a100001-0000-0000-0000-000000000001'),
  'appointments: D update did not actually change E row (owner-only RLS)'
);

-- ---------------------------------------------------------------------------
-- 3. Conversation persistence (owner-scoped)
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

select harness.expect_ok(
  $$insert into public.conversations (id, owner_id, title, language, intent)
    values ('7a200001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'Diabetes follow-up', 'en', 'disease')$$,
  'conversations: E creates a conversation'
);

select harness.expect_ok(
  $$insert into public.conversation_messages (id, conversation_id, owner_id, role, content)
    values ('7a210001-0000-0000-0000-000000000001', '7a200001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'user', 'What are the symptoms?')$$,
  'conversations: E adds a user message'
);

select harness.expect_ok(
  $$insert into public.conversation_messages (id, conversation_id, owner_id, role, content, response)
    values ('7a210002-0000-0000-0000-000000000002', '7a200001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'assistant', 'Guidance only', '{"kind":"disease"}'::jsonb)$$,
  'conversations: E adds an assistant message'
);

select harness.ok(
  (select count(*) = 2 from public.conversation_messages where conversation_id = '7a200001-0000-0000-0000-000000000001'),
  'conversations: E reads own messages'
);

-- Cross-user conversation IDOR: D cannot read E's conversation/messages.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';

select harness.ok(
  (select count(*) = 0 from public.conversations where id = '7a200001-0000-0000-0000-000000000001'),
  'conversations: D cannot read E conversation (IDOR denied)'
);

select harness.ok(
  (select count(*) = 0 from public.conversation_messages where conversation_id = '7a200001-0000-0000-0000-000000000001'),
  'conversations: D cannot read E messages (IDOR denied)'
);

select harness.expect_error(
  $$insert into public.conversation_messages (id, conversation_id, owner_id, role, content)
    values ('7a210003-0000-0000-0000-000000000003', '7a200001-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'user', 'forged')$$,
  'conversations: D cannot write into E conversation (RLS blocks)'
);

reset role;

-- ---------------------------------------------------------------------------
-- 4. Family-profile ownership on appointments (booking modal family isolation)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

-- E owns a family profile; E can book an appointment for it.
select harness.expect_ok(
  $$insert into public.family_profiles (id, owner_id, relation, label)
    values ('7a300001-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555555', 'child', 'My daughter')$$,
  'family: E creates a family profile'
);

select harness.expect_ok(
  $$insert into public.appointments (id, owner_id, family_profile_id, doctor_id, scheduled_date, scheduled_time, status)
    values ('7a100002-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', '7a300001-0000-0000-0000-000000000001', 'doc-101', '2026-10-02', '11:00', 'confirmed')$$,
  'family: E books an appointment for own family profile'
);

-- E cannot attach another user's family profile to their appointment.
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"44444444-4444-4444-4444-444444444444"}';
select harness.expect_ok(
  $$insert into public.family_profiles (id, owner_id, relation, label)
    values ('7a300002-0000-0000-0000-000000000002', '44444444-4444-4444-4444-444444444444', 'self', 'Self')$$,
  'family: D creates a family profile'
);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_error(
  $$insert into public.appointments (id, owner_id, family_profile_id, doctor_id, scheduled_date, scheduled_time, status)
    values ('7a100003-0000-0000-0000-000000000003', '55555555-5555-5555-5555-555555555555', '7a300002-0000-0000-0000-000000000002', 'doc-102', '2026-10-03', '12:00', 'confirmed')$$,
  'family: E cannot attach D family profile to own appointment (ownership trigger)'
);

reset role;