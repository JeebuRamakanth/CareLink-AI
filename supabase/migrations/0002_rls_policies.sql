-- ===========================================================================
-- CareLink-AI — Row Level Security policies (Step 10)
--
-- SECURITY PRINCIPLE: minimum necessary access.
--   - An authenticated user may access ONLY rows they own (owner_id = auth.uid()).
--   - Family-member rows are reachable only because owner_id is the same user.
--   - NO broad "authenticated users can read everything" policy anywhere.
--   - Anonymous users can never touch private health data.
--   - Insert requires owner_id to equal the authenticated user (client cannot
--     forge another user's id).
--   - Service/admin access is never granted via these policies; admin work must
--     use the service_role key server-side, never the anon key.
-- ===========================================================================

-- Enable RLS on every patient-owned table (no-op if already enabled).
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','family_profiles','health_context','medical_documents',
    'medical_reports','medicines','appointments','appointment_events',
    'recovery_checkins','vaccination_records','conversations',
    'conversation_messages','saved_hospitals','saved_doctors',
    'saved_pharmacies','saved_labs','emergency_events','audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- Helper: a table's own owner_id = auth.uid()
-- (profiles uses id = auth.uid() since it is keyed by auth.users id).

-- ---------------------------------------------------------------------------
-- profiles: a user can manage only their own profile row.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_self_select on public.profiles;
create policy profiles_self_select on public.profiles
  for select using (id = auth.uid());

drop policy if exists profiles_self_insert on public.profiles;
create policy profiles_self_insert on public.profiles
  for insert with check (id = auth.uid());

drop policy if exists profiles_self_update on public.profiles;
create policy profiles_self_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_self_delete on public.profiles;
create policy profiles_self_delete on public.profiles
  for delete using (id = auth.uid());

-- ---------------------------------------------------------------------------
-- Generic owner-scoped policies for all patient-owned tables.
-- Each table gets: select/update/delete where owner_id = auth.uid(),
-- and insert with check owner_id = auth.uid().
-- (No policy allows cross-user reads.)
-- ---------------------------------------------------------------------------

create or replace function carelink_apply_owner_rls(table_name text)
returns void
language plpgsql
as $$
begin
  execute format(
    'drop policy if exists %1$s_owner_select on public.%1$I;
     create policy %1$s_owner_select on public.%1$I
       for select using (owner_id = auth.uid());

     drop policy if exists %1$s_owner_insert on public.%1$I;
     create policy %1$s_owner_insert on public.%1$I
       for insert with check (owner_id = auth.uid());

     drop policy if exists %1$s_owner_update on public.%1$I;
     create policy %1$s_owner_update on public.%1$I
       for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

     drop policy if exists %1$s_owner_delete on public.%1$I;
     create policy %1$s_owner_delete on public.%1$I
       for delete using (owner_id = auth.uid());',
    table_name
  );
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'family_profiles','health_context','medical_documents',
    'medical_reports','medicines','appointments','appointment_events',
    'recovery_checkins','vaccination_records','conversations',
    'conversation_messages','saved_hospitals','saved_doctors',
    'saved_pharmacies','saved_labs','emergency_events'
  ]
  loop
    perform carelink_apply_owner_rls(t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- audit_events: an actor can read their own audit rows. Inserts are reserved
-- for server-side (service_role) so a client cannot forge audit rows here via
-- anon. A read-only self-select policy is the only client policy.
-- ---------------------------------------------------------------------------
drop policy if exists audit_events_self_select on public.audit_events;
create policy audit_events_self_select on public.audit_events
  for select using (actor_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Storage object policies: medical_documents bucket is private.
-- A user can read/create/update/delete only objects whose path starts with
-- their user id (path convention: <owner_id>/<...>).
-- ---------------------------------------------------------------------------

drop policy if exists medical_documents_read on storage.objects;
create policy medical_documents_read on storage.objects
  for select
  using (
    bucket_id = 'medical_documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists medical_documents_insert on storage.objects;
create policy medical_documents_insert on storage.objects
  for insert
  with check (
    bucket_id = 'medical_documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists medical_documents_update on storage.objects;
create policy medical_documents_update on storage.objects
  for update
  using (
    bucket_id = 'medical_documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'medical_documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists medical_documents_delete on storage.objects;
create policy medical_documents_delete on storage.objects
  for delete
  using (
    bucket_id = 'medical_documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
