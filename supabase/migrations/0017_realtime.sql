-- ===========================================================================
-- CareLink-AI — Step 10.5 §16: Realtime configuration (additive).
--
-- Only the tables backing required LIVE workflows are published:
--   - appointments              (appointment status updates)
--   - emergency_events          (SOS lifecycle)
--   - hospital_emergency_notifications (facility accept/reject)
--   - ambulance_requests        (ambulance state)
--   - ambulance_status          (ambulance progress)
--   - notifications             (user notification delivery)
--
-- No other health table is published — no medical documents, health context,
-- conversations, donor tables, or audit tables. Every published table is
-- owner/member-scoped by RLS; with Supabase Realtime Authorization enabled,
-- row visibility is enforced per-subscriber (user-scoped channels only).
--
-- Idempotent: publication membership is checked before each ADD TABLE.
-- ===========================================================================

do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'appointments','emergency_events','hospital_emergency_notifications',
    'ambulance_requests','ambulance_status','notifications'
  ]
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
