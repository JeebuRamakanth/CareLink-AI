-- ===========================================================================
-- 110 — Health timeline + notifications.
-- ===========================================================================

-- Seed a template (service path)
insert into public.notification_templates (code, kind, title_template, body_template)
values ('appt-reminder', 'appointment', 'Appointment reminder', 'You have an appointment soon');

-- Template: public read, non-admin write rejected
set role anon;
select harness.ok((select count(*) >= 1 from public.notification_templates), 'notify: anon reads templates');
reset role;

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$insert into public.notification_templates (code, kind, title_template, body_template) values ('x', 'sos', 'x', 'x')$$,
  'notify: non-super-admin cannot create templates'
);

-- ---------------------------------------------------------------------------
-- Timeline: valid own references accepted
-- ---------------------------------------------------------------------------
select harness.expect_ok(
  $$insert into public.health_timeline_events (id, owner_id, family_profile_id, event_type, appointment_id, title)
    values ('a0000013-0000-0000-0000-000000000013', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'appointment', 'a0000002-0000-0000-0000-000000000002', 'Consultation')$$,
  'timeline: A links own appointment'
);
select harness.expect_ok(
  $$insert into public.health_timeline_events (owner_id, event_type, medical_document_id, medical_report_id, title)
    values (auth.uid(), 'report', 'a0000001-0000-0000-0000-000000000001', null, 'Lab report uploaded')$$,
  'timeline: A links own document'
);
-- cross-user reference rejected
select harness.expect_error(
  $$insert into public.health_timeline_events (owner_id, event_type, medical_document_id, title)
    values (auth.uid(), 'report', 'b0000001-0000-0000-0000-000000000001', 'forged')$$,
  'timeline: A cannot link B document'
);
select harness.expect_error(
  $$insert into public.health_timeline_events (owner_id, event_type, appointment_id, title)
    values (auth.uid(), 'appointment', 'b0000002-0000-0000-0000-000000000002', 'forged')$$,
  'timeline: A cannot link B appointment'
);
select harness.expect_ok(
  $$insert into public.health_timeline_events (owner_id, event_type, medication_schedule_id, title)
    values (auth.uid(), 'medication', 'a0000009-0000-0000-0000-000000000009', 'Started Metformin')$$,
  'timeline: A links own medication schedule'
);
select harness.expect_error(
  $$insert into public.health_timeline_events (owner_id, event_type, title) values (auth.uid(), 'arbitrary_object', 'x')$$,
  'timeline: invalid event_type rejected'
);

-- ---------------------------------------------------------------------------
-- Notifications: recipient-scoped
-- ---------------------------------------------------------------------------
select harness.expect_ok(
  $$insert into public.notifications (id, owner_id, template_code, kind, title, scheduled_for)
    values ('a0000014-0000-0000-0000-000000000014', auth.uid(), 'appt-reminder', 'appointment', 'Reminder', '2026-08-31 08:00+00')$$,
  'notify: A creates own notification'
);
select harness.expect_error(
  $$insert into public.notifications (owner_id, kind, title) values ('22222222-2222-2222-2222-222222222222', 'sos', 'forged')$$,
  'notify: A cannot create notification for B'
);
select harness.expect_ok(
  $$insert into public.notification_delivery_events (owner_id, notification_id, event)
    values (auth.uid(), 'a0000014-0000-0000-0000-000000000014', 'queued')$$,
  'notify: A records delivery event'
);
reset role;
reset request.jwt.claims;

-- B isolation
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok((select count(*) = 0 from public.health_timeline_events where owner_id = '11111111-1111-1111-1111-111111111111'), 'timeline: B cannot see A events');
select harness.ok((select count(*) = 0 from public.notifications where owner_id = '11111111-1111-1111-1111-111111111111'), 'notify: B cannot see A notifications');
select harness.ok((select count(*) = 0 from public.notification_delivery_events where owner_id = '11111111-1111-1111-1111-111111111111'), 'notify: B cannot see A delivery events');
select harness.expect_error(
  $$insert into public.notification_delivery_events (owner_id, notification_id, event) values (auth.uid(), 'a0000014-0000-0000-0000-000000000014', 'sent')$$,
  'notify: B cannot record delivery event on A notification'
);
reset role;
reset request.jwt.claims;

-- payload size cap (minimal data rule)
select harness.expect_error(
  $$insert into public.notifications (owner_id, kind, title, payload) values ('11111111-1111-1111-1111-111111111111', 'sos', 'x', jsonb_build_object('pad', repeat('x', 3000)))$$,
  'notify: oversized notification payload rejected by CHECK'
);
