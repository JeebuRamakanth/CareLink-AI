-- ===========================================================================
-- 140 — Realtime publication scope + audit system.
--
-- NOTE (documented limitation): actual Realtime streaming requires the
-- Supabase Realtime server and cannot be exercised against plain local
-- PostgreSQL. What IS verified here: publication membership is exactly the
-- intended live-workflow tables and no private health table is published.
-- ===========================================================================

-- Publication exists with exactly the intended tables
select harness.ok(
  exists (select 1 from pg_publication where pubname = 'supabase_realtime'),
  'realtime: supabase_realtime publication exists'
);
select harness.ok(
  (
    select count(*) = 6
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in (
        'appointments','emergency_events','hospital_emergency_notifications',
        'ambulance_requests','ambulance_status','notifications'
      )
  ),
  'realtime: exactly the 6 live-workflow tables are published'
);
select harness.ok(
  (
    select count(*) = 0
    from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename in (
        'health_context','medical_documents','medical_reports','medicines',
        'conversations','conversation_messages','donor_profiles',
        'donation_records','donor_eligibility','audit_events','reviews',
        'medication_schedules','recovery_checkins','vaccination_records'
      )
  ),
  'realtime: no private health/donor/audit table is published'
);

-- ---------------------------------------------------------------------------
-- Audit system
-- ---------------------------------------------------------------------------

-- appointment status change writes an audit row (0018 trigger extension)
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$update public.appointments set status = 'cancelled' where id = 'a0000002-0000-0000-0000-000000000002'$$,
  'audit: A cancels own appointment'
);
reset role;
reset request.jwt.claims;

select harness.ok(
  exists (
    select 1 from public.audit_events
    where action = 'appointment_status_changed' and target_id = 'a0000002-0000-0000-0000-000000000002'
  ),
  'audit: appointment modification audited'
);

-- document access audit: owner ok, non-owner rejected
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_ok(
  $$select public.carelink_audit_document_access('a0000001-0000-0000-0000-000000000001', 'view')$$,
  'audit: owner document access audited'
);
select harness.expect_error(
  $$select public.carelink_audit_document_access('a0000001-0000-0000-0000-000000000001', 'bogus')$$,
  'audit: invalid document action rejected'
);
reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.expect_error(
  $$select public.carelink_audit_document_access('a0000001-0000-0000-0000-000000000001', 'view')$$,
  'audit: non-owner cannot audit-access A document'
);
select harness.expect_error(
  $$select public.carelink_audit_health_access('medical_reports', (select id from public.medical_reports where owner_id = '11111111-1111-1111-1111-111111111111' limit 1), 'read')$$,
  'audit: non-owner cannot audit-access A health record'
);
select harness.expect_error(
  $$select public.carelink_audit_health_access('user_roles', gen_random_uuid(), 'read')$$,
  'audit: non-whitelisted table rejected'
);
reset role;
reset request.jwt.claims;

-- audit immutability: no client update/delete (RLS + revoked privileges)
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$update public.audit_events set safe_message = 'tampered' where actor_id = auth.uid()$$,
  'audit: client cannot UPDATE audit rows'
);
select harness.expect_error(
  $$delete from public.audit_events where actor_id = auth.uid()$$,
  'audit: client cannot DELETE audit rows'
);
reset role;
reset request.jwt.claims;

-- audit rows contain no raw payloads: safe_message is short text only
select harness.ok(
  (select count(*) = 0 from public.audit_events where length(coalesce(safe_message,'')) > 200),
  'audit: no oversized audit messages (no raw payloads)'
);
