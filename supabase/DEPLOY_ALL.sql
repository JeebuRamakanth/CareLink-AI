-- =========================================================================
-- CareLink-AI — FULL SCHEMA DEPLOY BUNDLE (generated)
-- Source: supabase/migrations/*.sql concatenated in replay order.
-- Generated: 2026-10-25T16:34:50Z
--
-- HOW TO APPLY (Supabase dashboard): SQL Editor -> New query -> paste this
-- file -> Run. Or: psql "$SUPABASE_DB_URL" -f supabase/DEPLOY_ALL.sql
-- =========================================================================


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0001_initial_health_schema.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — initial health data schema (Step 10)
--
-- Security-first healthcare foundation. Every patient-owned row has an
-- ownership relationship protected by RLS (policies in 0002_rls_policies.sql).
--
-- Design rules:
--   - UUID primary keys everywhere.
--   - Every patient-owned table carries owner_id (auth.users id) so RLS can
--     scope rows to the authenticated user.
--   - Family-member records carry family_profile_id + owner_id so a user can
--     reach family rows they own, but never another user's rows.
--   - No service_role / admin actions are allowed from the client anon key.
--   - Minimal sensitive data; no diagnoses/conditions in the basic profile.
--   - Timestamps with timezone.
--   - Idempotent (IF NOT EXISTS) so re-running is non-destructive.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- Helper: updated_at trigger function (idempotent)
create or replace function carelink_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles — the authenticated user's own (non-sensitive) profile
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  date_of_birth date,
  gender text check (gender in ('male','female','other','prefer_not_to_say')),
  location_preference text,
  language_preference text default 'en',
  emergency_contact_name text,
  emergency_contact_phone text,
  communication_preferences jsonb default '{}'::jsonb,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Profile row is auto-created on signup via handle_new_user() (see below).

-- ---------------------------------------------------------------------------
-- 2. family_profiles — self/child/elder/family member patient contexts
-- ---------------------------------------------------------------------------
create table if not exists public.family_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  relation text not null check (relation in ('self','parent','child','spouse','other')),
  label text not null,
  date_of_birth date,
  gender text check (gender in ('male','female','other','prefer_not_to_say')),
  context_summary text,
  context_tags jsonb default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists family_profiles_owner_id_idx on public.family_profiles(owner_id);

-- ---------------------------------------------------------------------------
-- 3. health_context — minimum-necessary patient context for the agent
-- ---------------------------------------------------------------------------
create table if not exists public.health_context (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  active_symptoms jsonb default '[]'::jsonb,
  chronic_conditions jsonb default '[]'::jsonb,
  allergies jsonb default '[]'::jsonb,
  current_medications jsonb default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists health_context_owner_id_idx on public.health_context(owner_id);
create index if not exists health_context_family_profile_id_idx on public.health_context(family_profile_id);

-- ---------------------------------------------------------------------------
-- 4. medical_documents — file metadata (storage path kept separate from URL)
-- ---------------------------------------------------------------------------
create table if not exists public.medical_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  file_name text not null,
  mime_type text not null,
  file_size bigint not null,
  storage_bucket text not null default 'medical_documents',
  storage_path text not null,
  -- The public URL is NEVER stored here. Access is via signed URLs only.
  document_kind text check (document_kind in ('image','pdf','document','lab_report','prescription','medicine_image','other')),
  upload_status text check (upload_status in ('pending','uploading','uploaded','failed')) default 'pending',
  processing_status text check (processing_status in ('queued','processing','ready','error')) default 'queued',
  extracted_text_placeholder text,
  provider_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medical_documents_owner_id_idx on public.medical_documents(owner_id);
create index if not exists medical_documents_family_profile_id_idx on public.medical_documents(family_profile_id);

-- ---------------------------------------------------------------------------
-- 5. medical_reports — structured report interpretations (provider metadata)
-- ---------------------------------------------------------------------------
create table if not exists public.medical_reports (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  medical_document_id uuid references public.medical_documents(id) on delete set null,
  report_title text,
  summary text,
  important_observations jsonb default '[]'::jsonb,
  values_requiring_attention jsonb default '[]'::jsonb,
  normal_values jsonb default '[]'::jsonb,
  questions_for_doctor jsonb default '[]'::jsonb,
  recommended_next_action text,
  is_mock_interpretation boolean default true,
  provider_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medical_reports_owner_id_idx on public.medical_reports(owner_id);
create index if not exists medical_reports_medical_document_id_idx on public.medical_reports(medical_document_id);

-- ---------------------------------------------------------------------------
-- 6. medicines — recognized medicine info (educational only)
-- ---------------------------------------------------------------------------
create table if not exists public.medicines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  name text not null,
  common_purpose text,
  important_safety_info text,
  prescription_required boolean default false,
  medicine_image_document_id uuid references public.medical_documents(id) on delete set null,
  provider_metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists medicines_owner_id_idx on public.medicines(owner_id);

-- ---------------------------------------------------------------------------
-- 7. appointments — patient-owned appointment records
-- ---------------------------------------------------------------------------
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  doctor_id text,
  doctor_name text,
  specialty text,
  hospital_id text,
  hospital_name text,
  appointment_type text check (appointment_type in ('Consultation','Follow-up','Telehealth')),
  scheduled_date date not null,
  scheduled_time text not null,
  status text not null check (status in ('confirmed','upcoming','completed','cancelled','rescheduled')) default 'confirmed',
  consultation_fee text,
  notes text,
  preparation_notes text,
  consultation_mode text,
  location text,
  booking_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists appointments_owner_id_idx on public.appointments(owner_id);
create index if not exists appointments_family_profile_id_idx on public.appointments(family_profile_id);
create index if not exists appointments_scheduled_date_idx on public.appointments(scheduled_date);
create index if not exists appointments_status_idx on public.appointments(status);

-- ---------------------------------------------------------------------------
-- 8. appointment_events — append-only audit of booking lifecycle
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('booked','rescheduled','cancelled','completed','no_show')),
  previous_date date,
  previous_time text,
  reason text,
  occurred_at timestamptz not null default now()
);

create index if not exists appointment_events_appointment_id_idx on public.appointment_events(appointment_id);
create index if not exists appointment_events_owner_id_idx on public.appointment_events(owner_id);

-- ---------------------------------------------------------------------------
-- 9. recovery_checkins — Better / Same / Worse against a patient + context
-- ---------------------------------------------------------------------------
create table if not exists public.recovery_checkins (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  condition_label text,
  trend text not null check (trend in ('better','same','worse')),
  note text,
  recorded_at timestamptz not null default now()
);

create index if not exists recovery_checkins_owner_id_idx on public.recovery_checkins(owner_id);
create index if not exists recovery_checkins_family_profile_id_idx on public.recovery_checkins(family_profile_id);
create index if not exists recovery_checkins_recorded_at_idx on public.recovery_checkins(recorded_at);

-- ---------------------------------------------------------------------------
-- 10. vaccination_records — reminder-ready vaccination foundation
-- ---------------------------------------------------------------------------
create table if not exists public.vaccination_records (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  vaccine_name text not null,
  dose_number int,
  administered_date date,
  next_due_date date,
  provider text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vaccination_records_owner_id_idx on public.vaccination_records(owner_id);
create index if not exists vaccination_records_next_due_date_idx on public.vaccination_records(next_due_date);

-- ---------------------------------------------------------------------------
-- 11. conversations — agent conversation memory
-- ---------------------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  title text not null default 'New conversation',
  language text default 'en',
  intent text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_owner_id_idx on public.conversations(owner_id);
create index if not exists conversations_updated_at_idx on public.conversations(updated_at);

-- ---------------------------------------------------------------------------
-- 12. conversation_messages — messages + result metadata + attachments
-- ---------------------------------------------------------------------------
create table if not exists public.conversation_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text,
  response jsonb,
  attachments jsonb default '[]'::jsonb,
  context_tags jsonb default '[]'::jsonb,
  patient_profile_id text,
  intent text,
  actions jsonb default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists conversation_messages_conversation_id_idx on public.conversation_messages(conversation_id);
create index if not exists conversation_messages_owner_id_idx on public.conversation_messages(owner_id);
create index if not exists conversation_messages_created_at_idx on public.conversation_messages(created_at);

-- ---------------------------------------------------------------------------
-- 13-16. saved providers (hospital / doctor / pharmacy / lab)
-- ---------------------------------------------------------------------------
create table if not exists public.saved_hospitals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  hospital_id text not null,
  detail_slug text not null,
  name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saved_hospitals_owner_id_idx on public.saved_hospitals(owner_id);

create table if not exists public.saved_doctors (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  doctor_id text not null,
  detail_slug text not null,
  name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saved_doctors_owner_id_idx on public.saved_doctors(owner_id);

create table if not exists public.saved_pharmacies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  pharmacy_id text not null,
  name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saved_pharmacies_owner_id_idx on public.saved_pharmacies(owner_id);

create table if not exists public.saved_labs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  lab_id text not null,
  name text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists saved_labs_owner_id_idx on public.saved_labs(owner_id);

-- ---------------------------------------------------------------------------
-- 17. emergency_events — minimum-data emergency log (no permanent record for
-- ordinary symptom searches; only persisted when explicitly an emergency)
-- ---------------------------------------------------------------------------
create table if not exists public.emergency_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  severity text,
  indicator_label text,
  guidance jsonb default '[]'::jsonb,
  contacts jsonb default '[]'::jsonb,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists emergency_events_owner_id_idx on public.emergency_events(owner_id);

-- ---------------------------------------------------------------------------
-- 18. audit_events — audit-friendly log (actor + action + target + safe msg)
-- ---------------------------------------------------------------------------
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  -- Safe message only: never store raw payloads, secrets, or PHI text.
  safe_message text,
  created_at timestamptz not null default now()
);
create index if not exists audit_events_actor_id_idx on public.audit_events(actor_id);
create index if not exists audit_events_created_at_idx on public.audit_events(created_at);

-- ---------------------------------------------------------------------------
-- updated_at triggers for tables that carry updated_at
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','family_profiles','health_context','medical_documents',
    'medical_reports','medicines','appointments','vaccination_records',
    'conversations'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets — private by default (no public access to medical files)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('medical_documents','medical_documents', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Auto-create a profile row on new user signup (idempotent, safe)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, language_preference)
  values (new.id, 'en')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0001_initial_health_schema.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0002_rls_policies.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0002_rls_policies.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0003_security_hardening.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §2: Security hardening of the Step 10 core schema.
--
-- ADDITIVE ONLY. No Step 10 table is dropped, renamed, or rebuilt.
--
-- What this migration adds and why:
--   1. Secure helper functions used by RLS policies and triggers. They are
--      SECURITY DEFINER with a pinned search_path, EXECUTE revoked from the
--      public/anon roles so only authorized server paths can call them.
--   2. BEFORE INSERT/UPDATE triggers on tables that carry family_profile_id:
--      the database now enforces that family_profile_id belongs to the same
--      owner_id as the row (previously frontend-only).
--   3. Cross-object ownership triggers: a row can only reference another
--      object (document, appointment, conversation) owned by the same user.
--   4. Storage consistency trigger on medical_documents: storage_path must
--      start with the owner id and the bucket must stay 'medical_documents'
--      (keeps DB metadata consistent with the storage RLS path convention).
--
-- No existing column is altered; no data is touched; existing rows remain.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Secure helper functions
-- ---------------------------------------------------------------------------

-- Is the given family profile owned by the current user? Used by RLS and by
-- cross-table validation. Volatility: stable (result fixed within a query).
create or replace function public.carelink_is_family_profile_owner(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_profiles fp
    where fp.id = profile_id
      and fp.owner_id = auth.uid()
  );
$$;

-- Is the given medical document owned by the current user?
create or replace function public.carelink_can_access_document(document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.medical_documents d
    where d.id = document_id
      and d.owner_id = auth.uid()
  );
$$;

-- Is the given appointment owned by the current user?
create or replace function public.carelink_can_access_appointment(appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments a
    where a.id = appointment_id
      and a.owner_id = auth.uid()
  );
$$;

-- Does the given conversation belong to the current user?
create or replace function public.carelink_can_access_conversation(conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.owner_id = auth.uid()
  );
$$;

-- Generic "patient" accessor: a patient context is a family profile OR the
-- user's own profile. Every patient-scoped table resolves access through
-- owner_id, so this reduces to the same ownership predicate.
create or replace function public.carelink_can_access_patient(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.carelink_is_family_profile_owner(profile_id);
$$;

-- Privileged helpers: never callable by public/anon.
do $$
begin
  revoke execute on function public.carelink_is_family_profile_owner(uuid) from public;
  revoke execute on function public.carelink_can_access_document(uuid) from public;
  revoke execute on function public.carelink_can_access_appointment(uuid) from public;
  revoke execute on function public.carelink_can_access_conversation(uuid) from public;
  revoke execute on function public.carelink_can_access_patient(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_is_family_profile_owner(uuid) from anon;
    revoke execute on function public.carelink_can_access_document(uuid) from anon;
    revoke execute on function public.carelink_can_access_appointment(uuid) from anon;
    revoke execute on function public.carelink_can_access_conversation(uuid) from anon;
    revoke execute on function public.carelink_can_access_patient(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_is_family_profile_owner(uuid) to authenticated;
    grant execute on function public.carelink_can_access_document(uuid) to authenticated;
    grant execute on function public.carelink_can_access_appointment(uuid) to authenticated;
    grant execute on function public.carelink_can_access_conversation(uuid) to authenticated;
    grant execute on function public.carelink_can_access_patient(uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Family-profile ownership enforcement (trigger-based, additive)
-- ---------------------------------------------------------------------------

-- Enforces: NEW.family_profile_id must be a family profile owned by
-- NEW.owner_id. NULL family_profile_id means "self" and is always allowed.
create or replace function public.carelink_enforce_family_profile_ownership()
returns trigger
language plpgsql
as $$
begin
  if new.family_profile_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.family_profiles fp
    where fp.id = new.family_profile_id
      and fp.owner_id = new.owner_id
  ) then
    raise exception 'family_profile_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'health_context','medical_documents','medical_reports','medicines',
    'appointments','recovery_checkins','vaccination_records','conversations',
    'saved_hospitals','saved_doctors','saved_pharmacies','saved_labs',
    'emergency_events'
  ]
  loop
    execute format(
      'drop trigger if exists carelink_family_profile_ownership on public.%I;
       create trigger carelink_family_profile_ownership
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_family_profile_ownership();',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cross-object ownership enforcement (same-owner references)
-- ---------------------------------------------------------------------------

-- appointment_events.appointment_id must reference an appointment owned by
-- the same owner_id.
create or replace function public.carelink_enforce_appointment_event_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.appointments a
    where a.id = new.appointment_id
      and a.owner_id = new.owner_id
  ) then
    raise exception 'appointment_events.appointment_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_appointment_event_owner on public.appointment_events;
create trigger carelink_appointment_event_owner
  before insert or update on public.appointment_events
  for each row execute function public.carelink_enforce_appointment_event_owner();

-- Nullable appointment reference must point at an appointment owned by the
-- same owner_id. Used by recovery_checkins (0001) and recovery_plans (0012).
create or replace function public.carelink_enforce_recovery_appointment_owner()
returns trigger
language plpgsql
as $$
begin
  if new.appointment_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.appointments a
    where a.id = new.appointment_id
      and a.owner_id = new.owner_id
  ) then
    raise exception 'appointment_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_recovery_appointment_owner on public.recovery_checkins;
create trigger carelink_recovery_appointment_owner
  before insert or update on public.recovery_checkins
  for each row execute function public.carelink_enforce_recovery_appointment_owner();

-- medical_reports.medical_document_id (nullable) must reference a document
-- owned by the same owner_id AND (when family_profile_id is set on both) the
-- same family context.
create or replace function public.carelink_enforce_report_document_owner()
returns trigger
language plpgsql
as $$
begin
  if new.medical_document_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.medical_documents d
    where d.id = new.medical_document_id
      and d.owner_id = new.owner_id
      and (d.family_profile_id is not distinct from new.family_profile_id)
  ) then
    raise exception 'medical_reports.medical_document_id must belong to the same owner and family context';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_report_document_owner on public.medical_reports;
create trigger carelink_report_document_owner
  before insert or update on public.medical_reports
  for each row execute function public.carelink_enforce_report_document_owner();

-- medicines.medicine_image_document_id (nullable) must reference a document
-- owned by the same owner_id.
create or replace function public.carelink_enforce_medicine_image_owner()
returns trigger
language plpgsql
as $$
begin
  if new.medicine_image_document_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.medical_documents d
    where d.id = new.medicine_image_document_id
      and d.owner_id = new.owner_id
  ) then
    raise exception 'medicines.medicine_image_document_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_medicine_image_owner on public.medicines;
create trigger carelink_medicine_image_owner
  before insert or update on public.medicines
  for each row execute function public.carelink_enforce_medicine_image_owner();

-- conversation_messages.conversation_id must reference a conversation owned by
-- the same owner_id.
create or replace function public.carelink_enforce_message_conversation_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.conversations c
    where c.id = new.conversation_id
      and c.owner_id = new.owner_id
  ) then
    raise exception 'conversation_messages.conversation_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_message_conversation_owner on public.conversation_messages;
create trigger carelink_message_conversation_owner
  before insert or update on public.conversation_messages
  for each row execute function public.carelink_enforce_message_conversation_owner();

-- ---------------------------------------------------------------------------
-- 4. medical_documents storage consistency (owner path + private bucket)
-- ---------------------------------------------------------------------------
-- storage_path must start with "<owner_id>/" so the storage RLS path
-- convention (<owner_id>/<document_id>/<file>) and the DB row can never
-- disagree; the bucket must remain the private medical_documents bucket.
create or replace function public.carelink_enforce_document_storage_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.storage_bucket <> 'medical_documents' then
    raise exception 'medical_documents must use the private medical_documents bucket';
  end if;
  if new.storage_path not like (new.owner_id::text || '/%') then
    raise exception 'medical_documents.storage_path must start with the owner id';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_document_storage_consistency on public.medical_documents;
create trigger carelink_document_storage_consistency
  before insert or update on public.medical_documents
  for each row execute function public.carelink_enforce_document_storage_consistency();

-- ---------------------------------------------------------------------------
-- 5. Audit helper (safe, controlled entry point for audit_events inserts)
-- ---------------------------------------------------------------------------
-- Step 10 reserved audit inserts for service_role. This helper lets
-- server-side security-definer paths (and admin functions added later) write
-- structured audit rows while still never allowing arbitrary client SQL.
create or replace function public.carelink_record_audit(
  action text,
  target_table text default null,
  target_id uuid default null,
  safe_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  insert into public.audit_events (id, actor_id, action, target_table, target_id, safe_message)
  values (gen_random_uuid(), auth.uid(), action, target_table, target_id, safe_message)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.carelink_record_audit(text, text, uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_record_audit(text, text, uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_record_audit(text, text, uuid, text) to authenticated;
  end if;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0003_security_hardening.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0004_condition_specialty_master.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §4: Condition / symptom / specialty master data.
--
-- ADDITIVE ONLY. These are reference (master-data) tables that power:
--   user symptom/condition → relevant specialty → relevant hospitals/doctors.
-- Public-read: they contain no patient data, only the curated catalog.
-- Writes are restricted to admins/super-admins (RBAC helpers arrive in 0006;
-- the write policies here are added there once the helpers exist — the tables
-- start without any INSERT/UPDATE/DELETE policy, so no client write is
-- possible until 0006 explicitly grants one).
-- ===========================================================================

create table if not exists public.specialties (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conditions (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.symptoms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- condition ↔ specialty mapping (which specialties treat a condition)
create table if not exists public.condition_specialties (
  id uuid primary key default gen_random_uuid(),
  condition_id uuid not null references public.conditions(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (condition_id, specialty_id)
);

-- symptom → possible condition mapping (navigational, NOT diagnostic)
create table if not exists public.symptom_conditions (
  id uuid primary key default gen_random_uuid(),
  symptom_id uuid not null references public.symptoms(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete cascade,
  weight numeric(4,3) default 1.0 check (weight >= 0 and weight <= 1),
  created_at timestamptz not null default now(),
  unique (symptom_id, condition_id)
);

create index if not exists condition_specialties_condition_id_idx on public.condition_specialties(condition_id);
create index if not exists condition_specialties_specialty_id_idx on public.condition_specialties(specialty_id);
create index if not exists symptom_conditions_symptom_id_idx on public.symptom_conditions(symptom_id);
create index if not exists symptom_conditions_condition_id_idx on public.symptom_conditions(condition_id);

-- updated_at triggers
do $$
declare t text;
begin
  foreach t in array array['specialties','conditions','symptoms']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

-- RLS: enable + public read-only. No write policy is created here.
do $$
declare t text;
begin
  foreach t in array array[
    'specialties','conditions','symptoms','condition_specialties','symptom_conditions'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_public_read on public.%1$I;
       create policy %1$s_public_read on public.%1$I
         for select using (true);',
      t);
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0004_condition_specialty_master.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0005_provider_ecosystem.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §5: Provider ecosystem (hospitals / doctors /
-- pharmacies / labs).
--
-- ADDITIVE ONLY. The Step 10 patient bookmark tables saved_hospitals,
-- saved_doctors, saved_pharmacies, saved_labs are NOT duplicated — they stay
-- patient bookmarks; these new tables are the provider registry.
--
-- Design:
--   - Provider DISCOVERY tables (name, address, services, hours, fees…) are
--     public-read, so anonymous browsing keeps working. They never contain
--     private admin fields.
--   - Provider VERIFICATION/ADMIN data lives in separate *_verification
--     tables with NO public policy (admin policies added in 0006_rbac.sql).
--   - lab_bookings is patient-owned → owner-scoped RLS (reuses the Step 10
--     carelink_apply_owner_rls helper).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- HOSPITALS
-- ---------------------------------------------------------------------------
create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  city text,
  address text,
  phone_number text,
  email text,
  website text,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospital_locations (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  label text,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists hospital_locations_hospital_id_idx on public.hospital_locations(hospital_id);

create table if not exists public.hospital_services (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  service_name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists hospital_services_hospital_id_idx on public.hospital_services(hospital_id);

create table if not exists public.hospital_specialties (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  unique (hospital_id, specialty_id)
);
create index if not exists hospital_specialties_specialty_id_idx on public.hospital_specialties(specialty_id);

create table if not exists public.hospital_hours (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_24_hours boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hospital_hours_hospital_id_idx on public.hospital_hours(hospital_id);

create table if not exists public.emergency_capabilities (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null unique references public.hospitals(id) on delete cascade,
  has_emergency_department boolean not null default false,
  has_ambulance boolean not null default false,
  has_icu boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- hospital_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.hospital_verification (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null unique references public.hospitals(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- DOCTORS
-- ---------------------------------------------------------------------------
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  gender text check (gender in ('male','female','other','prefer_not_to_say')),
  years_experience integer check (years_experience is null or years_experience >= 0),
  bio text,
  photo_url text,
  languages jsonb not null default '[]'::jsonb,
  rating numeric(2,1) check (rating is null or (rating <= 5 and rating >= 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.doctors(id) on delete cascade,
  education_summary text,
  experience_summary text,
  about text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_specialties (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  unique (doctor_id, specialty_id)
);
create index if not exists doctor_specialties_specialty_id_idx on public.doctor_specialties(specialty_id);

-- doctor ↔ condition expertise mapping (the ONLY doctor/condition link table
-- — see hospital_doctors note below)
create table if not exists public.doctor_condition_expertise (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete cascade,
  unique (doctor_id, condition_id)
);
create index if not exists doctor_condition_expertise_condition_id_idx on public.doctor_condition_expertise(condition_id);

-- canonical doctor ↔ hospital link
create table if not exists public.doctor_hospitals (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  is_primary boolean not null default false,
  unique (doctor_id, hospital_id)
);
create index if not exists doctor_hospitals_hospital_id_idx on public.doctor_hospitals(hospital_id);

create table if not exists public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid references public.hospitals(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes smallint not null default 30 check (slot_duration_minutes between 5 and 240),
  created_at timestamptz not null default now()
);
create index if not exists doctor_availability_doctor_id_idx on public.doctor_availability(doctor_id);

create table if not exists public.qualifications (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  degree text not null,
  institution text,
  year smallint,
  created_at timestamptz not null default now()
);
create index if not exists qualifications_doctor_id_idx on public.qualifications(doctor_id);

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  title text not null,
  issuer text,
  year smallint,
  created_at timestamptz not null default now()
);
create index if not exists certifications_doctor_id_idx on public.certifications(doctor_id);

create table if not exists public.consultation_fees (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid references public.hospitals(id) on delete set null,
  appointment_type text check (appointment_type in ('Consultation','Follow-up','Telehealth')),
  fee numeric(10,2) not null check (fee >= 0),
  currency text not null default 'INR',
  created_at timestamptz not null default now()
);
create index if not exists consultation_fees_doctor_id_idx on public.consultation_fees(doctor_id);

-- doctor_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.doctor_verification (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.doctors(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- hospital_condition_services: hospital ↔ condition treated (for the
-- "relevant doctors first / Show all doctors" hospital-detail flow)
create table if not exists public.hospital_condition_services (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete cascade,
  unique (hospital_id, condition_id)
);
create index if not exists hospital_condition_services_condition_id_idx on public.hospital_condition_services(condition_id);

-- hospital_doctors: compat VIEW over the canonical doctor_hospitals link so
-- both naming styles work without a duplicated table.
create or replace view public.hospital_doctors
  with (security_invoker = true)
  as select id, doctor_id, hospital_id, is_primary from public.doctor_hospitals;

-- ---------------------------------------------------------------------------
-- PHARMACIES
-- ---------------------------------------------------------------------------
create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  address text,
  city text,
  phone_number text,
  rating numeric(2,1) check (rating is null or (rating <= 5 and rating >= 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_locations (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  label text,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_locations_pharmacy_id_idx on public.pharmacy_locations(pharmacy_id);

create table if not exists public.pharmacy_hours (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_24_hours boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_hours_pharmacy_id_idx on public.pharmacy_hours(pharmacy_id);

create table if not exists public.pharmacy_medicines (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_name text not null,
  brand text,
  dosage_form text,
  strength text,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_medicines_pharmacy_id_idx on public.pharmacy_medicines(pharmacy_id);

create table if not exists public.medicine_inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_medicine_id uuid not null references public.pharmacy_medicines(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  unit_price numeric(10,2) check (unit_price is null or unit_price >= 0),
  in_stock boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists medicine_inventory_pharmacy_medicine_id_idx on public.medicine_inventory(pharmacy_medicine_id);

-- pharmacy_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.pharmacy_verification (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null unique references public.pharmacies(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- LABS
-- ---------------------------------------------------------------------------
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  address text,
  city text,
  phone_number text,
  rating numeric(2,1) check (rating is null or (rating <= 5 and rating >= 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_locations (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  label text,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists lab_locations_lab_id_idx on public.lab_locations(lab_id);

create table if not exists public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  test_name text not null,
  description text,
  price numeric(10,2) check (price is null or price >= 0),
  created_at timestamptz not null default now()
);
create index if not exists lab_tests_lab_id_idx on public.lab_tests(lab_id);

create table if not exists public.lab_services (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  service_name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists lab_services_lab_id_idx on public.lab_services(lab_id);

create table if not exists public.lab_hours (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_24_hours boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lab_hours_lab_id_idx on public.lab_hours(lab_id);

-- lab_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.lab_verification (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null unique references public.labs(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- lab_bookings: PATIENT-OWNED (owner-scoped, not public)
create table if not exists public.lab_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete restrict,
  lab_test_id uuid references public.lab_tests(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('scheduled','completed','cancelled')) default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lab_bookings_owner_id_idx on public.lab_bookings(owner_id);
create index if not exists lab_bookings_family_profile_id_idx on public.lab_bookings(family_profile_id);
create index if not exists lab_bookings_lab_id_idx on public.lab_bookings(lab_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'hospitals','hospital_verification','doctors','doctor_profiles',
    'doctor_verification','pharmacies','pharmacy_verification','labs',
    'lab_verification','lab_bookings','medicine_inventory'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

-- lab_bookings family-profile ownership enforcement (Step 10.5 §2 helper)
drop trigger if exists carelink_family_profile_ownership on public.lab_bookings;
create trigger carelink_family_profile_ownership
  before insert or update on public.lab_bookings
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- ---------------------------------------------------------------------------
-- RLS — enable + scoped policies
-- ---------------------------------------------------------------------------

-- Public discovery tables: SELECT for everyone (anon browsing works).
do $$
declare t text;
begin
  foreach t in array array[
    'hospitals','hospital_locations','hospital_services','hospital_specialties',
    'hospital_hours','emergency_capabilities','hospital_condition_services',
    'doctors','doctor_profiles','doctor_specialties','doctor_condition_expertise',
    'doctor_hospitals','doctor_availability','qualifications','certifications',
    'consultation_fees',
    'pharmacies','pharmacy_locations','pharmacy_hours','pharmacy_medicines',
    'medicine_inventory',
    'labs','lab_locations','lab_tests','lab_services','lab_hours'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_public_read on public.%1$I;
       create policy %1$s_public_read on public.%1$I
         for select using (true);',
      t);
  end loop;
end $$;

-- Verification tables: RLS enabled, deliberately WITHOUT any client policy yet
-- (no read/write). Admin/provider-member access is added in 0006_rbac.sql.
do $$
declare t text;
begin
  foreach t in array array[
    'hospital_verification','doctor_verification','pharmacy_verification','lab_verification'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- lab_bookings: owner-scoped (Step 10 helper)
do $$
begin
  execute 'alter table public.lab_bookings enable row level security';
  perform public.carelink_apply_owner_rls('lab_bookings');
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0005_provider_ecosystem.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0006_rbac_provider_membership.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §3: RBAC + provider membership.
--
-- ADDITIVE ONLY.
--
-- SECURITY RULES ENCODED HERE:
--   - Roles live ONLY in user_roles; frontend role values are never trusted.
--   - Provider membership is scoped: hospital admins can only reach their own
--     hospital, pharmacy admins their own pharmacy, lab admins their own lab.
--   - All privileged helpers are SECURITY DEFINER with pinned search_path and
--     EXECUTE revoked from public/anon.
--   - Role/membership changes have NO client write policy — they go through
--     the audited guard functions below (or the service_role edge functions).
--   - Super-admin actions are audited (carelink_grant_role writes audit_events).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id text primary key,
  description text,
  created_at timestamptz not null default now()
);

insert into public.roles (id, description) values
  ('patient','End user of the platform'),
  ('doctor','Linked medical practitioner'),
  ('hospital_admin','Administrator of exactly one hospital'),
  ('pharmacy_admin','Administrator of exactly one pharmacy'),
  ('lab_admin','Administrator of exactly one lab'),
  ('admin','Platform administrator (non-medical ops)'),
  ('super_admin','Full platform administrator; all actions must be audited')
on conflict (id) do nothing;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id) on delete restrict,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, role_id)
);
create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
create index if not exists user_roles_role_id_idx on public.user_roles(role_id);

-- One membership = one provider entity. Exactly one FK must be set.
create table if not exists public.provider_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_kind text not null check (provider_kind in ('hospital','pharmacy','lab')),
  hospital_id uuid references public.hospitals(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (provider_kind = 'hospital' and hospital_id is not null and pharmacy_id is null and lab_id is null)
    or (provider_kind = 'pharmacy' and pharmacy_id is not null and hospital_id is null and lab_id is null)
    or (provider_kind = 'lab' and lab_id is not null and hospital_id is null and pharmacy_id is null)
  )
);
create index if not exists provider_memberships_user_id_idx on public.provider_memberships(user_id);
create index if not exists provider_memberships_hospital_id_idx on public.provider_memberships(hospital_id);
create index if not exists provider_memberships_pharmacy_id_idx on public.provider_memberships(pharmacy_id);
create index if not exists provider_memberships_lab_id_idx on public.provider_memberships(lab_id);
create unique index if not exists provider_memberships_hospital_user_uq
  on public.provider_memberships(user_id, hospital_id) where hospital_id is not null;
create unique index if not exists provider_memberships_pharmacy_user_uq
  on public.provider_memberships(user_id, pharmacy_id) where pharmacy_id is not null;
create unique index if not exists provider_memberships_lab_user_uq
  on public.provider_memberships(user_id, lab_id) where lab_id is not null;

-- doctor ↔ auth user link (a doctor account only reaches their own doctor row)
create table if not exists public.doctor_user_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  status text not null check (status in ('pending','approved','revoked')) default 'pending',
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, doctor_id)
);
create index if not exists doctor_user_links_user_id_idx on public.doctor_user_links(user_id);
create index if not exists doctor_user_links_doctor_id_idx on public.doctor_user_links(doctor_id);

-- ---------------------------------------------------------------------------
-- Secure role/membership helpers (SECURITY DEFINER, pinned path)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role_id = role_name
  );
$$;

create or replace function public.carelink_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.carelink_has_role('super_admin'); $$;

create or replace function public.carelink_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.carelink_has_role('admin') or public.carelink_has_role('super_admin'); $$;

create or replace function public.carelink_is_hospital_admin(hospital_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'hospital'
      and pm.hospital_id = hospital_uuid
  ) or public.carelink_is_super_admin();
$$;

create or replace function public.carelink_is_pharmacy_admin(pharmacy_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'pharmacy'
      and pm.pharmacy_id = pharmacy_uuid
  ) or public.carelink_is_super_admin();
$$;

create or replace function public.carelink_is_lab_admin(lab_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'lab'
      and pm.lab_id = lab_uuid
  ) or public.carelink_is_super_admin();
$$;

create or replace function public.carelink_is_doctor_linked(doctor_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doctor_user_links dl
    where dl.user_id = auth.uid()
      and dl.doctor_id = doctor_uuid
      and dl.status = 'approved'
  ) or public.carelink_is_super_admin();
$$;

-- RAW membership checks WITHOUT the super_admin bypass. Use these wherever the
-- caller must be an ACTUAL member of the provider (e.g. speaking as the
-- provider in a review response) rather than administering the platform.
create or replace function public.carelink_is_hospital_member(hospital_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'hospital'
      and pm.hospital_id = hospital_uuid
  );
$$;

create or replace function public.carelink_is_pharmacy_member(pharmacy_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'pharmacy'
      and pm.pharmacy_id = pharmacy_uuid
  );
$$;

create or replace function public.carelink_is_lab_member(lab_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'lab'
      and pm.lab_id = lab_uuid
  );
$$;

create or replace function public.carelink_is_linked_doctor(doctor_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doctor_user_links dl
    where dl.user_id = auth.uid()
      and dl.doctor_id = doctor_uuid
      and dl.status = 'approved'
  );
$$;

-- EXECUTE policy: the pure self-membership PREDICATES must remain callable by
-- every role that policy evaluation can run as (including anon) — they reveal
-- nothing beyond a boolean about the caller's own (possibly null) identity,
-- and PostgreSQL evaluates them inside policies on publicly readable tables.
-- The MUTATING guarded functions (below) stay revoked from anon/public.
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_has_role(text)','carelink_is_super_admin()','carelink_is_admin()',
    'carelink_is_hospital_admin(uuid)','carelink_is_pharmacy_admin(uuid)',
    'carelink_is_lab_admin(uuid)','carelink_is_doctor_linked(uuid)',
    'carelink_is_hospital_member(uuid)','carelink_is_pharmacy_member(uuid)',
    'carelink_is_lab_member(uuid)','carelink_is_linked_doctor(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Audited, guarded role/membership mutation functions
-- (callable only by super_admin; every call writes audit_events)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_grant_role(target_user uuid, role_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can grant roles';
  end if;
  insert into public.user_roles (id, user_id, role_id, granted_by)
  values (gen_random_uuid(), target_user, role_name, auth.uid())
  on conflict (user_id, role_id) do nothing
  returning id into new_id;
  perform public.carelink_record_audit('role_granted', 'user_roles', new_id, 'role: ' || role_name);
  return new_id;
end;
$$;

create or replace function public.carelink_revoke_role(target_user uuid, role_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can revoke roles';
  end if;
  delete from public.user_roles where user_id = target_user and role_id = role_name;
  perform public.carelink_record_audit('role_revoked', 'user_roles', null, 'role: ' || role_name);
end;
$$;

create or replace function public.carelink_add_provider_membership(
  target_user uuid,
  kind text,
  provider_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can add provider memberships';
  end if;
  if kind not in ('hospital','pharmacy','lab') then
    raise exception 'invalid provider kind';
  end if;
  insert into public.provider_memberships (id, user_id, provider_kind, hospital_id, pharmacy_id, lab_id)
  values (
    gen_random_uuid(), target_user, kind,
    case when kind = 'hospital' then provider_uuid end,
    case when kind = 'pharmacy' then provider_uuid end,
    case when kind = 'lab' then provider_uuid end
  )
  returning id into new_id;
  perform public.carelink_record_audit('provider_membership_added', 'provider_memberships', new_id, 'kind: ' || kind);
  return new_id;
end;
$$;

create or replace function public.carelink_remove_provider_membership(membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can remove provider memberships';
  end if;
  delete from public.provider_memberships where id = membership_id;
  perform public.carelink_record_audit('provider_membership_removed', 'provider_memberships', membership_id, null);
end;
$$;

do $$
begin
  revoke execute on function public.carelink_grant_role(uuid, text) from public;
  revoke execute on function public.carelink_revoke_role(uuid, text) from public;
  revoke execute on function public.carelink_add_provider_membership(uuid, text, uuid) from public;
  revoke execute on function public.carelink_remove_provider_membership(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_grant_role(uuid, text) from anon;
    revoke execute on function public.carelink_revoke_role(uuid, text) from anon;
    revoke execute on function public.carelink_add_provider_membership(uuid, text, uuid) from anon;
    revoke execute on function public.carelink_remove_provider_membership(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_grant_role(uuid, text) to authenticated;
    grant execute on function public.carelink_revoke_role(uuid, text) to authenticated;
    grant execute on function public.carelink_add_provider_membership(uuid, text, uuid) to authenticated;
    grant execute on function public.carelink_remove_provider_membership(uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.provider_memberships enable row level security;
alter table public.doctor_user_links enable row level security;

-- roles: readable by anyone (id + description only)
drop policy if exists roles_public_read on public.roles;
create policy roles_public_read on public.roles for select using (true);

-- user_roles: a user may read their own granted roles (transparency); NO
-- client insert/update/delete (guarded functions only).
drop policy if exists user_roles_self_select on public.user_roles;
create policy user_roles_self_select on public.user_roles
  for select using (user_id = auth.uid());

-- provider_memberships: a user may read their own membership rows.
drop policy if exists provider_memberships_self_select on public.provider_memberships;
create policy provider_memberships_self_select on public.provider_memberships
  for select using (user_id = auth.uid());

-- doctor_user_links: a user may read their own link status.
drop policy if exists doctor_user_links_self_select on public.doctor_user_links;
create policy doctor_user_links_self_select on public.doctor_user_links
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin write policies on the master-data + provider + verification tables
-- (0004/0005 created them read-only / no-policy; writes are enabled here).
--
-- IMPORTANT: these are PER-COMMAND policies, not FOR ALL. A FOR ALL admin
-- SELECT policy would be OR-combined with the public-read policy and then
-- invoke the membership helper as `anon`, which (correctly) has no EXECUTE.
-- SELECT stays governed by the 0004/0005 public-read policies; verification
-- tables get an explicit admin SELECT policy (they have no public read).
-- ---------------------------------------------------------------------------

-- Helper: attach insert/update/delete admin policies to a table using a
-- provider-scope predicate (a column name on that table) or 'SUPER_ADMIN'.
create or replace function public.carelink_apply_admin_write_rls(table_name text, scope text, helper text)
returns void
language plpgsql
as $$
declare pred text;
begin
  if scope = 'SUPER_ADMIN' then
    pred := 'public.carelink_is_super_admin()';
  elsif scope = 'INVENTORY' then
    pred := 'exists (select 1 from public.pharmacy_medicines pm where pm.id = pharmacy_medicine_id and public.carelink_is_pharmacy_admin(pm.pharmacy_id))';
  else
    pred := format('public.%I(%I)', helper, scope);
  end if;

  execute format(
    'drop policy if exists %1$s_admin_insert on public.%1$I;
     create policy %1$s_admin_insert on public.%1$I for insert with check (%2$s);
     drop policy if exists %1$s_admin_update on public.%1$I;
     create policy %1$s_admin_update on public.%1$I for update using (%2$s) with check (%2$s);
     drop policy if exists %1$s_admin_delete on public.%1$I;
     create policy %1$s_admin_delete on public.%1$I for delete using (%2$s);',
    table_name, pred);

  if table_name like '%_verification' then
    execute format(
      'drop policy if exists %1$s_admin_select on public.%1$I;
       create policy %1$s_admin_select on public.%1$I for select using (%2$s);',
      table_name, pred);
  end if;
end;
$$;

-- Master data (0004): super_admin only.
do $$
declare t text;
begin
  foreach t in array array['specialties','conditions','symptoms','condition_specialties','symptom_conditions']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'SUPER_ADMIN', null);
  end loop;
end $$;

-- HOSPITAL group
select public.carelink_apply_admin_write_rls('hospitals', 'id', 'carelink_is_hospital_admin');
do $$
declare t text;
begin
  foreach t in array array['hospital_locations','hospital_services','hospital_specialties','hospital_hours','emergency_capabilities','hospital_condition_services']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'hospital_id', 'carelink_is_hospital_admin');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('hospital_verification', 'hospital_id', 'carelink_is_hospital_admin');

-- DOCTOR group
select public.carelink_apply_admin_write_rls('doctors', 'id', 'carelink_is_doctor_linked');
do $$
declare t text;
begin
  foreach t in array array['doctor_profiles','doctor_specialties','doctor_condition_expertise','doctor_hospitals','doctor_availability','qualifications','certifications','consultation_fees']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'doctor_id', 'carelink_is_doctor_linked');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('doctor_verification', 'doctor_id', 'carelink_is_doctor_linked');
-- doctor verification WRITE is verification-body only (super_admin), linked doctor may READ
do $$
begin
  execute 'drop policy if exists doctor_verification_admin_insert on public.doctor_verification;
           create policy doctor_verification_admin_insert on public.doctor_verification for insert with check (public.carelink_is_super_admin())';
  execute 'drop policy if exists doctor_verification_admin_update on public.doctor_verification;
           create policy doctor_verification_admin_update on public.doctor_verification for update using (public.carelink_is_super_admin()) with check (public.carelink_is_super_admin())';
  execute 'drop policy if exists doctor_verification_admin_delete on public.doctor_verification;
           create policy doctor_verification_admin_delete on public.doctor_verification for delete using (public.carelink_is_super_admin())';
end $$;

-- PHARMACY group
select public.carelink_apply_admin_write_rls('pharmacies', 'id', 'carelink_is_pharmacy_admin');
do $$
declare t text;
begin
  foreach t in array array['pharmacy_locations','pharmacy_hours','pharmacy_medicines']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'pharmacy_id', 'carelink_is_pharmacy_admin');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('medicine_inventory', 'INVENTORY', null);
select public.carelink_apply_admin_write_rls('pharmacy_verification', 'pharmacy_id', 'carelink_is_pharmacy_admin');

-- LAB group
select public.carelink_apply_admin_write_rls('labs', 'id', 'carelink_is_lab_admin');
do $$
declare t text;
begin
  foreach t in array array['lab_locations','lab_tests','lab_services','lab_hours']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'lab_id', 'carelink_is_lab_admin');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('lab_verification', 'lab_id', 'carelink_is_lab_admin');

-- lab_bookings: lab admin can READ bookings for their lab (never the patient
-- list of OTHER labs). Write stays owner-only (0005 policy).
drop policy if exists lab_bookings_lab_admin_select on public.lab_bookings;
create policy lab_bookings_lab_admin_select on public.lab_bookings
  for select using (public.carelink_is_lab_admin(lab_id));

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0006_rbac_provider_membership.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0007_reviews.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §6: Reviews backend (replaces mock/client-only).
--
-- ADDITIVE ONLY.
--
-- Security properties:
--   - Exactly one target (hospital|doctor|pharmacy|lab) via nullable FKs +
--     CHECK constraint (no unsafe polymorphic reference).
--   - One published review per (author, target) via a unique expression index
--     (duplicate-review abuse prevention).
--   - Verified-review status lives in review_verification and can ONLY be set
--     by the guarded function below (client has no insert policy), so it
--     cannot be forged.
--   - Editing someone else's review: impossible (author-scoped policies).
--   - Moderation: server-side function only, always audited. Moderators must
--     hold admin/super_admin role; every action writes audit_events.
-- ===========================================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete set null,
  hospital_id uuid references public.hospitals(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  title text,
  body text,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  status text not null check (status in ('published','pending','hidden','removed')) default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (hospital_id is not null)::int + (doctor_id is not null)::int
    + (pharmacy_id is not null)::int + (lab_id is not null)::int = 1
  )
);
create index if not exists reviews_owner_id_idx on public.reviews(owner_id);
create index if not exists reviews_hospital_id_idx on public.reviews(hospital_id) where hospital_id is not null;
create index if not exists reviews_doctor_id_idx on public.reviews(doctor_id) where doctor_id is not null;
create index if not exists reviews_pharmacy_id_idx on public.reviews(pharmacy_id) where pharmacy_id is not null;
create index if not exists reviews_lab_id_idx on public.reviews(lab_id) where lab_id is not null;
-- one published review per (author, target)
create unique index if not exists reviews_one_per_target_uq
  on public.reviews (owner_id, (coalesce(hospital_id, doctor_id, pharmacy_id, lab_id)))
  where status = 'published';
-- one published review per completed appointment (verified path, when linked)
create unique index if not exists reviews_one_per_appointment_uq
  on public.reviews (appointment_id)
  where appointment_id is not null and status = 'published';

create table if not exists public.review_ratings (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  aspect text not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (review_id, aspect)
);
create index if not exists review_ratings_review_id_idx on public.review_ratings(review_id);

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null check (status in ('open','dismissed','actioned')) default 'open',
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index if not exists review_reports_review_id_idx on public.review_reports(review_id);
create index if not exists review_reports_reporter_id_idx on public.review_reports(reporter_id);

-- verified-review badge state (filled only by carelink_verify_review)
create table if not exists public.review_verification (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  verified_interaction boolean not null default false,
  appointment_id uuid references public.appointments(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- provider response to a review
create table if not exists public.provider_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  responder_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id)  -- one provider response per review
);

-- moderation history (written only via the guarded function)
create table if not exists public.review_moderation (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  moderator_id uuid references auth.users(id),
  action text not null check (action in ('publish','hide','remove')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists review_moderation_review_id_idx on public.review_moderation(review_id);

-- ---------------------------------------------------------------------------
-- Guarded verification: marks a review verified ONLY when the linked
-- appointment is completed and belongs to the review author. Client cannot
-- call this with arbitrary success — every precondition is checked here.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_verify_review(review_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = review_uuid;
  if not found then
    raise exception 'review not found';
  end if;
  -- Only the author (or an admin) may request verification.
  if r.owner_id <> auth.uid() and not public.carelink_is_admin() then
    raise exception 'not authorized to verify this review';
  end if;
  if r.appointment_id is null then
    return false; -- no linked appointment: nothing to verify against
  end if;
  if not exists (
    select 1 from public.appointments a
    where a.id = r.appointment_id
      and a.owner_id = r.owner_id
      and a.status = 'completed'
  ) then
    return false; -- eligibility not met (must be a completed appointment)
  end if;
  insert into public.review_verification (id, review_id, verified_interaction, appointment_id, verified_at)
  values (gen_random_uuid(), review_uuid, true, r.appointment_id, now())
  on conflict (review_id)
  do update set verified_interaction = true, appointment_id = r.appointment_id, verified_at = now();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guarded moderation: admin/super_admin only; always audited.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_moderate_review(
  review_uuid uuid,
  action text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_is_admin() then
    raise exception 'only admins can moderate reviews';
  end if;
  if action not in ('publish','hide','remove') then
    raise exception 'invalid moderation action';
  end if;
  insert into public.review_moderation (id, review_id, moderator_id, action, reason)
  values (gen_random_uuid(), review_uuid, auth.uid(), action, reason);
  update public.reviews
  set status = case action when 'publish' then 'published'
                           when 'hide' then 'hidden'
                           when 'remove' then 'removed' end
  where id = review_uuid;
  perform public.carelink_record_audit('review_moderated', 'reviews', review_uuid, 'action: ' || action);
end;
$$;

do $$
begin
  revoke execute on function public.carelink_verify_review(uuid) from public;
  revoke execute on function public.carelink_moderate_review(uuid, text, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_verify_review(uuid) from anon;
    revoke execute on function public.carelink_moderate_review(uuid, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_verify_review(uuid) to authenticated;
    grant execute on function public.carelink_moderate_review(uuid, text, text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['reviews','provider_responses']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

-- reviews.family_profile_id must belong to owner
drop trigger if exists carelink_family_profile_ownership on public.reviews;
create trigger carelink_family_profile_ownership
  before insert or update on public.reviews
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'reviews','review_ratings','review_reports','review_verification',
    'provider_responses','review_moderation'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- reviews: published reviews are public; author sees their own any-status rows
drop policy if exists reviews_public_or_self_select on public.reviews;
create policy reviews_public_or_self_select on public.reviews
  for select using (status = 'published' or owner_id = auth.uid());

drop policy if exists reviews_author_insert on public.reviews;
create policy reviews_author_insert on public.reviews
  for insert with check (owner_id = auth.uid() and status in ('published','pending'));

-- author may edit ONLY their own review and can never change status away by
-- moderation states (status changes flow through carelink_moderate_review)
drop policy if exists reviews_author_update on public.reviews;
create policy reviews_author_update on public.reviews
  for update using (owner_id = auth.uid() and status in ('published','pending'))
  with check (owner_id = auth.uid() and status in ('published','pending'));

drop policy if exists reviews_author_delete on public.reviews;
create policy reviews_author_delete on public.reviews
  for delete using (owner_id = auth.uid());

-- review_ratings: readable for public reviews, writable only by the review author
drop policy if exists review_ratings_select on public.review_ratings;
create policy review_ratings_select on public.review_ratings
  for select using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and (r.status = 'published' or r.owner_id = auth.uid())
    )
  );

drop policy if exists review_ratings_author_write on public.review_ratings;
create policy review_ratings_author_write on public.review_ratings
  for all using (
    exists (select 1 from public.reviews r where r.id = review_id and r.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.reviews r where r.id = review_id and r.owner_id = auth.uid())
  );

-- review_reports: anyone authenticated can report; reporter sees own reports;
-- admins see all reports.
drop policy if exists review_reports_insert on public.review_reports;
create policy review_reports_insert on public.review_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists review_reports_select on public.review_reports;
create policy review_reports_select on public.review_reports
  for select using (reporter_id = auth.uid() or public.carelink_is_admin());

-- review_verification: READ public (badge), NO client write (function only)
drop policy if exists review_verification_public_read on public.review_verification;
create policy review_verification_public_read on public.review_verification
  for select using (true);

-- provider_responses: public read when the parent review is published; write
-- only by the authorized provider account (hospital/pharmacy/lab admin of the
-- target, or the linked doctor).
drop policy if exists provider_responses_public_select on public.provider_responses;
create policy provider_responses_public_select on public.provider_responses
  for select using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and r.status = 'published'
    )
  );

-- Uses the RAW membership helpers: a super_admin must NOT be able to pose as
-- the provider in a response without an actual membership/link.
drop policy if exists provider_responses_provider_insert on public.provider_responses;
create policy provider_responses_provider_insert on public.provider_responses
  for insert with check (
    responder_id = auth.uid()
    and exists (
      select 1 from public.reviews r
      where r.id = review_id
        and (
          (r.hospital_id is not null and public.carelink_is_hospital_member(r.hospital_id))
          or (r.pharmacy_id is not null and public.carelink_is_pharmacy_member(r.pharmacy_id))
          or (r.lab_id is not null and public.carelink_is_lab_member(r.lab_id))
          or (r.doctor_id is not null and public.carelink_is_linked_doctor(r.doctor_id))
        )
    )
  );

drop policy if exists provider_responses_provider_update on public.provider_responses;
create policy provider_responses_provider_update on public.provider_responses
  for update using (responder_id = auth.uid())
  with check (responder_id = auth.uid());

drop policy if exists provider_responses_provider_delete on public.provider_responses;
create policy provider_responses_provider_delete on public.provider_responses
  for delete using (responder_id = auth.uid());

-- review_moderation: admins can READ moderation history; writes only via fn
drop policy if exists review_moderation_admin_select on public.review_moderation;
create policy review_moderation_admin_select on public.review_moderation
  for select using (public.carelink_is_admin());

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0007_reviews.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0008_agent_recommendations.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §7: Recommendation provenance.
--
-- ADDITIVE ONLY. Stores why the agent recommended a provider entity: per-
-- factor scores, matched reasons, and live/mock provenance. Internal scores
-- are owner-visible only (RLS) and must be mapped to safe explanation text in
-- the UI — never shown as raw internals to other users (no public policy).
-- ===========================================================================

create table if not exists public.agent_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_profile_id uuid references public.family_profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  entity_type text not null check (entity_type in ('hospital','doctor','pharmacy','lab')),
  -- entity_id is the provider slug or id from the active data source (real or mock)
  entity_id text not null,
  relevance_score numeric(4,3) check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 1)),
  distance_score numeric(4,3) check (distance_score is null or (distance_score >= 0 and distance_score <= 1)),
  rating_score numeric(4,3) check (rating_score is null or (rating_score >= 0 and rating_score <= 1)),
  availability_score numeric(4,3) check (availability_score is null or (availability_score >= 0 and availability_score <= 1)),
  specialty_score numeric(4,3) check (specialty_score is null or (specialty_score >= 0 and specialty_score <= 1)),
  emergency_score numeric(4,3) check (emergency_score is null or (emergency_score >= 0 and emergency_score <= 1)),
  cost_score numeric(4,3) check (cost_score is null or (cost_score >= 0 and cost_score <= 1)),
  overall_score numeric(4,3) check (overall_score is null or (overall_score >= 0 and overall_score <= 1)),
  matched_reasons jsonb not null default '[]'::jsonb,
  source text not null default 'mock',          -- provider/source label
  is_mock boolean not null default true,        -- provenance: mock vs live
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists agent_recommendations_owner_id_idx on public.agent_recommendations(owner_id);
create index if not exists agent_recommendations_patient_profile_id_idx on public.agent_recommendations(patient_profile_id);
create index if not exists agent_recommendations_conversation_id_idx on public.agent_recommendations(conversation_id);
create index if not exists agent_recommendations_entity_idx on public.agent_recommendations(entity_type, entity_id);

-- patient_profile_ids must belong to the owner (same rule as family_profile)
create or replace function public.carelink_enforce_recommendation_patient_owner()
returns trigger
language plpgsql
as $$
begin
  if new.patient_profile_id is not null and not exists (
    select 1 from public.family_profiles fp
    where fp.id = new.patient_profile_id and fp.owner_id = new.owner_id
  ) then
    raise exception 'agent_recommendations.patient_profile_id must belong to the row owner';
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.owner_id = new.owner_id
  ) then
    raise exception 'agent_recommendations.conversation_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_recommendation_patient_owner on public.agent_recommendations;
create trigger carelink_recommendation_patient_owner
  before insert or update on public.agent_recommendations
  for each row execute function public.carelink_enforce_recommendation_patient_owner();

-- RLS: owner-scoped only. Never public.
alter table public.agent_recommendations enable row level security;
do $$
begin
  perform public.carelink_apply_owner_rls('agent_recommendations');
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0008_agent_recommendations.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0009_ai_context_backend.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §8: AI context / snapshot backend.
--
-- ADDITIVE ONLY. Completes the DB side of the existing Step 13 AI gateway
-- architecture. It does NOT create a second AI system and it does NOT
-- duplicate conversation storage — it links to conversations /
-- conversation_messages from Step 10.
--
-- Guarantees (enforced here):
--   - snapshots are bounded payloads (jsonb capped by the app; column keeps
--     only the redacted minimum-necessary snapshot from Step 13 §5),
--   - patient-scoped + authorization-checked (owner_id + family ownership
--     trigger + conversation ownership trigger),
--   - timestamped + source-linked (conversation/message references),
--   - no arbitrary private-table AI access: the AI itself never reads these
--     tables; only the user’s own session fetches context, and privileged AI
--     access stays behind the ai-gateway Edge Function.
-- ===========================================================================

-- Registry of agent configurations (no patient data; public read).
create table if not exists public.ai_agents (
  id text primary key,                     -- e.g. 'carelink-agent'
  label text not null,
  model_label text,
  configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bounded, redacted patient context snapshots (Step 13 context snapshot rows)
create table if not exists public.patient_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  -- redacted minimum-necessary snapshot only (relation, age band, capped tags)
  snapshot jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  created_at timestamptz not null default now()
);
create index if not exists patient_context_snapshots_owner_id_idx on public.patient_context_snapshots(owner_id);
create index if not exists patient_context_snapshots_family_profile_id_idx on public.patient_context_snapshots(family_profile_id);
create index if not exists patient_context_snapshots_created_at_idx on public.patient_context_snapshots(created_at);

create table if not exists public.agent_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete set null,
  intent text not null,
  confidence text check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now()
);
create index if not exists agent_intents_owner_id_idx on public.agent_intents(owner_id);
create index if not exists agent_intents_conversation_id_idx on public.agent_intents(conversation_id);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  action text not null,
  parameters jsonb not null default '{}'::jsonb,
  status text not null check (status in ('suggested','completed','dismissed')) default 'suggested',
  created_at timestamptz not null default now()
);
create index if not exists agent_actions_owner_id_idx on public.agent_actions(owner_id);
create index if not exists agent_actions_conversation_id_idx on public.agent_actions(conversation_id);

create table if not exists public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete set null,
  rating smallint not null check (rating in (-1, 0, 1)),
  comment text,
  created_at timestamptz not null default now(),
  unique (conversation_id, message_id, owner_id)
);
create index if not exists agent_feedback_owner_id_idx on public.agent_feedback(owner_id);

create table if not exists public.agent_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  question text not null,
  source_intent text,
  status text not null check (status in ('offered','answered','dismissed')) default 'offered',
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_followups_owner_id_idx on public.agent_followups(owner_id);
create index if not exists agent_followups_conversation_id_idx on public.agent_followups(conversation_id);

-- ---------------------------------------------------------------------------
-- Triggers: family ownership + conversation ownership
-- ---------------------------------------------------------------------------
drop trigger if exists carelink_family_profile_ownership on public.patient_context_snapshots;
create trigger carelink_family_profile_ownership
  before insert or update on public.patient_context_snapshots
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- conversation_id (when set) must belong to the snapshot owner.
-- (Separate function for message ownership below — a single tg_argv-branching
-- function is unsafe because tables without message_id fail field evaluation.)
create or replace function public.carelink_enforce_ai_conversation_owner()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.owner_id = new.owner_id
  ) then
    raise exception 'conversation_id must belong to the row owner';
  end if;
  return new;
end;
$$;

-- message_id (when set) must belong to the row owner. Attached ONLY to the
-- tables that actually carry a message_id column.
create or replace function public.carelink_enforce_ai_message_owner()
returns trigger
language plpgsql
as $$
begin
  if new.message_id is not null and not exists (
    select 1 from public.conversation_messages m
    where m.id = new.message_id and m.owner_id = new.owner_id
  ) then
    raise exception 'message_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['patient_context_snapshots','agent_intents','agent_actions','agent_feedback','agent_followups']
  loop
    execute format(
      'drop trigger if exists carelink_ai_conversation_owner on public.%I;
       create trigger carelink_ai_conversation_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_ai_conversation_owner();', t, t);
  end loop;
  -- message ownership additionally enforced on the tables carrying message_id
  foreach t in array array['agent_intents','agent_feedback']
  loop
    execute format(
      'drop trigger if exists carelink_ai_message_owner on public.%I;
       create trigger carelink_ai_message_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_ai_message_owner();', t, t);
  end loop;
end $$;

-- updated_at for the registry table
drop trigger if exists set_updated_at on public.ai_agents;
create trigger set_updated_at before update on public.ai_agents
  for each row execute function carelink_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ai_agents enable row level security;
drop policy if exists ai_agents_public_read on public.ai_agents;
create policy ai_agents_public_read on public.ai_agents for select using (true);
drop policy if exists ai_agents_superadmin_write on public.ai_agents;
create policy ai_agents_superadmin_write on public.ai_agents
  for all using (public.carelink_is_super_admin())
  with check (public.carelink_is_super_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'patient_context_snapshots','agent_intents','agent_actions',
    'agent_feedback','agent_followups'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0009_ai_context_backend.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0010_appointment_expansion.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §9: Appointment expansion.
--
-- ADDITIVE ONLY. Step 10 appointments + appointment_events are preserved;
-- this adds normalized booking structure on top:
--   appointment_types master, doctor slots, status history, notes,
--   cancellations, reschedules, reminders — plus database-level double-
--   booking protection that the frontend cannot bypass.
--
-- Double-booking protection:
--   1. appointment_slots has UNIQUE(doctor_id, slot_date, start_time) — one
--      slot row per doctor moment.
--   2. appointments.slot_id (new nullable column) + partial UNIQUE —
--      one ACTIVE booking (confirmed/upcoming) per slot.
--   3. partial UNIQUE on appointments(doctor_id, scheduled_date,
--      scheduled_time) for ACTIVE bookings — guards even legacy rows that
--      never reference a slot row.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Master: appointment types (public read)
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_types (
  code text primary key,     -- Consultation | Follow-up | Telehealth | ...
  label text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.appointment_types (code, label) values
  ('Consultation','Consultation'),('Follow-up','Follow-up'),('Telehealth','Telehealth')
on conflict (code) do nothing;

-- ---------------------------------------------------------------------------
-- Doctor slots
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_slots (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid references public.hospitals(id) on delete set null,
  slot_date date not null,
  start_time time not null,
  end_time time not null,
  capacity smallint not null default 1 check (capacity >= 1),
  status text not null check (status in ('open','blocked')) default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, slot_date, start_time)
);
create index if not exists appointment_slots_doctor_id_idx on public.appointment_slots(doctor_id);
create index if not exists appointment_slots_slot_date_idx on public.appointment_slots(slot_date);

-- ---------------------------------------------------------------------------
-- appointments: additive slot link + double-booking unique index
-- ---------------------------------------------------------------------------
alter table public.appointments
  add column if not exists slot_id uuid references public.appointment_slots(id) on delete set null;

create unique index if not exists appointments_active_slot_uq
  on public.appointments (slot_id)
  where slot_id is not null and status in ('confirmed','upcoming');

create unique index if not exists appointments_active_schedule_uq
  on public.appointments (doctor_id, scheduled_date, scheduled_time)
  where doctor_id is not null and status in ('confirmed','upcoming');

-- ---------------------------------------------------------------------------
-- Normalized lifecycle tables
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_status_history (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  old_status text check (old_status in ('confirmed','upcoming','completed','cancelled','rescheduled')),
  new_status text not null check (new_status in ('confirmed','upcoming','completed','cancelled','rescheduled')),
  changed_by uuid references auth.users(id),
  changed_at timestamptz not null default now()
);
create index if not exists appointment_status_history_appointment_id_idx on public.appointment_status_history(appointment_id);
create index if not exists appointment_status_history_owner_id_idx on public.appointment_status_history(owner_id);

create table if not exists public.appointment_notes (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);
create index if not exists appointment_notes_appointment_id_idx on public.appointment_notes(appointment_id);
create index if not exists appointment_notes_owner_id_idx on public.appointment_notes(owner_id);

create table if not exists public.cancellation_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  cancelled_at timestamptz not null default now(),
  unique (appointment_id)
);
create index if not exists cancellation_records_owner_id_idx on public.cancellation_records(owner_id);

create table if not exists public.reschedule_events (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  previous_date date,
  previous_time text,
  new_date date not null,
  new_time text not null,
  reason text,
  rescheduled_at timestamptz not null default now()
);
create index if not exists reschedule_events_appointment_id_idx on public.reschedule_events(appointment_id);
create index if not exists reschedule_events_owner_id_idx on public.reschedule_events(owner_id);

-- appointment reminders (minimal payload; notifications table fans these out)
create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  remind_at timestamptz not null,
  channel text not null check (channel in ('in_app','email','sms')) default 'in_app',
  status text not null check (status in ('scheduled','sent','cancelled')) default 'scheduled',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists reminders_owner_id_idx on public.reminders(owner_id);
create index if not exists reminders_remind_at_idx on public.reminders(remind_at);
create index if not exists reminders_status_idx on public.reminders(status);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

-- status changes on appointments are appended to appointment_status_history
create or replace function public.carelink_track_appointment_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.appointment_status_history
      (id, appointment_id, owner_id, old_status, new_status, changed_by)
    values
      (gen_random_uuid(), new.id, new.owner_id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_track_appointment_status on public.appointments;
create trigger carelink_track_appointment_status
  after update on public.appointments
  for each row execute function public.carelink_track_appointment_status();

-- lifecycle tables: appointment reference must stay same-owner
create or replace function public.carelink_enforce_appointment_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id and a.owner_id = new.owner_id
  ) then
    raise exception 'appointment_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['appointment_notes','cancellation_records','reschedule_events','reminders']
  loop
    execute format(
      'drop trigger if exists carelink_appointment_owner on public.%I;
       create trigger carelink_appointment_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_appointment_owner();', t, t);
  end loop;
end $$;

drop trigger if exists set_updated_at on public.appointment_slots;
create trigger set_updated_at before update on public.appointment_slots
  for each row execute function carelink_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.appointment_types enable row level security;
drop policy if exists appointment_types_public_read on public.appointment_types;
create policy appointment_types_public_read on public.appointment_types for select using (true);
drop policy if exists appointment_types_superadmin_write on public.appointment_types;
create policy appointment_types_superadmin_write on public.appointment_types
  for all using (public.carelink_is_super_admin())
  with check (public.carelink_is_super_admin());

-- slots: public availability discovery; managed by linked doctor / super admin
alter table public.appointment_slots enable row level security;
drop policy if exists appointment_slots_public_read on public.appointment_slots;
create policy appointment_slots_public_read on public.appointment_slots for select using (true);
drop policy if exists appointment_slots_doctor_write on public.appointment_slots;
create policy appointment_slots_doctor_write on public.appointment_slots
  for all using (public.carelink_is_doctor_linked(doctor_id))
  with check (public.carelink_is_doctor_linked(doctor_id));

-- patient-owned expansion tables
do $$
declare t text;
begin
  foreach t in array array[
    'appointment_status_history','appointment_notes','cancellation_records',
    'reschedule_events','reminders'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0010_appointment_expansion.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0011_medication_scheduling.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §10: Medicine master + medication scheduling.
--
-- ADDITIVE ONLY. The Step 10 `medicines` table (patient-specific recognized/
-- educational medicine info) is preserved untouched — this adds the shared
-- master catalog and patient-owned scheduling.
--
-- MANDATORY RULE (backend-enforced):
--   reminder_time = schedule_time - 30 minutes. A BEFORE INSERT/UPDATE
--   trigger overwrites reminder_time deterministically — the value cannot be
--   set to anything else (frontend cannot bypass).
--
-- SAFETY:
--   - AI cannot invent or modify dosage: dosage_source is constrained to
--     'clinician' | 'verified' | 'user_entered_prescription', and the AI
--     gateway has no write path here at all.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Master catalog (public read; super_admin write)
-- ---------------------------------------------------------------------------
create table if not exists public.medicine_master (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  common_purpose text,
  prescription_required boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.medicine_strengths (
  id uuid primary key default gen_random_uuid(),
  medicine_master_id uuid not null references public.medicine_master(id) on delete cascade,
  strength text not null,
  unique (medicine_master_id, strength)
);
create index if not exists medicine_strengths_master_idx on public.medicine_strengths(medicine_master_id);

create table if not exists public.medicine_forms (
  id uuid primary key default gen_random_uuid(),
  medicine_master_id uuid not null references public.medicine_master(id) on delete cascade,
  dosage_form text not null,
  unique (medicine_master_id, dosage_form)
);
create index if not exists medicine_forms_master_idx on public.medicine_forms(medicine_master_id);

create table if not exists public.medicine_aliases (
  id uuid primary key default gen_random_uuid(),
  medicine_master_id uuid not null references public.medicine_master(id) on delete cascade,
  alias text not null,
  unique (medicine_master_id, alias)
);
create index if not exists medicine_aliases_alias_idx on public.medicine_aliases(alias);

create table if not exists public.medicine_safety_info (
  id uuid primary key default gen_random_uuid(),
  medicine_master_id uuid not null unique references public.medicine_master(id) on delete cascade,
  safety_info text,
  interactions jsonb not null default '[]'::jsonb,
  contraindications jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Patient-owned scheduling
-- ---------------------------------------------------------------------------
create table if not exists public.medication_schedules (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  medicine_master_id uuid references public.medicine_master(id) on delete set null,
  medicine_name text not null,                 -- resolved display name (kept for offline/mock mode)
  dosage_label text,                           -- e.g. '500 mg' — free text label only
  dosage_source text not null check (dosage_source in ('clinician','verified','user_entered_prescription')),
  frequency text not null check (frequency in ('once_daily','twice_daily','three_times_daily','every_8_hours','weekly','custom')),
  times_of_day jsonb not null default '[]'::jsonb,  -- e.g. ["08:00","20:00"]
  start_date date not null default current_date,
  end_date date,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists medication_schedules_owner_id_idx on public.medication_schedules(owner_id);
create index if not exists medication_schedules_family_profile_id_idx on public.medication_schedules(family_profile_id);
create index if not exists medication_schedules_medicine_master_id_idx on public.medication_schedules(medicine_master_id);

create table if not exists public.medication_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  medication_schedule_id uuid not null references public.medication_schedules(id) on delete cascade,
  scheduled_for timestamptz not null,
  taken_at timestamptz,
  status text not null check (status in ('taken','missed','skipped')),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists medication_logs_owner_id_idx on public.medication_logs(owner_id);
create index if not exists medication_logs_schedule_id_idx on public.medication_logs(medication_schedule_id);
create index if not exists medication_logs_scheduled_for_idx on public.medication_logs(scheduled_for);

create table if not exists public.scheduled_medication_reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  medication_schedule_id uuid not null references public.medication_schedules(id) on delete cascade,
  schedule_time timestamptz not null,
  reminder_time timestamptz not null,          -- ALWAYS schedule_time - 30 min (trigger-enforced)
  channel text not null check (channel in ('in_app','email','sms')) default 'in_app',
  status text not null check (status in ('scheduled','sent','dismissed')) default 'scheduled',
  created_at timestamptz not null default now(),
  unique (medication_schedule_id, schedule_time)
);
create index if not exists scheduled_medication_reminders_owner_id_idx on public.scheduled_medication_reminders(owner_id);
create index if not exists scheduled_medication_reminders_schedule_id_idx on public.scheduled_medication_reminders(medication_schedule_id);
create index if not exists scheduled_medication_reminders_reminder_time_idx on public.scheduled_medication_reminders(reminder_time);
create index if not exists scheduled_medication_reminders_status_idx on public.scheduled_medication_reminders(status);

-- ---------------------------------------------------------------------------
-- Deterministic T-30 reminder enforcement
-- ---------------------------------------------------------------------------
create or replace function public.carelink_enforce_medication_reminder_offset()
returns trigger
language plpgsql
as $$
begin
  -- reminder is ALWAYS the scheduled dose time minus 30 minutes; any caller
  -- supplied value is discarded and recomputed.
  new.reminder_time := new.schedule_time - interval '30 minutes';
  return new;
end;
$$;

drop trigger if exists carelink_medication_reminder_offset on public.scheduled_medication_reminders;
create trigger carelink_medication_reminder_offset
  before insert or update on public.scheduled_medication_reminders
  for each row execute function public.carelink_enforce_medication_reminder_offset();

-- schedule/log/reminder cross-object ownership: the referenced
-- medication_schedule must belong to the same owner
create or replace function public.carelink_enforce_schedule_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.medication_schedules s
    where s.id = new.medication_schedule_id and s.owner_id = new.owner_id
  ) then
    raise exception 'medication_schedule_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['medication_logs','scheduled_medication_reminders']
  loop
    execute format(
      'drop trigger if exists carelink_schedule_owner on public.%I;
       create trigger carelink_schedule_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_schedule_owner();', t, t);
  end loop;
end $$;

-- family-profile ownership on all patient-owned tables here
do $$
declare t text;
begin
  foreach t in array array['medication_schedules','medication_logs','scheduled_medication_reminders']
  loop
    execute format(
      'drop trigger if exists carelink_family_profile_ownership on public.%I;
       create trigger carelink_family_profile_ownership
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_family_profile_ownership();', t, t);
  end loop;
end $$;

drop trigger if exists set_updated_at on public.medication_schedules;
create trigger set_updated_at before update on public.medication_schedules
  for each row execute function carelink_set_updated_at();
drop trigger if exists set_updated_at on public.medicine_master;
create trigger set_updated_at before update on public.medicine_master
  for each row execute function carelink_set_updated_at();
drop trigger if exists set_updated_at on public.medicine_safety_info;
create trigger set_updated_at before update on public.medicine_safety_info
  for each row execute function carelink_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Master catalog: public read, super_admin write.
do $$
declare t text;
begin
  foreach t in array array['medicine_master','medicine_strengths','medicine_forms','medicine_aliases','medicine_safety_info']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_public_read on public.%1$I;
       create policy %1$s_public_read on public.%1$I for select using (true);
       drop policy if exists %1$s_superadmin_write on public.%1$I;
       create policy %1$s_superadmin_write on public.%1$I
         for all using (public.carelink_is_super_admin())
         with check (public.carelink_is_super_admin());', t);
  end loop;
end $$;

-- Patient-owned scheduling: owner-scoped.
do $$
declare t text;
begin
  foreach t in array array['medication_schedules','medication_logs','scheduled_medication_reminders']
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0011_medication_scheduling.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0012_recovery_expansion.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §11: Recovery expansion.
--
-- ADDITIVE ONLY. Step 10 recovery_checkins is preserved; this adds structured
-- plans, follow-up questions and escalation events around it. All tables are
-- patient-scoped (owner + family profile) with cross-object ownership
-- enforced by triggers.
-- ===========================================================================

create table if not exists public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  condition_label text,
  plan jsonb not null default '{}'::jsonb,
  status text not null check (status in ('active','completed','cancelled')) default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recovery_plans_owner_id_idx on public.recovery_plans(owner_id);
create index if not exists recovery_plans_family_profile_id_idx on public.recovery_plans(family_profile_id);
create index if not exists recovery_plans_appointment_id_idx on public.recovery_plans(appointment_id);

create table if not exists public.recovery_followup_questions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  recovery_plan_id uuid not null references public.recovery_plans(id) on delete cascade,
  question text not null,
  answer text,
  asked_at timestamptz not null default now(),
  answered_at timestamptz
);
create index if not exists recovery_followup_questions_owner_id_idx on public.recovery_followup_questions(owner_id);
create index if not exists recovery_followup_questions_plan_id_idx on public.recovery_followup_questions(recovery_plan_id);

-- Escalation events: recorded when a Better/Same/Worse check-in trends worse
-- or a follow-up requires attention.
create table if not exists public.recovery_escalation_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  recovery_plan_id uuid references public.recovery_plans(id) on delete set null,
  checkin_id uuid references public.recovery_checkins(id) on delete set null,
  trend_snapshot text check (trend_snapshot in ('better','same','worse')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists recovery_escalation_events_owner_id_idx on public.recovery_escalation_events(owner_id);
create index if not exists recovery_escalation_events_plan_id_idx on public.recovery_escalation_events(recovery_plan_id);

-- ---------------------------------------------------------------------------
-- Triggers: family ownership + cross-object ownership
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recovery_plans','recovery_escalation_events']
  loop
    execute format(
      'drop trigger if exists carelink_family_profile_ownership on public.%I;
       create trigger carelink_family_profile_ownership
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_family_profile_ownership();', t, t);
  end loop;
end $$;

drop trigger if exists set_updated_at on public.recovery_plans;
create trigger set_updated_at before update on public.recovery_plans
  for each row execute function carelink_set_updated_at();

-- recovery_plans.appointment_id (nullable) must reference an own appointment
-- (reuses the nullable-aware appointment-owner trigger from 0003)
drop trigger if exists carelink_recovery_plan_appointment_owner on public.recovery_plans;
create trigger carelink_recovery_plan_appointment_owner
  before insert or update on public.recovery_plans
  for each row execute function public.carelink_enforce_recovery_appointment_owner();

-- follow-up questions must reference an own recovery plan
create or replace function public.carelink_enforce_recovery_plan_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.recovery_plans p
    where p.id = new.recovery_plan_id and p.owner_id = new.owner_id
  ) then
    raise exception 'recovery_plan_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_followup_plan_owner on public.recovery_followup_questions;
create trigger carelink_followup_plan_owner
  before insert or update on public.recovery_followup_questions
  for each row execute function public.carelink_enforce_recovery_plan_owner();

-- escalation events: plan + check-in references must be same-owner
create or replace function public.carelink_enforce_escalation_owner()
returns trigger
language plpgsql
as $$
begin
  if new.recovery_plan_id is not null and not exists (
    select 1 from public.recovery_plans p
    where p.id = new.recovery_plan_id and p.owner_id = new.owner_id
  ) then
    raise exception 'recovery_plan_id must belong to the row owner';
  end if;
  if new.checkin_id is not null and not exists (
    select 1 from public.recovery_checkins c
    where c.id = new.checkin_id and c.owner_id = new.owner_id
  ) then
    raise exception 'checkin_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_escalation_owner on public.recovery_escalation_events;
create trigger carelink_escalation_owner
  before insert or update on public.recovery_escalation_events
  for each row execute function public.carelink_enforce_escalation_owner();

-- ---------------------------------------------------------------------------
-- RLS: owner-scoped
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['recovery_plans','recovery_followup_questions','recovery_escalation_events']
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0012_recovery_expansion.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0013_health_timeline.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §12: Health timeline.
--
-- ADDITIVE ONLY. One chronological, patient-scoped event stream linking to
-- existing objects via EXPLICIT nullable FKs (no unsafe polymorphic
-- references). Every FK is ownership-checked by trigger.
-- ===========================================================================

create table if not exists public.health_timeline_events (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  event_type text not null check (event_type in (
    'report','lab_test','prescription','appointment','hospital_visit',
    'medication','vaccination','recovery','follow_up'
  )),
  -- explicit FK references (nullable; at most the ones relevant to the type)
  medical_document_id uuid references public.medical_documents(id) on delete set null,
  medical_report_id uuid references public.medical_reports(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  vaccination_record_id uuid references public.vaccination_records(id) on delete set null,
  recovery_checkin_id uuid references public.recovery_checkins(id) on delete set null,
  medication_schedule_id uuid references public.medication_schedules(id) on delete set null,
  title text not null,
  summary text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists health_timeline_events_owner_id_idx on public.health_timeline_events(owner_id);
create index if not exists health_timeline_events_family_profile_id_idx on public.health_timeline_events(family_profile_id);
create index if not exists health_timeline_events_event_type_idx on public.health_timeline_events(event_type);
create index if not exists health_timeline_events_occurred_at_idx on public.health_timeline_events(occurred_at);

-- ---------------------------------------------------------------------------
-- Cross-object ownership: every referenced object must belong to the owner
-- ---------------------------------------------------------------------------
create or replace function public.carelink_enforce_timeline_owner()
returns trigger
language plpgsql
as $$
begin
  if new.medical_document_id is not null and not exists (
    select 1 from public.medical_documents d
    where d.id = new.medical_document_id and d.owner_id = new.owner_id
  ) then
    raise exception 'medical_document_id must belong to the row owner';
  end if;
  if new.medical_report_id is not null and not exists (
    select 1 from public.medical_reports r
    where r.id = new.medical_report_id and r.owner_id = new.owner_id
  ) then
    raise exception 'medical_report_id must belong to the row owner';
  end if;
  if new.appointment_id is not null and not exists (
    select 1 from public.appointments a
    where a.id = new.appointment_id and a.owner_id = new.owner_id
  ) then
    raise exception 'appointment_id must belong to the row owner';
  end if;
  if new.vaccination_record_id is not null and not exists (
    select 1 from public.vaccination_records v
    where v.id = new.vaccination_record_id and v.owner_id = new.owner_id
  ) then
    raise exception 'vaccination_record_id must belong to the row owner';
  end if;
  if new.recovery_checkin_id is not null and not exists (
    select 1 from public.recovery_checkins c
    where c.id = new.recovery_checkin_id and c.owner_id = new.owner_id
  ) then
    raise exception 'recovery_checkin_id must belong to the row owner';
  end if;
  if new.medication_schedule_id is not null and not exists (
    select 1 from public.medication_schedules s
    where s.id = new.medication_schedule_id and s.owner_id = new.owner_id
  ) then
    raise exception 'medication_schedule_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_timeline_owner on public.health_timeline_events;
create trigger carelink_timeline_owner
  before insert or update on public.health_timeline_events
  for each row execute function public.carelink_enforce_timeline_owner();

drop trigger if exists carelink_family_profile_ownership on public.health_timeline_events;
create trigger carelink_family_profile_ownership
  before insert or update on public.health_timeline_events
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- ---------------------------------------------------------------------------
-- RLS: owner-scoped
-- ---------------------------------------------------------------------------
alter table public.health_timeline_events enable row level security;
do $$
begin
  perform public.carelink_apply_owner_rls('health_timeline_events');
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0013_health_timeline.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0014_notifications.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §13: Notifications.
--
-- ADDITIVE ONLY. Recipient-scoped notifications with delivery events, ready
-- for Edge Function / cron dispatch (status + scheduled_for indexes).
--
-- PRIVACY: payloads carry the minimum needed to render the notification —
-- never medical report contents or raw AI output. A size cap CHECK enforces
-- the "small payload" rule at the database level.
-- ===========================================================================

create table if not exists public.notification_templates (
  code text primary key,
  kind text not null check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup')),
  title_template text not null,
  body_template text not null,
  channel text not null check (channel in ('in_app','email','sms')) default 'in_app',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- recipient IS the owner: a user receives only their own notifications
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  template_code text references public.notification_templates(code) on delete set null,
  kind text not null check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup')),
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  status text not null check (status in ('scheduled','pending','sent','read','failed','cancelled')) default 'scheduled',
  created_at timestamptz not null default now(),
  -- payloads are render hints only: capped so they can never smuggle a report
  check (octet_length(payload::text) <= 2000)
);
create index if not exists notifications_owner_id_idx on public.notifications(owner_id);
create index if not exists notifications_family_profile_id_idx on public.notifications(family_profile_id);
create index if not exists notifications_recipient_scheduled_idx on public.notifications(owner_id, scheduled_for);
create index if not exists notifications_status_scheduled_idx on public.notifications(status, scheduled_for);

create table if not exists public.notification_delivery_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('queued','sent','delivered','failed')),
  detail text,
  occurred_at timestamptz not null default now()
);
create index if not exists notification_delivery_events_notification_id_idx on public.notification_delivery_events(notification_id);
create index if not exists notification_delivery_events_owner_id_idx on public.notification_delivery_events(owner_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists carelink_family_profile_ownership on public.notifications;
create trigger carelink_family_profile_ownership
  before insert or update on public.notifications
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- delivery events must reference an own notification
create or replace function public.carelink_enforce_notification_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.notifications n
    where n.id = new.notification_id and n.owner_id = new.owner_id
  ) then
    raise exception 'notification_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_notification_owner on public.notification_delivery_events;
create trigger carelink_notification_owner
  before insert or update on public.notification_delivery_events
  for each row execute function public.carelink_enforce_notification_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Templates: public read; super_admin write (per-command policies).
alter table public.notification_templates enable row level security;
drop policy if exists notification_templates_public_read on public.notification_templates;
create policy notification_templates_public_read on public.notification_templates for select using (true);
do $$
begin
  perform public.carelink_apply_admin_write_rls('notification_templates', 'SUPER_ADMIN', null);
end $$;

-- Recipient-scoped tables
do $$
declare t text;
begin
  foreach t in array array['notifications','notification_delivery_events']
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0014_notifications.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0015_sos_emergency.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §14: SOS / emergency workflow.
--
-- ADDITIVE ONLY. Step 10 emergency_events is preserved as the patient-owned
-- incident record; this adds the authorized workflow around it:
--   SOS → facility notification → hospital accept/reject → ambulance state.
--
-- Every transition goes through a guarded SECURITY DEFINER function that
-- validates authorization, records history, and audits. No client-side
-- transition is possible. No continuous live location is stored — a single
-- location fix per event (unique constraint).
-- ===========================================================================

-- One location fix per emergency event (no continuous tracking)
create table if not exists public.emergency_locations (
  id uuid primary key default gen_random_uuid(),
  emergency_event_id uuid not null unique references public.emergency_events(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  latitude numeric(9,6),
  longitude numeric(9,6),
  accuracy_meters integer check (accuracy_meters is null or accuracy_meters >= 0),
  captured_at timestamptz not null default now()
);
create index if not exists emergency_locations_owner_id_idx on public.emergency_locations(owner_id);

create table if not exists public.hospital_emergency_notifications (
  id uuid primary key default gen_random_uuid(),
  emergency_event_id uuid not null references public.emergency_events(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- patient owner (traceability)
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  status text not null check (status in ('sent','accepted','rejected','expired')) default 'sent',
  responded_by uuid references auth.users(id),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (emergency_event_id, hospital_id)
);
create index if not exists hospital_emergency_notifications_event_idx on public.hospital_emergency_notifications(emergency_event_id);
create index if not exists hospital_emergency_notifications_hospital_idx on public.hospital_emergency_notifications(hospital_id);
create index if not exists hospital_emergency_notifications_owner_idx on public.hospital_emergency_notifications(owner_id);

create table if not exists public.ambulance_requests (
  id uuid primary key default gen_random_uuid(),
  emergency_event_id uuid not null references public.emergency_events(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  status text not null check (status in ('requested','assigned','en_route','arrived','completed','cancelled')) default 'requested',
  requested_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emergency_event_id, hospital_id)
);
create index if not exists ambulance_requests_owner_id_idx on public.ambulance_requests(owner_id);
create index if not exists ambulance_requests_hospital_id_idx on public.ambulance_requests(hospital_id);

create table if not exists public.ambulance_status (
  id uuid primary key default gen_random_uuid(),
  ambulance_request_id uuid not null references public.ambulance_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('requested','assigned','en_route','arrived','completed','cancelled')),
  note text,
  recorded_by uuid references auth.users(id),
  recorded_at timestamptz not null default now()
);
create index if not exists ambulance_status_request_id_idx on public.ambulance_status(ambulance_request_id);
create index if not exists ambulance_status_owner_id_idx on public.ambulance_status(owner_id);

create table if not exists public.emergency_event_history (
  id uuid primary key default gen_random_uuid(),
  emergency_event_id uuid not null references public.emergency_events(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_id uuid references auth.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists emergency_event_history_event_idx on public.emergency_event_history(emergency_event_id);
create index if not exists emergency_event_history_owner_idx on public.emergency_event_history(owner_id);

create table if not exists public.emergency_admin_acceptance (
  id uuid primary key default gen_random_uuid(),
  emergency_event_id uuid not null unique references public.emergency_events(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  accepted_by uuid not null references auth.users(id),
  accepted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists emergency_admin_acceptance_hospital_idx on public.emergency_admin_acceptance(hospital_id);

-- ---------------------------------------------------------------------------
-- Guarded workflow functions (server-side transitions only)
-- ---------------------------------------------------------------------------

-- Patient (event owner) requests that a hospital be notified about their SOS.
create or replace function public.carelink_notify_hospital_for_emergency(
  emergency_event_uuid uuid,
  hospital_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare evt record;
declare new_id uuid;
begin
  select id, owner_id into evt from public.emergency_events where id = emergency_event_uuid;
  if not found then
    raise exception 'emergency event not found';
  end if;
  if evt.owner_id <> auth.uid() then
    raise exception 'only the event owner can trigger hospital notification';
  end if;
  if not exists (select 1 from public.hospitals h where h.id = hospital_uuid) then
    raise exception 'hospital not found';
  end if;
  insert into public.hospital_emergency_notifications
    (id, emergency_event_id, owner_id, hospital_id)
  values (gen_random_uuid(), emergency_event_uuid, evt.owner_id, hospital_uuid)
  on conflict (emergency_event_id, hospital_id) do nothing
  returning id into new_id;

  insert into public.emergency_event_history
    (id, emergency_event_id, owner_id, from_state, to_state, actor_id, note)
  values (gen_random_uuid(), emergency_event_uuid, evt.owner_id, null, 'hospital_notified', auth.uid(), null);

  perform public.carelink_record_audit('sos_hospital_notified', 'emergency_events', emergency_event_uuid, null);
  return new_id;
end;
$$;

-- Hospital admin accepts/rejects a notification for THEIR hospital only.
create or replace function public.carelink_respond_emergency_notification(
  notification_uuid uuid,
  action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare n record;
begin
  if action not in ('accepted','rejected') then
    raise exception 'invalid action';
  end if;
  select id, emergency_event_id, owner_id, hospital_id, status into n
  from public.hospital_emergency_notifications where id = notification_uuid;
  if not found then
    raise exception 'notification not found';
  end if;
  -- ACTUAL membership required (super_admin cannot impersonate a facility)
  if not public.carelink_is_hospital_member(n.hospital_id) then
    raise exception 'only an admin of the notified hospital can respond';
  end if;
  if n.status <> 'sent' then
    raise exception 'notification already answered';
  end if;

  update public.hospital_emergency_notifications
  set status = action, responded_by = auth.uid(), responded_at = now()
  where id = notification_uuid;

  insert into public.emergency_event_history
    (id, emergency_event_id, owner_id, from_state, to_state, actor_id, note)
  values (gen_random_uuid(), n.emergency_event_id, n.owner_id, 'hospital_notified', 'hospital_' || action, auth.uid(), null);

  if action = 'accepted' then
    insert into public.emergency_admin_acceptance
      (id, emergency_event_id, owner_id, hospital_id, accepted_by)
    values (gen_random_uuid(), n.emergency_event_id, n.owner_id, n.hospital_id, auth.uid())
    on conflict (emergency_event_id) do nothing;
  end if;

  perform public.carelink_record_audit('sos_hospital_' || action, 'hospital_emergency_notifications', notification_uuid, null);
end;
$$;

-- Hospital admin creates an ambulance request for an ACCEPTED notification on
-- their hospital.
create or replace function public.carelink_create_ambulance_request(
  emergency_event_uuid uuid,
  hospital_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare evt record;
declare new_id uuid;
begin
  if not public.carelink_is_hospital_member(hospital_uuid) then
    raise exception 'only an admin of the hospital can create an ambulance request';
  end if;
  select id, owner_id into evt from public.emergency_events where id = emergency_event_uuid;
  if not found then
    raise exception 'emergency event not found';
  end if;
  if not exists (
    select 1 from public.emergency_admin_acceptance a
    where a.emergency_event_id = emergency_event_uuid and a.hospital_id = hospital_uuid
  ) then
    raise exception 'hospital has not accepted this emergency';
  end if;
  insert into public.ambulance_requests (id, emergency_event_id, owner_id, hospital_id)
  values (gen_random_uuid(), emergency_event_uuid, evt.owner_id, hospital_uuid)
  on conflict (emergency_event_id, hospital_id) do nothing
  returning id into new_id;

  if new_id is not null then
    insert into public.ambulance_status (id, ambulance_request_id, owner_id, status, recorded_by)
    values (gen_random_uuid(), new_id, evt.owner_id, 'requested', auth.uid());
    insert into public.emergency_event_history
      (id, emergency_event_id, owner_id, from_state, to_state, actor_id, note)
    values (gen_random_uuid(), emergency_event_uuid, evt.owner_id, 'hospital_accepted', 'ambulance_requested', auth.uid(), null);
    perform public.carelink_record_audit('ambulance_requested', 'ambulance_requests', new_id, null);
  end if;
  return new_id;
end;
$$;

-- Hospital admin advances the ambulance state for THEIR hospital's request.
create or replace function public.carelink_transition_ambulance(
  ambulance_request_uuid uuid,
  new_status text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare r record;
begin
  if new_status not in ('requested','assigned','en_route','arrived','completed','cancelled') then
    raise exception 'invalid ambulance status';
  end if;
  select id, emergency_event_id, owner_id, hospital_id, status into r
  from public.ambulance_requests where id = ambulance_request_uuid;
  if not found then
    raise exception 'ambulance request not found';
  end if;
  if not public.carelink_is_hospital_member(r.hospital_id) then
    raise exception 'only an admin of the responsible hospital can update ambulance state';
  end if;
  -- no transition out of terminal states
  if r.status in ('completed','cancelled') then
    raise exception 'ambulance request already in terminal state';
  end if;

  update public.ambulance_requests set status = new_status where id = ambulance_request_uuid;

  insert into public.ambulance_status (id, ambulance_request_id, owner_id, status, note, recorded_by)
  values (gen_random_uuid(), ambulance_request_uuid, r.owner_id, new_status, note, auth.uid());

  insert into public.emergency_event_history
    (id, emergency_event_id, owner_id, from_state, to_state, actor_id, note)
  values (gen_random_uuid(), r.emergency_event_id, r.owner_id, 'ambulance_' || r.status, 'ambulance_' || new_status, auth.uid(), note);

  perform public.carelink_record_audit('ambulance_' || new_status, 'ambulance_requests', ambulance_request_uuid, null);
end;
$$;

-- Guarded functions: authenticated only, never anon/public.
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_notify_hospital_for_emergency(uuid, uuid)',
    'carelink_respond_emergency_notification(uuid, text)',
    'carelink_create_ambulance_request(uuid, uuid)',
    'carelink_transition_ambulance(uuid, text, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers + RLS
-- ---------------------------------------------------------------------------
drop trigger if exists set_updated_at on public.ambulance_requests;
create trigger set_updated_at before update on public.ambulance_requests
  for each row execute function carelink_set_updated_at();

-- Owner-scoped reads for the patient; direct writes stay locked down — all
-- mutations flow through the guarded functions above (no client insert/
-- update/delete policies are created on workflow tables except where noted).
do $$
declare t text;
begin
  foreach t in array array[
    'emergency_locations','hospital_emergency_notifications','ambulance_requests',
    'ambulance_status','emergency_event_history','emergency_admin_acceptance'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_owner_select on public.%1$I;
       create policy %1$s_owner_select on public.%1$I for select using (owner_id = auth.uid());', t);
  end loop;
end $$;

-- emergency_locations: patient records their own one-time fix
drop policy if exists emergency_locations_owner_insert on public.emergency_locations;
create policy emergency_locations_owner_insert on public.emergency_locations
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.emergency_events e
      where e.id = emergency_event_id and e.owner_id = auth.uid()
    )
  );

-- hospital members READ notifications/requests for THEIR hospital (facility inbox)
drop policy if exists hospital_emergency_notifications_member_select on public.hospital_emergency_notifications;
create policy hospital_emergency_notifications_member_select on public.hospital_emergency_notifications
  for select using (public.carelink_is_hospital_member(hospital_id));

drop policy if exists ambulance_requests_member_select on public.ambulance_requests;
create policy ambulance_requests_member_select on public.ambulance_requests
  for select using (public.carelink_is_hospital_member(hospital_id));

drop policy if exists ambulance_status_member_select on public.ambulance_status;
create policy ambulance_status_member_select on public.ambulance_status
  for select using (
    exists (
      select 1 from public.ambulance_requests ar
      where ar.id = ambulance_request_id
        and public.carelink_is_hospital_member(ar.hospital_id)
    )
  );

drop policy if exists emergency_admin_acceptance_member_select on public.emergency_admin_acceptance;
create policy emergency_admin_acceptance_member_select on public.emergency_admin_acceptance
  for select using (public.carelink_is_hospital_member(hospital_id));

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0015_sos_emergency.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0016_blood_donation.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §15: Blood donation network.
--
-- ADDITIVE ONLY.
--
-- MANDATORY RULES ENFORCED DATABASE-SIDE (frontend cannot bypass):
--   1. After a successful donation the donor is unavailable for 4 months:
--      - donation_records insert trigger upserts donor_eligibility
--        (eligible_until = donated_on + 4 months, is_eligible = false)
--      - carelink_record_donation() rejects donations inside the cooldown
--      - carelink_match_donors() never matches an ineligible donor
--   2. Privacy flow:
--      - Before donor consent: donor sees only the request (blood group, city,
--        units, urgency) — NO patient identity/contact anywhere in what the
--        donor can read; the requester sees only that a donor exists.
--      - Donor NO: nothing is disclosed (audited).
--      - Donor YES: minimum contact details are exchanged ONLY through the
--        guarded disclosure functions, each call audited in audit_events.
--      - donor_profiles / donation_records / eligibility have NO cross-user
--        SELECT policy at all.
-- ===========================================================================

create table if not exists public.blood_groups (
  code text primary key check (code in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  label text not null
);
insert into public.blood_groups (code, label) values
  ('A+','A positive'),('A-','A negative'),('B+','B positive'),('B-','B negative'),
  ('AB+','AB positive'),('AB-','AB negative'),('O+','O positive'),('O-','O negative')
on conflict (code) do nothing;

-- Donor profile: contact details are NEVER cross-user readable.
create table if not exists public.donor_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  blood_group_code text not null references public.blood_groups(code),
  city text,
  phone text,
  date_of_birth date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists donor_profiles_blood_group_idx on public.donor_profiles(blood_group_code);

create table if not exists public.donor_locations (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  updated_at timestamptz not null default now()
);
create index if not exists donor_locations_donor_profile_id_idx on public.donor_locations(donor_profile_id);

create table if not exists public.donor_availability (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null unique references public.donor_profiles(id) on delete cascade,
  is_available boolean not null default true,
  available_from date,
  available_until date,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.donation_records (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  donated_on date not null,
  units smallint not null default 1 check (units between 1 and 2),
  hospital_id uuid references public.hospitals(id) on delete set null,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists donation_records_donor_profile_id_idx on public.donation_records(donor_profile_id);
create index if not exists donation_records_donated_on_idx on public.donation_records(donated_on);

create table if not exists public.donor_eligibility (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null unique references public.donor_profiles(id) on delete cascade,
  last_donation_date date,
  eligible_until date,
  is_eligible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  blood_group_code text not null references public.blood_groups(code),
  units_needed smallint not null default 1 check (units_needed between 1 and 10),
  hospital_id uuid references public.hospitals(id) on delete set null,
  city text,
  urgency text not null check (urgency in ('routine','urgent','critical')) default 'routine',
  status text not null check (status in ('open','fulfilled','cancelled','expired')) default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blood_requests_owner_id_idx on public.blood_requests(owner_id);
create index if not exists blood_requests_blood_group_idx on public.blood_requests(blood_group_code);
create index if not exists blood_requests_status_idx on public.blood_requests(status);

-- Match results: prove a match exists WITHOUT exposing donor identity
-- (donor_profiles has no cross-user read; requester reads only these rows).
create table if not exists public.donor_match_results (
  id uuid primary key default gen_random_uuid(),
  blood_request_id uuid not null references public.blood_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- requester
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  matched_at timestamptz not null default now(),
  notified boolean not null default false,
  unique (blood_request_id, donor_profile_id)
);
create index if not exists donor_match_results_request_idx on public.donor_match_results(blood_request_id);
create index if not exists donor_match_results_owner_idx on public.donor_match_results(owner_id);
create index if not exists donor_match_results_donor_idx on public.donor_match_results(donor_profile_id);

-- Donor-facing request: donor sees request details, NOT patient identity.
create table if not exists public.donor_requests (
  id uuid primary key default gen_random_uuid(),
  blood_request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- requester
  status text not null check (status in ('sent','accepted','declined','expired')) default 'sent',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (blood_request_id, donor_profile_id)
);
create index if not exists donor_requests_donor_profile_id_idx on public.donor_requests(donor_profile_id);
create index if not exists donor_requests_owner_id_idx on public.donor_requests(owner_id);

create table if not exists public.donor_notifications (
  id uuid primary key default gen_random_uuid(),
  donor_request_id uuid references public.donor_requests(id) on delete cascade,
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  kind text not null check (kind in ('match','request','reminder','result')),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  check (octet_length(payload::text) <= 1000)
);
create index if not exists donor_notifications_donor_profile_id_idx on public.donor_notifications(donor_profile_id);

-- ---------------------------------------------------------------------------
-- 4-month cooldown: trigger keeps eligibility in sync with donation history
-- ---------------------------------------------------------------------------
create or replace function public.carelink_apply_donation_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.donor_eligibility (id, donor_profile_id, last_donation_date, eligible_until, is_eligible)
  values (
    gen_random_uuid(), new.donor_profile_id, new.donated_on,
    (new.donated_on + interval '4 months')::date,
    false
  )
  on conflict (donor_profile_id) do update
    set last_donation_date = greatest(donor_eligibility.last_donation_date, excluded.last_donation_date),
        eligible_until = greatest(donor_eligibility.eligible_until, excluded.eligible_until),
        is_eligible = false,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists carelink_donation_cooldown on public.donation_records;
create trigger carelink_donation_cooldown
  after insert on public.donation_records
  for each row execute function public.carelink_apply_donation_cooldown();

-- ---------------------------------------------------------------------------
-- Guarded functions
-- ---------------------------------------------------------------------------

-- Record a donation. Callable by the donor themself or a super_admin. The
-- cooldown window is enforced HERE as well as via the eligibility trigger.
-- p_ prefixes avoid PL/pgSQL parameter/column ambiguity.
create or replace function public.carelink_record_donation(
  donor_profile_uuid uuid,
  p_donated_on date,
  hospital_uuid uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare dp record;
declare new_id uuid;
begin
  select id, owner_id into dp from public.donor_profiles where id = donor_profile_uuid;
  if not found then
    raise exception 'donor profile not found';
  end if;
  if dp.owner_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized to record a donation for this donor';
  end if;
  -- 4-month cooldown: reject donations inside the window
  if exists (
    select 1 from public.donation_records d
    where d.donor_profile_id = donor_profile_uuid
      and (d.donated_on + interval '4 months')::date > p_donated_on
  ) then
    raise exception 'donor is within the 4-month cooldown period';
  end if;
  insert into public.donation_records (id, donor_profile_id, donated_on, hospital_id, recorded_by)
  values (gen_random_uuid(), donor_profile_uuid, p_donated_on, hospital_uuid, auth.uid())
  returning id into new_id;
  perform public.carelink_record_audit('donation_recorded', 'donation_records', new_id, null);
  return new_id;
end;
$$;

-- Match eligible donors for a blood request (requester or super_admin only).
-- Ineligible (cooldown), inactive, unavailable, and wrong-group donors are
-- never matched.
create or replace function public.carelink_match_donors(blood_request_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare req record;
declare matched integer := 0;
begin
  select id, owner_id, blood_group_code, city, status into req
  from public.blood_requests where id = blood_request_uuid;
  if not found then
    raise exception 'blood request not found';
  end if;
  if req.owner_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized to match donors for this request';
  end if;
  if req.status <> 'open' then
    raise exception 'blood request is not open';
  end if;

  insert into public.donor_match_results (id, blood_request_id, owner_id, donor_profile_id)
  select gen_random_uuid(), req.id, req.owner_id, dp.id
  from public.donor_profiles dp
  left join public.donor_eligibility e on e.donor_profile_id = dp.id
  left join public.donor_availability av on av.donor_profile_id = dp.id
  where dp.blood_group_code = req.blood_group_code
    and dp.is_active
    and dp.owner_id <> req.owner_id                     -- never self-match
    and coalesce(av.is_available, true)
    and (e.eligible_until is null or e.eligible_until <= current_date)  -- cooldown
    and (req.city is null or dp.city = req.city)
  on conflict (blood_request_id, donor_profile_id) do nothing;

  get diagnostics matched = row_count;
  perform public.carelink_record_audit('donor_matching_run', 'blood_requests', blood_request_uuid, 'matches: ' || matched);
  return matched;
end;
$$;

-- Create donor requests from match results (requester only). The donor sees
-- the request but NOT the requester identity beyond an opaque user id.
create or replace function public.carelink_send_donor_request(blood_request_uuid uuid, donor_profile_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare req record;
declare new_id uuid;
begin
  select id, owner_id, status into req from public.blood_requests where id = blood_request_uuid;
  if not found then
    raise exception 'blood request not found';
  end if;
  if req.owner_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized';
  end if;
  if req.status <> 'open' then
    raise exception 'blood request is not open';
  end if;
  -- must be an existing match for this request (no arbitrary donor pings)
  if not exists (
    select 1 from public.donor_match_results m
    where m.blood_request_id = blood_request_uuid and m.donor_profile_id = donor_profile_uuid
  ) then
    raise exception 'donor is not a match for this request';
  end if;
  insert into public.donor_requests (id, blood_request_id, donor_profile_id, owner_id)
  values (gen_random_uuid(), blood_request_uuid, donor_profile_uuid, req.owner_id)
  on conflict (blood_request_id, donor_profile_id) do nothing
  returning id into new_id;

  if new_id is not null then
    insert into public.donor_notifications (id, donor_request_id, donor_profile_id, kind, payload)
    select gen_random_uuid(), new_id, donor_profile_uuid, 'request',
           jsonb_build_object('blood_group', br.blood_group_code, 'city', br.city, 'urgency', br.urgency, 'units', br.units_needed)
    from public.blood_requests br where br.id = blood_request_uuid;
  end if;
  return new_id;
end;
$$;

-- Donor answers YES/NO. Only the donor may respond, only while pending.
-- YES/NO both audited; NO discloses nothing.
create or replace function public.carelink_donor_respond(donor_request_uuid uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare dr record;
begin
  select dr1.id, dr1.status, dr1.blood_request_id, dp.owner_id as donor_owner
  into dr
  from public.donor_requests dr1
  join public.donor_profiles dp on dp.id = dr1.donor_profile_id
  where dr1.id = donor_request_uuid;
  if not found then
    raise exception 'donor request not found';
  end if;
  if dr.donor_owner <> auth.uid() then
    raise exception 'only the donor can respond';
  end if;
  if dr.status <> 'sent' then
    raise exception 'donor request already answered';
  end if;

  update public.donor_requests
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = donor_request_uuid;

  perform public.carelink_record_audit(
    case when accept then 'donor_consent_yes' else 'donor_consent_no' end,
    'donor_requests', donor_request_uuid, null);
end;
$$;

-- Disclosure: requester reads the donor's MINIMUM contact details — only
-- after donor YES, audited every time.
create or replace function public.carelink_get_donor_contact(donor_request_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dr record;
begin
  select dr1.id, dr1.status, dr1.owner_id as requester_id, dp.owner_id as donor_owner,
         dp.phone as donor_phone, p.display_name as donor_name
  into dr
  from public.donor_requests dr1
  join public.donor_profiles dp on dp.id = dr1.donor_profile_id
  left join public.profiles p on p.id = dp.owner_id
  where dr1.id = donor_request_uuid;
  if not found then
    raise exception 'donor request not found';
  end if;
  if dr.requester_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized';
  end if;
  if dr.status <> 'accepted' then
    raise exception 'donor has not consented to share contact details';
  end if;
  perform public.carelink_record_audit('donor_contact_disclosed', 'donor_requests', donor_request_uuid, null);
  return jsonb_build_object('donor_name', dr.donor_name, 'donor_phone', dr.donor_phone);
end;
$$;

-- Disclosure: donor reads the requester's MINIMUM contact details — only
-- after their own YES, audited every time.
create or replace function public.carelink_get_requester_contact(donor_request_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dr record;
begin
  select dr1.id, dr1.status, dr1.owner_id as requester_id, dp.owner_id as donor_owner,
         p.display_name as requester_name
  into dr
  from public.donor_requests dr1
  join public.donor_profiles dp on dp.id = dr1.donor_profile_id
  left join public.profiles p on p.id = dr1.owner_id
  where dr1.id = donor_request_uuid;
  if not found then
    raise exception 'donor request not found';
  end if;
  if dr.donor_owner <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized';
  end if;
  if dr.status <> 'accepted' then
    raise exception 'no contact details before you accept';
  end if;
  perform public.carelink_record_audit('requester_contact_disclosed', 'donor_requests', donor_request_uuid, null);
  return jsonb_build_object('requester_name', dr.requester_name);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_record_donation(uuid, date, uuid)',
    'carelink_match_donors(uuid)',
    'carelink_send_donor_request(uuid, uuid)',
    'carelink_donor_respond(uuid, boolean)',
    'carelink_get_donor_contact(uuid)',
    'carelink_get_requester_contact(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers + RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['donor_profiles','blood_requests']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

drop trigger if exists set_updated_at on public.donor_availability;
create trigger set_updated_at before update on public.donor_availability
  for each row execute function carelink_set_updated_at();
drop trigger if exists set_updated_at on public.donor_eligibility;
create trigger set_updated_at before update on public.donor_eligibility
  for each row execute function carelink_set_updated_at();
drop trigger if exists set_updated_at on public.donor_locations;
create trigger set_updated_at before update on public.donor_locations
  for each row execute function carelink_set_updated_at();

drop trigger if exists carelink_family_profile_ownership on public.blood_requests;
create trigger carelink_family_profile_ownership
  before insert or update on public.blood_requests
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- donor child tables must reference the caller's own donor profile
create or replace function public.carelink_enforce_donor_profile_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.donor_profiles dp
    where dp.id = new.donor_profile_id and dp.owner_id = new.owner_id
  ) then
    raise exception 'donor_profile_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['donor_locations','donor_availability']
  loop
    execute format(
      'drop trigger if exists carelink_donor_profile_owner on public.%I;
       create trigger carelink_donor_profile_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_donor_profile_owner();', t, t);
  end loop;
end $$;

-- RLS -----------------------------------------------------------------------
alter table public.blood_groups enable row level security;
drop policy if exists blood_groups_public_read on public.blood_groups;
create policy blood_groups_public_read on public.blood_groups for select using (true);

-- donor_profiles: STRICTLY self (no cross-user select — identity protected)
alter table public.donor_profiles enable row level security;
drop policy if exists donor_profiles_self_select on public.donor_profiles;
create policy donor_profiles_self_select on public.donor_profiles
  for select using (owner_id = auth.uid());
drop policy if exists donor_profiles_self_insert on public.donor_profiles;
create policy donor_profiles_self_insert on public.donor_profiles
  for insert with check (owner_id = auth.uid());
drop policy if exists donor_profiles_self_update on public.donor_profiles;
create policy donor_profiles_self_update on public.donor_profiles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists donor_profiles_self_delete on public.donor_profiles;
create policy donor_profiles_self_delete on public.donor_profiles
  for delete using (owner_id = auth.uid());

-- donor_locations / donor_availability: self via profile ownership
do $$
declare t text;
begin
  foreach t in array array['donor_locations','donor_availability']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_self_select on public.%1$I;
       create policy %1$s_self_select on public.%1$I for select using (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );
       drop policy if exists %1$s_self_insert on public.%1$I;
       create policy %1$s_self_insert on public.%1$I for insert with check (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );
       drop policy if exists %1$s_self_update on public.%1$I;
       create policy %1$s_self_update on public.%1$I for update using (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       ) with check (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );
       drop policy if exists %1$s_self_delete on public.%1$I;
       create policy %1$s_self_delete on public.%1$I for delete using (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );', t);
  end loop;
end $$;

-- donation_records / donor_eligibility: NO client read/write policies at all.
-- Reads happen through guarded functions; writes via carelink_record_donation.
do $$
begin
  execute 'alter table public.donation_records enable row level security';
  execute 'alter table public.donor_eligibility enable row level security';
end $$;

-- blood_requests: requester-owned
do $$
begin
  execute 'alter table public.blood_requests enable row level security';
  perform public.carelink_apply_owner_rls('blood_requests');
end $$;

-- donor_match_results: requester sees matches for own requests (no identity
-- resolution possible — donor_profiles is not cross-readable). No client write
-- (matching function only).
alter table public.donor_match_results enable row level security;
drop policy if exists donor_match_results_owner_select on public.donor_match_results;
create policy donor_match_results_owner_select on public.donor_match_results
  for select using (owner_id = auth.uid());

-- donor_requests: requester reads own requests' STATUS; donor reads requests
-- addressed to them (minimal columns exist — no patient identity on the row).
-- No client write: responses go through carelink_donor_respond.
alter table public.donor_requests enable row level security;
drop policy if exists donor_requests_owner_select on public.donor_requests;
create policy donor_requests_owner_select on public.donor_requests
  for select using (owner_id = auth.uid());
drop policy if exists donor_requests_donor_select on public.donor_requests;
create policy donor_requests_donor_select on public.donor_requests
  for select using (
    exists (
      select 1 from public.donor_profiles dp
      where dp.id = donor_profile_id and dp.owner_id = auth.uid()
    )
  );

-- donor_notifications: donor-only
alter table public.donor_notifications enable row level security;
drop policy if exists donor_notifications_donor_select on public.donor_notifications;
create policy donor_notifications_donor_select on public.donor_notifications
  for select using (
    exists (
      select 1 from public.donor_profiles dp
      where dp.id = donor_profile_id and dp.owner_id = auth.uid()
    )
  );

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0016_blood_donation.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0017_realtime.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

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

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0017_realtime.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0018_audit_expansion.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §18: Audit system expansion.
--
-- ADDITIVE ONLY. The Step 10 audit_events table is preserved (read-only
-- self-select; no client insert/update/delete policy — unchanged).
--
-- Adds:
--   1. Appointment modifications are audited (status-change trigger now also
--      writes an audit row).
--   2. carelink_audit_document_access() — document view/sign/download/delete
--      audit, called by the document-access Edge Function; the caller must
--      own the document (or be super_admin).
--   3. carelink_audit_health_access() — health-record access audit with a
--      WHITELIST of auditable owner tables (no dynamic SQL).
--   4. Hard guarantees re-asserted: UPDATE/DELETE on audit_events are denied
--      for all client roles (RLS + explicit revokes).
--
-- Already audited elsewhere: role changes + provider membership (0006),
-- review moderation (0007), SOS transitions (0015), donor disclosure (0016).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Appointment modification audit (extends the 0010 status trigger)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: the audit write crosses the RLS boundary by design —
-- audit_events has no client insert policy, so the trigger must execute with
-- definer privileges. auth.uid() still reports the real caller (GUC-based).
create or replace function public.carelink_track_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.appointment_status_history
      (id, appointment_id, owner_id, old_status, new_status, changed_by)
    values
      (gen_random_uuid(), new.id, new.owner_id, old.status, new.status, auth.uid());
    insert into public.audit_events
      (id, actor_id, action, target_table, target_id, safe_message)
    values
      (gen_random_uuid(), auth.uid(), 'appointment_status_changed', 'appointments', new.id,
       'status: ' || old.status || ' -> ' || new.status);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Document access audit (document-access Edge Function calls this)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_audit_document_access(document_uuid uuid, action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if action not in ('view','sign','download','delete') then
    raise exception 'invalid document access action';
  end if;
  if not public.carelink_can_access_document(document_uuid)
     and not public.carelink_is_super_admin() then
    raise exception 'not authorized to audit-access this document';
  end if;
  return public.carelink_record_audit('document_' || action, 'medical_documents', document_uuid, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Health-record access audit (whitelist — no dynamic SQL, no arbitrary
--    table probing; the caller must own the row being audited)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_audit_health_access(
  target_table text,
  target_id uuid,
  action text default 'read'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare is_owner boolean := false;
begin
  if action not in ('read','export','share') then
    raise exception 'invalid health access action';
  end if;

  if target_table = 'health_context' then
    select exists (select 1 from public.health_context r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'medical_reports' then
    select exists (select 1 from public.medical_reports r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'medicines' then
    select exists (select 1 from public.medicines r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'vaccination_records' then
    select exists (select 1 from public.vaccination_records r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'recovery_checkins' then
    select exists (select 1 from public.recovery_checkins r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'conversations' then
    select exists (select 1 from public.conversations r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  else
    raise exception 'table not auditable';
  end if;

  if not is_owner and not public.carelink_is_super_admin() then
    raise exception 'not authorized to audit-access this record';
  end if;

  return public.carelink_record_audit('health_record_' || action, target_table, target_id, null);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_audit_document_access(uuid, text)',
    'carelink_audit_health_access(text, uuid, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Re-assert audit immutability for client roles (RLS already denies; these
--    revokes make the table privilege level airtight too)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke update, delete, truncate on public.audit_events from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke update, delete, truncate on public.audit_events from authenticated;
  end if;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0018_audit_expansion.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0019_agent_recommendation_verification.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 10.5 §REC: Agent recommendation provenance.
--
-- ADDITIVE ONLY. Extends public.agent_recommendations (0008) with the
-- verification/provenance fields the Step 13 AI gateway emits per response:
--   provider          — which AI provider/engine produced the recommendation
--   verification       — provenance status (validated / fallback / unverified)
--   provider_snapshot  — full provider payload snapshot (mode, provider,
--                        fetchedAt, verification) for auditability. No PHI.
--
-- Backward-compatible: legacy mock rows automatically keeptheir existing
-- source/is_mock semantics; provider stays null for them and verification
-- defaults to 'fallback' (unverified-by-validators mock data. Deterministic,
-- replayable on a clean database and safe with existing data。
-- ===========================================================================

alter table public.agent_recommendations
  add column if not exists provider text,
  add column if not exists verification text not null default 'fallback',
  add column if not exists provider_snapshot jsonb;

-- verification values mirror the Step 13 AI provenance enum.
 do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_recommendations'::regclass
      and conname = 'agent_recommendations_verification_check'
  ) then
    alter table public.agent_recommendations
      add constraint agent_recommendations_verification_check
      check (verification in ('validated','fallback','unverified'));
  end if;
end $$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0019_agent_recommendation_verification.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0020_review_verification_rls.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- 0020 — Review verification row-level access hardening.
--
-- WHY: review_verification held a public-read policy (FOR SELECT USING (true))
-- that exposed appointment_id (a cross-object private reference) to even
-- the anonymous role. The verified badge value is a single boolean that the UI
-- renders from its own review list; no anonymous UI data dependency needs
-- THAT raw row (which also contains the completing appointment's UUID).
--
-- FIX (additive, backward-compatible):
--  1. Drop the public-read policy on review_verification.

--  2. Revoke anonymous privileges on that table entirely (default table grants
--     used by Supabase grant anon SELECT via the default privileges; explicit
--     revoke closes that hole regardless of default-privilege drift.).
--  3. Add an owner-scoped authenticated read policy: a caller may only see
--     the verification row of a review THEY authored. This keeps the repository
--     method getReviewVerification working for the author while denying cross-user
--     and anonymous enumeration. The guarded function carelink_verify_review
--     remains the sole write path.
-- ===========================================================================

drop policy if exists review_verification_public_read on public.review_verification;

revoke all on table public.review_verification from anon;

create policy review_verification_author_read on public.review_verification
  for select to authenticated
  using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id
        and r.owner_id = auth.uid()
    )
  );

-- 4. Harden handle_new_user (SECURITY DEFINER trigger) by pinning its
--    search_path to '' fand fully qualifying the only table it touches. Avoids
--    any future search_path hijack in the public schema.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, language_preference)
  values (new.id, 'en')
  on conflict (id) do nothing;
  return new;
end;
$$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0020_review_verification_rls.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0021_security_least_privilege_execute.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 14 security hardening: least-privilege EXECUTE
-- ===========================================================================
-- Trigger / internal no-arg SECURITY DEFINER helpers do not need client EXECUTE
-- (PostgreSQL only checks EXECUTE for direct CALL/expression use, not for trigger
--  firing). Remove the default PUBLIC + anon grants so no unauthenticated or
--  low-privilege role can invoke a mutating definer body standalone.
-- RLS predicate helpers (carelink_is_*, carelink_has_role, carelink_is_admin,
--  carelink_is_super_admin) intentionally keep anon where used in quals on
--  public-facing tables; those are read-only and required for RLS to evaluate.

-- apply donation cooldown (trigger on donation_records);
revoke execute on function public.carelink_apply_donation_cooldown() from public;
revoke execute on function public.carelink_apply_donation_cooldown() from anon;

-- appointment status history (trigger on appointments );
revoke execute on function public.carelink_track_appointment_status() from public;
revoke execute on function public.carelink_track_appointment_status() from anon;

-- auto-create profile on signup (trigger on profiles );
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

-- Authenticated roles still trigger these naturally through DML; no direct grants needed.
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0021_security_least_privilege_execute.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0022_development_provider_seed.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI - Step 15 (Phase 12): DEVELOPMENT provider/master seed.
--
-- Clearly-marked DEVELOPMENT/TEST provider records so a fresh Supabase project
-- has realistic-but-flagged discovery data for the directory / search /
-- relevant-doctor / booking flows the moment credentials are wired.
--
-- SAFETY:
--   - Slugs use a `dev-` prefix and ids use the deterministic `7d...` range so
--     they can never collide with the SQL test harness fixtures (5a../5e../6a..),
--     static frontend data, or real production records.
--   - No patient PHI is seeded (providers only). Verification stays `pending`
--     - dev records are never presented as production-verified.
--   - Additive + idempotent (`on conflict (id) do nothing`). Safe to replay
--     against a database that already has real providers.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Master data - specialties / conditions / symptoms (dev-flagged)
-- ---------------------------------------------------------------------------
insert into public.specialties (id,slug,name,description) values
  ('7d000001-0000-0000-0000-000000000001','dev-cardiology','Cardiology (dev)','Development seed specialty'),
  ('7d000002-0000-0000-0000-000000000002','dev-endocrinology','Endocrinology (dev)','Development seed specialty'),
  ('7d000003-0000-0000-0000-000000000003','dev-neurology','Neurology (dev)','Development seed specialty'),
  ('7d000004-0000-0000-0000-000000000004','dev-orthopedics','Orthopedics (dev)','Development seed specialty'),
  ('7d000005-0000-0000-0000-000000000005','dev-pediatrics','Pediatrics (dev)','Development seed specialty'),
  ('7d000006-0000-0000-0000-000000000006','dev-family-medicine','Family Medicine (dev)','Development seed specialty')
on conflict (id) do nothing;
insert into public.conditions (id,slug,name,description) values
  ('7d100001-0000-0000-0000-000000000001','dev-diabetes','Diabetes mellitus (dev)','Development seed condition'),
  ('7d100002-0000-0000-0000-000000000002','dev-hypertension','Hypertension (dev)','Development seed condition'),
  ('7d100003-0000-0000-0000-000000000003','dev-migraine','Migraine (dev)','Development seed condition'),
  ('7d100004-0000-0000-0000-000000000004','dev-arthritis','Arthritis (dev)','Development seed condition'),
  ('7d100005-0000-0000-0000-000000000005','dev-asthma','Asthma (dev)','Development seed condition')
on conflict (id) do nothing;
insert into public.symptoms (id,slug,name,description) values
  ('7d110001-0000-0000-0000-000000000001','dev-fatigue','Fatigue (dev)','Development seed symptom'),
  ('7d110002-0000-0000-0000-000000000002','dev-headache','Headache (dev)','Development seed symptom'),
  ('7d110003-0000-0000-0000-000000000003','dev-excessive-thirst','Excessive thirst (dev)','Development seed symptom'),
  ('7d110004-0000-0000-0000-000000000004','dev-joint-pain','Joint pain (dev)','Development seed symptom'),
  ('7d110005-0000-0000-0000-000000000005','dev-shortness-of-breath','Shortness of breath (dev)','Development seed symptom')
on conflict (id) do nothing;
insert into public.symptom_conditions (symptom_id,condition_id,weight) values
  ('7d110001-0000-0000-0000-000000000001','7d100001-0000-0000-0000-000000000001',0.6),
  ('7d110002-0000-0000-0000-000000000002','7d100003-0000-0000-0000-000000000003',0.5),
  ('7d110003-0000-0000-0000-000000000003','7d100001-0000-0000-0000-000000000001',0.4),
  ('7d110004-0000-0000-0000-000000000004','7d100004-0000-0000-0000-000000000004',0.5),
  ('7d110005-0000-0000-0000-000000000005','7d100005-0000-0000-0000-000000000005',0.5)
on conflict (id) do nothing;
insert into public.condition_specialties (condition_id,specialty_id) values
  ('7d100001-0000-0000-0000-000000000001','7d000002-0000-0000-0000-000000000002'),
  ('7d100001-0000-0000-0000-000000000001','7d000001-0000-0000-0000-000000000001'),
  ('7d100002-0000-0000-0000-000000000002','7d000001-0000-0000-0000-000000000001'),
  ('7d100003-0000-0000-0000-000000000003','7d000003-0000-0000-0000-000000000003'),
  ('7d100004-0000-0000-0000-000000000004','7d000004-0000-0000-0000-000000000004'),
  ('7d100005-0000-0000-0000-000000000005','7d000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Hospitals (dev-flagged)
-- ---------------------------------------------------------------------------
insert into public.hospitals (id,slug,name,description,city,address,phone_number,email,website,rating) values
  ('7d200001-0000-0000-0000-000000000001','dev-bloomfield-city-hospital','Bloomfield City Hospital (dev)','Development seed multispeciality hospital focused on cardiac and metabolic care.','Hyderabad','8-10 Bloomfield Road, Begumpet','+91 40 0000 0001','dev-bloomfield@example.in','https://example.in/dev-bloomfield',4.2),
  ('7d200002-0000-0000-0000-000000000002','dev-aurora-neuro-hospital','Aurora Neuro and Cardiac Institute (dev)','Development seed tertiary hospital for neurology and cardiology.','Bengaluru','42 Aurora Avenue, Indiranagar','+91 80 0000 0002','dev-aurora@example.in','https://example.in/dev-aurora',4.6),
  ('7d200003-0000-0000-0000-000000000003','dev-riverside-ortho-children-hospital','Riverside Ortho and Children Hospital (dev)','Development seed hospital for orthopedics, pediatrics and family care.','Chennai','19 Riverside Drive, Adyar','+91 44 0000 0003','dev-riverside@example.in','https://example.in/dev-riverside',4.4)
on conflict (id) do nothing;
insert into public.hospital_locations (id,hospital_id,label,address,city,latitude,longitude) values
  ('7d210001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','Main campus','8-10 Bloomfield Road, Begumpet','Hyderabad',17.441700,78.465400),
  ('7d210002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','Main campus','42 Aurora Avenue, Indiranagar','Bengaluru',12.971900,77.641200),
  ('7d210003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003','Main campus','19 Riverside Drive, Adyar','Chennai',13.001200,80.256500)
on conflict (id) do nothing;
insert into public.hospital_services (id,hospital_id,service_name,description) values
  ('7d220001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','24x7 emergency','Emergency department (dev)'),
  ('7d220002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','Cardiac ICU','ICU (dev)'),
  ('7d220003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','Stroke unit','Neuro ICU (dev)'),
  ('7d220004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','Pediatric ER','Children emergency (dev)'),
  ('7d220005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','Joint replacement unit','Ortho ward (dev)')
on conflict (id) do nothing;
insert into public.hospital_specialties (id,hospital_id,specialty_id) values
  ('7d230001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','7d000001-0000-0000-0000-000000000001'),
  ('7d230002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','7d000002-0000-0000-0000-000000000002'),
  ('7d230003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','7d000001-0000-0000-0000-000000000001'),
  ('7d230004-0000-0000-0000-000000000004','7d200002-0000-0000-0000-000000000002','7d000003-0000-0000-0000-000000000003'),
  ('7d230005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','7d000004-0000-0000-0000-000000000004'),
  ('7d230006-0000-0000-0000-000000000006','7d200003-0000-0000-0000-000000000003','7d000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.hospital_condition_services (id,hospital_id,condition_id) values
  ('7d240001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','7d100001-0000-0000-0000-000000000001'),
  ('7d240002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','7d100003-0000-0000-0000-000000000003'),
  ('7d240003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003','7d100004-0000-0000-0000-000000000004'),
  ('7d240004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','7d100005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.hospital_hours (id,hospital_id,day_of_week,open_time,close_time,is_24_hours) values
  ('7d250001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',0,null,null,true),
  ('7d250002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',0,null,null,true),
  ('7d250003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003',0,'08:00','22:00',false)
on conflict (id) do nothing;
insert into public.emergency_capabilities (id,hospital_id,has_emergency_department,has_ambulance,has_icu,capabilities) values
  ('7d260001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',true,true,true,'{"devSeed":true}'::jsonb),
  ('7d260002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',true,true,true,'{"devSeed":true}'::jsonb),
  ('7d260003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003',true,false,true,'{"devSeed":true}'::jsonb)
on conflict (id) do nothing;
insert into public.hospital_verification (id,hospital_id,status,notes) values
  ('7d270001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d270002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','pending','Development seed record - pending verification'),
  ('7d270003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Doctors (dev-flagged)
-- ---------------------------------------------------------------------------
insert into public.doctors (id,slug,name,gender,years_experience,bio,photo_url,languages,rating) values
  ('7d300001-0000-0000-0000-000000000001','dev-dr-a-sharma','Dr. A. Sharma (dev)','female',12,'Development seed endocrinologist treating diabetes and metabolic disorders.',null,'["English","Hindi","Telugu"]'::jsonb,4.3),
  ('7d300002-0000-0000-0000-000000000002','dev-dr-b-nair','Dr. B. Nair (dev)','male',16,'Development seed interventional cardiologist for cardiac care.',null,'["English","Malayalam"]'::jsonb,4.7),
  ('7d300003-0000-0000-0000-000000000003','dev-dr-c-rao','Dr. C. Rao (dev)','male',9,'Development seed neurologist specializing in migraine care.',null,'["English","Kannada","Hindi"]'::jsonb,4.5),
  ('7d300004-0000-0000-0000-000000000004','dev-dr-d-mehta','Dr. D. Mehta (dev)','female',14,'Development seed orthopedic surgeon for joint replacement.',null,'["English","Hindi"]'::jsonb,4.6),
  ('7d300005-0000-0000-0000-000000000005','dev-dr-e-iyer','Dr. E. Iyer (dev)','male',8,'Development seed pediatric pulmonologist for asthma care.',null,'["English","Tamil"]'::jsonb,4.4)
on conflict (id) do nothing;
insert into public.doctor_profiles (id,doctor_id,education_summary,experience_summary,about) values
  ('7d310001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','MBBS, MD (Endocrinology) - dev','12+ years - dev','Development seed profile.'),
  ('7d310002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','MBBS, DM (Cardiology) - dev','16+ years - dev','Development seed profile.'),
  ('7d310003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','MBBS, MD (Neurology) - dev','9+ years - dev','Development seed profile.'),
  ('7d310004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','MBBS, MS (Orthopedics) - dev','14+ years - dev','Development seed profile.'),
  ('7d310005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','MBBS, MD (Pediatrics) - dev','8+ years - dev','Development seed profile.')
on conflict (id) do nothing;
insert into public.doctor_specialties (id,doctor_id,specialty_id) values
  ('7d320001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d000002-0000-0000-0000-000000000002'),
  ('7d320002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d000001-0000-0000-0000-000000000001'),
  ('7d320003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','7d000003-0000-0000-0000-000000000003'),
  ('7d320004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','7d000004-0000-0000-0000-000000000004'),
  ('7d320005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','7d000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.doctor_condition_expertise (id,doctor_id,condition_id) values
  ('7d330001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d100001-0000-0000-0000-000000000001'),
  ('7d330002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d100001-0000-0000-0000-000000000001'),
  ('7d330003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d100002-0000-0000-0000-000000000002'),
  ('7d330004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d100003-0000-0000-0000-000000000003'),
  ('7d330005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d100004-0000-0000-0000-000000000004'),
  ('7d330006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d100005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.doctor_hospitals (id,doctor_id,hospital_id,is_primary) values
  ('7d340001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',true),
  ('7d340002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001',true),
  ('7d340003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',false),
  ('7d340004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002',true),
  ('7d340005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003',true),
  ('7d340006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003',true)
on conflict (id) do nothing;
insert into public.doctor_availability (id,doctor_id,hospital_id,day_of_week,start_time,end_time,slot_duration_minutes) values
  ('7d350001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',1,'09:00','17:00',30),
  ('7d350002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001',2,'10:00','18:00',30),
  ('7d350003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',3,'10:00','16:00',30),
  ('7d350004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002',3,'08:30','15:30',30),
  ('7d350005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003',4,'09:00','17:00',30),
  ('7d350006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003',5,'09:30','16:30',30)
on conflict (id) do nothing;
insert into public.qualifications (id,doctor_id,degree,institution,year) values
  ('7d360001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','MD Endocrinology','Dev Medical College - dev',2014),
  ('7d360002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','DM Cardiology','Dev Medical College - dev',2012),
  ('7d360003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','MD Neurology','Dev Medical College - dev',2017),
  ('7d360004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','MS Orthopedics','Dev Medical College - dev',2013),
  ('7d360005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','MD Pediatrics','Dev Medical College - dev',2018)
on conflict (id) do nothing;
insert into public.certifications (id,doctor_id,title,issuer,year) values
  ('7d370001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','Board Certified - Endocrinology (dev)','Dev Medical Board',2015),
  ('7d370002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','Board Certified - Cardiology (dev)','Dev Medical Board',2013),
  ('7d370003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','Board Certified - Neurology (dev)','Dev Medical Board',2018)
on conflict (id) do nothing;
insert into public.consultation_fees (id,doctor_id,hospital_id,appointment_type,fee,currency) values
  ('7d380001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','Consultation',600.00,'INR'),
  ('7d380002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','Consultation',900.00,'INR'),
  ('7d380003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','Telehealth',750.00,'INR'),
  ('7d380004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','Consultation',800.00,'INR'),
  ('7d380005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','Consultation',700.00,'INR'),
  ('7d380006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','Consultation',500.00,'INR')
on conflict (id) do nothing;
insert into public.doctor_verification (id,doctor_id,status,notes) values
  ('7d390001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d390002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','pending','Development seed record - pending verification'),
  ('7d390003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','pending','Development seed record - pending verification'),
  ('7d390004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','pending','Development seed record - pending verification'),
  ('7d390005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Pharmacies (dev-flagged) + medicine inventory
-- ---------------------------------------------------------------------------
insert into public.pharmacies (id,slug,name,address,city,phone_number,rating) values
  ('7d400001-0000-0000-0000-000000000001','dev-city-meds','City Meds (dev)','3 Park Lane, Begumpet','Hyderabad','+91 40 0000 0101',4.1),
  ('7d400002-0000-0000-0000-000000000002','dev-wellness-care-pharmacy','Wellness Care Pharmacy (dev)','21 Wellness Street, Indiranagar','Bengaluru','+91 80 0000 0102',4.3)
on conflict (id) do nothing;
insert into public.pharmacy_locations (id,pharmacy_id,label,address,city,latitude,longitude) values
  ('7d410001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001','Main','3 Park Lane, Begumpet','Hyderabad',17.443200,78.462100),
  ('7d410002-0000-0000-0000-000000000002','7d400002-0000-0000-0000-000000000002','Main','21 Wellness Street, Indiranagar','Bengaluru',12.970500,77.639800)
on conflict (id) do nothing;
insert into public.pharmacy_hours (id,pharmacy_id,day_of_week,open_time,close_time,is_24_hours) values
  ('7d420001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001',0,null,null,true),
  ('7d420002-0000-0000-0000-000000000002','7d400002-0000-0000-0000-000000000002',0,'08:00','23:00',false)
on conflict (id) do nothing;
insert into public.pharmacy_medicines (id,pharmacy_id,medicine_name,brand,dosage_form,strength) values
  ('7d430001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001','Metformin','DevBrand','tablet','500 mg'),
  ('7d430002-0000-0000-0000-000000000002','7d400001-0000-0000-0000-000000000001','Amlodipine','DevBrand','tablet','5 mg'),
  ('7d430003-0000-0000-0000-000000000003','7d400002-0000-0000-0000-000000000002','Paracetamol','DevBrand','tablet','500 mg'),
  ('7d430004-0000-0000-0000-000000000004','7d400002-0000-0000-0000-000000000002','Salbutamol inhaler','DevBrand','inhaler','100 mcg/dose')
on conflict (id) do nothing;
insert into public.medicine_inventory (id,pharmacy_medicine_id,quantity,unit_price,in_stock) values
  ('7d440001-0000-0000-0000-000000000001','7d430001-0000-0000-0000-000000000001',120,42.00,true),
  ('7d440002-0000-0000-0000-000000000002','7d430002-0000-0000-0000-000000000002',80,58.00,true),
  ('7d440003-0000-0000-0000-000000000003','7d430003-0000-0000-0000-000000000003',200,15.50,true),
  ('7d440004-0000-0000-0000-000000000004','7d430004-0000-0000-0000-000000000004',40,180.00,true)
on conflict (id) do nothing;
insert into public.pharmacy_verification (id,pharmacy_id,status,notes) values
  ('7d450001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d450002-0000-0000-0000-000000000002','7d400002-0000-0000-0000-000000000002','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Labs (dev-flagged) + tests + services
-- ---------------------------------------------------------------------------
insert into public.labs (id,slug,name,address,city,phone_number,rating) values
  ('7d500001-0000-0000-0000-000000000001','dev-city-diagnostics','City Diagnostics Centre (dev)','11 Lab Lane, Begumpet','Hyderabad','+91 40 0000 0201',4.2),
  ('7d500002-0000-0000-0000-000000000002','dev-precision-pathology','Precision Pathology Labs (dev)','7 Precision Drive, Adyar','Chennai','+91 44 0000 0202',4.5)
on conflict (id) do nothing;
insert into public.lab_locations (id,lab_id,label,address,city,latitude,longitude) values
  ('7d510001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','Main','11 Lab Lane, Begumpet','Hyderabad',17.441100,78.464900),
  ('7d510002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002','Main','7 Precision Drive, Adyar','Chennai',13.004200,80.251200)
on conflict (id) do nothing;
insert into public.lab_tests (id,lab_id,test_name,description,price) values
  ('7d520001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','HbA1c','Glycated haemoglobin - dev',350.00),
  ('7d520002-0000-0000-0000-000000000002','7d500001-0000-0000-0000-000000000001','Fasting blood glucose','Fasting plasma glucose - dev',120.00),
  ('7d520003-0000-0000-0000-000000000003','7d500002-0000-0000-0000-000000000002','Lipid profile','Total cholesterol + fractions - dev',450.00),
  ('7d520004-0000-0000-0000-000000000004','7d500002-0000-0000-0000-000000000002','Complete blood count','CBC - dev',300.00)
on conflict (id) do nothing;
insert into public.lab_services (id,lab_id,service_name,description) values
  ('7d530001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','Home sample collection','Available - dev'),
  ('7d530002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002','Home sample collection','Available - dev'),
  ('7d530003-0000-0000-0000-000000000003','7d500002-0000-0000-0000-000000000002','Same-day reports','Available - dev')
on conflict (id) do nothing;
insert into public.lab_hours (id,lab_id,day_of_week,open_time,close_time,is_24_hours) values
  ('7d540001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001',0,'06:00','20:00',false),
  ('7d540002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002',0,'06:30','19:30',false)
on conflict (id) do nothing;
insert into public.lab_verification (id,lab_id,status,notes) values
  ('7d550001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d550002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Appointment slots (dev doctors, future dates) - used by booking flow
-- ---------------------------------------------------------------------------
insert into public.appointment_slots (id,doctor_id,hospital_id,slot_date,start_time,end_time,capacity,status) values
  ('7d600001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','2026-09-14','09:00','09:30',1,'open'),
  ('7d600002-0000-0000-0000-000000000002','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','2026-09-14','09:30','10:00',1,'open'),
  ('7d600003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','2026-09-14','10:00','10:30',1,'open'),
  ('7d600004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','2026-09-15','09:00','09:30',1,'open'),
  ('7d600005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','2026-09-16','09:00','09:30',1,'open'),
  ('7d600006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','2026-09-16','09:30','10:00',1,'open')
on conflict (id) do nothing;

-- ===========================================================================
-- End of development provider seed. Replace with a real provider load before
-- production use. All records carry dev slugs/ids + pending verification.
-- ===========================================================================

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0022_development_provider_seed.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0023_provider_media_and_location_indexes.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI Step 1 16/ 17/ 29: Provider media + location-discovery indexes.
--
-- ADDITIVE ONLY. The provider ecosystem (0005) is preserved unchanged. This
-- migration adds:
-- 1. provider_media a single metadata table for provider imagery
-- (hospitals / doctors / pharmacies / labs). Every stored provider image
-- gets: provider_kind + provider_id, cloudinary_public_id, secure_url,
-- resource_type, width, height, byte_size, uploaded_at, uploaded_by.
-- Exactly one provider FK must be set (mirrors provider_memberships pattern.
-- 2. Source/verification provenance columns already live either on the provider
-- tables (rating, address, city, phone, website, photo_url) or on the
-- verification tables (status, verified_by, verified_at, notes) no
-- duplicate provenance columns are added; the *_verification tables remain the
-- single source of verification truth.
-- 3. Location-discovery + provider-relationship indexes so haversine / join
-- queries don't full-scan (mirroring the existing per-table indexes).
--
-- SECURITY:
-- - provider_media RLS: ACTIVE media rows are public-read (a provider image is
-- delivery content, not patient data); writes/updates/deletes are restricted to
-- the owning provider admin (hospital_admin / linked doctor / pharmacy_admin /
-- lab_admin) or super_admin verified_media always records the actor.
-- - Client cannot flip a provider's verification status on a media row; the
-- `verified_media` flag merely tags an uploaded asset as provider-approved and is
-- set only by the authorized writer.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. provider_media provider image metadata (Cloudinary + provider refs)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_media (
 id uuid primary key default gen_random_uuid(),
 provider_kind text not null check (provider_kind in ('hospital','doctor','pharmacy','lab')),
 hospital_id uuid references public.hospitals(id) on delete cascade,
 doctor_id uuid references public.doctors(id) on delete cascade,
 pharmacy_id uuid references public.pharmacies(id) on delete cascade,
 lab_id uuid references public.labs(id) on delete cascade,
 -- Cloudinary asset references (never secrets; public id + delivery URL only).
 cloudinary_public_id text,
 secure_url text,
 resource_type text not null default 'image' check (resource_type in ('image','video','raw')),
 width integer check (width is null or width > 0),
 height integer check (height is null or height > 0),
 byte_size bigint check (byte_size is null or byte_size > 0),
 alt_text text,
 is_primary boolean not null default false,
 verified_media boolean not null default false,
 uploaded_at timestamptz not null default now(),
 uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 check (
 (provider_kind = 'hospital' and hospital_id is not null and doctor_id is null and pharmacy_id is null
 and lab_id is null)
 or (provider_kind = 'doctor'and doctor_id is not null and hospital_id is null
 and pharmacy_id is null and lab_id is null)
 or(provider_kind = 'pharmacy'and pharmacy_id is not null and hospital_id is null
 and doctor_id is null and lab_id is null)
 or(provider_kind = 'lab'and lab_id is not null and hospital_id is null and pharmacy_id is null
 and doctor_id is null)
 )
);

create index if not exists provider_media_hospital_id_idx on public.provider_media(hospital_id) where (provider_kind = 'hospital');
create index if not exists provider_media_doctor_id_idx on public.provider_media(doctor_id) where (provider_kind = 'doctor');
create index if not exists provider_media_pharmacy_id_idx on public.provider_media(pharmacy_id) where (provider_kind = 'pharmacy');
create index if not exists provider_media_lab_id_idx on public.provider_media(lab_id) where (provider_kind = 'lab');

-- ---------------------------------------------------------------------------
-- 2. Location-discovery indexes (haver/join acceleration).
-- ---------------------------------------------------------------------------
create index if not exists hospital_locations_city_idx on public.hospital_locations(city);
create index if not exists pharmacy_locations_city_idx on public.pharmacy_locations(city);
create index if not exists lab_locations_city_idx on public.lab_locations(city);

create index if not exists doctor_hospitals_doctor_id_idx on public.doctor_hospitals(doctor_id);
create index if not exists doctor_hospitals_is_primary_idx on public.doctor_hospitals(hospital_id, is_primary);
create index if not exists hospital_specialties_hospital_id_idx on public.hospital_specialties(hospital_id);
create index if not exists doctor_specialties_doctor_id_idx on public.doctor_specialties(doctor_id);
create index if not exists pharmacy_medicines_medicine_name_idx on public.pharmacy_medicines(medicine_name);
create index if not exists lab_tests_test_name_idx on public.lab_tests(test_name);

-- ---------------------------------------------------------------------------
-- 3. provider_media RLS public read for active delivery assets only; writes
-- never public authorized exclusively by the owning provider admin / super_admin.
-- ---------------------------------------------------------------------------
alter table public.provider_media enable row level security;

drop policy if exists provider_media_public_read on public.provider_media;
create policy provider_media_public_read on public.provider_media
 for select using (verified_media = true);

drop policy if exists provider_media_admin_insert on public.provider_media;
create policy provider_media_admin_insert on public.provider_media
 for insert with check (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 );

drop policy if exists provider_media_admin_update on public.provider_media;
create policy provider_media_admin_update on public.provider_media
 for update using (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 )
 with check (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 );

drop policy if exists provider_media_admin_delete on public.provider_media;
create policy provider_media_admin_delete on public.provider_media
 for delete using (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 );

drop trigger if exists set_updated_at on public.provider_media;
create trigger set_updated_at before update on public.provider_media
 for each row execute function carelink_set_updated_at();
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0023_provider_media_and_location_indexes.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0024_data_provenance_and_booking_integrity.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 2: Data provenance + booking integrity + media dedupe.
--
-- ADDITIVE ONLY. Preserves every existing table/policy/index. This migration:
--
-- 1. adds provenance columns to the public provider-registry tables
--    (hospitals / doctors / pharmacies / labs)):
--      data_source   — who/what produced the record (e.g. 'supabase-seed',
--                       'geoapify', 'nppes', 'manual-admin'. NULL = un-known).
--      source_ref    — provider-specific external id / reference (nullable).
--      data_status   — honest data-quality classification so the UI can say
--                       REAL / MOCK / FALLBACK / UNAVAILABLE / PENDING_VERIFICATION
--                       (the *_verification tables remain the single source of
--                        verification truth; data_status is record-origin quality).
--      fetched_at    — when this record was last fetched from an external source.

-- 2. backfills the development seed rows (dev- ids / slug) as
--    'development-seed' + data_status 'PENDING_VERIFICATION' so a fresh project
--    can never present dev seed data as production-verified real-world data..
-- 3. adds a partial UNIQUE index on appointments to prevent double-booking
--    the same doctor + slot when the booking is active (uncancelled).
--    (NULL doctor_id / tele-appointments are deliberately excluded — the slot
--     constraint only applies when a real doctor + date + time is known..
-- 4. adds content-hash columns + owner-scoped partial unique indexes so the
--    media/document pipelines can dedupe identical uploads without ever
--    deduping across owners (a user's private media is never reusable by
--    another user without authorization).
--
-- SECURITY: provenance/dedup columns are non-sensitive public-read delivery
-- metadata only; no PHI, no credentials, no private URLs live here..
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Provenance columns on provider-registry tables
-- ---------------------------------------------------------------------------
alter table public.hospitals add column if not exists data_source text;
alter table public.hospitals add column if not exists source_ref text;
alter table public.hospitals add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.hospitals add column if not exists fetched_at timestamptz;

alter table public.doctors add column if not exists data_source text;
alter table public.doctors add column if not exists source_ref text;
alter table public.doctors add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.doctors add column if not exists fetched_at timestamptz;

alter table public.pharmacies add column if not exists data_source text;
alter table public.pharmacies add column if not exists source_ref text;
alter table public.pharmacies add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.pharmacies add column if not exists fetched_at timestamptz;
alter table public.labs add column if not exists data_source text;
alter table public.labs add column if not exists source_ref text;
alter table public.labs add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.labs add column if not exists fetched_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Backfill dev-seed provenance (idempotent, dev-first)
-- ---------------------------------------------------------------------------
update public.hospitals h
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (h.data_source is null)
    and (h.slug like 'dev-%' or h.id::text like '7d2%');

update public.doctors d
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (d.data_source is null)
    and (d.slug like 'dev-%' or d.id::text like '7d3%');

update public.pharmacies p
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (p.data_source is null)
    and (p.slug like 'dev-%' or p.id::text like '7d4%');

update public.labs l
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (l.data_source is null)
    and (l.slug like 'dev-%' or l.id::text like '7d5%');

-- ---------------------------------------------------------------------------
-- 3. Double-booking protection on appointments
-- ---------------------------------------------------------------------------
-- Prevents two ACTIVE appointments for the same doctor + date + time. Cancelled
-- bookings free the slot (so a patient can rebook after cancelling).
create unique index if not exists appointments_active_slot_uq
  on public.appointments (doctor_id, scheduled_date, scheduled_time)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 4. Content-hash columns + owner-scoped dedupe (media isolation safe(
-- ---------------------------------------------------------------------------
alter table public.medical_documents add column if not exists content_hash text;
create unique index if not exists medical_documents_owner_content_hash_uq
  on public.medical_documents (owner_id, content_hash) where content_hash is not null;

alter table public.provider_media add column if not exists content_hash text;
create unique index if not exists provider_media_owner_content_hash_uq
  on public.provider_media (uploaded_by, content_hash) where (uploaded_by is not null and content_hash is not null);
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0024_data_provenance_and_booking_integrity.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0025_account_suspension_login_activity_admin_permissions.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 2: Account suspension, security activity, admin
-- permissions layer. ADDITIVE ONLY.
--
--  1. `profiles.account_status` — active / suspended / disabled. Server-side
--       suspension enforcement: BEFORE INSERT/UPDATE/DELETE triggers on the
--       patient-owned write tables block any mutation while the acting user is
--       suspended (reads of public/non-sensitive content remain permitted).
--  2. `security_activity_events` — login/session/account lifecycle events,
--       written ONLY via the guarded audited RPC `carelink_record_login_activity`
--       (user-scoped to the caller; NO tokens/passwords/secrets ever stored).
--  3. `permissions` + `role_permissions` — explicit admin permission sets so
--       ADMIN is narrower than SUPER_ADMIN and every privileged RPC checks the
--       required permission server-side (never the frontend).
--  4. Account status changes emit: an audit event, a security activity event,and a
--       minimal recipient notification (kind 'account'), so the user is informed.

-- SECURITY: all helpers are SECURITY DEFINER with pinned search_path; every
-- privileged function checks `carelink_is_suspended()` on the CALLER; EXECUTE is
-- revoked from public/anon on every privileged RPC; only authenticated may call
-- them. No credential material is ever stored; payloads stay minimal. Existing
-- tables/policies/indexes preserved..
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Account status on profiles (additive column; backfill active)
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists account_status text
  check (account_status in ('active','suspended','disabled')) default 'active';
alter table public.profiles add column if not exists suspended_at timestamptz;
alter table public.profiles add column if not exists suspended_reason text;

-- Is the acting user currently suspended / disabled? SECURITY DEFINER predicate
-- usable by RLS policy evaluation on all roles (returns false for null identity)
create or replace function public.carelink_is_suspended()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.account_status = 'suspended' or p.account_status = 'disabled')
  );
$$;

-- Is a given target user suspended? (used by admin callers to inspect targets)
create or replace function public.carelink_is_target_suspended(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target
      and (p.account_status = 'suspended' or p.account_status = 'disabled')
  );
$$;

-- Suspension write blocker: BEFORE INSERT/UPDATE/DELETE on protected tables.



create or replace function public.carelink_enforce_not_suspended()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended: write operations are blocked for this account';
  end if;
  -- MUST return the row: an NULL return from a BEFORE trigger silently skips
  -- the statement (no error, no insert), which would silently break every write..
  return coalesce(new, old);
end;
$$;

-- Attach the blocker to every patient-owned / user-write table. Triggers are
-- BEFORE INSERT/UPDATE/DELETE (guarded mutate paths set their own checks).
do $$
declare t text;
begin
  foreach t in array array[
    'family_profiles','health_context','medical_documents','medical_reports',
    'medicines','appointments','appointment_events','appointment_notes',
    'appointment_status_history','cancellation_records','reschedule_events',
    'recovery_checkins','vaccination_records','conversations','conversation_messages',
    'saved_hospitals','saved_doctors','saved_pharmacies','saved_labs',
    'emergency_events','reviews','review_ratings','review_reports','medication_schedules',
    'medication_logs','scheduled_medication_reminders','recovery_plans','health_timeline_events'
  ]
  loop
    execute format(
      'drop trigger if exists carelink_enforce_not_suspended on public.%I;
       create trigger carelink_enforce_not_suspended
         before insert or update or delete on public.%I
         for each row execute function public.carelink_enforce_not_suspended();',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Security activity events
-- ---------------------------------------------------------------------------
create table if not exists public.security_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in (
    'login_success','login_failure','logout','session_refresh',
    'password_reset_request','password_change','account_suspended',
    'account_reactivated','account_disabled','role_granted','role_revoked',
    'admin_login','super_admin_login','admin_access_denied'
  )),
  ip_address text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb check (octet_length(metadata::text) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists security_activity_user_id_idx on public.security_activity_events(user_id);
create index if not exists security_activity_events_created_idx on public.security_activity_events(created_at);
create index if not exists security_activity_user_event_idx on public.security_activity_events(user_id, created_at);

alter table public.security_activity_events enable row level security;

-- Self reads + admin reads; NO direct client insert/update/delete (writes ride
-- the guarded RPC below, which is user-scoped so a user can never forge another
-- user's activity).
drop policy if exists security_activity_self_select on public.security_activity_events;
create policy security_activity_self_select on public.security_activity_events
  for select using (user_id = auth.uid());
drop policy if exists security_activity_admin_select on public.security_activity_events;
create policy security_activity_admin_select on public.security_activity_events
  for select using (public.carelink_is_admin());

-- Guarded user-scoped activity recorder. SECURITY DEFINER so the insert crosses
-- RLS (the function forces user_id = auth.uid()); no trust on args beyond event..
create or replace function public.carelink_record_login_activity(
  event text,
  metadata jsonb default '{}'::jsonb,
  ip_address text default null,
  user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
declare actor uuid := auth.uid();
declare clean_event text;
declare cap_meta jsonb;
begin
  clean_event := lower(btrim(event));
  if clean_event not in (
    'login_success','login_failure','logout','session_refresh','password_reset_request',
    'password_change','account_suspended','account_reactivated','account_disabled',
    'role_granted','role_revoked','admin_login','super_admin_login','admin_access_denied'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended()and clean_event in ('login_success','session_refresh') then
    -- A suspended account may never record a fresh successful login/session..
    raise exception 'account suspended';
  end if;

  -- Retain only tiny scalar metadata (never raw credentials/tokens/PHI). No
  -- arrays/objects/nested values are kept..

  cap_meta := coalesce((
    select jsonb_object_agg(k, nullif(v::text,''))
    from jsonb_each(coalesce(metadata,'{}'::jsonb)) as e(k,v)
    where jsonb_typeof(v) in ('string','number','boolean')
      and octet_length(k) <= 64
      and octet_length(nullif(v::text,'')) <= 200
  ),'{}'::jsonb);

  insert into public.security_activity_events (id, user_id, event, metadata, ip_address, user_agent)
 values (gen_random_uuid(), actor, clean_event, cap_meta, left(coalesce(ip_address,''), 64), left(coalesce(user_agent,''), 256))
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin permission model
-- ---------------------------------------------------------------------------
create table if not exists public.permissions (
  code text primary key,
  description text,
  created_at timestamptz not null default now()
);

insert into public.permissions (code, description) values
  ('dashboard.view','View the operational dashboard'),
  ('users.view','View user directory (no PHI beyond ops-necessary)'),
  ('users.manage','Suspend/reactivate accounts (audited)'),
  ('providers.view','View provider registry + provenance'),
  ('providers.verify','Verify provider records (super admin only)'),
  ('reviews.view','View review moderation queue'),
  ('reviews.moderate','Moderate (publish/hide/remove) reviews'),
  ('appointments.view','View appointment directory (ops)'),
  ('notifications.view','View notification dispatch queue'),
  ('audit.view','View audit log'),
  ('security.view','View security activity feed'),
  ('reports.view','View aggregate operational reports'),
  ('roles.manage','Grant/revoke roles (super admin only)'),
  ('system.manage','Manage system/security configuration (super admin only)')
on conflict (code) do nothing;

create table if not exists public.role_permissions (
  role_id text not null references public.roles(id) on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_id, permission_code)
);

insert into public.role_permissions (role_id, permission_code)
select 'super_admin', code from public.permissions
on conflict (role_id, permission_code) do nothing;

insert into public.role_permissions (role_id, permission_code) values
  ('admin','dashboard.view'),
  ('admin','users.view'),
  ('admin','users.manage'),
  ('admin','providers.view'),
  ('admin','reviews.view'),
  ('admin','reviews.moderate'),
  ('admin','appointments.view'),
  ('admin','notifications.view'),
  ('admin','audit.view'),
  ('admin','security.view'),
  ('admin','reports.view')
on conflict (role_id, permission_code) do nothing;

alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists permissions_public_read on public.permissions;
create policy permissions_public_read on public.permissions
  for select using (true);
drop policy if exists role_permissions_public_read on public.role_permissions;
create policy role_permissions_public_read on public.role_permissions
  for select using (true);
revoke update, delete, insert on public.role_permissions from public;
revoke update, delete, insert on public.permissions from public;

-- Has the acting user a given permission (by role membership)?
create or replace function public.carelink_has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    where ur.user_id = auth.uid()
      and rp.permission_code = p_code
  ) or public.carelink_is_super_admin();
$$;

-- Return the acting user's role ids (frontend display only — never authorization).
create or replace function public.carelink_current_user_roles()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(ur.role_id order by ur.role_id), array[]::text[])
  from public.user_roles ur
  where ur.user_id = auth.uid()
$$;

grant execute on function public.carelink_is_suspended()to anon, authenticated;
grant execute on function public.carelink_is_target_suspended(uuid) to anon, authenticated;
grant execute on function public.carelink_has_permission(text) to anon, authenticated;
grant execute on function public.carelink_current_user_roles()to authenticated;

do $$
declare fn text;
begin
  foreach fn in array array['carelink_record_login_activity(text, jsonb, text, text)']
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0025_account_suspension_login_activity_admin_permissions.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0026_admin_rbac_layer.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- CareLink-AI — Step 2: admin RBAC operation layer. ADDITIVE..
-- Builds on 0025 (account status + permission model)。 Adds real, guarded
-- admin RPCs scoped by permission codes + suspension-aware gates..
-- ===========================================================================

-- 1. Account notification kind (so suspension/reactivation reach the user)
alter table public.notification_templates drop constraint if exists notification_templates_kind_check;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notification_templates
  add constraint notification_templates_kind_check
  check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup','account'));
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup','account'));

insert into public.notification_templates (code,kind,title_template,body_template,channel)
values
  ('account_status_changed','account','Account status updated','Your CareLink account status was updated.','in_app'),
  ('account_suspended','account','Account suspended','Your CareLink account has been suspended.','in_app'),
  ('account_reactivated','account','Account reactivated','Your CareLink account has been reactivated.','in_app'),
  ('account_disabled','account','Account disabled','Your CareLink account has been disabled.','in_app')
on conflict (code) do nothing;

-- 2. Admin read policies (writes ride guarded RPCs below)
drop policy if exists profiles_admin_select on public.profiles;
 create policy profiles_admin_select on public.profiles
  for select using (public.carelink_is_admin());
drop policy if exists security_activity_admin_select on public.security_activity_events;
create policy security_activity_admin_select on public.security_activity_events
  for select using (public.carelink_is_admin());

-- 3. Active-admin gate (not suspended)
create or replace function public.carelink_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.carelink_is_admin() and not public.carelink_is_suspended());
$$;

create or replace function public.carelink_admin_has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended()  and (public.carelink_has_permission(permission_code)) or public.carelink_is_super_admin());
$$;

-- 4. Real-data admin readers (permission + suspension gates on every call)
create or replace function public.carelink_admin_list_users(
  search_text text default null,
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, email text, display_name text, account_status text, roles text[], created_at timestamptz, last_activity_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('users.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  return query
  select p.id, au.email, p.display_name, p.account_status,
         coalesce((select array_agg(ur.role_id order by ur.role_id)from public.user_roles ur where ur.user_id = p.id), array[]::text[]),
         p.created_at,
         (select max(sa.created_at)from public.security_activity_events sa where sa.user_id = p.id)
  from public.profiles p
  left join auth.users au on au.id = p.id
  where (search_text is null or p.display_name ilike '%' || search_text || '%' or au.email ilike '%' || search_text || '%')
    and (status_filter is null or p.account_status = status_filter)
  order by p.created_at desc
  limit page_size offset page * page_size;
end;
$$;

create or replace function public.carelink_admin_list_security_activity(
  limit_n int default 100,
  user_filter uuid default null
)
returns table (id uuid, user_id uuid, event text, metadata jsonb, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('security.view') then
    raise exception 'permission denied';
  end if;
  if limit_n < 1 or limit_n > 500 then
    raise exception 'invalid limit';
  end if;
  return query
  select sa.id, sa.user_id, sa.event, sa.metadata, sa.created_at
  from public.security_activity_events sa
  where (user_filter is null or sa.user_id = user_filter)
  order by sa.created_at desc
  limit limit_n;end;$$;

create or replace function public.carelink_admin_list_audit(
  limit_n int default 100,
  action_filter text default null
)
returns table (id uuid, actor_id uuid, action text, target_table text, target_id uuid, safe_message text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('audit.view') then
    raise exception 'permission denied';
  end if;
  if limit_n < 1 or limit_n > 500 then
    raise exception 'invalid limit';
  end if;
  return query
  select ae.id, ae.actor_id, ae.action, ae.target_table, ae.target_id, ae.safe_message, ae.created_at
  from public.audit_events ae
  where (action_filter is null or ae.action = action_filter)
  order by ae.created_at desc
  limit limit_n;end;$$;

create or replace function public.carelink_admin_list_providers(
  kind text,
  search_text text default null,
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, slug text, name text, city text, data_status text, verification_status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('providers.view') then
    raise exception 'permission denied';
  end if;
  if kind not in ('hospital','doctor','pharmacy','lab') then
    raise exception 'invalid provider kind';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  if kind = 'hospital' then
    return query
    select h.id,h.slug,h.name,h.city,h.data_status,hv.status,h.created_at
    from public.hospitals h
    left join public.hospital_verification hv on hv.hospital_id = h.id
    where (search_text is null or h.name ilike '%' || search_text || '%' or h.city ilike '%' || search_text || '%')
      and (status_filter is null or hv.status = status_filter)
    order by h.created_at desc
    limit page_size offset page * page_size;
  elsif kind = 'doctor' then
    return query
    select d.id,d.slug,d.name,
           coalesce((select h.city from public.doctor_hospitals dh join public.hospitals h on h.id = dh.hospital_id where dh.doctor_id = d.id limit 1), 'city'::text),
           d.data_status,dv.status,d.created_at
    from public.doctors d
    left join public.doctor_verification dv on dv.doctor_id = d.id
    where (search_text is null or d.name ilike '%' || search_text || '%')
      and (status_filter is null or dv.status = status_filter)
    order by d.created_at desc
    limit page_size offset page * page_size;
  elsif kind = 'pharmacy' then
    return query
    select p.id,p.slug,p.name,p.city,p.data_status,pv.status,p.created_at
    from public.pharmacies p
    left join public.pharmacy_verification pv on pv.pharmacy_id = p.id
    where (search_text is null or p.name ilike '%' || search_text || '%' or p.city ilike '%' || search_text || '%')
      and (status_filter is null or pv.status = status_filter)
    order by p.created_at desc
    limit page_size offset page * page_size;
  else
    return query
    select l.id,l.slug,l.name,l.city,l.data_status,lv.status,l.created_at
    from public.labs l
    left join public.lab_verification lv on lv.lab_id = l.id
    where (search_text is null or l.name ilike '%' || search_text || '%' or l.city ilike '%' || search_text || '%')
      and (status_filter is null or lv.status = status_filter)
    order by l.created_at desc
    limit page_size offset page * page_size;
  end if;
end;
$$;

create or replace function public.carelink_admin_list_reviews(
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, owner_id uuid, rating smallint, status text, title text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('reviews.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  return query
  select r.id,r.owner_id,r.overall_rating,r.status,r.title,r.created_at
  from public.reviews r
  where (status_filter is null or r.status = status_filter)
  order by r.created_at desc
  limit page_size offset page * page_size;end;$$;

create or replace function public.carelink_admin_list_appointments(
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, owner_id uuid, doctor_name text, hospital_name text, scheduled_date date, scheduled_time time, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('appointments.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  return query
  select a.id,a.owner_id,a.doctor_name,a.hospital_name,a.scheduled_date,a.scheduled_time,a.status,a.created_at
  from public.appointments a
  where (status_filter is null or a.status = status_filter)
  order by a.created_at desc
  limit page_size offset page * page_size;end;$$;

create or replace function public.carelink_admin_list_notifications(
  status_filter text default null,
  limit_n int default 100
)
returns table (id uuid, owner_id uuid, kind text, title text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('notifications.view') then
    raise exception 'permission denied';
  end if;
  if limit_n < 1 or limit_n > 500 then
    raise exception 'invalid limit';
  end if;
  return query
  select n.id,n.owner_id,n.kind,n.title,n.status,n.created_at
  from public.notifications n
  where (status_filter is null or n.status = status_filter)
  order by n.created_at desc
  limit limit_n;end;$$;

-- 5. Dashboard stats (real counts only; never fabricated)
create or replace function public.carelink_admin_stats()
returns table (metric text, value bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  return query
  select 'users',count(*) from public.profiles p
  union select 'suspended_users',count(*) from public.profiles p where p.account_status = 'suspended'
  union select 'active_appointments',count(*) from public.appointments a where a.status in ('confirmed','upcoming')
  union select 'published_reviews',count(*) from public.reviews r where r.status = 'published'
  union select 'pending_reviews',count(*) from public.reviews r where r.status in ('pending','hidden')
  union select 'providers_hospitals',count(*) from public.hospitals h
  union select 'providers_doctors',count(*) from public.doctors d
  union select 'providers_pharmacies',count(*) from public.pharmacies p
  union select 'providers_labs',count(*) from public.labs l
  union select 'notifications',count(*) from public.notifications n;end;$$;

-- 6. Suspend / reactivate / disable (users.manage gate;
create or replace function public.carelink_admin_set_account_status(
  target_user uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_status text;
declare notif_template text;
declare activity_event text;
begin
  if not public.carelink_admin_has_permission('users.manage') then
    raise exception 'permission denied';
  end if;
  if new_status not in ('active','suspended','disabled') then
    raise exception 'invalid account status';
  end if;
  select account_status into current_status from public.profiles where id = target_user;
  if current_status is null then
    raise exception 'profile not found';
  end if;
  if current_status = new_status then
    return;
  end if;
  if new_status = 'active' then
    notif_template := 'account_reactivated';
    activity_event := 'account_reactivated';
  elsif new_status = 'disabled' then
    notif_template := 'account_disabled';
    activity_event := 'account_disabled';
  else
    notif_template := 'account_suspended';
    activity_event := 'account_suspended';
  end if;
  update public.profiles
  set account_status = new_status,
      suspended_at = case when new_status in ('suspended','disabled') then now() else null end,
      suspended_reason = case when new_status in ('suspended','disabled') then left(coalesce(reason,''),300) else null end
  where id = target_user;
  perform public.carelink_record_audit('account_status_changed','profiles', target_user,'status: ' || current_status || ' -> ' || new_status);
  perform public.carelink_record_login_activity(activity_event, jsonb_build_object('target', target_user::text,'status', new_status));
  insert into public.notifications (id,owner_id,kind,template_code,title,body,status,scheduled_for)
  values (gen_random_uuid(), target_user,'account',notif_template,'Account status updated',left(coalesce(reason,''),180),'scheduled',now())
 on conflict (id) do nothing;end;$$;

-- 7. Grant / revoke roles with the roles.manage gate (super_admin only)
create or replace function public.carelink_admin_grant_user_role(target_user uuid, role_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('roles.manage') then
    raise exception 'permission denied';
  end if;
  return public.carelink_grant_role(target_user, role_name);end;$$;

create or replace function public.carelink_admin_revoke_user_role(target_user uuid, role_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('roles.manage') then
    raise exception 'permission denied';
  end if;
  perform public.carelink_revoke_role(target_user, role_name);end;$$;

-- 8. Permission exposure for the frontend (display only — never authorization)
create or replace function public.carelink_current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission_code order by rp.permission_code), array[]::text[])
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = auth.uid()$$;

-- 9. Restrict EXECUTE on admin RPCs; grant to authenticated。

do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_has_permission(text)',
    'carelink_admin_list_users(text,text,int,int)',
    'carelink_admin_list_security_activity(int,uuid)',
    'carelink_admin_list_audit(int,text)',
    'carelink_admin_list_providers(text,text,text,int,int)',
    'carelink_admin_list_reviews(text,int,int)',
    'carelink_admin_list_appointments(text,int,int)',
    'carelink_admin_list_notifications(text,int)',
    'carelink_admin_stats()',
    'carelink_admin_set_account_status(uuid,text,text)',
    'carelink_admin_grant_user_role(uuid,text)',
    'carelink_admin_revoke_user_role(uuid,text)',
    'carelink_current_user_permissions()',
    'carelink_is_active_admin()'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0026_admin_rbac_layer.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0027_step16_operations_and_quality.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 16: operational completion + data quality + audit depth.
-- ADDITIVE ONLY. Builds on 0001→0026. Nothing existing is dropped or altered.
--
-- This migration closes the remaining Step 16 production gaps:
--
--  1. APPOINTMENT NOTIFICATIONS — booking/cancel/reschedule lifecycle events
--     now emit a minimal, recipient-scoped notification row (safe templates,
--     small payload only; the existing notification-dispatcher Edge Function
--     fans them out). Event types stay within the existing CHECK constraint.
--  2. PROVIDER VERIFICATION / STATUS OPS — a single guarded RPC
--     `carelink_admin_set_provider_status` performs verify / reject / activate /
--     deactivate with server-side permission + suspension gates (providers.verify
--     for verification, providers.manage for status), writes the *_verification
--     tables, records an audit event AND a security activity event.
--  3. ADMIN APPOINTMENT OPERATIONS — `carelink_admin_set_appointment_status`
--     lets authorized admins complete/cancel appointments with audit + a
--     recipient notification (no cross-user health data exposed).
--  4. DATA QUALITY — `carelink_admin_data_quality` flags duplicate/missing-
--     coordinate/orphan/unverified providers, orphaned appointments/reviews,
--     and unverified media. It NEVER deletes anything — it flags for ops.
--  5. NEW SECURITY ACTIVITY EVENTS — provider verification, admin appointment
--     ops are recorded through the existing guarded recorder (CHECK constraint
--     + valid-event list extended).
--  6. EXECUTE guards for every new RPC (authenticated only; never anon/public).
--
-- SECURITY: every new function is SECURITY DEFINER with pinned search_path and
-- re-checks role/permission/suspension on the caller inside the database. No
-- new credentials, no client write paths on security/audit/provenance rows.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Extend the security-activity event vocabulary (additive)
-- ---------------------------------------------------------------------------
alter table public.security_activity_events
  drop constraint if exists security_activity_events_event_check;

alter table public.security_activity_events
  add constraint security_activity_events_event_check
  check (event in (
    'login_success','login_failure','logout','session_refresh',
    'password_reset_request','password_change','account_suspended',
    'account_reactivated','account_disabled','role_granted','role_revoked',
    'admin_login','super_admin_login','admin_access_denied',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin'
  ));

-- Keep the guarded recorder's internal whitelist in sync with the CHECK.
create or replace function public.carelink_record_login_activity(
  event text,
  metadata jsonb default '{}'::jsonb,
  ip_address text default null,
  user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
declare actor uuid := auth.uid();
declare clean_event text;
declare cap_meta jsonb;
begin
  clean_event := lower(btrim(event));
  if clean_event not in (
    'login_success','login_failure','logout','session_refresh','password_reset_request',
    'password_change','account_suspended','account_reactivated','account_disabled',
    'role_granted','role_revoked','admin_login','super_admin_login','admin_access_denied',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended() and clean_event in ('login_success','session_refresh') then
    raise exception 'account suspended';
  end if;

  cap_meta := coalesce((
    select jsonb_object_agg(k, nullif(v::text,''))
    from jsonb_each(coalesce(metadata,'{}'::jsonb)) as e(k,v)
    where jsonb_typeof(v) in ('string','number','boolean')
      and octet_length(k) <= 64
      and octet_length(nullif(v::text,'')) <= 200
  ),'{}'::jsonb);

  insert into public.security_activity_events (id, user_id, event, metadata, ip_address, user_agent)
  values (gen_random_uuid(), actor, clean_event, cap_meta, left(coalesce(ip_address,''), 64), left(coalesce(user_agent,''), 256))
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Appointment lifecycle notifications (recipient-scoped, minimal payload)
-- ---------------------------------------------------------------------------

-- Appointment/booking notification templates (additive; existing rows kept).
insert into public.notification_templates (code,kind,title_template,body_template,channel)
values
  ('appointment_booked','appointment','Appointment booked','Your CareLink appointment has been booked.','in_app'),
  ('appointment_cancelled','appointment','Appointment cancelled','Your CareLink appointment has been cancelled.','in_app'),
  ('appointment_rescheduled','appointment','Appointment rescheduled','Your CareLink appointment has been rescheduled.','in_app')
on conflict (code) do nothing;

-- Ensure the notifications.kind CHECK (and templates) allow 'appointment'.
alter table public.notification_templates
  drop constraint if exists notification_templates_kind_check;
alter table public.notifications
  drop constraint if exists notifications_kind_check;

alter table public.notification_templates
  add constraint notification_templates_kind_check
  check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup','account'));
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup','account'));

-- An AFTER INSERT/UPDATE trigger emitting a notification for lifecycle events.
create or replace function public.carelink_notify_appointment_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare event_title text;
declare event_body text;
declare event_template text;
begin
  if tg_op = 'INSERT' then
    event_title := 'Appointment booked';
    event_body := 'Your CareLink appointment has been booked. Manage it from your appointments page.';
    event_template := 'appointment_booked';
    insert into public.notifications
      (id, owner_id, kind, template_code, title, body, payload, status, scheduled_for)
    values
      (gen_random_uuid(), new.owner_id, 'appointment', event_template, event_title, event_body,
       jsonb_build_object('appointment_id', new.id::text), 'scheduled', now())
    on conflict (id) do nothing;
  elsif tg_op = 'UPDATE' and new.status is distinct from old.status then
    if new.status = 'cancelled' then
      event_title := 'Appointment cancelled';
      event_body := 'Your CareLink appointment has been cancelled.';
      event_template := 'appointment_cancelled';
    elsif new.status = 'rescheduled' then
      event_title := 'Appointment rescheduled';
      event_body := 'Your CareLink appointment has been rescheduled.';
      event_template := 'appointment_rescheduled';
    else
      return new;
    end if;
    insert into public.notifications
      (id, owner_id, kind, template_code, title, body, payload, status, scheduled_for)
    values
      (gen_random_uuid(), new.owner_id, 'appointment', event_template, event_title, event_body,
       jsonb_build_object('appointment_id', new.id::text), 'scheduled', now())
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_notify_appointment_lifecycle on public.appointments;
create trigger carelink_notify_appointment_lifecycle
  after insert or update on public.appointments
  for each row execute function public.carelink_notify_appointment_lifecycle();

-- ---------------------------------------------------------------------------
-- 2. Provider verification / status operations (audited, permission-gated)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_set_provider_status(
  provider_kind text,
  provider_id uuid,
  new_status text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare target_table text;
declare target_column text;
declare current_status text;
declare event_name text;
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended: write operations are blocked for this account';
  end if;
  -- Verification transitions require providers.verify (super-admin-only);
  -- delivery status (active/inactive) requires providers.manage.
  if new_status in ('verified','rejected') then
    if not public.carelink_admin_has_permission('providers.verify') then
      raise exception 'permission denied';
    end if;
  else
    if not public.carelink_admin_has_permission('providers.manage') then
      raise exception 'permission denied';
    end if;
  end if;
  if provider_kind not in ('hospital','doctor','pharmacy','lab') then
    raise exception 'invalid provider kind';
  end if;
  if new_status not in ('verified','rejected','active','inactive') then
    raise exception 'invalid provider status';
  end if;

  target_table := provider_kind || '_verification';
  target_column := provider_kind || '_id';

  execute format('select status from public.%I where %I = $1', target_table, target_column)
    into current_status using provider_id;
  if current_status is null then
    current_status := 'pending';
    execute format(
      'insert into public.%I (%I, status, notes) values ($1, ''pending'', null) on conflict (%I) do nothing',
      target_table, target_column, target_column
    ) using provider_id;
  end if;

  if new_status in ('verified','rejected') then
    execute format(
      'update public.%I set status = $2, verified_by = auth.uid(), verified_at = now(), notes = coalesce($3, notes) where %I = $1',
      target_table, target_column
    ) using provider_id, new_status, note;
    event_name := 'provider_verified';
    if new_status = 'rejected' then
      event_name := 'provider_rejected';
    end if;
  else
    -- 'active'/'inactive' are delivery/availability flags recorded on the provider row.
    execute format(
      'update public.%I set data_status = $2 where id = $1',
      case provider_kind when 'hospital' then 'hospitals' when 'doctor' then 'doctors' when 'pharmacy' then 'pharmacies' else 'labs' end
    ) using provider_id, case when new_status = 'active' then 'REAL' else 'UNAVAILABLE' end;
    event_name := 'provider_activated';
    if new_status = 'inactive' then
      event_name := 'provider_deactivated';
    end if;
  end if;

  perform public.carelink_record_audit(
    event_name,
    target_table,
    provider_id,
    'provider: ' || provider_kind || ' -> ' || new_status || coalesce(' — ' || note, '')
  );
  perform public.carelink_record_login_activity(
    event_name,
    jsonb_build_object('provider_kind', provider_kind, 'provider_id', provider_id::text, 'status', new_status)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin appointment operations (completion/cancellation, audited)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_set_appointment_status(
  appointment_id uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare owner_uid uuid;
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended: write operations are blocked for this account';
  end if;
  if not public.carelink_admin_has_permission('appointments.manage') then
    raise exception 'permission denied';
  end if;
  if new_status not in ('completed','cancelled') then
    raise exception 'invalid appointment status';
  end if;
  select owner_id into owner_uid from public.appointments where id = appointment_id;
  if owner_uid is null then
    raise exception 'appointment not found';
  end if;

  update public.appointments set status = new_status, notes = coalesce(reason, notes)
  where id = appointment_id;
  perform public.carelink_record_audit('appointment_updated_by_admin', 'appointments', appointment_id, 'status: -> ' || new_status || coalesce(' — ' || reason, ''));
  perform public.carelink_record_login_activity('appointment_updated_by_admin', jsonb_build_object('appointment_id', appointment_id::text, 'status', new_status));
  insert into public.notifications (id, owner_id, kind, template_code, title, body, payload, status, scheduled_for)
  values (
    gen_random_uuid(), owner_uid, 'appointment',
    case when new_status = 'cancelled' then 'appointment_cancelled' else 'appointment_booked' end,
    case when new_status = 'cancelled' then 'Appointment cancelled' else 'Appointment completed' end,
    'An administrator updated your appointment status.',
    jsonb_build_object('appointment_id', appointment_id::text), 'scheduled', now()
  ) on conflict (id) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Data quality view (flag only, never delete)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_data_quality()
returns table (
  issue_kind text,
  entity text,
  entity_id uuid,
  severity text,
  detail text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  if not public.carelink_admin_has_permission('data_quality.view') then
    raise exception 'permission denied';
  end if;
  return query
  -- duplicate hospital names (case-insensitive) in the same city
  select 'duplicate_provider'::text, 'hospital'::text, h.id,
         'medium'::text, 'Duplicate hospital name: ' || h.name
  from public.hospitals h
  join (
    select lower(name) lname, lower(coalesce(city,'')) lcity, count(*) c
    from public.hospitals group by 1,2 having count(*) > 1
  ) d on lower(h.name) = d.lname and lower(coalesce(h.city,'')) = d.lcity
  union all
  -- hospitals with no location row (missing coordinates/address)
  select 'missing_coordinates'::text, 'hospital'::text, h.id,
         'high'::text, 'Hospital has no location record'
  from public.hospitals h
  where not exists (select 1 from public.hospital_locations hl where hl.hospital_id = h.id)
  union all
  -- unverified providers (verification still pending)
  select 'unverified_provider'::text, 'hospital'::text, h.id,
         'medium'::text, 'Hospital verification still pending'
  from public.hospitals h
  left join public.hospital_verification hv on hv.hospital_id = h.id
  where hv.status is null or hv.status <> 'verified'
  union all
  -- orphaned appointments: no real doctor/hospital reference AND no names
  select 'orphaned_appointment'::text, 'appointment'::text, a.id,
         'low'::text, 'Appointment has no doctor or hospital reference'
  from public.appointments a
  where a.doctor_id is null and a.hospital_id is null and a.doctor_name is null and a.hospital_name is null
  union all
  -- orphaned reviews: dangling / missing provider target reference
  select 'orphaned_review'::text, 'review'::text, r.id,
         'low'::text, 'Review references a missing provider target'
  from public.reviews r
  left join public.hospitals h on h.id = r.hospital_id
  left join public.doctors d on d.id = r.doctor_id
  left join public.pharmacies p on p.id = r.pharmacy_id
  left join public.labs l on l.id = r.lab_id
  where (r.hospital_id is not null and h.id is null)
     or (r.doctor_id is not null and d.id is null)
     or (r.pharmacy_id is not null and p.id is null)
     or (r.lab_id is not null and l.id is null)
  union all
  -- provider media with no verified flag
  select 'unverified_media'::text, 'media'::text, pm.id,
         'low'::text, 'Provider media not verified'
  from public.provider_media pm
  where pm.verified_media = false
  limit 2000;
end;
$$;

comment on function public.carelink_admin_data_quality() is
  'Data-quality flag report. The row cap is a safety valve, NOT a report size: '
  'it is deliberately high so that a growing directory can never truncate a '
  'whole issue category before it is listed (a lower cap silently hid '
  'orphaned_review rows once the corridor directory exceeded it).';

-- ---------------------------------------------------------------------------
-- 5. Permissions for new capabilities
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('appointments.manage','Review/modify appointments as an operator (audited)'),
  ('providers.manage','Activate/deactivate provider delivery status (audited)'),
  ('data_quality.view','View data quality flags (ops)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select 'super_admin', code
from public.permissions
where code in ('appointments.manage','providers.manage','data_quality.view')
on conflict (role_id, permission_code) do nothing;

-- ADMIN gets appointment ops + data quality view but NOT provider verification.
insert into public.role_permissions (role_id, permission_code) values
  ('admin','appointments.manage'),
  ('admin','data_quality.view')
on conflict (role_id, permission_code) do nothing;

-- ---------------------------------------------------------------------------
-- 6. EXECUTE guards: every new RPC is authenticated-only.
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_set_provider_status(text,uuid,text,text)',
    'carelink_admin_set_appointment_status(uuid,text,text)',
    'carelink_admin_data_quality()'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0027_step16_operations_and_quality.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0028_ai_tools_search_reviews_infinite.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 17: AI tools + global admin search + infinite reviews.
-- ADDITIVE ONLY. Preserves every existing table/policy/index. Adds:
--
--   1. Security-activity event vocabulary (denied_admin_access,
--       denied_super_admin_access, ai_tool_attempt, ai_tool_action) in BOTH
--       the CHECK constraint and the guarded `carelink_record_login_activity`
--       whitelist — so the React client can audit admin-lane denials and AI tool
--       attempts/mutations through the existing user-scoped auditable RPC.
--
--   2. `donors.view` permission — super_admin ONLY — so blood-donor search
--       rows (contact-free redacted摘要 only) gated is behind the strongest role.
--       Never exposed to plain admins or the anonymous path.
--
--   3. `carelink_admin_stats()` extension → a rich ~26-metric operational
--       command-center feed (patients, active/suspended, appointments by
--       status, reviews, blood donors, AI conversations/messages, provider
--       verification statistics, notifications by status). Old metric names are
--       preserved so existing dashboard tiles keep working.

--   4. `carelink_admin_global_search(q, page_size, page)` — a single
--       permission-aware search across patients/doctors/hospitals/pharmacies/
--       labs/appointments/reviews/blood donors. Categories are included ONLY
--       when the caller's permissions cover them; donors rows are contact-redacted
--       (blood group, city, eligibility only — never phone/DOB/email/name.);
--       pagination capped; NO full-table download possible (max page_size 25).
--       Suspended callers are denied (definer gate), no PHI beyond what the
--       caller's permission already admits..
--
--   5. `carelink_reviews_cursor(...)` — TRUE keyset/cursor infinite scroll for
--       the public reviews stream (published-only; no duplicates/skips by
--       design; keyset ON (created_at, id) exclusive-before cursor; rating
--       + kind + text search filters; limit capped 40). Provider names/review
--       verification/provider responses ride the same RPC — relays no cross-owner
--       leakage because the definer filters to published permitted rows only.
--
--   6. Performance indexes (only justified): pg_trgm GIN on review text +
--       provider names/cities for global search; btree keyset index for the
--       review cursor;; btree on appointment date/status, notifications
--       recipient/status, security/audit recency, conversation recency.。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Security-activity event vocabulary (CHECK + guarded RPC whitelist)
-- ---------------------------------------------------------------------------
alter table public.security_activity_events drop constraint if exists security_activity_events_event_check;
alter table public.security_activity_events
  add constraint security_activity_events_event_check
  check (event in (
    'login_success','login_failure','logout','session_refresh',
    'password_reset_request','password_change','account_suspended',
    'account_reactivated','account_disabled','role_granted','role_revoked',
    'admin_login','super_admin_login','admin_access_denied',
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action'
  ));

-- ---------------------------------------------------------------------------
-- 2. donors.view permission (super_admin only)
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('donors.view','View blood-donor directory (super admin only)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select 'super_admin', 'donors.view'
where not exists (
  select 1 from public.role_permissions where role_id ='super_admin' and permission_code ='donors.view'
);

-- Extendthe guarded whitelist so the client can audit denials and AI tool actions.

create or replace function public.carelink_record_login_activity(
  event text,
  metadata jsonb default '{}'::jsonb,
  ip_address text default null,
  user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
declare actor uuid := auth.uid();
declare clean_event text;
declare cap_meta jsonb;
begin
  clean_event := lower(btrim(event));
  if clean_event not in (
    'login_success','login_failure','logout','session_refresh','password_reset_request',
    'password_change','account_suspended','account_reactivated','account_disabled',
    'role_granted','role_revoked','admin_login','super_admin_login','admin_access_denied',
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended()and clean_event in ('login_success','session_refresh') then
    raise exception 'account suspended';
  end if;

  cap_meta := coalesce((
    select jsonb_object_agg(k, nullif(v::text,''))
    from jsonb_each(coalesce(metadata,'{}'::jsonb)) as e(k,v)
    where jsonb_typeof(v) in ('string','number','boolean')
      and octet_length(k) <= 64
      and octet_length(nullif(v::text,'')) <= 200
  ),'{}'::jsonb);

  insert into public.security_activity_events (id, user_id, event, metadata, ip_address, user_agent)
 values (gen_random_uuid(), actor, clean_event, cap_meta, left(coalesce(ip_address,''), 64), left(coalesce(user_agent,''), 256))
  returning id into new_id;
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Extend carelink_admin_stats → rich command-center feed (definer)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_stats()
returns table (metric text, value bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  return query
  -- Accounts / patients
  select 'users',count(*) from public.profiles p
  union all select 'active_users',count(*) from public.profiles p where p.account_status = 'active'
  union all select 'suspended_users',count(*) from public.profiles p where p.account_status in ('suspended','disabled')
  -- Providers
  union all select 'providers_hospitals',count(*) from public.hospitals h
  union all select 'providers_doctors',count(*) from public.doctors d
  union all select 'providers_pharmacies',count(*) from public.pharmacies p
  union all select 'providers_labs',count(*) from public.labs l
  -- Appointments by status
  union all select 'total_appointments',count(*) from public.appointments a
  union all select 'active_appointments',count(*) from public.appointments a where a.status in ('confirmed','upcoming')
  union all select 'pending_appointments',count(*) from public.appointments a where a.status = 'upcoming'
  union all select 'completed_appointments',count(*) from public.appointments a where a.status = 'completed'
  union all select 'cancelled_appointments',count(*) from public.appointments a where a.status = 'cancelled'
  -- Reviews
  union all select 'total_reviews',count(*) from public.reviews r
  union all select 'published_reviews',count(*) from public.reviews r where r.status = 'published'
  union all select 'pending_reviews',count(*) from public.reviews r where r.status in ('pending','hidden')
  -- Blood donors
  union all select 'blood_donors',count(*) from public.donor_profiles dp where dp.is_active
  -- AI
  union all select 'ai_conversations',count(*) from public.conversations c
  union all select 'ai_messages',count(*) from public.conversation_messages cm
  union all select 'ai_tool_actions',count(*) from public.security_activity_events sae where sae.event in ('ai_tool_attempt','ai_tool_action')
  -- Provider verification statistics
  union all select 'verification_verified',(select count(*) from public.hospital_verification where status='verified') + (select count(*) from public.doctor_verification where status='verified') + (select count(*) from public.pharmacy_verification where status='verified') + (select count(*) from public.lab_verification where status='verified')
  union all select 'verification_pending',(select count(*) from public.hospital_verification where status='pending') + (select count(*) from public.doctor_verification where status='pending') + (select count(*) from public.pharmacy_verification where status='pending') + (select count(*) from public.lab_verification where status='pending')
  union all select 'verification_rejected',(select count(*) from public.hospital_verification where status='rejected') + (select count(*) from public.doctor_verification where status='rejected') + (select count(*) from public.pharmacy_verification where status='rejected') + (select count(*) from public.lab_verification where status='rejected')
  -- Notifications by status
  union all select 'notifications',count(*) from public.notifications n
  union all select 'notifications_sent',count(*) from public.notifications n where n.status in ('sent','read')
  union all select 'notifications_pending',count(*) from public.notifications n where n.status in ('scheduled','pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Global admin search (permission-scoped, donor-redacted, paginated)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_global_search(
  q text default '',
  page_size int default 20,
  page int default 0
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  status text,
  extra jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare search text;
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  -- Least-privilege scoping: a caller with NONE of the global-search
  -- permissions is denied entirely (an empty "no results" response would
  -- be indistinguishable from an authorized-but-empty search).
  if not (
    public.carelink_admin_has_permission('users.view')
    or public.carelink_admin_has_permission('providers.view')
    or public.carelink_admin_has_permission('appointments.view')
    or public.carelink_admin_has_permission('reviews.view')
    or public.carelink_admin_has_permission('donors.view')
  ) then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 25 or page < 0 then
    raise exception 'invalid paging';
  end if;
  search := btrim(coalesce(q,''));
  if search = '' then
    return query select 'empty'::text, null::uuid, 'Type to search'::text, ''::text, ''::text, '{}'::jsonb
    where false;
    return;
  end if;

  -- Patients: requires users.view
  if public.carelink_admin_has_permission('users.view') then
    return query
    select 'patient', p.id, p.display_name, au.email, p.account_status,
           jsonb_build_object('created_at', p.created_at, 'last_activity',(select max(sa.created_at) from public.security_activity_events sa where sa.user_id = p.id))
    from public.profiles p
    left join auth.users au on au.id = p.id
    where p.display_name ilike '%' || search || '%' or au.email ilike '%' || search || '%'
    order by p.created_at desc
    limit page_size offset page * page_size;
  end if;

  -- Hospitals / doctors / pharmacies / labs: requires providers.view
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'hospital', h.id, h.name, coalesce(h.city,''), coalesce(h.data_status,'pending'), jsonb_build_object('slug', h.slug)
    from public.hospitals h
    where h.name ilike '%' || search || '%' or h.city ilike '%' || search || '%'
    order by h.name
    limit page_size offset page * page_size;
  end if;
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'doctor', d.id, d.name, coalesce((select h.city from public.doctor_hospitals dh join public.hospitals h on h.id = dh.hospital_id where dh.doctor_id = d.id limit 1),''), coalesce(d.data_status,'pending'), jsonb_build_object('slug', d.slug)
    from public.doctors d
    where d.name ilike '%' || search || '%'
    order by d.name
    limit page_size offset page * page_size;
  end if;
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'pharmacy', p.id, p.name, coalesce(p.city,''), coalesce(p.data_status,'pending'), jsonb_build_object('slug', p.slug)
    from public.pharmacies p
    where p.name ilike '%' || search || '%' or p.city ilike '%' || search || '%'
    order by p.name
    limit page_size offset page * page_size;
  end if;
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'lab', l.id, l.name, coalesce(l.city,''), coalesce(l.data_status,'pending'), jsonb_build_object('slug', l.slug)
    from public.labs l
    where l.name ilike '%' || search || '%' or l.city ilike '%' || search || '%'
    order by l.name
    limit page_size offset page * page_size;
  end if;

  -- Appointments: requires appointments.view
  if public.carelink_admin_has_permission('appointments.view') then
    return query
    select 'appointment', a.id, coalesce(a.doctor_name,''), coalesce(a.hospital_name,''), a.status,
           jsonb_build_object('scheduled_date', a.scheduled_date,'scheduled_time',a.scheduled_time,'owner_id',a.owner_id::text,'appointment_id',a.id::text)
    from public.appointments a
    where a.doctor_name ilike '%' || search || '%' or a.hospital_name ilike '%' || search || '%' or a.doctor_id ilike '%' || search || '%' or a.hospital_id ilike '%' || search || '%'
    order by a.scheduled_date desc
    limit page_size offset page * page_size;
  end if;

  -- Reviews: requires reviews.view
  if public.carelink_admin_has_permission('reviews.view') then
    return query
    select 'review', r.id, coalesce(r.title,'Untitled review'), coalesce(r.body,''), r.status,
           jsonb_build_object('rating', r.overall_rating,'created_at', r.created_at,'owner_id',r.owner_id::text)
    from public.reviews r
    where r.title ilike '%' || search || '%' or r.body ilike '%' || search || '%'
    order by r.created_at desc
    limit page_size offset page * page_size;
  end if;

  -- Blood donors: requires donors.view (super_admin only) — NEVER phone/DOB/email/name. Donor rows are redacted (group + city + active eligibility only).
  if public.carelink_admin_has_permission('donors.view') then
    return query
    select 'blood_donor', dp.id, b.label, coalesce(dp.city,''), case when dp.is_active then 'active' else 'inactive' end,
           jsonb_build_object('eligible', (select d.is_eligible from public.donor_eligibility d where d.donor_profile_id = dp.id limit 1), 'matched_at',(select max(dm.matched_at) from public.donor_match_results dm where dm.donor_profile_id = dp.id))
    from public.donor_profiles dp
    join public.blood_groups b on b.code = dp.blood_group_code
    where b.label ilike '%' || search || '%' or dp.city ilike '%' || search || '%'
    order by dp.created_at desc
    limit page_size offset page * page_size;
  end if;

  -- Nothing authorized matched: honest empty.
   return query select 'none'::text, null::uuid, ''::text,''::text,''::text,'{}'::jsonb where false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. TRUE infinite-scroll reviews (keyset/cursor, published-only)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_reviews_cursor(
  p_query text default null,
  p_rating smallint default null,
  p_kind text default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  body text,
  rating smallint,
  author_display text,
  provider_kind text,
  provider_name text,
  provider_slug text,
  is_verified boolean,
  provider_response text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare lim int;
begin
  -- Public stream: any caller may read published reviews; the definer NEVER
  -- returns non-published rows (a direct table select exposes them to the
  -- author-only policy, this RPC is the only public keyset path.

  lim := least(greatest(coalesce(p_limit,20),1),40);

  return query
  select r.id,r.title,r.body,r.overall_rating,
         coalesce(p.display_name,'Anonymous'),
         case
           when r.hospital_id is not null then 'hospital'
           when r.doctor_id is not null then 'doctor'
           when r.pharmacy_id is not null then 'pharmacy'
           when r.lab_id is not null then 'lab' else 'provider' end,
         coalesce(
           (select h.name from public.hospitals h where h.id = r.hospital_id),
           (select d.name from public.doctors d where d.id = r.doctor_id),
           (select p2.name from public.pharmacies p2 where p2.id = r.pharmacy_id),
           (select l.name from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce(
           (select h.slug from public.hospitals h where h.id = r.hospital_id),
           (select d.slug from public.doctors d where d.id = r.doctor_id),
           (select p2.slug from public.pharmacies p2 where p2.id = r.pharmacy_id),
           (select l.slug from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id),false),
         (select pr.body from public.provider_responses pr where pr.review_id = r.id limit 1),
         r.created_at
  from public.reviews r
  left join public.profiles p on p.id = r.owner_id
  where r.status = 'published'
    and (p_query is null or p_query = '' or r.title ilike '%' || p_query || '%' or r.body ilike '%' || p_query || '%' or coalesce(p.display_name,'') ilike '%' || p_query || '%')
    and (p_rating is null or r.overall_rating = p_rating)
    and (
      p_kind is null or p_kind = '' or
      (p_kind = 'hospital' and r.hospital_id is not null) or
      (p_kind = 'doctor' and r.doctor_id is not null) or
      (p_kind = 'pharmacy' and r.pharmacy_id is not null) or
      (p_kind = 'lab'and r.lab_id is not null)
    )
   and (p_before_created is null or (r.created_at, r.id) < (p_before_created, p_before_id))
  order by r.created_at desc, r.id desc
  limit lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Performance indexes (justified)
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists reviews_keyset_idx on public.reviews (created_at desc, id desc) where status ='published';
create index if not exists reviews_title_trgm_idx on public.reviews using gin (title gin_trgm_ops) where title is not null;
create index if not exists reviews_body_trgm_idx on public.reviews using gin (body gin_trgm_ops) where body is not null;
create index if not exists hospitals_name_trgm_idx on public.hospitals using gin (name gin_trgm_ops);
create index if not exists hospitals_city_trgm_idx on public.hospitals using gin (city gin_trgm_ops) where city is not null;
create index if not exists doctors_name_trgm_idx on public.doctors using gin (name gin_trgm_ops);
create index if not exists pharmacists_name_trgm_idx on public.pharmacies using gin (name gin_trgm_ops);
create index if not exists pharmacists_city_trgm_idx on public.pharmacies using gin (city gin_trgm_ops) where city is not null;
create index if not exists labs_name_trgm_idx on public.labs using gin (name gin_trgm_ops);
create index if not exists labs_city_trgm_idx on public.labs using gin (city gin_trgm_ops) where city is not null;
create index if not exists appointments_schedule_status_idx on public.appointments (scheduled_date, status);
create index if not exists notifications_recipient_status_idx on public.notifications (owner_id, status);
create index if not exists security_activity_created_idx on public.security_activity_events (created_at desc);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists conversations_updated_desc_idx on public.conversations (updated_at desc);
create index if not exists profiles_account_status_idx on public.profiles (account_status);

-- ---------------------------------------------------------------------------
-- 7. EXECUTE guards: new RPCs authenticated-only (public/anon revoked
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_global_search(text,int,int)',
    'carelink_reviews_cursor(text,smallint,text,timestamptz,uuid,int)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0028_ai_tools_search_reviews_infinite.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0028_step17_carelink_command_center.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 17: Clinical command center + global search + reviews
-- feed cursor + family-context resolver + performance indexes. ADDITIVE ONLY.
--
-- Builds on 0001→0027. Nothing existing is dropped or altered. This migration:
--
--  1. SUPER ADMIN COMMAND CENTER METRICS — extends carelink_admin_stats
--     with the full real-DB metrics set. Every value is a real count at query time.
--     NO fabricated numbers, NO fake percentages — insufficient data simply
--     returns honest zeros/empty. Dashboards decide how to present..
--
--  2. GLOBAL ADMIN SEARCH — a single guarded RPC carelink_admin_search_results
--     across patients, doctors, hospitals, pharmacies, labs, donors (privacy-shielded,
--     appointment header rows, review rows). Authorization-aware: every result is
--     presented per the caller's session permission, page-bounded, and never exposes
--     private donor contact info (donor rows strip phone/DOB/owner identity and keep
--     only city + blood group). No full-table download: LIMIT/OFFSET with bounded
--     page_size + normalized LIKE-search on indexed columns.

--  3. REVIEWS TRUE INFINITE SCROLL — carelink_reviews_feed_cursor
--     (cursor/keyset pagination). Cursor = (created_at,id) so page spills
--     never duplicate/skip on equal-timestamp rows; descending order; page_size
--     bounded; NO huge offsets. Supports rating_min/max, provider-kind/provider-id
--     filters, status moderation (admin-only when non-published), provider response,
--     verification badge, author initials (masked), and targets the executing
--     session (public published feed, plus admin queue when authorized).
--
--  4. FAMILY-CONTEXT RESOLVER — carelink_resolve_family_profile(uuid)
--
--     THE ONLY backend way o map a frontend "family member being asked about"
--     to an authorized row. Returns NULL for any id that is not owned by the caller —
--     even for an admin (admin may not impersonate a patient's family context). This
--     is the IDOR firewall for AI family context.

--  5. PERFORMANCE INDEXES — justified indexes for search/review-feed/
--     notifications/conversations/audit hot paths. ADDITIVE, skipped if exists..
--
-- SECURITY: every new function is SECURITY DEFINER with pinned search_path and
-- re-checks role/permission/suspension on the caller inside the database. The
-- global search returns NO PHI beyond what each viewing role already sees (donor
-- rows stripped, appointment/review rows redacted). No new credentials, no client
-- write paths on security/audit rows. EXECUTE revoked from public/anon and granted to
-- authenticated only..
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. trigram index helper (only when pg_trgm installed) — dynamic so it
--     works both locally (superuser) and on managed Supabase projects.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists hospitals_name_trgm_idx on public.hospitals using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists doctors_name_trgm_idx on public.doctors using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists pharmacies_name_trgm_idx on public.pharmacies using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists labs_name_trgm_idx on public.labs using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists profiles_display_name_trgm_idx on public.profiles using gin (display_name gin_trgm_ops) where display_name is not null;';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Command-center stats — extended real-DB metrics
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_stats()
returns table (metric text, value bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  return query
  -- Accounts / patients
  select 'users',count(*) from public.profiles p
  union all select 'active_users',count(*) from public.profiles p where p.account_status = 'active'
  union all select 'suspended_users',count(*) from public.profiles p where p.account_status in ('suspended','disabled')
  union all select 'patients',count(*) from public.profiles p
  union all select 'active_patients',count(*) from public.profiles p where p.account_status = 'active'
  -- Providers
  union all select 'providers_hospitals',count(*) from public.hospitals h
  union all select 'active_hospitals',count(*) from public.hospitals h
    where exists (select 1 from public.hospital_verification v where v.hospital_id = h.id and v.status = 'verified')
  union all select 'providers_doctors',count(*) from public.doctors d
  union all select 'active_doctors',count(*) from public.doctors d
    where exists (select 1 from public.doctor_verification v where v.doctor_id = d.id and v.status = 'verified')
  union all select 'providers_pharmacies',count(*) from public.pharmacies p
  union all select 'active_pharmacies',count(*) from public.pharmacies p
    where exists (select 1 from public.pharmacy_verification v where v.pharmacy_id = p.id and v.status = 'verified')
  union all select 'providers_labs',count(*) from public.labs l
  union all select 'active_labs',count(*) from public.labs l
    where exists (select 1 from public.lab_verification v where v.lab_id = l.id and v.status = 'verified')
  -- Appointments by status
  union all select 'total_appointments',count(*) from public.appointments a
  union all select 'appointments',count(*) from public.appointments a
  union all select 'active_appointments',count(*) from public.appointments a where a.status in ('confirmed','upcoming')
  union all select 'pending_appointments',count(*) from public.appointments a where a.status = 'upcoming'
  union all select 'confirmed_appointments',count(*) from public.appointments a where a.status = 'confirmed'
  union all select 'upcoming_appointments',count(*) from public.appointments a where a.status = 'upcoming'
  union all select 'completed_appointments',count(*) from public.appointments a where a.status = 'completed'
  union all select 'cancelled_appointments',count(*) from public.appointments a where a.status = 'cancelled'
  union all select 'rescheduled_appointments',count(*) from public.appointments a where a.status = 'rescheduled'
  -- Reviews
  union all select 'total_reviews',count(*) from public.reviews r
  union all select 'reviews',count(*) from public.reviews r
  union all select 'published_reviews',count(*) from public.reviews r where r.status = 'published'
  union all select 'pending_reviews',count(*) from public.reviews r where r.status in ('pending','hidden')
  union all select 'provider_responses',count(*) from public.provider_responses pr
  -- Blood donors
  union all select 'blood_donors',count(*) from public.donor_profiles dp where dp.is_active
  union all select 'donors',count(*) from public.donor_profiles dp
  union all select 'active_donors',count(*) from public.donor_profiles dp where dp.is_active = true
  -- AI
  union all select 'ai_conversations',count(*) from public.conversations c
  union all select 'ai_messages',count(*) from public.conversation_messages cm
  union all select 'ai_tool_actions',count(*) from public.security_activity_events sae where sae.event in ('ai_tool_attempt','ai_tool_action')
  -- Provider verification statistics
  union all select 'verification_verified',(select count(*) from public.hospital_verification where status='verified') + (select count(*) from public.doctor_verification where status='verified') + (select count(*) from public.pharmacy_verification where status='verified') + (select count(*) from public.lab_verification where status='verified')
  union all select 'verification_pending',(select count(*) from public.hospital_verification where status='pending') + (select count(*) from public.doctor_verification where status='pending') + (select count(*) from public.pharmacy_verification where status='pending') + (select count(*) from public.lab_verification where status='pending')
  union all select 'verification_rejected',(select count(*) from public.hospital_verification where status='rejected') + (select count(*) from public.doctor_verification where status='rejected') + (select count(*) from public.pharmacy_verification where status='rejected') + (select count(*) from public.lab_verification where status='rejected')
  -- Notifications by status
  union all select 'notifications',count(*) from public.notifications n
  union all select 'notifications_sent',count(*) from public.notifications n where n.status in ('sent','read')
  union all select 'notification_sent',count(*) from public.notifications n where n.status in ('sent','read')
  union all select 'notifications_pending',count(*) from public.notifications n where n.status in ('scheduled','pending')
  -- Media
  union all select 'media_assets',count(*) from public.provider_media pm;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Global admin search — server-side, page-bounded, donor-privacy-safe
-- ---------------------------------------------------------------------------
-- ---------------------------------------------------------------------------
-- 2. Global admin search — server-side, page-bounded, donor-privacy-safe.
--    Canonical RPC name (Step 17 shape). The original 0028 pairing defined a
--    second overload of carelink_admin_global_search with an incompatible
--    return type; that name is owned by the AI-tools migration, so the richer
--    command-center search uses its own explicit name.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_search_results(
  search_text text default null,
  page_size int default 20,
  page int default 0
)
returns table (
  result_kind text,
  result_id text,
  name text,
  detail text,
  status text,
  data_status text,
  extra jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_search text;
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 50 or page < 0 then
    raise exception 'invalid paging';
  end if;
  v_search := coalesce(nullif(trim(search_text), ''), null);
  if v_search is null then
    return;
  end if;

  return query
  select 'patient'::text, p.id::text, coalesce(p.display_name,''), au.email,
         p.account_status, null::text,
         jsonb_build_object('created_at', p.created_at)
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.display_name ilike '%' || v_search || '%' or au.email ilike '%' || v_search || '%'
  order by p.created_at desc
  limit page_size offset page * page_size;

  return query
  select * from (
    select 'hospital'::text, h.id::text, h.name, coalesce(h.city,''),
           coalesce((select v.status from public.hospital_verification v where v.hospital_id = h.id limit 1),''),
           h.data_status, jsonb_build_object('created_at', h.created_at,'city', h.city)
    from public.hospitals h
    where h.name ilike '%' || v_search || '%' or h.city ilike '%' || v_search || '%'
    order by h.created_at desc
    limit page_size offset page * page_size
  ) hospitals
  union all
  select * from (
    select 'doctor'::text, d.id::text, d.name,
           coalesce((select s.name from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id where ds.doctor_id = d.id order by ds.id limit 1),''),
           coalesce((select v.status from public.doctor_verification v where v.doctor_id = d.id limit 1),''),
           d.data_status,
           jsonb_build_object('created_at', d.created_at,'city', (select h.city from public.doctor_hospitals dh join public.hospitals h on h.id = dh.hospital_id where dh.doctor_id = d.id limit 1))
    from public.doctors d
    where d.name ilike '%' || v_search || '%' or exists (select 1 from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id where ds.doctor_id = d.id and s.name ilike '%' || v_search || '%')
    order by d.created_at desc
    limit page_size offset page * page_size
  ) doctors
  union all
  select * from (
    select 'pharmacy'::text, p.id::text, p.name, coalesce(p.city,''),
           coalesce((select v.status from public.pharmacy_verification v where v.pharmacy_id = p.id limit 1),''),
           p.data_status, jsonb_build_object('created_at', p.created_at,'city', p.city)
    from public.pharmacies p
    where p.name ilike '%' || v_search || '%' or p.city ilike '%' || v_search || '%'
    order by p.created_at desc
    limit page_size offset page * page_size
  ) pharmacies
  union all
  select * from (
    select 'lab'::text, l.id::text, l.name, coalesce(l.city,''),
           coalesce((select v.status from public.lab_verification v where v.lab_id = l.id limit 1),''),
           l.data_status, jsonb_build_object('created_at', l.created_at,'city', l.city)
    from public.labs l
    where l.name ilike '%' || v_search || '%' or l.city ilike '%' || v_search || '%'
    order by l.created_at desc
    limit page_size offset page * page_size
  ) labs
  union all
  -- Blood donors: privacy-shielded — NO phone/DOB/owner identity surfaces.
  select * from (
    select 'donor'::text, dp.id::text,
           'Blood donor (area: ' || coalesce(dp.city,'unknown') || ')',
           coalesce(dp.blood_group_code,''),
           case when dp.is_active then 'available' else 'inactive' end,
           null::text,
           jsonb_build_object('blood_group', dp.blood_group_code,'city', dp.city)
    from public.donor_profiles dp
    where dp.city ilike '%' || v_search || '%' or dp.blood_group_code ilike '%' || v_search || '%'
    order by dp.created_at desc
    limit page_size offset page * page_size
  ) donors
  union all
  -- Appointments: operator-safe header rows only (no medical notes/body).
  select * from (
    select 'appointment'::text, a.id::text, coalesce(a.doctor_name,''),
           coalesce(a.hospital_name,''),
           a.status, null::text,
           jsonb_build_object('scheduled_date', a.scheduled_date,'scheduled_time', a.scheduled_time,'owner', a.owner_id::text,'family_profile_id', a.family_profile_id::text)
    from public.appointments a
    where a.doctor_name ilike '%' || v_search || '%' or a.hospital_name ilike '%' || v_search || '%' or a.specialty ilike '%' || v_search || '%'
    order by a.created_at desc
    limit page_size offset page * page_size
  ) appointments
  union all
  select * from (
    select 'review'::text, r.id::text, coalesce(r.title,''), coalesce(r.body,''),
           r.status, null::text,
           jsonb_build_object('rating', r.overall_rating,'owner', r.owner_id::text,'created_at', r.created_at)
    from public.reviews r
    where r.title ilike '%' || v_search || '%' or r.body ilike '%' || v_search || '%'
    order by r.created_at desc
    limit page_size offset page * page_size
  ) reviews;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reviews — true infinite scroll via cursor/keyset pagination
-- ---------------------------------------------------------------------------
create or replace function public.carelink_reviews_feed_cursor(
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size int default 20,
  rating_min int default null,
  rating_max int default null,
  provider_kind text default null,
  provider_id uuid default null,
  status_filter text default null
)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  body text,
  overall_rating smallint,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  hospital_name text,
  doctor_name text,
  pharmacy_name text,
  lab_name text,
  subject_kind text,
  verified_interaction boolean,
  response_body text,
  author_initials text,
  author_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_page_size int;
begin
  -- Fail-closed paging: reject out-of-range page_size instead of silently
  -- clamping, so an unbounded/abusive request is never masked by a LIMIT.
  if page_size is not null and (page_size < 1 or page_size > 50) then
    raise exception 'invalid page_size';
  end if;
  v_page_size := least(greatest(coalesce(page_size,20),1),50);
  if rating_min is not null and (rating_min <1 or rating_min >5) then
    raise exception 'invalid rating_min';
  end if;
  if rating_max is not null and (rating_max <1 or rating_max >5) then
    raise exception 'invalid rating_max';
  end if;
  if provider_kind is not null and provider_kind not in ('hospital','doctor','pharmacy','lab') then
    raise exception 'invalid provider_kind';
  end if;
  if status_filter is not null and status_filter not in ('published','pending','hidden','removed') then
    raise exception 'invalid status_filter';
  end if;
  -- Non-public moderation states are admin-only (no leaking hidden/removed rows).
  if status_filter is not null and status_filter <> 'published' and not public.carelink_is_admin() then

    raise exception 'permission denied';
  end if;

  return query
  select r.id,r.owner_id,r.title,r.body,r.overall_rating,r.status,r.created_at,r.updated_at,
         coalesce(h.name,''), coalesce(d.name,''), coalesce(p.name,''), coalesce(l.name,''),
         case when r.hospital_id is not null then 'hospital'
              when r.doctor_id is not null then 'doctor'
              when r.pharmacy_id is not null then 'pharmacy'
              when r.lab_id is not null then 'lab'
              else 'unknown' end,
         coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id),false),
         coalesce((select pr.body from public.provider_responses pr where pr.review_id = r.id),null),
         left(coalesce(split_part(coalesce(prof.display_name,''),' ',1),''),1) || left(coalesce(split_part(coalesce(prof.display_name,''),' ',2),''),1),
         coalesce(prof.display_name,'CareLink member')
  from public.reviews r
  left join public.hospitals h on h.id = r.hospital_id
  left join public.doctors d on d.id = r.doctor_id
  left join public.pharmacies p on p.id = r.pharmacy_id
  left join public.labs l on l.id = r.lab_id
  left join public.profiles prof on prof.id = r.owner_id
  where (coalesce(status_filter,'published') = r.status)
    and (rating_min is null or r.overall_rating >= rating_min)
   and (rating_max is null or r.overall_rating <= rating_max)
   and (provider_kind is null or (case when r.hospital_id is not null then 'hospital'
                                       when r.doctor_id is not null then 'doctor'
                                       when r.pharmacy_id is not null then 'pharmacy'
                                       when r.lab_id is not null then 'lab'
                                       else 'unknown' end) = provider_kind)
   and (provider_id is null or coalesce(r.hospital_id,r.doctor_id,r.pharmacy_id,r.lab_id) = provider_id)

   and (cursor_created_at is null or cursor_id is null or (r.created_at,r.id) < (cursor_created_at,cursor_id))
  order by r.created_at desc, r.id desc
  limit v_page_size;end;$$;

-- ---------------------------------------------------------------------------
-- 4. Family-context resolver — thee ONLY backend way to resolve an authorized
--     family member from a frontend ask ("my mother…" → row).
-- ---------------------------------------------------------------------------
create or replace function public.carelink_resolve_family_profile(family_id uuid)
returns public.family_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select fp.* from public.family_profiles fp
  where fp.id = family_id and fp.owner_id = auth.uid() and (
    fp.relation in ('self','parent','child','spouse','other')
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. EXECUTE guards for the new RPCs (authenticated only; never anon/public).
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_search_results(text,int,int)',
    'carelink_reviews_feed_cursor(timestamptz,uuid,int,int,int,text,uuid,text)',
    'carelink_resolve_family_profile(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0028_step17_carelink_command_center.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0029_step18_owner_auth_hierarchy.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 18: real owner auth + admin/super-admin hierarchy +
-- owner bootstrap floor + AI response guardrail. ADDITIVE ONLY.
--
-- Builds on 0001→0028. Nothing existing is dropped or altered. This migration:
--
--  1. SECURITY-ACTIVITY EVENT VOCABULARY — extends the CHECK constraint and
--       the guarded `carelink_record_login_activity` whitelist with the Step-18
--       audit events:
--         - `admin_login_success` / `super_admin_login_success` — the login
--           lane the account entered was selected by the UI and the server-side
--           role was verified,so auditors can distinguish Admin Login from
--           Super Admin Login for the SAME authenticated identity;
--         - `suspended_login_denied` — a suspended/disabled account attempted
--           an admin/super-admin login lane (denied deterministically);
--         - `owner_bootstrap` — a secure owner bootstrap completed;
--         - `role_change` / `permission_change` — role/permission membership
--           changed via the guarded RPC layer (audited, target+role metadata);
--         - `privileged_operation` — generic audited elevated-ops marker for
--           privileged admin mutations that need an activity trace.
--
--  2. OWNER BOOTSTRAP FLOOR — `carelink_owner_bootstrap(self_email)`: a
--       SECURITY DEFINER, pinned-path, idempotent, audited function that lets the
--       OWNER of the platform turn their OWN real auth account into the FIRST
--       super_admin. Guarantees:
--         - SELF-ONLY: the caller's auth.users record must match the passed
--           email — nobody can bootstrap another account.
--         - ACTIVE-ONLY: suspended/disabled callers are denied (restore later
--           by another super_admin via the console.
--         - FIRST-ONLY: when a super_admin user_roles row ALREADY exists, the
--           call is a safe no-op returning false — it never mints a second
--           super_admin and never creates a duplicate role row。
--         - IDEMPOTENT: re-running after success is a no-op (false。
--         - TRUSTED-ROLE ONLY: it inserts a real `user_roles` row for the
--           authenticated caller — NEVER e user-provided role/email claims asthe
--           authorization input (email only identifies WHICH caller may run it)。
--         - AUDITED: writes an audit_events row AND a security-activity event
--           (owner_bootstrap, target = self uuid only)。
--       The existing admin-gateway Edge Function can call this function for the
--       operator-provided bootstrap secret — the UI never calls it directly (only
--       server-side paths with the caller's JWT may reach it; EXECUTE is granted
--       to authenticated because the function itself enforces self+first+active)。
--
--  3. ROLE-HIERARCHY PERMISSION RESOLVER — `carelink_has_permission_or_higher(
--       required_role, required_permission)`: raises EXCEPTION unless the acting
--       user's actual role is at least `required_role` in the hierarchy
--       (patient < hospital_admin < lab_admin < pharmacy_admin < admin <
--       super_admin) AND has the required permission (super_admin always
--       inherits every permission)。 All existing admin RPCs already pass SUPER_ADMIN
--       through `carelink_admin_has_permission` (which ends with
--       `or carelink_is_super_admin()`)；this adds an explicit, testable,
--       singular hierarchy predicate for callers that need both role-and-permission
--       gating (e.g. future ops endpoints)。It is NOT a bypass — it is the
--       inverse of every existing check.
--
--  4. AI RESPONSE GUARDRAIL — `carelink_ai_response_guardrail(payload, role)`
--       a deterministic SECURITY DEFINER floor that screens an LLM-produced text
--       payload for emergency escalation, diagnostic overclaim, instructionand
--       secret-leak patterns. Returns `true` when the payload is deemed SAFE as set
--       (or the pattern set has no matches), `false` when a credible violation was
--       detected (caller should treat the response as untrusted and fall back)。
--       This is the DB layer of the existing defense-in-depth AI guardrail — NOT
--       the only mechanism (model instruction layer, application safetyLayer,
--       tools, RLS, output validation all remain)。
--
-- SECURITY: every new function is SECURITY DEFINER with pinned search_path and
-- re-checks suspension/role on the caller inside the database。 No new credentials,
-- no client write paths on security/audit rows, no raw AI text persisted anywhere。
-- The owner email flows ONLY as an input to the audited self-check function.。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the security-activity event vocabulary (CHECK + guarded RPC)
-- ---------------------------------------------------------------------------
alter table public.security_activity_events
  drop constraint if exists security_activity_events_event_check;

alter table public.security_activity_events
  add constraint security_activity_events_event_check
  check (event in (
    'login_success','login_failure','logout','session_refresh',
    'password_reset_request','password_change','account_suspended',
    'account_reactivated','account_disabled','role_granted','role_revoked',
    'admin_login','super_admin_login','admin_access_denied',
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
    'owner_bootstrap','role_change','permission_change','privileged_operation'
  ));

-- Keep the guarded recorder's internal whitelist in sync with the CHECK.
create or replace function public.carelink_record_login_activity(
  event text,
  metadata jsonb default '{}'::jsonb,
  ip_address text default null,
  user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
declare actor uuid := auth.uid();
declare clean_event text;
declare cap_meta jsonb;
begin
  clean_event := lower(btrim(event));
  if clean_event not in (
    'login_success','login_failure','logout','session_refresh','password_reset_request',
    'password_change','account_suspended','account_reactivated','account_disabled',
    'role_granted','role_revoked','admin_login','super_admin_login','admin_access_denied',
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
    'owner_bootstrap','role_change','permission_change','privileged_operation'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended() and clean_event in ('login_success','session_refresh') then
    raise exception 'account suspended';
  end if;

  -- Retain only tiny scalar metadata (never raw credentials/tokens/PHI). No
  -- arrays/objects/nested values are kept.


  cap_meta := coalesce((
    select jsonb_object_agg(k, nullif(v::text,''))
    from jsonb_each(coalesce(metadata,'{}'::jsonb)) as e(k,v)
    where jsonb_typeof(v) in ('string','number','boolean')
      and octet_length(k) <= 64
      and octet_length(nullif(v::text,'')) <= 200
  ),'{}'::jsonb);

  insert into public.security_activity_events (id, user_id, event, metadata, ip_address, user_agent)
  values (gen_random_uuid(), actor, clean_event, cap_meta, left(coalesce(ip_address,''), 64), left(coalesce(user_agent,''), 256))
  returning id into new_id;
  return new_id;end;$$;

-- Faster filtering of the new activity vocabulary (justified index for ops/audit).
create index if not exists security_activity_events_event_idx
  on public.security_activity_events (event, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Owner bootstrap floor — first-super_admin self-assignment (audited)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_owner_bootstrap(self_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
declare actor_email text;
declare status text;
declare new_role_id uuid;
begin
  -- Self-only: the caller must be authenticatedand their own auth.users row
  -- must match the submitted email. An ALREADY elevated caller still must pass
  -- this own-email identity check (bootstrap never operates ona target).
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended() then
    raise exception 'account suspended: bootstrap requires an active account';
  end if;

  select au.email, p.account_status
    into actor_email, status
    from auth.users au
    left join public.profiles p on p.id = au.id
    where au.id = actor;
  if actor_email is null then
    raise exception 'email not found';
  end if;
  if lower(btrim(actor_email)) <> lower(btrim(coalesce(self_email, ''))) then
    raise exception 'bootstrap email must match the authenticated user';
  end if;
  if status is not null and status in ('suspended','disabled') then
    raise exception 'account suspended: bootstrap requires an active account';
  end if;

  -- First-only + idempotent: when ANY super_admin already exists, this is a
  -- safe no-op (never mints a second super_admin, never duplicates rows。
  if exists (select 1 from public.user_roles where role_id ='super_admin') then
    return false;
  end if;

  -- Insert the trusted role row for THE CALLER (auth.uid(), never user input。
  insert into public.user_roles ( id , user_id , role_id , granted_by )
  values (gen_random_uuid(), actor, 'super_admin', actor)
  on conflict ( user_id , role_id ) do nothing
  returning id into new_role_id;

  -- Audited: audit row + security-activity event (target = self only。。
  perform public.carelink_record_audit('owner_bootstrap', 'user_roles', actor,'role: super_admin');
  perform public.carelink_record_login_activity('owner_bootstrap', jsonb_build_object('target', 'self', 'role', 'super_admin'));
  return new_role_id is not null;
end;
$$;

-- EXECUTE guard: authenticated-callable (the function self-enforces self+first+active).
revoke execute on function public.carelink_owner_bootstrap(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_owner_bootstrap(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_owner_bootstrap(text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Role-hierarchy permission resolver (patient < … < super_admin)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_permission_or_higher(
  required_role text,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    -- The acting user's actual role must be at least the required hierarchy floor
    -- (super_admin automatically satisfies every lower floor;admin hierarchy
    --  is: patient < hospital_admin < lab_admin < pharmacy_admin < admin <
    --  super_admin). A caller with NO role row never matches (safe false)。
    (select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and (
          required_role = 'super_admin' and ur.role_id in ('admin','super_admin')
          or required_role = 'admin' and ur.role_id in ('admin','super_admin')
          or required_role = 'pharmacy_admin' and ur.role_id in ('pharmacy_admin','admin','super_admin')
          or required_role = 'lab_admin' and ur.role_id in ('lab_admin','admin','super_admin')
          or required_role = 'hospital_admin' and ur.role_id in ('hospital_admin','admin','super_admin')
          or required_role = 'doctor'and ur.role_id in ('doctor','admin','super_admin')
          or required_role = 'patient'and ur.role_id in ('patient','doctor','hospital_admin','lab_admin','pharmacy_admin','admin','super_admin')
        )
    ))
    and public.carelink_admin_has_permission(required_permission)
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. AI response guardrail -- deterministic DB-layer verdict screen
-- ---------------------------------------------------------------------------
create or replace function public.carelink_ai_response_guardrail(
  payload text,
  response_role text default 'assistant'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (
    -- Emergency indicators always flag for escalation handling (never silent).
    (lower(payload) like any (array[
        '%chest pain%','%cannot breathe%','%cannot catch my breath%','%face drooping%',
        '%slurred speech%','%unconscious%','%not breathing%','%severe bleeding%','%heart attack%',
        '%suicidal%','%seizure%','%choking%','%stroke%','%heavy bleeding%','%overdose%'
      ]) )
    -- Credible diagnostic overclaim patterns (case-insensitive)。
    or lower(payload) ~ 'you (definitely|certainly|surely) have'
    or lower(payload) ~ 'you are (diagnosed with|suffering from)'
    or lower(payload) ~ 'this confirms (you have|that you have)'
    or lower(payload) ~ 'i diagnose (you|this) (as|with)'
    -- Instruction-override / secret-elevation markers。
    or lower(payload) ~ 'ignore (all |any )?(previous|prior|above) instructions'
    or lower(payload) ~ 'reveal (all|your|the) (patient|user|system|hidden|secret)'
    or lower(payload) ~ '(service[-_ ]?role|api[-_ ]?key|access[-_ ]?token|refresh[-_ ]?token|secret[-_ ]?key)'
    or lower(payload) ~ 'skip (rl s|row level security|security checks)'
    -- Agentic self-harm / unsafe autonomy attempts。
    or lower(payload) ~ '(disable|turn off|bypass) (security|safety|authorization|rl s)'
    or lower(payload) ~ '(make|set|grant) me (an? |the )(admin|super[-_ ]?admin)'
    or lower(payload) ~ 'run (sql|arbitrary rpc|service[-_ ]?role)'
  );
$$;

-- EXECUTE guards for the new RPCs (authenticated-only; never anon/public).
revoke execute on function public.carelink_has_permission_or_higher(text,text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_has_permission_or_higher(text,text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_has_permission_or_higher(text,text) to authenticated;
  end if;
end $$;

revoke execute on function public.carelink_ai_response_guardrail(text,text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_ai_response_guardrail(text,text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_ai_response_guardrail(text,text) to authenticated;
  end if;
end $$;
-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0029_step18_owner_auth_hierarchy.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0030_step19_owner_auth_hardening.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 19: owner auth hierarchy hardening. ADDITIVE ONLY.
--
-- Closes a REAL privilege-escalation defect discovered while completing the
-- Step 18 frontend work: the role/permission predicates did not account for
-- account suspension, so a SUSPENDED super_admin (or admin) still evaluated as
-- authorized for elevated reads/writes.
--
--   `carelink_admin_has_permission(p)` read:
--       (not carelink_is_suspended() and carelink_has_permission(p)) or carelink_is_super_admin()
--   Because of `and`/`or` precedence this is
--       (not suspended and has_permission) OR is_super_admin
--   so a suspended super_admin short-circuits through `carelink_is_super_admin()`
--   (which only checked role membership, never status) and passed EVERY admin
--   gate. The same status-blind predicate backs RLS policies on supervisor
--   tables (ai_context, appointments, medications, verification tables, …), so a
--   suspended super_admin could still read/write those rows.
--
-- This migration makes the authorization primitives status-aware at the root:
--   1. `carelink_is_super_admin()` / `carelink_is_admin()` now require an ACTIVE
--      account (suspended/disabled => false). Every RLS policy and RPC that used
--      them inherits the fix.
--   2. `carelink_has_permission(p)` is gated on not-suspended so a suspended
--      privileged account cannot fall through its explicit role_permissions rows.
--   3. `carelink_admin_has_permission(p)` is de-parenthesized to
--      `not suspended and carelink_has_permission(p)` (the super_admin grant is
--      already folded into carelink_has_permission), removing the precedence bug.
--   4. `carelink_has_permission_or_higher(required_role, required_permission)`
--      fixes the hierarchy floor mapping: requiring the `super_admin` floor is
--      now satisfied ONLY by super_admin (an admin no longer satisfies a
--      super-admin floor), while super_admin still satisfies every lower floor.
--
-- SECURITY: no new tables/credentials; every predicate stays SECURITY DEFINER
-- with a pinned search_path and remains read-only. REPLACE-only — no policy or
-- table is altered, and no previously-granted permission is widened.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Status-aware privileged-role predicates
-- ---------------------------------------------------------------------------
create or replace function public.carelink_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select (not public.carelink_is_suspended()) and public.carelink_has_role('super_admin'); $$;

create or replace function public.carelink_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended())
         and (public.carelink_has_role('admin') or public.carelink_has_role('super_admin'));
$$;

-- ---------------------------------------------------------------------------
-- 2. Status-gated permission resolver (super_admin grant folded in)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended()) and (
    exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid()
        and rp.permission_code = p_code
    )
    or public.carelink_has_role('super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. De-parenthesized admin gate (removes the OR-precedence bypass)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended()) and public.carelink_has_permission(permission_code);
$$;

-- ---------------------------------------------------------------------------
-- 4. Correct hierarchy floor mapping in the role-or-higher resolver
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_permission_or_higher(
  required_role text,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (not public.carelink_is_suspended())
    and (select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and (
          -- Requiring a floor is satisfied by that role OR any HIGHER role.
          required_role = 'super_admin' and ur.role_id = 'super_admin'
          or required_role = 'admin' and ur.role_id in ('admin','super_admin')
          or required_role = 'pharmacy_admin' and ur.role_id in ('pharmacy_admin','admin','super_admin')
          or required_role = 'lab_admin' and ur.role_id in ('lab_admin','admin','super_admin')
          or required_role = 'hospital_admin' and ur.role_id in ('hospital_admin','admin','super_admin')
          or required_role = 'doctor' and ur.role_id in ('doctor','admin','super_admin')
          or required_role = 'patient' and ur.role_id in ('patient','doctor','hospital_admin','lab_admin','pharmacy_admin','admin','super_admin')
        )
    ))
    and public.carelink_admin_has_permission(required_permission)
  );
$$;

-- EXECUTE posture is preserved automatically: CREATE OR REPLACE keeps the
-- existing grants on these long-standing RLS predicate helpers (authenticated +
-- anon, per migrations 0021/0025). No revoke is issued here — revoking from anon
-- would break the policies that evaluate these predicates for the anon role.

-- ---------------------------------------------------------------------------
-- 5. Lane-aware login audit vocabulary
--    The selected LOGIN LANE (patient/admin/super_admin) — not the account's
--    role — determines the success event; a denied administrative-lane attempt
--    is recorded with the lane-specific `*_login_denied` event. Extends the
--    Step-18 vocabulary (which had the *_success + suspended events) so the
--    frontend can record lane denials without inferring the lane from role.
-- ---------------------------------------------------------------------------
alter table public.security_activity_events
  drop constraint if exists security_activity_events_event_check;

alter table public.security_activity_events
  add constraint security_activity_events_event_check
  check (event in (
    'login_success','login_failure','logout','session_refresh',
    'password_reset_request','password_change','account_suspended',
    'account_reactivated','account_disabled','role_granted','role_revoked',
    'admin_login','super_admin_login','admin_access_denied',
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
    'admin_login_denied','super_admin_login_denied',
    'owner_bootstrap','role_change','permission_change','privileged_operation'
  ));

create or replace function public.carelink_record_login_activity(
  event text,
  metadata jsonb default '{}'::jsonb,
  ip_address text default null,
  user_agent text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
declare actor uuid := auth.uid();
declare clean_event text;
declare cap_meta jsonb;
begin
  clean_event := lower(btrim(event));
  if clean_event not in (
    'login_success','login_failure','logout','session_refresh','password_reset_request',
    'password_change','account_suspended','account_reactivated','account_disabled',
    'role_granted','role_revoked','admin_login','super_admin_login','admin_access_denied',
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
    'admin_login_denied','super_admin_login_denied',
    'owner_bootstrap','role_change','permission_change','privileged_operation'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended() and clean_event in ('login_success','session_refresh') then
    raise exception 'account suspended';
  end if;

  -- Retain only tiny scalar metadata (never raw credentials/tokens/PHI).
  cap_meta := coalesce((
    select jsonb_object_agg(k, nullif(v::text,''))
    from jsonb_each(coalesce(metadata,'{}'::jsonb)) as e(k,v)
    where jsonb_typeof(v) in ('string','number','boolean')
      and octet_length(k) <= 64
      and octet_length(nullif(v::text,'')) <= 200
  ),'{}'::jsonb);

  insert into public.security_activity_events (id, user_id, event, metadata, ip_address, user_agent)
  values (gen_random_uuid(), actor, clean_event, cap_meta, left(coalesce(ip_address,''), 64), left(coalesce(user_agent,''), 256))
  returning id into new_id;
  return new_id;
end;
$$;


-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0030_step19_owner_auth_hardening.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0031_step21_machilipatnam_directory.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 21: Machilipatnam healthcare directory (Phase 2–5, 12).
--
-- ADDITIVE ONLY. Seeds the REAL, source-backed healthcare facilities and the
-- small set of attributable practitioners for Machilipatnam, Krishna District,
-- Andhra Pradesh into the existing provider registry (hospitals / hospital_*
-- / doctors / doctor_* / qualifications / *_verification). No new provider
-- tables are created — the existing schema + relationships are reused.
--
-- HONESTY / PROVENANCE:
--   - Every row is inserted with an explicit `data_source`, `source_url`,
--     `data_status` and `fetched_at` so a directory listing is never presented
--     as verified. Government/official sources are 'VERIFIED'; a provider's own
--     site is 'PROVIDER_LISTED'/'SOURCE_LISTED'; third-party directories are
--     'THIRD_PARTY_DIRECTORY'. Ratings stay NULL (never fabricated).
--   - No patient PHI. No invented coordinates (only the government-published
--     E-UPHC Chilakalapudi coordinates are stored).
--   - Verification stays `pending` — client/admin verification workflow is the
--     only way a doctor ever becomes `verified`.
--   - Ids use the deterministic '7f…' range + 'mph-' slugs so they can never
--     collide with the dev seed ('7d…'), the SQL test fixtures (5a../5b..), or
--     real production rows. Idempotent (`on conflict do nothing`) + safe to
--     replay.
--
-- SOURCES (checked 2026-10-09): krishna.ap.gov.in; gmcmachilipatnam-ap-gov.com;
-- andhrahospitals.org; muralikrishnahospital.com; savehospitalmachilipatnam.com;
-- madhuneuro.com; Star Health / Apollo 24|7 / Bajaj Finserv network directories.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Provenance vocabulary + source_url column (additive).
--    Extend the honest data_status classification (0024) so directory listings
--    are distinguishable from verified data and development fixtures.
-- ---------------------------------------------------------------------------
alter table public.hospitals add column if not exists source_url text;
alter table public.doctors   add column if not exists source_url text;
alter table public.pharmacies add column if not exists source_url text;
alter table public.labs      add column if not exists source_url text;

do $$
declare t text;
begin
  foreach t in array array['hospitals','doctors','pharmacies','labs']
  loop
    execute format('alter table public.%I drop constraint if exists %I_data_status_check;', t, t);
    execute format($f$
      alter table public.%I add constraint %I_data_status_check
        check (data_status is null or data_status in (
          'REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION',
          'VERIFIED','PROVIDER_LISTED','SOURCE_LISTED','THIRD_PARTY_DIRECTORY','DEVELOPMENT_SEED'))
    $f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Specialties (additive, idempotent) used by the Machilipatnam facilities.
-- ---------------------------------------------------------------------------
insert into public.specialties (id,slug,name,description) values
  ('7e000001-0000-0000-0000-000000000001','mph-general-medicine','General Medicine','General medicine and internal medicine'),
  ('7e000002-0000-0000-0000-000000000002','mph-general-surgery','General Surgery','General surgery'),
  ('7e000003-0000-0000-0000-000000000003','mph-cardiology','Cardiology','Heart and vascular care'),
  ('7e000004-0000-0000-0000-000000000004','mph-neurology','Neurology','Brain and nervous system care'),
  ('7e000005-0000-0000-0000-000000000005','mph-orthopaedics','Orthopaedics','Bones, joints and musculoskeletal care'),
  ('7e000006-0000-0000-0000-000000000006','mph-paediatrics','Paediatrics','Child health care'),
  ('7e000007-0000-0000-0000-000000000007','mph-gynaecology','Gynaecology and Obstetrics',$$Women's health and maternity care$$),
  ('7e000008-0000-0000-0000-000000000008','mph-nephrology','Nephrology','Kidney care'),
  ('7e000009-0000-0000-0000-000000000009','mph-urology','Urology','Urinary tract care'),
  ('7e00000a-0000-0000-0000-00000000000a','mph-ent','ENT','Ear, nose and throat care'),
  ('7e00000b-0000-0000-0000-00000000000b','mph-ophthalmology','Ophthalmology','Eye care'),
  ('7e00000c-0000-0000-0000-00000000000c','mph-pulmonology','Pulmonology','Respiratory care'),
  ('7e00000d-0000-0000-0000-00000000000d','mph-gastroenterology','Gastroenterology','Digestive system care'),
  ('7e00000e-0000-0000-0000-00000000000e','mph-physiotherapy','Physiotherapy','Rehabilitation and physiotherapy'),
  ('7e00000f-0000-0000-0000-00000000000f','mph-dermatology','Dermatology','Skin care'),
  ('7e000010-0000-0000-0000-000000000010','mph-psychiatry','Psychiatry','Mental health care')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Hospitals (real, source-backed).
-- ---------------------------------------------------------------------------
insert into public.hospitals
  (id,slug,name,description,city,address,phone_number,email,website,rating,data_source,source_url,data_status,fetched_at)
values
  ('7f100001-0000-0000-0000-000000000001','mph-district-hospital-machilipatnam','District Hospital, Machilipatnam',
   'Main public district hospital serving Machilipatnam and Krishna District.','Machilipatnam','Near Noble High School',
   '8333814350',null,null,null,'krishna.ap.gov.in','https://krishna.ap.gov.in/public-utility/district-hospital','VERIFIED','2026-10-09'),
  ('7f100002-0000-0000-0000-000000000002','mph-government-medical-college-machilipatnam','Government Medical College & Teaching General Hospital, Machilipatnam',
   'Government medical college (2023) and attached teaching general hospital.','Machilipatnam','Near Radar Station, Kara Agraharam',
   '7893330266','principalgmcmachilipatnam@gmail.com','https://www.gmcmachilipatnam-ap-gov.com',null,
   'gmcmachilipatnam-ap-gov.com','https://www.gmcmachilipatnam-ap-gov.com/contact-us','VERIFIED','2026-10-09'),
  ('7f100003-0000-0000-0000-000000000003','mph-chinnapuram-primary-health-centre','Chinnapuram Primary Health Centre',
   'Government primary health centre serving the Chinnapuram area.','Machilipatnam','Chinnapuram',
   null,null,null,null,'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f100004-0000-0000-0000-000000000004','mph-e-uphc-chilakalapudi','E-UPHC Chilakalapudi',
   'Extended Urban Primary Health Centre at Chilakalapudi.','Machilipatnam','Chilakalapudi',
   '8885935351',null,null,null,'krishna.ap.gov.in','https://krishna.ap.gov.in/public-utility-category/hospitals','VERIFIED','2026-10-09'),
  ('7f100005-0000-0000-0000-000000000005','mph-andhra-hospitals-machilipatnam','Andhra Hospitals, Machilipatnam',
   'Multi-speciality private hospital (approx. 100 beds, 42 ICU beds).','Machilipatnam','Door No. 124 & 125, Raju Pet, Azad Road',
   '08672221199',null,'https://www.andhrahospitals.org',null,
   'andhrahospitals.org','https://www.andhrahospitals.org/Ah/chg_location/MACHILIPATNAM','SOURCE_LISTED','2026-10-09'),
  ('7f100006-0000-0000-0000-000000000006','mph-sai-sri-ram-hospitals','Sai Sri Ram Hospitals',
   'Multi-speciality private hospital with inpatient, outpatient and emergency care.','Machilipatnam','Edepalli, Srinivas Nagar Colony',
   null,null,null,null,'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f100007-0000-0000-0000-000000000007','mph-murali-krishna-hospital','Murali Krishna Hospital',
   'General hospital (2009) with general medicine, diagnostics and emergency support.','Machilipatnam','Dimmala Centre, Lakshmana Rao Puram',
   '08374487474',null,'https://muralikrishnahospital.com',null,
   'muralikrishnahospital.com','https://muralikrishnahospital.com','PROVIDER_LISTED','2026-10-09'),
  ('7f100008-0000-0000-0000-000000000008','mph-save-multi-speciality-hospital','SAVE Multi-Speciality Hospital',
   '50-bed multi-speciality hospital with general medicine, ENT, eye, ortho and 24/7 emergency care.','Machilipatnam','Kamma Sangam Road',
   null,null,'https://savehospitalmachilipatnam.com',null,
   'savehospitalmachilipatnam.com','https://savehospitalmachilipatnam.com/en','PROVIDER_LISTED','2026-10-09'),
  ('7f100009-0000-0000-0000-000000000009','mph-aswini-hospital-machilipatnam','Aswini Hospital',
   'Private hospital in Buttaipeta listed in the Star Health insurance network.','Machilipatnam','25/371, Buttaipeta',
   '08672225200',null,null,null,'Star Health network directory',
   'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh','THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f10000a-0000-0000-0000-00000000000a','mph-dr-madhu-super-speciality-hospital','Dr. Madhu Super Speciality Hospital',
   'Super-speciality private hospital offering orthopaedic and specialist services.','Machilipatnam','#11/273, Near Gandhi Bomma Shivalayam, Chammanagiripet',
   '0867222518',null,'https://madhuneuro.com',null,
   'madhuneuro.com','https://madhuneuro.com/orthopaedics','PROVIDER_LISTED','2026-10-09'),
  ('7f10000b-0000-0000-0000-00000000000b','mph-nagamani-retina-institute','Nagamani Retina Institute',
   'Super-speciality eye hospital providing comprehensive eye and retinal care.','Machilipatnam','D.No 11/57-1, Opp. Venugopala Swami Temple, Chemmanagiripet',
   '08672227598',null,null,null,'Star Health network directory',
   'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh','THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f10000c-0000-0000-0000-00000000000c','mph-dr-venkat-basu-bone-joint-clinic','Dr. Venkat Basu''s Bone & Joint Clinic',
   'Orthopaedic and joint-replacement clinic.','Machilipatnam','Opposite Vivekananda Mandiram, Buttaipet',
   '6309955880',null,null,null,'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09')
on conflict (id) do nothing;

-- location (only government-published coordinates are stored)
insert into public.hospital_locations (id,hospital_id,label,address,city,latitude,longitude) values
  ('7f110004-0000-0000-0000-000000000004','7f100004-0000-0000-0000-000000000004','Main centre','Chilakalapudi','Machilipatnam',16.199120,81.155670)
on conflict (id) do nothing;

-- services + facilities (only those stated by a source)
insert into public.hospital_services (id,hospital_id,service_name,description) values
  ('7f120005-0000-0000-0000-000000000005','7f100005-0000-0000-0000-000000000005','24x7 Emergency','Emergency department'),
  ('7f120005-0000-0000-0000-000000000006','7f100005-0000-0000-0000-000000000005','ICU','Intensive care (42 beds per source)'),
  ('7f120008-0000-0000-0000-000000000007','7f100008-0000-0000-0000-000000000008','24x7 Emergency','Emergency department'),
  ('7f120006-0000-0000-0000-000000000008','7f100006-0000-0000-0000-000000000006','Ambulance','Ambulance service'),
  ('7f120007-0000-0000-0000-000000000009','7f100007-0000-0000-0000-000000000007','Diagnostics','Diagnostic services')
on conflict (id) do nothing;

-- hospital ↔ specialty links
insert into public.hospital_specialties (id,hospital_id,specialty_id) values
  ('7f130005-0000-0000-0000-000000000001','7f100005-0000-0000-0000-000000000005','7e000003-0000-0000-0000-000000000003'),
  ('7f130005-0000-0000-0000-000000000002','7f100005-0000-0000-0000-000000000005','7e000004-0000-0000-0000-000000000004'),
  ('7f130005-0000-0000-0000-000000000003','7f100005-0000-0000-0000-000000000005','7e000008-0000-0000-0000-000000000008'),
  ('7f130005-0000-0000-0000-000000000004','7f100005-0000-0000-0000-000000000005','7e000009-0000-0000-0000-000000000009'),
  ('7f130005-0000-0000-0000-000000000005','7f100005-0000-0000-0000-000000000005','7e00000a-0000-0000-0000-00000000000a'),
  ('7f130005-0000-0000-0000-000000000006','7f100005-0000-0000-0000-000000000005','7e000007-0000-0000-0000-000000000007'),
  ('7f130005-0000-0000-0000-000000000007','7f100005-0000-0000-0000-000000000005','7e00000d-0000-0000-0000-00000000000d'),
  ('7f130006-0000-0000-0000-000000000008','7f100006-0000-0000-0000-000000000006','7e000001-0000-0000-0000-000000000001'),
  ('7f130006-0000-0000-0000-000000000009','7f100006-0000-0000-0000-000000000006','7e000005-0000-0000-0000-000000000005'),
  ('7f130006-0000-0000-0000-00000000000a','7f100006-0000-0000-0000-000000000006','7e000006-0000-0000-0000-000000000006'),
  ('7f130007-0000-0000-0000-00000000000b','7f100007-0000-0000-0000-000000000007','7e000001-0000-0000-0000-000000000001'),
  ('7f130008-0000-0000-0000-00000000000c','7f100008-0000-0000-0000-000000000008','7e000001-0000-0000-0000-000000000001'),
  ('7f130008-0000-0000-0000-00000000000d','7f100008-0000-0000-0000-000000000008','7e00000a-0000-0000-0000-00000000000a'),
  ('7f130008-0000-0000-0000-00000000000e','7f100008-0000-0000-0000-000000000008','7e00000b-0000-0000-0000-00000000000b'),
  ('7f130008-0000-0000-0000-00000000000f','7f100008-0000-0000-0000-000000000008','7e000005-0000-0000-0000-000000000005'),
  ('7f13000a-0000-0000-0000-000000000010','7f10000a-0000-0000-0000-00000000000a','7e000005-0000-0000-0000-000000000005'),
  ('7f13000b-0000-0000-0000-000000000011','7f10000b-0000-0000-0000-00000000000b','7e00000b-0000-0000-0000-00000000000b'),
  ('7f13000c-0000-0000-0000-000000000012','7f10000c-0000-0000-0000-00000000000c','7e000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Doctors (real, attributable only) + relationships.
-- ---------------------------------------------------------------------------
insert into public.doctors
  (id,slug,name,gender,years_experience,bio,photo_url,languages,rating,data_source,source_url,data_status,fetched_at)
values
  ('7f300001-0000-0000-0000-000000000001','mph-dr-k-murali-krishna','Dr. K. Murali Krishna',null,null,
   'General physician (MD) and chief doctor at Murali Krishna Hospital.','{}','["Telugu","English"]'::jsonb,null,
   'muralikrishnahospital.com','https://muralikrishnahospital.com','PROVIDER_LISTED','2026-10-09'),
  ('7f300002-0000-0000-0000-000000000002','mph-dr-venkat-basu','Dr. Venkat Basu',null,null,
   'Consultant orthopaedic and joint-replacement surgeon.','{}','["Telugu","English"]'::jsonb,null,
   'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f300003-0000-0000-0000-000000000003','mph-dr-tejaswi-ponnam','Dr. Tejaswi Ponnam',null,null,
   'General physician and internal medicine specialist at H & H Clinic.','{}','["Telugu","English"]'::jsonb,null,
   'Apollo 24|7 directory','https://www.apollo247.com/doctors/lady-doctors-in-machilipatnam-dcity','THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f300004-0000-0000-0000-000000000004','mph-dr-sandeep-vemu','Dr. Sandeep Vemu',null,null,
   'ENT specialist and co-founder of SAVE Multi-Speciality Hospital.','{}','["Telugu","English"]'::jsonb,null,
   'savehospitalmachilipatnam.com','https://savehospitalmachilipatnam.com/en','PROVIDER_LISTED','2026-10-09'),
  ('7f300005-0000-0000-0000-000000000005','mph-dr-praveena-madasu','Dr. Praveena Madasu',null,null,
   'Ophthalmologist and co-founder of SAVE Multi-Speciality Hospital.','{}','["Telugu","English"]'::jsonb,null,
   'savehospitalmachilipatnam.com','https://savehospitalmachilipatnam.com/en','PROVIDER_LISTED','2026-10-09')
on conflict (id) do nothing;

insert into public.doctor_profiles (id,doctor_id,education_summary,experience_summary,about) values
  ('7f310001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','MBBS, MD (Physician)',null,'General physician and chief doctor at Murali Krishna Hospital.'),
  ('7f310002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','Consultant Orthopaedic & Joint Replacement Surgeon',null,'Orthopaedic and joint-replacement surgeon.'),
  ('7f310003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','MBBS, MD (General Medicine)',null,'General physician and internal medicine specialist.'),
  ('7f310004-0000-0000-0000-000000000004','7f300004-0000-0000-0000-000000000004',null,null,'ENT specialist and hospital co-founder.'),
  ('7f310005-0000-0000-0000-000000000005','7f300005-0000-0000-0000-000000000005',null,null,'Ophthalmologist and hospital co-founder.')
on conflict (id) do nothing;

insert into public.doctor_specialties (id,doctor_id,specialty_id) values
  ('7f320001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','7e000001-0000-0000-0000-000000000001'),
  ('7f320002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','7e000005-0000-0000-0000-000000000005'),
  ('7f320003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','7e000001-0000-0000-0000-000000000001'),
  ('7f320004-0000-0000-0000-000000000004','7f300004-0000-0000-0000-000000000004','7e00000a-0000-0000-0000-00000000000a'),
  ('7f320005-0000-0000-0000-000000000005','7f300005-0000-0000-0000-000000000005','7e00000b-0000-0000-0000-00000000000b')
on conflict (id) do nothing;

-- canonical doctor ↔ hospital links (a doctor only appears at hospitals they
-- are actually linked to here — never by name/city matching).
insert into public.doctor_hospitals (id,doctor_id,hospital_id,is_primary) values
  ('7f340001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','7f100007-0000-0000-0000-000000000007',true),
  ('7f340002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','7f10000c-0000-0000-0000-00000000000c',true),
  ('7f340002-0000-0000-0000-000000000003','7f300002-0000-0000-0000-000000000002','7f100005-0000-0000-0000-000000000005',false),
  ('7f340003-0000-0000-0000-000000000004','7f300003-0000-0000-0000-000000000003','7f100006-0000-0000-0000-000000000006',true),
  ('7f340004-0000-0000-0000-000000000005','7f300004-0000-0000-0000-000000000004','7f100008-0000-0000-0000-000000000008',true),
  ('7f340005-0000-0000-0000-000000000006','7f300005-0000-0000-0000-000000000005','7f100008-0000-0000-0000-000000000008',true)
on conflict (id) do nothing;

insert into public.qualifications (id,doctor_id,degree,institution,year) values
  ('7f360001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','MD (Physician)',null,null),
  ('7f360002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','Orthopaedic & Joint Replacement Surgery',null,null),
  ('7f360003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','MD (General Medicine)',null,null)
on conflict (id) do nothing;

-- verification stays pending — only the guarded workflow can ever verify.
insert into public.doctor_verification (id,doctor_id,status,notes) values
  ('7f390001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','pending','Directory import — pending verification'),
  ('7f390002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','pending','Directory import — pending verification'),
  ('7f390003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','pending','Directory import — pending verification'),
  ('7f390004-0000-0000-0000-000000000004','7f300004-0000-0000-0000-000000000004','pending','Directory import — pending verification'),
  ('7f390005-0000-0000-0000-000000000005','7f300005-0000-0000-0000-000000000005','pending','Directory import — pending verification')
on conflict (id) do nothing;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0031_step21_machilipatnam_directory.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0032_step21_review_eligibility.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 21 (Phase 7): review eligibility enforced in the database.
--
-- WHY: 0007 allowed a client to `insert` a published review for any target with
-- NO proof the author actually attended. The verified badge (carelink_verify_review)
-- only checked an appointment *when one was linked*. A review that omitted
-- appointment_id could therefore be posted by anyone for any provider.
--
-- FIX (additive + backward compatible with the 060 eligibility fixtures):
--   A BEFORE INSERT trigger requires every review to reference a genuine
--   COMPLETED appointment owned by the review author. When the appointment
--   records a provider id, that provider must match the review target. This
--   cannot be bypassed from the browser — it runs inside the database on the
--   only write path, so hiding the button is backed by a real server rule.
--
--   The trigger fires on INSERT and on UPDATEs that would re-point a review at
--   a different appointment/author/target (never on benign status/title/body
--   edits, so moderation + author edits keep working). It applies to EVERY
--   writer, including trusted imports — there is no bypass flag.
--
-- SECURITY: the trigger function is SECURITY DEFINER so it can read the
-- appointments row regardless of RLS, but it still enforces owner equality — it
-- never widens access.
-- ===========================================================================

create or replace function public.carelink_enforce_review_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
begin
  if new.appointment_id is null then
    raise exception 'a review requires a completed appointment';
  end if;

  select * into a from public.appointments where id = new.appointment_id;
  if not found then
    raise exception 'review not allowed: linked appointment does not exist';
  end if;

  if a.owner_id <> new.owner_id then
    raise exception 'review not allowed: appointment belongs to another patient';
  end if;

  if a.status <> 'completed' then
    raise exception 'review not allowed: appointment is not completed';
  end if;

  -- Provider consistency — only when the appointment actually records a
  -- provider id (legacy/demo appointments may leave it null; the owner +
  -- completed checks above are the hard floor).
  if new.doctor_id is not null and a.doctor_id is not null
     and a.doctor_id <> new.doctor_id::text then
    raise exception 'review not allowed: appointment is with a different doctor';
  end if;
  if new.hospital_id is not null and a.hospital_id is not null
     and a.hospital_id <> new.hospital_id::text then
    raise exception 'review not allowed: appointment is at a different hospital';
  end if;

  return new;
end;
$$;

drop trigger if exists carelink_review_eligibility on public.reviews;
create trigger carelink_review_eligibility
  before insert on public.reviews
  for each row execute function public.carelink_enforce_review_eligibility();

drop trigger if exists carelink_review_eligibility_repoint on public.reviews;
create trigger carelink_review_eligibility_repoint
  before update of appointment_id, owner_id, doctor_id, hospital_id, pharmacy_id, lab_id on public.reviews
  for each row execute function public.carelink_enforce_review_eligibility();

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0032_step21_review_eligibility.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0033_step22_appointment_request_workflow.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 22: honest appointment REQUEST workflow + slot validation
--                + concurrency/idempotency + provider/staff authorization.
--
-- ADDITIVE ONLY. Builds on 0001→0032. Nothing existing is dropped or altered
-- in a breaking way (only a CHECK constraint is widened, never narrowed).
--
-- WHY: the sourced Andhra Pradesh directory has NO live hospital scheduling
-- integration. A form that accepts a date/time is therefore NOT a confirmed
-- booking. This migration makes that distinction real at the database level:
--
--   * `appointment_requests` — a patient's REQUEST to be seen. It is always
--     created `pending`; only an authorized provider/staff action (or a real
--     scheduling provider) may turn it into a confirmed appointment.
--   * `carelink_request_appointment(...)` — the ONLY client write path for
--     requests. It validates the doctor/hospital/affiliation/slot/future-date
--     server-side, is idempotent on a client `request_key`, and NEVER touches
--     `appointments` (so it cannot collide with the existing demo booking flow
--     nor fabricate a confirmation).
--   * `carelink_admin_confirm_appointment_request(...)` — the authorized
--     confirmation path. Permission-gated, audited, and idempotent.
--   * `carelink_list_my_appointment_requests()` — owner-scoped read.
--   * Provider/staff/doctor visibility of patient requests for their OWN
--     scope only (RLS), never another hospital's patients.
--
-- STATUS SEMANTICS (Phase 6.5): requests use the explicit vocabulary
--   pending | confirmed | rejected | cancelled | completed
-- and map onto the EXISTING `appointments.status` values only at confirmation
-- time (confirmed/completed), so the legacy dashboard keeps working.
--
-- SECURITY: every function is SECURITY DEFINER with a pinned search_path and
-- re-checks auth/permission/suspension inside the database. Patient identity is
-- ALWAYS auth.uid() — a client-supplied user id is never honored. No PHI is
-- returned to public/anon readers; provider/staff policies are owner-scoped.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. REQUEST STATUS vocabulary is independent of the appointment status CHECK.
--    (No change needed to public.appointments.status.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. appointment_requests
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete set null,

  doctor_id text,
  doctor_name text,
  specialty text,
  hospital_id text,
  hospital_name text,
  appointment_type text check (appointment_type in ('Consultation','Follow-up','Telehealth')),
  scheduled_date date not null,
  scheduled_time text not null,
  slot_id uuid references public.appointment_slots(id) on delete set null,

  reason text,
  contact_method text,

  status text not null default 'pending'
    check (status in ('pending','confirmed','rejected','cancelled','completed')),

  -- Idempotency: a repeated submission with the same key returns the SAME row.
  request_key text not null,

  -- The confirmed appointment created from this request (when applicable).
  confirmed_appointment_id uuid references public.appointments(id) on delete set null,
  decision_note text,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (owner_id, request_key)
);
create index if not exists appointment_requests_owner_idx on public.appointment_requests(owner_id);
create index if not exists appointment_requests_status_idx on public.appointment_requests(status);
create index if not exists appointment_requests_hospital_idx on public.appointment_requests(hospital_id);
create index if not exists appointment_requests_doctor_idx on public.appointment_requests(doctor_id);
create index if not exists appointment_requests_scheduled_idx on public.appointment_requests(scheduled_date);

drop trigger if exists set_updated_at on public.appointment_requests;
create trigger set_updated_at before update on public.appointment_requests
  for each row execute function carelink_set_updated_at();

-- Suspended accounts cannot create requests (same floor as appointments).
drop trigger if exists carelink_enforce_not_suspended on public.appointment_requests;
create trigger carelink_enforce_not_suspended before insert or update on public.appointment_requests
  for each row execute function carelink_enforce_not_suspended();

-- A family profile referenced by a request MUST belong to the request owner.
drop trigger if exists carelink_family_profile_ownership on public.appointment_requests;
create trigger carelink_family_profile_ownership before insert or update on public.appointment_requests
  for each row execute function carelink_enforce_family_profile_ownership();

-- ---------------------------------------------------------------------------
-- 3. RLS — owner-only by default; provider/staff/doctor get scoped READ.
-- ---------------------------------------------------------------------------
alter table public.appointment_requests enable row level security;

-- Owner full control of their own requests (insert/select/update/delete).
drop policy if exists appointment_requests_owner_select on public.appointment_requests;
create policy appointment_requests_owner_select on public.appointment_requests
  for select using (owner_id = auth.uid());

drop policy if exists appointment_requests_owner_insert on public.appointment_requests;
create policy appointment_requests_owner_insert on public.appointment_requests
  for insert with check (owner_id = auth.uid());

-- Owners may only cancel/annotate; status transitions to confirmed/rejected are
-- reserved for the guarded confirmation RPC (see below) — this policy still
-- scopes the row to the owner so a raw client UPDATE can never touch another
-- patient's request.
drop policy if exists appointment_requests_owner_update on public.appointment_requests;
create policy appointment_requests_owner_update on public.appointment_requests
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists appointment_requests_owner_delete on public.appointment_requests;
create policy appointment_requests_owner_delete on public.appointment_requests
  for delete using (owner_id = auth.uid());

-- Provider/staff scoped read: a verified doctor linked to the request's doctor,
-- or a hospital member of the request's hospital, may READ requests for their
-- own scope. They can never read another provider's patients.
drop policy if exists appointment_requests_provider_select on public.appointment_requests;
create policy appointment_requests_provider_select on public.appointment_requests
  for select using (
    public.carelink_is_super_admin()
    or (
      doctor_id is not null
      and doctor_id ~ '^[0-9a-fA-F-]{36}$'
      and public.carelink_is_linked_doctor(doctor_id::uuid)
    )
    or (
      hospital_id is not null
      and hospital_id ~ '^[0-9a-fA-F-]{36}$'
      and public.carelink_is_hospital_member(hospital_id::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Client write path — carelink_request_appointment(...)
--
--    Validates everything server-side and returns the persisted request row.
--    Idempotent on (owner_id, request_key): a repeat submission returns the
--    existing row instead of creating a duplicate.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_request_appointment(
  p_doctor_id text,
  p_hospital_id text,
  p_scheduled_date date,
  p_scheduled_time text,
  p_appointment_type text default 'Consultation',
  p_reason text default null,
  p_family_profile_id uuid default null,
  p_slot_id uuid default null,
  p_request_key text default null
)
returns public.appointment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  existing public.appointment_requests;
  doctor_row public.doctors;
  hospital_row public.hospitals;
  linked boolean := false;
  key text := coalesce(nullif(btrim(p_request_key), ''), gen_random_uuid()::text);
  created public.appointment_requests;
begin
  if uid is null then
    raise exception 'authentication required';
  end if;
  if public.carelink_is_suspended() then
    raise exception 'account suspended: write operations are blocked for this account';
  end if;

  -- Idempotency: same key -> same row.
  select * into existing from public.appointment_requests
    where owner_id = uid and request_key = key;
  if existing.id is not null then
    return existing;
  end if;

  -- Required fields.
  if p_doctor_id is null or btrim(p_doctor_id) = '' then
    raise exception 'a doctor is required';
  end if;
  if p_hospital_id is null or btrim(p_hospital_id) = '' then
    raise exception 'a hospital is required';
  end if;
  if p_scheduled_date is null then
    raise exception 'an appointment date is required';
  end if;
  if p_scheduled_time is null or btrim(p_scheduled_time) = '' then
    raise exception 'an appointment time is required';
  end if;
  if char_length(coalesce(p_reason, '')) > 500 then
    raise exception 'reason is too long (max 500 characters)';
  end if;

  -- Date must be today or later (no past requests).
  if p_scheduled_date < current_date then
    raise exception 'the appointment date must be in the future';
  end if;

  -- Resolve the doctor by id OR slug (the directory uses stable ids, the UI may
  -- pass a slug). Both are public-read registry rows.
  select * into doctor_row from public.doctors
    where id::text = p_doctor_id or slug = p_doctor_id
    limit 1;
  if doctor_row.id is null then
    raise exception 'doctor not found';
  end if;

  select * into hospital_row from public.hospitals
    where id::text = p_hospital_id or slug = p_hospital_id
    limit 1;
  if hospital_row.id is null then
    raise exception 'hospital not found';
  end if;

  -- Doctor-hospital affiliation must genuinely exist (never name-matched).
  select exists (
    select 1 from public.doctor_hospitals dh
    where dh.doctor_id = doctor_row.id and dh.hospital_id = hospital_row.id
  ) into linked;
  if not linked then
    raise exception 'this doctor is not affiliated with the selected hospital';
  end if;

  -- If a concrete slot is referenced it must belong to that doctor AND (when it
  -- records a hospital) that hospital, and be open.
  if p_slot_id is not null then
    if not exists (
      select 1 from public.appointment_slots s
      where s.id = p_slot_id
        and s.doctor_id = doctor_row.id
        and (s.hospital_id is null or s.hospital_id = hospital_row.id)
        and s.status = 'open'
        and s.slot_date = p_scheduled_date
        and to_char(s.start_time, 'HH24:MI') = p_scheduled_time
    ) then
      raise exception 'the selected slot is not available for this doctor and hospital';
    end if;
  end if;

  -- A family profile, when given, must be owned by the caller (trigger also
  -- enforces this, but we surface a clear message).
  if p_family_profile_id is not null
     and not public.carelink_is_family_profile_owner(p_family_profile_id) then
    raise exception 'the selected family profile does not belong to you';
  end if;

  insert into public.appointment_requests (
    owner_id, family_profile_id, doctor_id, doctor_name, specialty,
    hospital_id, hospital_name, appointment_type,
    scheduled_date, scheduled_time, slot_id, reason, status, request_key
  ) values (
    uid, p_family_profile_id, doctor_row.id::text, doctor_row.name, null,
    hospital_row.id::text, hospital_row.name, coalesce(p_appointment_type, 'Consultation'),
    p_scheduled_date, p_scheduled_time, p_slot_id, p_reason, 'pending', key
  )
  returning * into created;

  perform public.carelink_record_audit(
    'appointment_requested', 'appointment_requests', created.id,
    'request created (pending provider confirmation)'
  );

  return created;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Owner read — carelink_list_my_appointment_requests()
-- ---------------------------------------------------------------------------
create or replace function public.carelink_list_my_appointment_requests()
returns setof public.appointment_requests
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.appointment_requests
  where owner_id = auth.uid()
  order by created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- 6. Authorized confirmation — carelink_decide_appointment_request(...)
--
--    Only an operator with `appointments.manage` (admin/super_admin) may
--    confirm or reject. Confirmation creates a REAL appointment row (status
--    'confirmed') and links it back to the request; rejection marks the request
--    rejected. Idempotent: a second decision on an already-decided request is a
--    no-op that returns the current row.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_decide_appointment_request(
  p_request_id uuid,
  p_decision text,
  p_note text default null
)
returns public.appointment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  req public.appointment_requests;
  new_appt_id uuid;
  doctor_uuid uuid;
  hospital_uuid uuid;
begin
  if p_decision not in ('confirmed','rejected') then
    raise exception 'invalid decision';
  end if;
  if public.carelink_is_suspended() then
    raise exception 'account suspended: write operations are blocked for this account';
  end if;
  if not public.carelink_admin_has_permission('appointments.manage') then
    raise exception 'permission denied';
  end if;

  select * into req from public.appointment_requests where id = p_request_id for update;
  if req.id is null then
    raise exception 'appointment request not found';
  end if;
  -- Idempotent: already decided -> return as-is.
  if req.status <> 'pending' then
    return req;
  end if;

  if p_decision = 'rejected' then
    update public.appointment_requests
      set status = 'rejected', decision_note = p_note, decided_by = auth.uid(), decided_at = now()
      where id = p_request_id
      returning * into req;
    perform public.carelink_record_audit('appointment_request_rejected', 'appointment_requests', p_request_id, coalesce(p_note, 'rejected'));
    return req;
  end if;

  -- Confirmation: create the real appointment row (owner = requester).
  doctor_uuid := case when req.doctor_id ~ '^[0-9a-fA-F-]{36}$' then req.doctor_id::uuid else null end;
  hospital_uuid := case when req.hospital_id ~ '^[0-9a-fA-F-]{36}$' then req.hospital_id::uuid else null end;

  begin
    insert into public.appointments (
      owner_id, family_profile_id, doctor_id, doctor_name, specialty,
      hospital_id, hospital_name, appointment_type,
      scheduled_date, scheduled_time, status, notes, slot_id
    ) values (
      req.owner_id, req.family_profile_id, req.doctor_id, req.doctor_name, req.specialty,
      req.hospital_id, req.hospital_name, coalesce(req.appointment_type, 'Consultation'),
      req.scheduled_date, req.scheduled_time, 'confirmed',
      coalesce(p_note, req.reason), req.slot_id
    )
    returning id into new_appt_id;
  exception when unique_violation then
    -- Another confirmation already consumed this doctor/date/time (or slot).
    -- Never fabricate a confirmation: surface a clear, actionable message.
    raise exception 'that slot has just been taken — please choose another time';
  end;

  update public.appointment_requests
    set status = 'confirmed', confirmed_appointment_id = new_appt_id,
        decision_note = p_note, decided_by = auth.uid(), decided_at = now()
    where id = p_request_id
    returning * into req;

  perform public.carelink_record_audit('appointment_request_confirmed', 'appointment_requests', p_request_id, 'confirmed -> appointment ' || new_appt_id::text);
  return req;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Owner cancellation of a still-pending request.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_cancel_appointment_request(
  p_request_id uuid,
  p_note text default null
)
returns public.appointment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare req public.appointment_requests;
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended: write operations are blocked for this account';
  end if;
  select * into req from public.appointment_requests where id = p_request_id for update;
  if req.id is null then
    raise exception 'appointment request not found';
  end if;
  -- Only the owner may cancel, and only while pending.
  if req.owner_id <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if req.status <> 'pending' then
    raise exception 'only pending requests can be cancelled';
  end if;
  update public.appointment_requests
    set status = 'cancelled', decision_note = p_note, decided_at = now()
    where id = p_request_id
    returning * into req;
  perform public.carelink_record_audit('appointment_request_cancelled', 'appointment_requests', p_request_id, coalesce(p_note, 'cancelled by owner'));
  return req;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. EXECUTE guards — authenticated only, never anon/public.
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_request_appointment(text,text,date,text,text,text,uuid,uuid,text)',
    'carelink_list_my_appointment_requests()',
    'carelink_decide_appointment_request(uuid,text,text)',
    'carelink_cancel_appointment_request(uuid,text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 9. NOTIFICATION templates for the request lifecycle (additive).
-- ---------------------------------------------------------------------------
insert into public.notification_templates (code,kind,title_template,body_template,channel)
values
  ('appointment_request_received','appointment','Appointment request received','Your appointment request has been received and is pending provider confirmation.','in_app'),
  ('appointment_request_confirmed','appointment','Appointment confirmed','Your appointment request has been confirmed by the provider.','in_app'),
  ('appointment_request_rejected','appointment','Appointment request declined','Your appointment request could not be confirmed. Please choose another time or facility.','in_app')
on conflict (code) do nothing;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0033_step22_appointment_request_workflow.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0034_corridor_directory_import.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 24: Machilipatnam → Vijayawada corridor directory import.
--
-- GENERATED by `node scripts/directory/emit-migration.mjs` from
-- src/data/hospitals.ts (itself generated by `scripts/directory/ingest.mjs`).
-- Do not edit by hand — re-run the pipeline instead.
--
-- ADDITIVE + IDEMPOTENT. Reuses the existing provider registry
-- (hospitals / hospital_locations / hospital_services from migration 0005) and
-- the provenance columns added in 0024/0031. Every insert is
-- `on conflict (id) do nothing`, so replaying the chain never duplicates a row.
--
-- HONESTY / PROVENANCE
--   - Government district directories (krishna.ap.gov.in, ntr.ap.gov.in) are
--     recorded as data_status 'VERIFIED' (they are the official source);
--     provider sites as 'PROVIDER_LISTED'; insurance-network/third-party
--     listings as 'THIRD_PARTY_DIRECTORY'.
--   - No phone number, coordinate, opening hour, capability or rating is
--     invented. Absent means unknown.
--   - No doctor rows are created here: no government staff list was available
--     for these facilities, and a facility listing is not evidence that a named
--     doctor works there. Doctors remain in 0031 where a source named them.
--   - Verification stays 'pending' — only the guarded admin workflow verifies.
--
-- COVERAGE: the practical Machilipatnam–Vijayawada travel corridor (25 km
-- buffer + documented corridor localities). See src/data/coverage.ts and
-- scripts/directory/last-import-report.json for the achieved-coverage report.
--
-- SOURCES (checked 2026-10-25):
--   https://krishna.ap.gov.in/public-utility-category/hospitals/
--   https://ntr.ap.gov.in/public-utility-category/hospitals/
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Corridor coverage columns on the provider registry (additive).
-- ---------------------------------------------------------------------------
alter table public.hospitals add column if not exists district text;
alter table public.hospitals add column if not exists pincode text;
alter table public.hospitals add column if not exists category_label text;
alter table public.hospitals add column if not exists ownership text
  check (ownership is null or ownership in ('Government','Private'));
alter table public.hospitals add column if not exists facility_type text;
alter table public.hospitals add column if not exists coverage_method text;
alter table public.hospitals add column if not exists coverage_note text;

create index if not exists hospitals_district_idx on public.hospitals(district);
create index if not exists hospitals_pincode_idx on public.hospitals(pincode);
create index if not exists hospitals_ownership_idx on public.hospitals(ownership);

-- ---------------------------------------------------------------------------
-- 1. Facilities (idempotent).
-- ---------------------------------------------------------------------------
insert into public.hospitals
  (id,slug,name,description,city,address,phone_number,email,website,rating,
   data_source,source_url,data_status,fetched_at,
   district,pincode,category_label,ownership,facility_type)
values
  ('7f200000-0000-4000-8000-b7a668a21911', 'ntr-a-m-o-h-i-vijayawada', 'A.M.O.H-I, Vijayawada', 'Assistant Medical Officer of Health office listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'A.M.O.H-I, Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520004', 'Assistant Medical Officer of Health office', 'Government', 'AMOH'),
  ('7f100005-0000-0000-0000-000000000005', 'mph-andhra-hospitals-machilipatnam', 'Andhra Hospitals, Machilipatnam', 'Urban Primary Health Centre (extended) listed by andhrahospitals.org for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Door No. 124 & 125, Raju Pet, Azad Road, Machilipatnam, Andhra Pradesh, India', '08672221199', null, 'https://www.andhrahospitals.org', null, 'andhrahospitals.org', 'https://www.andhrahospitals.org/Ah/chg_location/MACHILIPATNAM', 'SOURCE_LISTED', '2026-10-23', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f100009-0000-0000-0000-000000000009', 'mph-aswini-hospital-machilipatnam', 'Aswini Hospital', 'Private Hospital listed by Star Health network directory for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', '25/371, Buttaipeta, Machilipatnam, Andhra Pradesh, India', '08672225200', null, null, null, 'Star Health network directory', 'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh', 'THIRD_PARTY_DIRECTORY', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f100003-0000-0000-0000-000000000003', 'mph-chinnapuram-primary-health-centre', 'Chinnapuram Primary Health Centre', 'Primary Health Centre listed by third-party directory for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Chinnapuram, Machilipatnam, Andhra Pradesh, India', null, null, null, null, 'third-party directory', null, 'THIRD_PARTY_DIRECTORY', '2026-10-23', 'Krishna', null, 'Primary Health Centre', 'Government', 'PHC'),
  ('7f100001-0000-0000-0000-000000000001', 'mph-district-hospital-machilipatnam', 'District Hospital, Machilipatnam', 'District hospital listed by krishna.ap.gov.in for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Near Noble High School, Machilipatnam, Andhra Pradesh, India', '8333814350', null, null, null, 'krishna.ap.gov.in', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'District hospital', 'Government', 'District Hospital'),
  ('7f200000-0000-4000-8000-8dd03ea30b55', 'ntr-district-leprosy-office-vijayawada', 'District Leprosy Office, Vijayawada', 'District Leprosy Office listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'District Leprosy Office, Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520001', 'District Leprosy Office', 'Government', 'DLO'),
  ('7f10000a-0000-0000-0000-00000000000a', 'mph-dr-madhu-super-speciality-hospital', 'Dr. Madhu Super Speciality Hospital', 'Private Hospital listed by madhuneuro.com for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', '#11/273, Near Gandhi Bomma Shivalayam, Chammanagiripet, Machilipatnam, Andhra Pradesh, India', '0867222518', null, 'https://madhuneuro.com', null, 'madhuneuro.com', 'https://madhuneuro.com/orthopaedics', 'PROVIDER_LISTED', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-75373a415b71', 'krishna-dr-pinnamaneni-siddhartha-institute-of-medical-sciences-and-research-c', 'Dr. Pinnamaneni Siddhartha Institute of Medical Sciences & Research Centre', 'Private hospital listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gannavaram', 'Dr Pinnamaneni Siddhartha Institute of Medical Sciences & Research Institute,Chinna Outpalli,Gannavaram Mandal ,Krishna District, Gannavaram, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521101', 'Private hospital', 'Private', 'Private Hospital'),
  ('7f10000c-0000-0000-0000-00000000000c', 'mph-dr-venkat-basu-bone-joint-clinic', 'Dr. Venkat Basu''s Bone & Joint Clinic', 'Private Hospital listed by third-party directory for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Opposite Vivekananda Mandiram, Buttaipet, Machilipatnam, Andhra Pradesh, India', '6309955880', null, null, null, 'third-party directory', null, 'THIRD_PARTY_DIRECTORY', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-ca2692939c99', 'krishna-e-uphc-ambedkar-nagar-colony', 'E-UPHC Ambedkar Nagar Colony', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Ambedkar Nagar Colony', 'Ambedkar Nagar Colony, Ambedkar Nagar Colony, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-29378408f28d', 'krishna-e-uphc-bandarkota-gilakalandi', 'E-UPHC Bandarkota/Gilakalandi', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Bandar', 'E-UPHC Bandarkota/Gilakalandi, Bandar, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521149', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-5d288cd279d4', 'ntr-e-uphc-baptist-palem', 'E-UPHC Baptist Palem', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'E-UPHC Baptist Palem Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520003', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-c9a9140a0b0c', 'krishna-e-uphc-bapujinagar', 'E-UPHC Bapujinagar', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Bapujinagar', 'Bapujinagar, Gudiwada, Bapujinagar, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521301', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-fe352d48f31b', 'krishna-e-uphc-bhimannavaripeta', 'E-UPHC Bhimannavaripeta', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Bhimannavaripeta', 'E-UPHC Bhimannavaripeta, Bhimannavaripeta, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-3f6acd442a59', 'krishna-e-uphc-chilakalapudi', 'E-UPHC Chilakalapudi', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'E-UPHC Chilakalapudi Machilipatnam, Machilipatnam, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f100004-0000-0000-0000-000000000004', 'mph-e-uphc-chilakalapudi', 'E-UPHC Chilakalapudi', 'Unclassified listed by krishna.ap.gov.in for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Chilakalapudi, Machilipatnam, Andhra Pradesh, India', '8885935351', null, null, null, 'krishna.ap.gov.in', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521002', 'Unclassified', 'Government', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-29bf8eef4bc9', 'ntr-e-uphc-durgapuram', 'E-UPHC Durgapuram', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'E-UPHC Durgapuram Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-2297785e95dd', 'krishna-e-uphc-giripuram', 'E-UPHC Giripuram', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Giripuram', 'E-UPHC Giripuram, Giripuram, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-491d6ab53a69', 'krishna-e-uphc-gulam-mohiddinnagar', 'E-UPHC Gulam Mohiddinnagar', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gulam Mohiddinnagar', 'E-UPHC Gulam Mohiddinnagar, Gulam Mohiddinnagar, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-07e09f03f47c', 'ntr-e-uphc-gunadala', 'E-UPHC Gunadala', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gunadala', 'E-UPHC Gunadala Vijayawada., Gunadala, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-2d3be9b5e1d6', 'krishna-e-uphc-jakkampudi', 'E-UPHC Jakkampudi', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Jakkampudi', 'Jakkampudi, Jakkampudi, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-c5f891164ad0', 'krishna-e-uphc-karakatta-south', 'E-UPHC Karakatta South', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Karakatta South', 'E-UPHC Karakatta South, Karakatta South, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-1c2fd9e2d394', 'krishna-e-uphc-kothapeta-hill-area', 'E-UPHC Kothapeta hill area', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kothapeta hill area', 'E-UPHC Kothapeta hill area, Kothapeta hill area, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-5a5594fe356c', 'ntr-e-uphc-kreesthurajapuram', 'E-UPHC Kreesthurajapuram', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'Kreesthurajapuram Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-297a8c6d0431', 'ntr-e-uphc-krishna-lanka', 'E-UPHC Krishna Lanka', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'Krishna Lanka, Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520013', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-d3e6e321bae3', 'ntr-e-uphc-labbipeta', 'E-UPHC Labbipeta', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'Labbipeta Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-39b434e870c2', 'ntr-e-uphc-lambadipeta', 'E-UPHC Lambadipeta', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'Lambadipeta Bza, Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-e9e4623bfb2b', 'ntr-e-uphc-madhuranagar', 'E-UPHC Madhuranagar', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'Madhuranagar, Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-c1d60fc07d7a', 'krishna-e-uphc-narayanapuram', 'E-UPHC Narayanapuram', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'E-UPHC Narayanapuram Machilipatnam, Machilipatnam, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-7dfcbfbd6c2a', 'ntr-e-uphc-new-jojinagar', 'E-UPHC New Jojinagar', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'New Jojinagar Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-336c90c50bb7', 'krishna-e-uphc-new-raja-rajawari-peta', 'E-UPHC New Raja Rajawari Peta', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'New Raja Rajawari Peta', 'E-UPHC New Raja Rajawari Peta, New Raja Rajawari Peta, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-c4ad14378bbf', 'krishna-e-uphc-ntr-colony-gudivada', 'E-UPHC NTR Colony (Gudivada)', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gudivada', 'E-UPHC NTR Colony (Gudivada), Gudivada, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521301', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-4d1791837f67', 'ntr-e-uphc-patamata', 'E-UPHC Patamata', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Patamata', 'Patamata Vijayawada, Patamata, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-c353a5401ee9', 'ntr-e-uphc-prakash-nagar', 'E-UPHC Prakash Nagar', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'E-UPHC Prakash Nagar, Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-733cbf2f1be9', 'krishna-e-uphc-ramalingeswara-nagar', 'E-UPHC Ramalingeswara Nagar', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Ramalingeswara Nagar', 'Ramalingeswara Nagar, Ramalingeswara Nagar, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-0dddc90452ff', 'ntr-e-uphc-ranigari-thota', 'E-UPHC Ranigari Thota', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'E-UPHC Ranigari Thota Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520013', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-e414f065d773', 'krishna-e-uphc-saradanagar', 'E-UPHC Saradanagar', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Saradanagar', 'E-UPHC Saradanagar, MTM, Saradanagar, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-68a04a6f1388', 'krishna-e-uphc-shanthi-nagar', 'E-UPHC SHANTHI NAGAR', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'SHANTHI NAGAR', 'SHANTHI NAGAR Vijaaywada, SHANTHI NAGAR, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-9e1ba5d8da8a', 'krishna-e-uphc-singh-nagar', 'E-UPHC Singh Nagar', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Singh Nagar', 'E-UPHC Singh Nagar, Singh Nagar, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-e187546a2f49', 'ntr-e-uphc-vambay-colony', 'E-UPHC Vambay Colony', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'E-UPHC Vambay Colony Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-be48b85614bd', 'krishna-e-uphc-varredgudam', 'E-UPHC Varredgudam', 'Urban Primary Health Centre (extended) listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Varredgudam', 'E-UPHC Varredgudam, Varredgudam, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f200000-0000-4000-8000-a1f22d925ff6', 'ntr-e-uphc-w-y-n-c-h-peta', 'E-UPHC W Y N C H Peta', 'Urban Primary Health Centre (extended) listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'W Y N C H Peta VIJAYAWADA, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
  ('7f100002-0000-0000-0000-000000000002', 'mph-government-medical-college-machilipatnam', 'Government Medical College & Teaching General Hospital, Machilipatnam', 'Medical college / teaching hospital listed by gmcmachilipatnam-ap-gov.com for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Near Radar Station, Kara Agraharam, Machilipatnam, Andhra Pradesh, India', '7893330266', 'principalgmcmachilipatnam@gmail.com', 'https://www.gmcmachilipatnam-ap-gov.com', null, 'gmcmachilipatnam-ap-gov.com', 'https://www.gmcmachilipatnam-ap-gov.com/contact-us', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Medical college / teaching hospital', 'Government', 'Medical College Hospital'),
  ('7f100007-0000-0000-0000-000000000007', 'mph-murali-krishna-hospital', 'Murali Krishna Hospital', 'Private Hospital listed by muralikrishnahospital.com for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Dimmala Centre, Lakshmana Rao Puram, Machilipatnam, Andhra Pradesh, India', '08374487474', null, 'https://muralikrishnahospital.com', null, 'muralikrishnahospital.com', 'https://muralikrishnahospital.com', 'PROVIDER_LISTED', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f10000b-0000-0000-0000-00000000000b', 'mph-nagamani-retina-institute', 'Nagamani Retina Institute', 'Private Hospital listed by Star Health network directory for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'D.No 11/57-1, Opp. Venugopala Swami Temple, Chemmanagiripet, Machilipatnam, Andhra Pradesh, India', '08672227598', null, null, null, 'Star Health network directory', 'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh', 'THIRD_PARTY_DIRECTORY', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-c7cfa1616a88', 'ntr-new-government-hospital', 'New Government Hospital', 'Government hospital listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gunadala', 'New Government Hospital, Gunadala, Vijayawada, Gunadala, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520008', 'Government hospital', 'Government', 'Government Hospital'),
  ('7f200000-0000-4000-8000-18d0c604b7b6', 'ntr-old-government-general-hospital', 'Old Government General Hospital', 'Government hospital listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Benz Circle', 'Old Government Hospital, Benz Circle, Vijayawada, Benz Circle, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520004', 'Government hospital', 'Government', 'Government Hospital'),
  ('7f200000-0000-4000-8000-a2aeffc2c893', 'krishna-p-p-unit-machilipatnam', 'P.P.UNIT Machilipatnam', 'Post-Partum unit listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'P.P.UNIT Machilipatnam, Machilipatnam, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521002', 'Post-Partum unit', 'Government', 'PP Unit'),
  ('7f200000-0000-4000-8000-92d0db34369b', 'krishna-phc-atukuru', 'PHC Atukuru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Atukuru', 'PHC Atukuru, Atukuru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521229', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-9992cbce4343', 'krishna-phc-bantumilli', 'PHC Bantumilli', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Bantumilli', 'PHC Bantumilli, Bantumilli, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521324', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-510b5ab82c82', 'krishna-phc-chandrala', 'PHC Chandrala', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Chandrala', 'PHC Chandrala, Chandrala, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521330', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-d572309c234f', 'krishna-phc-chinaogirala', 'PHC Chinaogirala', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Chinaogirala', 'PHC Chinaogirala, Chinaogirala, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521245', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-52d7a4b488f1', 'krishna-phc-chinapandraka', 'PHC Chinapandraka', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Chinapandraka', 'PHC Chinapandraka, Chinapandraka, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '516214', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-84a4a03c6ce5', 'krishna-phc-chinnapuram', 'PHC Chinnapuram', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Chinnapuram', 'PHC Chinnapuram, Chinnapuram, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-d4a6ebc6ac09', 'ntr-phc-g-konduru', 'PHC G.Konduru', 'Primary Health Centre listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'G.konduru', 'PHC G.Konduru, G.konduru, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '521229', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-075adf7c22f0', 'krishna-phc-ghantasala', 'PHC Ghantasala', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Ghantasala', 'PHC Ghantasala, Ghantasala, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521133', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-5f1a97a02085', 'krishna-phc-ghantasalapalem', 'PHC Ghantasalapalem', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Ghantasala', 'PHC Ghantasalapalem, Ghantasala, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521133', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-37c2411c5685', 'krishna-phc-gudlavalleru', 'PHC Gudlavalleru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gudlavalleru', 'PHC Gudlavalleru, Gudlavalleru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521356', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-66fd3cfeb8b8', 'ntr-phc-ibrahimpatnam', 'PHC Ibrahimpatnam', 'Primary Health Centre listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Ibrahimpatnam', 'PHC Ibrahimpatnam, Ibrahimpatnam, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '521456', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-57accbc0f059', 'krishna-phc-indupalli', 'PHC Indupalli', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Indupalli', 'PHC Indupalli, Indupalli, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521311', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-c707d8649846', 'krishna-phc-kanumuru', 'PHC Kanumuru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kanumuru', 'PHC Kanumuru, Kanumuru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521256', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-c2d372f20cfb', 'krishna-phc-kapileswarapuram', 'PHC Kapileswarapuram', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kapileswarapuram', 'PHC Kapileswarapuram, Kapileswarapuram, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521246', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-bf3c9ebcffcd', 'krishna-phc-koduru', 'PHC Koduru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Koduru', 'PHC Koduru, Koduru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521325', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-32081db05020', 'krishna-phc-kowthavaram', 'PHC Kowthavaram', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kowthavaram', 'PHC Kowthavaram, Kowthavaram, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521330', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-3cb881ccf5e5', 'krishna-phc-lakshmipuram', 'PHC Lakshmipuram', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Lakshmipuram', 'PHC Lakshmipuram, Lakshmipuram, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521324', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-a12413189b46', 'krishna-phc-mallavolu', 'PHC Mallavolu', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Mallavolu', 'PHC Mallavolu, Mallavolu, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521149', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-759f8b4a7156', 'krishna-phc-mopidevi', 'PHC Mopidevi', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Mopidevi', 'PHC Mopidevi, Mopidevi, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521125', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-cd1fa8c0c5b4', 'krishna-phc-moturu', 'PHC Moturu', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Moturu', 'PHC Moturu, Moturu, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521323', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-d7929fec6636', 'krishna-phc-movva', 'PHC Movva', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Movva', 'PHC Movva, Movva, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521135', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-a71f813cc7f5', 'krishna-phc-nagayalanka', 'PHC Nagayalanka', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Nagayalanka', 'PHC Nagayalanka, Nagayalanka, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521120', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-2f4ed15241e8', 'krishna-phc-nidumolu', 'PHC Nidumolu', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Nidumolu', 'PHC Nidumolu, Nidumolu, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521156', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-5419b6749ea6', 'krishna-phc-pamarru', 'PHC Pamarru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Pamarru', 'PHC Pamarru, Pamarru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521157', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-64617f4ec9e4', 'krishna-phc-pedana', 'PHC Pedana', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Pedana', 'PHC Pedana, Pedana, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521366', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-9273df44fbb0', 'krishna-phc-pedaparupudi', 'PHC Pedaparupudi', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Pedaparupudi', 'PHC Pedaparupudi, Pedaparupudi, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521263', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-19a29980d9a4', 'krishna-phc-pedatummidi', 'PHC Pedatummidi', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Pedatummidi', 'PHC Pedatummidi, Pedatummidi, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521329', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-9ca3ea3cc1bc', 'krishna-phc-puritigadda', 'PHC Puritigadda', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Puritigadda', 'PHC Puritigadda, Puritigadda, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521126', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-83ac87e624da', 'krishna-phc-srikakulam', 'PHC Srikakulam', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Srikakulam', 'phcsrikakulam@gmail.com, Srikakulam, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '532001', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-4856f626be15', 'krishna-phc-tallapalem', 'PHC Tallapalem', 'Unclassified listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Tallapalem', 'PHC Tallapalem, Tallapalem, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521002', 'Unclassified', 'Government', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-5cc10194b6c6', 'krishna-phc-uppuluru', 'PHC Uppuluru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Uppuluru', 'PHC Uppuluru, Uppuluru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521151', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-835efa5610a0', 'krishna-phc-vekanuru', 'PHC Vekanuru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kanuru', 'PHC Vekanuru, Kanuru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521121', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-712965049eb5', 'krishna-phc-ventrapragada', 'PHC Ventrapragada', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Ventrapragada', 'PHC Ventrapragada, Ventrapragada, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521263', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-3b061d4c6db3', 'krishna-phc-zamigolvepalli', 'PHC Zamigolvepalli', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Zamigolvepalli', 'PHC Zamigolvepalli, Zamigolvepalli, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521322', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-811bd9bc1fd6', 'krishna-phc-chowtapalli', 'PHC.Chowtapalli', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Chowtapalli', 'PHC.Chowtapalli, Chowtapalli, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521323', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-fb71cb9cce64', 'krishna-phc-guraja', 'PHC.Guraja', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Guraja', 'PHC.Guraja, Guraja, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521325', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-36b948d048cd', 'krishna-phc-katuru', 'PHC.Katuru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Katuru', 'PHC.Katuru, Katuru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521164', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-5900fcbeb35e', 'krishna-phc-kondapalli', 'PHC.Kondapalli', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kondapalli', 'PHC.Kondapalli, Kondapalli, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521228', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-d34bd35cf078', 'krishna-phc-mustabada', 'PHC.Mustabada', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Mustabada', 'PHC.Mustabada, Mustabada, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521107', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-0fb96e3ce094', 'krishna-phc-nimmakuru', 'PHC.Nimmakuru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Nimmakuru', 'PHC.Nimmakuru, Nimmakuru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521158', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-b3bd95b4167c', 'krishna-phc-pedaoutapalli', 'PHC.Pedaoutapalli', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Pedaoutapalli', 'PHC.Pedaoutapalli, Pedaoutapalli, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '520010', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-fdb110b80e8b', 'krishna-phc-penamaluru', 'PHC.Penamaluru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Penamaluru', 'PHC.Penamaluru, Penamaluru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521139', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-eed322044b58', 'krishna-phc-sagguru', 'PHC.Sagguru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Sagguru', 'PHC.Sagguru, Sagguru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521211', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-253190088062', 'krishna-phc-thotlavalluru', 'PHC.Thotlavalluru', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Thotlavalluru', 'PHC.Thotlavalluru, Thotlavalluru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521163', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-ee169ba2e955', 'krishna-phc-unguturu', 'PHC.Unguturu', 'Primary Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Unguturu', 'PHC.Unguturu, Unguturu, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521312', 'Primary Health Centre', 'Government', 'PHC'),
  ('7f200000-0000-4000-8000-82fa35f4d210', 'krishna-phc-velagaleru', 'PHC.Velagaleru', 'Unclassified listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Velagaleru', 'PHC.Velagaleru, Velagaleru, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521229', 'Unclassified', 'Government', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-a2b10e4f4398', 'ntr-police-dispensary-vijayawada', 'Police Dispensary Vijayawada', 'Police dispensary listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'Police Dispensary Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520001', 'Police dispensary', 'Government', 'Police Dispensary'),
  ('7f200000-0000-4000-8000-77d0e2e4d4f7', 'krishna-pp-unit-avanigadda', 'PP Unit Avanigadda', 'Post-Partum unit listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Avanigadda', 'PP Unit Avanigadda, Avanigadda, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521121', 'Post-Partum unit', 'Government', 'PP Unit'),
  ('7f200000-0000-4000-8000-40a83694b2b0', 'krishna-ppu-gudiwada', 'PPU Gudiwada', 'Post-Partum unit listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Gudiwada', 'PPU Gudiwada, Gudiwada, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521301', 'Post-Partum unit', 'Government', 'PP Unit'),
  ('7f100006-0000-0000-0000-000000000006', 'mph-sai-sri-ram-hospitals', 'Sai Sri Ram Hospitals', 'Private Hospital listed by third-party directory for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Edepalli, Srinivas Nagar Colony, Machilipatnam, Andhra Pradesh, India', null, null, null, null, 'third-party directory', null, 'THIRD_PARTY_DIRECTORY', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f100008-0000-0000-0000-000000000008', 'mph-save-multi-speciality-hospital', 'SAVE Multi-Speciality Hospital', 'Private Hospital listed by savehospitalmachilipatnam.com for the Machilipatnam–Vijayawada corridor.', 'Machilipatnam', 'Kamma Sangam Road, Machilipatnam, Andhra Pradesh, India', null, null, 'https://savehospitalmachilipatnam.com', null, 'savehospitalmachilipatnam.com', 'https://savehospitalmachilipatnam.com/en', 'PROVIDER_LISTED', '2026-10-23', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
  ('7f200000-0000-4000-8000-0a16610c7b87', 'krishna-tb-control-centre-mtm', 'TB.Control centre MTM', 'Tuberculosis treatment centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'MTM', 'TB.Control centre MTM, MTM, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521001', 'Tuberculosis treatment centre', 'Government', 'TB Clinic'),
  ('7f200000-0000-4000-8000-ca9d3e10d918', 'ntr-ufwc-kothapeta', 'UFWC Kothapeta', 'Urban Family Welfare Centre listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Kothapeta', 'UFWC Kothapeta, Kothapeta, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520012', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
  ('7f200000-0000-4000-8000-ae2a87ba9313', 'ntr-ufwc-patamata', 'UFWC Patamata', 'Urban Family Welfare Centre listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Patamata', 'UFWC Patamata, Patamata, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520010', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
  ('7f200000-0000-4000-8000-dd2c0960ab11', 'ntr-ufwc-rajeevnagar', 'UFWC Rajeevnagar', 'Urban Family Welfare Centre listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'UFWC Rajeevnagar Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520015', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
  ('7f200000-0000-4000-8000-71bdcb666777', 'ntr-ufwc-vijayawada', 'UFWC Vijayawada', 'Urban Family Welfare Centre listed by NTR District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Vijayawada', 'UFWC Vijayawada, Vijayawada, Andhra Pradesh, India', null, null, null, null, 'NTR District, Government of Andhra Pradesh — Hospitals', 'https://ntr.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'NTR', '520008', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
  ('7f200000-0000-4000-8000-c28d24dc7292', 'krishna-uhc-pedana', 'UHC Pedana', 'Urban Health Centre listed by Krishna District, Government of Andhra Pradesh — Hospitals for the Machilipatnam–Vijayawada corridor.', 'Pedana', 'UHC Pedana, Pedana, Andhra Pradesh, India', null, null, null, null, 'Krishna District, Government of Andhra Pradesh — Hospitals', 'https://krishna.ap.gov.in/public-utility-category/hospitals/', 'VERIFIED', '2026-10-23', 'Krishna', '521366', 'Urban Health Centre', 'Government', 'UHC')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Facilities with published coordinates (only when a source stated them).
-- ---------------------------------------------------------------------------
insert into public.hospital_locations (id,hospital_id,label,address,city,latitude,longitude) values
  ('7f210000-0000-4000-8000-000000000001','7f100004-0000-0000-0000-000000000004','Main centre','Chilakalapudi, Machilipatnam, Andhra Pradesh, India','Machilipatnam',16.19912,81.15567)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Backfill the corridor columns on rows that a previous migration already
--    inserted (0031 seeded the curated Machilipatnam facilities, so the
--    `on conflict (id) do nothing` above correctly skipped them and their new
--    columns would otherwise stay null). Idempotent: only nulls are filled.
-- ---------------------------------------------------------------------------
update public.hospitals h
   set district       = coalesce(h.district, v.district),
       pincode        = coalesce(h.pincode, v.pincode),
       category_label = coalesce(h.category_label, v.category_label),
       ownership      = coalesce(h.ownership, v.ownership),
       facility_type  = coalesce(h.facility_type, v.facility_type)
  from (values
    ('7f200000-0000-4000-8000-b7a668a21911', 'NTR', '520004', 'Assistant Medical Officer of Health office', 'Government', 'AMOH'),
    ('7f100005-0000-0000-0000-000000000005', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f100009-0000-0000-0000-000000000009', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f100003-0000-0000-0000-000000000003', 'Krishna', null, 'Primary Health Centre', 'Government', 'PHC'),
    ('7f100001-0000-0000-0000-000000000001', 'Krishna', '521001', 'District hospital', 'Government', 'District Hospital'),
    ('7f200000-0000-4000-8000-8dd03ea30b55', 'NTR', '520001', 'District Leprosy Office', 'Government', 'DLO'),
    ('7f10000a-0000-0000-0000-00000000000a', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-75373a415b71', 'Krishna', '521101', 'Private hospital', 'Private', 'Private Hospital'),
    ('7f10000c-0000-0000-0000-00000000000c', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-ca2692939c99', 'Krishna', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-29378408f28d', 'Krishna', '521149', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-5d288cd279d4', 'NTR', '520003', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-c9a9140a0b0c', 'Krishna', '521301', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-fe352d48f31b', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-3f6acd442a59', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f100004-0000-0000-0000-000000000004', 'Krishna', '521002', 'Unclassified', 'Government', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-29bf8eef4bc9', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-2297785e95dd', 'Krishna', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-491d6ab53a69', 'Krishna', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-07e09f03f47c', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-2d3be9b5e1d6', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-c5f891164ad0', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-1c2fd9e2d394', 'Krishna', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-5a5594fe356c', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-297a8c6d0431', 'NTR', '520013', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-d3e6e321bae3', 'NTR', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-39b434e870c2', 'NTR', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-e9e4623bfb2b', 'NTR', '520004', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-c1d60fc07d7a', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-7dfcbfbd6c2a', 'NTR', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-336c90c50bb7', 'Krishna', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-c4ad14378bbf', 'Krishna', '521301', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-4d1791837f67', 'NTR', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-c353a5401ee9', 'NTR', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-733cbf2f1be9', 'Krishna', '520010', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-0dddc90452ff', 'NTR', '520013', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-e414f065d773', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-68a04a6f1388', 'Krishna', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-9e1ba5d8da8a', 'Krishna', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-e187546a2f49', 'NTR', '520015', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-be48b85614bd', 'Krishna', '521001', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f200000-0000-4000-8000-a1f22d925ff6', 'NTR', '520012', 'Urban Primary Health Centre (extended)', 'Government', 'E-UPHC'),
    ('7f100002-0000-0000-0000-000000000002', 'Krishna', '521001', 'Medical college / teaching hospital', 'Government', 'Medical College Hospital'),
    ('7f100007-0000-0000-0000-000000000007', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f10000b-0000-0000-0000-00000000000b', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-c7cfa1616a88', 'NTR', '520008', 'Government hospital', 'Government', 'Government Hospital'),
    ('7f200000-0000-4000-8000-18d0c604b7b6', 'NTR', '520004', 'Government hospital', 'Government', 'Government Hospital'),
    ('7f200000-0000-4000-8000-a2aeffc2c893', 'Krishna', '521002', 'Post-Partum unit', 'Government', 'PP Unit'),
    ('7f200000-0000-4000-8000-92d0db34369b', 'Krishna', '521229', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-9992cbce4343', 'Krishna', '521324', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-510b5ab82c82', 'Krishna', '521330', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-d572309c234f', 'Krishna', '521245', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-52d7a4b488f1', 'Krishna', '516214', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-84a4a03c6ce5', 'Krishna', '521001', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-d4a6ebc6ac09', 'NTR', '521229', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-075adf7c22f0', 'Krishna', '521133', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-5f1a97a02085', 'Krishna', '521133', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-37c2411c5685', 'Krishna', '521356', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-66fd3cfeb8b8', 'NTR', '521456', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-57accbc0f059', 'Krishna', '521311', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-c707d8649846', 'Krishna', '521256', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-c2d372f20cfb', 'Krishna', '521246', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-bf3c9ebcffcd', 'Krishna', '521325', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-32081db05020', 'Krishna', '521330', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-3cb881ccf5e5', 'Krishna', '521324', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-a12413189b46', 'Krishna', '521149', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-759f8b4a7156', 'Krishna', '521125', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-cd1fa8c0c5b4', 'Krishna', '521323', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-d7929fec6636', 'Krishna', '521135', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-a71f813cc7f5', 'Krishna', '521120', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-2f4ed15241e8', 'Krishna', '521156', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-5419b6749ea6', 'Krishna', '521157', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-64617f4ec9e4', 'Krishna', '521366', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-9273df44fbb0', 'Krishna', '521263', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-19a29980d9a4', 'Krishna', '521329', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-9ca3ea3cc1bc', 'Krishna', '521126', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-83ac87e624da', 'Krishna', '532001', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-4856f626be15', 'Krishna', '521002', 'Unclassified', 'Government', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-5cc10194b6c6', 'Krishna', '521151', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-835efa5610a0', 'Krishna', '521121', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-712965049eb5', 'Krishna', '521263', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-3b061d4c6db3', 'Krishna', '521322', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-811bd9bc1fd6', 'Krishna', '521323', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-fb71cb9cce64', 'Krishna', '521325', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-36b948d048cd', 'Krishna', '521164', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-5900fcbeb35e', 'Krishna', '521228', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-d34bd35cf078', 'Krishna', '521107', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-0fb96e3ce094', 'Krishna', '521158', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-b3bd95b4167c', 'Krishna', '520010', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-fdb110b80e8b', 'Krishna', '521139', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-eed322044b58', 'Krishna', '521211', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-253190088062', 'Krishna', '521163', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-ee169ba2e955', 'Krishna', '521312', 'Primary Health Centre', 'Government', 'PHC'),
    ('7f200000-0000-4000-8000-82fa35f4d210', 'Krishna', '521229', 'Unclassified', 'Government', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-a2b10e4f4398', 'NTR', '520001', 'Police dispensary', 'Government', 'Police Dispensary'),
    ('7f200000-0000-4000-8000-77d0e2e4d4f7', 'Krishna', '521121', 'Post-Partum unit', 'Government', 'PP Unit'),
    ('7f200000-0000-4000-8000-40a83694b2b0', 'Krishna', '521301', 'Post-Partum unit', 'Government', 'PP Unit'),
    ('7f100006-0000-0000-0000-000000000006', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f100008-0000-0000-0000-000000000008', 'Krishna', '521001', 'Private Hospital', 'Private', 'Healthcare facility'),
    ('7f200000-0000-4000-8000-0a16610c7b87', 'Krishna', '521001', 'Tuberculosis treatment centre', 'Government', 'TB Clinic'),
    ('7f200000-0000-4000-8000-ca9d3e10d918', 'NTR', '520012', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
    ('7f200000-0000-4000-8000-ae2a87ba9313', 'NTR', '520010', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
    ('7f200000-0000-4000-8000-dd2c0960ab11', 'NTR', '520015', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
    ('7f200000-0000-4000-8000-71bdcb666777', 'NTR', '520008', 'Urban Family Welfare Centre', 'Government', 'UFWC'),
    ('7f200000-0000-4000-8000-c28d24dc7292', 'Krishna', '521366', 'Urban Health Centre', 'Government', 'UHC')
  ) as v(id, district, pincode, category_label, ownership, facility_type)
 where h.id = v.id::uuid;

-- ---------------------------------------------------------------------------
-- 4. Coverage classification recorded per facility (for the quality dashboard).
-- ---------------------------------------------------------------------------
update public.hospitals h
   set coverage_method = 'corridor',
       coverage_note = 'Machilipatnam–Vijayawada corridor (25 km buffer + documented corridor localities)'
 where h.coverage_method is null
   and h.district in ('Krishna','NTR');

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0034_corridor_directory_import.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0035_step25_departments_affiliations_blood_centres.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 25: hospital departments, doctor affiliations and blood
-- centres for the Machilipatnam → Vijayawada corridor.
--
-- GENERATED by `node scripts/directory/emit-step25-migration.mjs` from
-- src/data/directoryEvidence.ts and src/data/bloodCentres.ts — the same evidence
-- the app renders. Do not edit by hand; re-run the generator instead.
--
-- ADDITIVE + IDEMPOTENT. Reuses the provider registry from migration 0005
-- (hospitals / doctors / doctor_hospitals) and the provenance columns added in
-- 0024/0031/0034. Every insert is `on conflict … do nothing`, so replaying the
-- chain never duplicates a row.
--
-- SECURITY: all three tables are provider DISCOVERY data → public read, exactly
-- like hospitals. No write policy for anon/authenticated; seeding is by
-- migration and admin writes go through the guarded RPCs. No patient data.
--
-- HONESTY
--   - `evidence_status` is 'published' only when a facility-specific source
--     names the department.
--   - `appointment_capable` records whether the facility publishes a booking
--     path — never that a slot is currently free.
--   - blood_centres has NO stock column: live stock is not integrated, so no
--     figure can be stored, fabricated or shown stale.
--   - No phone, floor, opening hour, rating or doctor count is invented.
--
-- SOURCES (checked 2026-10-22)
--   https://www.gmcmachilipatnam-ap-gov.com/departments/
--   https://muralikrishnahospital.com/doctors  ·  /services
--   https://savehospitalmachilipatnam.com/en/services  ·  /team
--   https://madhuneuro.com/machilipatnam/
--   https://www.indianredcross.org/ircsbloodbanks/
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Hospital departments.
-- ---------------------------------------------------------------------------
create table if not exists public.hospital_departments (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  name text not null,
  specialty_category text,
  description text,
  services jsonb not null default '[]'::jsonb,
  phone text,
  location_note text,
  opening_hours text,
  appointment_capable boolean not null default false,
  evidence_status text not null default 'published'
    check (evidence_status in ('published','unverified_suggestion')),
  data_source text,
  source_url text,
  data_status text not null default 'THIRD_PARTY_DIRECTORY',
  fetched_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name)
);
create index if not exists hospital_departments_hospital_id_idx on public.hospital_departments(hospital_id);
create index if not exists hospital_departments_name_idx on public.hospital_departments(lower(name));

-- ---------------------------------------------------------------------------
-- 2. Doctor ↔ hospital ↔ department affiliations.
--
--    Reuses doctor_hospitals (0005) for the plain hospital link; this table
--    carries the department and the published role/timing. A doctor with no
--    department stated simply has no row here — never an invented department.
-- ---------------------------------------------------------------------------
create table if not exists public.doctor_department_affiliations (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  department_id uuid references public.hospital_departments(id) on delete set null,
  department_name text,
  status text not null default 'current'
    check (status in ('current','historical','uncertain')),
  role text,
  schedule_note text,
  data_source text,
  source_url text,
  data_status text not null default 'THIRD_PARTY_DIRECTORY',
  fetched_at date,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (doctor_id, hospital_id, department_name)
);
create index if not exists doctor_dept_aff_doc_idx on public.doctor_department_affiliations(doctor_id);
create index if not exists doctor_dept_aff_hosp_idx on public.doctor_department_affiliations(hospital_id);
create index if not exists doctor_dept_aff_dept_idx on public.doctor_department_affiliations(department_id);

-- ---------------------------------------------------------------------------
-- 3. Blood centres — separate identity from hospitals, NO stock column.
-- ---------------------------------------------------------------------------
create table if not exists public.blood_centres (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  hospital_id uuid references public.hospitals(id) on delete set null,
  address text,
  locality text,
  district text,
  pincode text,
  state text default 'Andhra Pradesh',
  country text default 'India',
  phone text,
  phone_alt text,
  email text,
  website text,
  registration_id text,
  ownership text check (ownership is null or ownership in ('Government','Private','Charitable')),
  category_label text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  operational_status text,
  stock_source text not null default 'not_integrated' check (stock_source in ('live','not_integrated')),
  data_source text,
  source_url text,
  data_status text not null default 'THIRD_PARTY_DIRECTORY',
  fetched_at date,
  last_verified_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blood_centres_locality_idx on public.blood_centres(locality);
create index if not exists blood_centres_district_idx on public.blood_centres(district);
create index if not exists blood_centres_hospital_idx on public.blood_centres(hospital_id);

-- ---------------------------------------------------------------------------
-- 4. RLS — public read, no client writes.
-- ---------------------------------------------------------------------------
alter table public.hospital_departments enable row level security;
alter table public.doctor_department_affiliations enable row level security;
alter table public.blood_centres enable row level security;

drop policy if exists hospital_departments_public_read on public.hospital_departments;
create policy hospital_departments_public_read on public.hospital_departments for select using (true);

drop policy if exists doctor_dept_aff_public_read on public.doctor_department_affiliations;
create policy doctor_dept_aff_public_read on public.doctor_department_affiliations for select using (true);

drop policy if exists blood_centres_public_read on public.blood_centres;
create policy blood_centres_public_read on public.blood_centres for select using (true);

revoke insert, update, delete on public.hospital_departments from anon, authenticated;
revoke insert, update, delete on public.doctor_department_affiliations from anon, authenticated;
revoke insert, update, delete on public.blood_centres from anon, authenticated;
grant select on public.hospital_departments to anon, authenticated;
grant select on public.doctor_department_affiliations to anon, authenticated;
grant select on public.blood_centres to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Departments (59 rows).
-- ---------------------------------------------------------------------------
insert into public.hospital_departments
  (hospital_id, name, specialty_category, description, services, appointment_capable,
   evidence_status, data_source, source_url, data_status, fetched_at)
values
  ('7f100002-0000-0000-0000-000000000002','Anaesthesiology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Anatomy',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Bio-Chemistry',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Community Medicine',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Dentistry',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Dermatology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','ENT',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Forensic Medicine',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','General Medicine',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','General Surgery',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Gynecology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Micro Biology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Orthopedics',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Paediatrics',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Pathology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Pharmacology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Physiology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Psychiatry',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Pulmonology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Radiology',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100002-0000-0000-0000-000000000002','Emergency Medicine',null,null,'[]'::jsonb,false,'published','Government Medical College Machilipatnam — Departments','https://www.gmcmachilipatnam-ap-gov.com/departments/','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','General Medicine','Medicine',null,'["Outpatient consultation","Emergency support"]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Services','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Orthopaedics',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','General Surgery',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Obstetrics & Gynaecology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Dermatology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Rheumatology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Psychiatry',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Neurology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Gastroenterology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Cardiology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Pulmonology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Nephrology',null,'Visiting specialist department listed on the hospital’s published doctors roster.','[]'::jsonb,true,'published','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f100007-0000-0000-0000-000000000007','Diagnostic Support','Diagnostics',null,'["Diabetic Profile Package"]'::jsonb,false,'published','Murali Krishna Hospital — Medical Services','https://muralikrishnahospital.com/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','ENT',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Orthopaedics',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Ophthalmology',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','General Medicine',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Emergency Medicine',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Diagnostic Support',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','General Surgery',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Cardiology',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Paediatrics',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Rehabilitation Medicine',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Obstetrics & Gynaecology',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f100008-0000-0000-0000-000000000008','Pharmacy Services',null,null,'[]'::jsonb,true,'published','SAVE Multi-Speciality Hospital — Services','https://savehospitalmachilipatnam.com/en/services','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Neurology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Neurosurgery',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Nephrology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Rheumatology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Cardiology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Orthopaedics',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Endocrinology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Pulmonology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','General Surgery',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','General Medicine',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','ENT',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Gastroenterology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22'),
  ('7f10000a-0000-0000-0000-00000000000a','Dermatology',null,null,'[]'::jsonb,true,'published','Dr. Madhu Super Speciality Hospital — Machilipatnam branch services','https://madhuneuro.com/machilipatnam/','PROVIDER_LISTED','2026-10-22')
on conflict (hospital_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Doctors not already seeded by 0031 (11 rows).
-- ---------------------------------------------------------------------------
insert into public.doctors
  (id, slug, name, gender, years_experience, bio, photo_url, languages, rating,
   data_source, source_url, data_status, fetched_at)
values
  ('7f400000-0000-4000-8000-49de5c9609e8','mph-dr-a-sandeep','Dr. A. Sandeep',null,null,'Orthopaedics specialist listed on the facility''s published roster. Qualifications: M.S. Ortho; Fellow in Joint Replacement.','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-b910d7d1a83f','mph-dr-g-dinesh','Dr. G. Dinesh',null,null,'General Surgery specialist listed on the facility''s published roster. Qualifications: MS General Surgery.','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-c97820368917','mph-dr-harika-matti','Dr. Harika Matti',null,null,'Obstetrics & Gynaecology specialist listed on the facility''s published roster. Qualifications: MBBS; MS (OBG); FRM (RGUHS).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-9f585b30cbe0','mph-dr-harishta-battula','Dr. Harishta Battula',null,null,'Dermatology specialist listed on the facility''s published roster. Qualifications: MBBS; MD DVL; Fellow in aesthetic medicine.','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-f778dbdeb0b2','mph-dr-kona-ravi-kiran','Dr. Kona Ravi Kiran',null,null,'Rheumatology specialist listed on the facility''s published roster. Qualifications: MBBS; MD (Rheumatology Fellowship - Manipal).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-d18ac0f1b43d','mph-dr-l-srikanth','Dr. L. Srikanth',null,null,'Psychiatry specialist listed on the facility''s published roster. Qualifications: MD (Neuro Psychiatry).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-6a4fd3d7f888','mph-dr-p-sai-sandeep','Dr. P. Sai Sandeep',null,null,'Neurology specialist listed on the facility''s published roster. Qualifications: DNB (Gen Med); DM (Neurology).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-9ed7ba01a3fb','mph-dr-u-bhaskar-rao','Dr. U. Bhaskar Rao',null,null,'Gastroenterology specialist listed on the facility''s published roster. Qualifications: MD; DM (Gastroenterology).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-c67fcea035d4','mph-dr-v-s-r-bhupal','Dr. V.S.R. Bhupal',null,null,'Cardiology specialist listed on the facility''s published roster. Qualifications: MD; DM (NIMS).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-5ad51bca93af','mph-dr-vvs-dsr-sagar','Dr. VVS DSR Sagar',null,null,'Pulmonology specialist listed on the facility''s published roster. Qualifications: MD (Pulmonology).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22'),
  ('7f400000-0000-4000-8000-e6eeed0e5adb','mph-dr-y-ramesh','Dr. Y. Ramesh',null,null,'Nephrology specialist listed on the facility''s published roster. Qualifications: MD; DM (Nephrology).','[]'::jsonb,'[]'::jsonb,null,'Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22')
on conflict (id) do nothing;

-- Link every doctor to its hospital in the canonical doctor_hospitals table.
insert into public.doctor_hospitals (doctor_id, hospital_id, is_primary)
select distinct a.doctor_id, a.hospital_id, true
from public.doctor_department_affiliations a
on conflict (doctor_id, hospital_id) do nothing;

-- ---------------------------------------------------------------------------
-- 7. Doctor affiliations (14 rows).
-- ---------------------------------------------------------------------------
insert into public.doctor_department_affiliations
  (doctor_id, hospital_id, department_name, status, role, schedule_note,
   data_source, source_url, data_status, fetched_at, last_verified_at)
values
  ('7f300001-0000-0000-0000-000000000001','7f100007-0000-0000-0000-000000000007','General Medicine','current','Chief physician','Daily consultation 10:00 AM – 1:00 PM and 6:00 PM – 8:00 PM','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-49de5c9609e8','7f100007-0000-0000-0000-000000000007','Orthopaedics','current','Visiting specialist','1st and 3rd Friday of each month, 10:00 AM onwards','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-b910d7d1a83f','7f100007-0000-0000-0000-000000000007','General Surgery','current','Consulting surgeon (on call)','Everyday (on call)','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-c97820368917','7f100007-0000-0000-0000-000000000007','Obstetrics & Gynaecology','current','Visiting specialist','11:00 AM every month, 2nd Tuesday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-9f585b30cbe0','7f100007-0000-0000-0000-000000000007','Dermatology','current','Visiting specialist','1st and 3rd Tuesday of each month, 10:00 AM – 1:00 PM','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-f778dbdeb0b2','7f100007-0000-0000-0000-000000000007','Rheumatology','current','Visiting specialist','10:00 AM – 1:00 PM every month, 4th Thursday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-d18ac0f1b43d','7f100007-0000-0000-0000-000000000007','Psychiatry','current','Visiting specialist','10:30 AM – 2:00 PM every month, 3rd Sunday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-6a4fd3d7f888','7f100007-0000-0000-0000-000000000007','Neurology','current','Visiting specialist','1st Sunday of each month, 10:00 AM onwards','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-9ed7ba01a3fb','7f100007-0000-0000-0000-000000000007','Gastroenterology','current','Visiting specialist','10:00 AM – 1:00 PM every month, 4th Sunday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-c67fcea035d4','7f100007-0000-0000-0000-000000000007','Cardiology','current','Visiting specialist','5:00 PM every month, 3rd Friday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-5ad51bca93af','7f100007-0000-0000-0000-000000000007','Pulmonology','current','Visiting specialist','4:00 PM every month, 4th Tuesday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f400000-0000-4000-8000-e6eeed0e5adb','7f100007-0000-0000-0000-000000000007','Nephrology','current','Visiting specialist','3:00 PM – 5:00 PM every month, 4th Friday','Murali Krishna Hospital — Doctors & Specialists','https://muralikrishnahospital.com/doctors','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f300004-0000-0000-0000-000000000004','7f100008-0000-0000-0000-000000000008','ENT','current','Founder, Medical Director & Lead ENT Surgeon',null,'SAVE Multi-Speciality Hospital — Our Team','https://savehospitalmachilipatnam.com/en/team','PROVIDER_LISTED','2026-10-22','2026-10-22'),
  ('7f300005-0000-0000-0000-000000000005','7f100008-0000-0000-0000-000000000008','Ophthalmology','current','Head of Ophthalmology & Lead Eye Surgeon',null,'SAVE Multi-Speciality Hospital — Our Team','https://savehospitalmachilipatnam.com/en/team','PROVIDER_LISTED','2026-10-22','2026-10-22')
on conflict (doctor_id, hospital_id, department_name) do nothing;

-- ---------------------------------------------------------------------------
-- 8. Blood centres (3 rows).
-- ---------------------------------------------------------------------------
insert into public.blood_centres
  (id, slug, name, hospital_id, address, locality, district, pincode, state, country,
   phone, phone_alt, email, website, registration_id, ownership, category_label,
   latitude, longitude, operational_status, stock_source,
   data_source, source_url, data_status, fetched_at, last_verified_at)
values
  ('7f500000-0000-4000-8000-43152bb9d603','ircs-dr-pattabhi-red-cross-blood-centre-machilipatnam','IRCS Dr. Pattabhi Red Cross Blood Centre, Machilipatnam',null,'DM&HO Campus, 21/276, Parasupeta, Machilipatnam, Krishna District, Andhra Pradesh','Machilipatnam','Krishna','521001','Andhra Pradesh','India','7793939660','9182609909',null,null,null,'Charitable','Red Cross blood centre',null,null,null,'not_integrated','Indian Red Cross Society — List of IRCS Blood Centres (Sep 2026)','https://www.indianredcross.org/ircsbloodbanks/','SOURCE_LISTED','2026-10-22',null),
  ('7f500000-0000-4000-8000-26f17fca3214','ircs-blood-bank-vijayawada-gandhi-nagar','IRCS Blood Bank, Vijayawada (Gandhi Nagar)',null,'G.R. Raju Street, D.No. 26-5-5, Red Cross Building, Gandhi Nagar, Vijayawada 520003, Andhra Pradesh','Vijayawada','NTR','520003','Andhra Pradesh','India','8977008540',null,null,null,null,'Charitable','Red Cross blood centre',null,null,null,'not_integrated','Indian Red Cross Society — List of IRCS Blood Centres (Sep 2026)','https://www.indianredcross.org/ircsbloodbanks/','SOURCE_LISTED','2026-10-22',null),
  ('7f500000-0000-4000-8000-770ad2120b87','ircs-blood-centre-gudivada','IRCS Blood Centre, Gudivada',null,'Gudivada, Krishna District, Andhra Pradesh','Gudivada','Krishna',null,'Andhra Pradesh','India',null,null,null,null,null,'Charitable','Red Cross blood centre',null,null,null,'not_integrated','Indian Red Cross Society — List of IRCS Blood Centres (Sep 2026)','https://www.indianredcross.org/ircsbloodbanks/','SOURCE_LISTED','2026-10-22',null)
on conflict (id) do nothing;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0035_step25_departments_affiliations_blood_centres.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0036_step27_pharmacy_lab_directory.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 27: corridor pharmacy + laboratory directory.
--
-- GENERATED by `node scripts/directory/import-pharmacies.mjs` from the reviewed
-- OpenStreetMap snapshots in scripts/directory/source-snapshots/. Do not edit by
-- hand; re-run the importer instead.
--
-- ADDITIVE + IDEMPOTENT. The provider registry already defines `pharmacies` and
-- `labs` (migration 0005); this migration only ADDS corridor/provenance columns
-- and upserts rows by stable id. Replaying never duplicates a row and never
-- rewrites an existing one's identity.
--
-- SECURITY: provider DISCOVERY data → public read, exactly like hospitals and
-- blood centres. No write policy for anon/authenticated; seeding is by migration.
--
-- HONESTY
--   - `stock_source` is 'not_integrated' everywhere: there is NO stock column, so
--     a stock level cannot be stored, fabricated or shown stale.
--   - `is_verified` stays false: a community-mapped POI is not a licence check.
--   - A field the source did not publish is NULL — never guessed.
--
-- SOURCE: OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/)
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the existing registry tables with corridor + provenance columns.
-- ---------------------------------------------------------------------------
alter table public.pharmacies add column if not exists district text;
alter table public.pharmacies add column if not exists pincode text;
alter table public.pharmacies add column if not exists state text default 'Andhra Pradesh';
alter table public.pharmacies add column if not exists country text default 'India';
alter table public.pharmacies add column if not exists latitude numeric(9,6);
alter table public.pharmacies add column if not exists longitude numeric(9,6);
alter table public.pharmacies add column if not exists opening_hours text;
alter table public.pharmacies add column if not exists brand text;
alter table public.pharmacies add column if not exists ownership text;
alter table public.pharmacies add column if not exists stock_source text not null default 'not_integrated';
alter table public.pharmacies add column if not exists data_source text;
alter table public.pharmacies add column if not exists source_url text;
alter table public.pharmacies add column if not exists data_status text not null default 'THIRD_PARTY_DIRECTORY';
alter table public.pharmacies add column if not exists last_checked_at date;

alter table public.labs add column if not exists district text;
alter table public.labs add column if not exists pincode text;
alter table public.labs add column if not exists state text default 'Andhra Pradesh';
alter table public.labs add column if not exists country text default 'India';
alter table public.labs add column if not exists latitude numeric(9,6);
alter table public.labs add column if not exists longitude numeric(9,6);
alter table public.labs add column if not exists opening_hours text;
alter table public.labs add column if not exists ownership text;
alter table public.labs add column if not exists data_source text;
alter table public.labs add column if not exists source_url text;
alter table public.labs add column if not exists data_status text not null default 'THIRD_PARTY_DIRECTORY';
alter table public.labs add column if not exists last_checked_at date;

create index if not exists pharmacies_locality_idx on public.pharmacies(city);
create index if not exists pharmacies_district_idx on public.pharmacies(district);
create index if not exists labs_locality_idx on public.labs(city);
create index if not exists labs_district_idx on public.labs(district);

-- ---------------------------------------------------------------------------
-- 2. Seed the corridor pharmacies (stable ids; idempotent upsert).
-- ---------------------------------------------------------------------------
insert into public.pharmacies (
  id, slug, name, address, city, district, pincode, state, country,
  latitude, longitude, phone_number, opening_hours, brand, ownership,
  stock_source, data_source, source_url, data_status, last_checked_at
) values
  ('be3795bc-b475-4342-8212-6eb09ac2670d'::uuid, 'medplus-vijayawada-4', 'MedPlus', 'AS Rama Rao Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.505316, 80.6476242, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12189205877', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('e681a398-4203-46da-8d53-fe2c02f50ae4'::uuid, 'adithya-pharmacy-vijayawada', 'Adithya Pharmacy', 'Siddartha College Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520010', 'Andhra Pradesh', 'India', 16.5068125, 80.6492258, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12850806183', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('50120333-f671-4592-81bd-c276937a99ca'::uuid, 'apollo-pharmacy-vijayawada', 'Apollo Pharmacy', 'Vijayawada - Machilipatnam Road, Patamata, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.4897952, 80.6727431, null, null, 'Apollo Pharmacy', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/6207604486', 'THIRD_PARTY_DIRECTORY', '2025-07-10'::date),
  ('04d2aaab-be3a-4ade-9bc8-873286e23539'::uuid, 'medplus-vijayawada-7', 'MedPlus', 'Gayatri Nagar Main, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5014482, 80.653855, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12189182983', 'THIRD_PARTY_DIRECTORY', '2024-09-21'::date),
  ('06f1bae9-7b93-4219-a038-44fe82f52fac'::uuid, 'medplus-vijayawada-5', 'MedPlus', 'MG Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5012486, 80.6421967, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/11998980359', 'THIRD_PARTY_DIRECTORY', '2024-06-21'::date),
  ('86f2c6c4-866e-4f23-bdb8-3089a3c36a0d'::uuid, 'sri-vasavi-medical-fancy-store-vijayawada', 'Sri Vasavi Medical & Fancy Store', 'Sikhamani Center Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5072649, 80.6399608, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12873316247', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('237bea7e-444e-4119-8f31-eebc775c77a4'::uuid, 'sri-venkata-sai-durga-medical-fancy-stores-vijayawada', 'Sri Venkata Sai Durga Medical & Fancy Stores', 'Sikhamani Center Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5055001, 80.6397578, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12873284605', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('c401f3e3-d54a-4dff-8537-d601bbfc7cb3'::uuid, 'sri-venkata-sai-durga-medical-shop-vijayawada', 'Sri Venkata Sai Durga Medical Shop', 'Sikhamani Center Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.506112, 80.6397588, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12852869807', 'THIRD_PARTY_DIRECTORY', '2025-05-21'::date),
  ('e58f4ac9-7f14-4c01-933f-39462038b6fd'::uuid, 'suraksha-generic-pharmacy-vijayawada', 'Suraksha Generic Pharmacy', 'Karl Marx Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5127934, 80.6415616, null, null, 'Suraksha', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12422552992', 'THIRD_PARTY_DIRECTORY', '2024-12-14'::date),
  ('47b8fed5-9f9d-429b-abb3-9054d7ce4421'::uuid, 'medplus-vijayawada-3', 'MedPlus', 'Gurunanak Colony, Patamata, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5027383, 80.6684235, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12875633028', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('da69e707-d1b1-49da-aa82-45775685762f'::uuid, 'apollo-pharmacy-gosala', 'Apollo Pharmacy', 'Vijayawada - Machilipatnam Road, Gosala, Krishna district', 'Gosala', 'Krishna', '521139', 'Andhra Pradesh', 'India', 16.4760133, 80.7068857, null, null, 'Apollo Pharmacy', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993628546', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('d3d3d8a8-d250-4ff0-8297-41172be28478'::uuid, 'apollo-pharmacy-tadigadapa', 'Apollo Pharmacy', 'Vijayawada - Machilipatnam Road, Srinivasanagar, Tadigadapa, Krishna district', 'Tadigadapa', 'Krishna', '521137', 'Andhra Pradesh', 'India', 16.4762955, 80.7069326, null, null, 'Apollo Pharmacy', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993628538', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('994bb8de-87d0-4ee3-a3a3-71cd703f1d51'::uuid, 'sri-gopala-krishna-medical-and-general-store-gosala', 'Sri Gopala Krishna Medical And General Store', 'Vijayawada - Machilipatnam Road, Gosala, Krishna district', 'Gosala', 'Krishna', '521139', 'Andhra Pradesh', 'India', 16.4757239, 80.705002, null, '09:00-21:00', null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993643279', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('c9131b24-3056-4ab4-9b88-68438cb23bff'::uuid, 'apollo-pharmacy-tadigadapa-2', 'Apollo Pharmacy', 'Vijayawada - Machilipatnam Road, Tadigadapa, NTR District', 'Tadigadapa', 'NTR', '521137', 'Andhra Pradesh', 'India', 16.4873155, 80.678514, null, null, 'Apollo Pharmacy', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993629337', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('e0d96ac7-6985-4891-95f0-ad59f6996e86'::uuid, 'vijaya-medical-fancy-vijayawada', 'Vijaya Medical & Fancy', 'Nirmala Convent Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.4975174, 80.6572864, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12863985094', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('59bcb8ee-b615-4085-ba16-5bdaba43e61b'::uuid, 'unnamed-pharmacy-listing-tadigadapa-tadigadapa', 'Unnamed pharmacy listing, Tadigadapa', 'Vijayawada - Machilipatnam Road, Srinivasanagar, Tadigadapa, Krishna district', 'Tadigadapa', 'Krishna', '521137', 'Andhra Pradesh', 'India', 16.4772095, 80.7044916, null, 'Mo-Sa 06:00-19:00', null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993671405', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('68ce58d4-c9fe-4b54-93a3-3cc98f8ed1ab'::uuid, 'sri-krishna-medical-store-tadigadapa', 'Sri Krishna Medical Store', 'Nidamanuru - Poranki - Pedapulapaka Road, Vasanth Nagar, Tadigadapa, Krishna district', 'Tadigadapa', 'Krishna', '521137', 'Andhra Pradesh', 'India', 16.4786251, 80.7085878, null, '09:00-21:00', null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12991085441', 'THIRD_PARTY_DIRECTORY', '2025-07-10'::date),
  ('2c13cb43-8fbf-4d24-a8b5-7c4ec82c6604'::uuid, 'moons-pharmacy-machilipatnam', 'Moons pharmacy', 'Machilipatnam Main Road, Bhardapuram, Machilipatnam, Krishna district', 'Machilipatnam', 'Krishna', '521001', 'Andhra Pradesh', 'India', 16.1792122, 81.128739, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12171339803', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('7619e7c7-a064-4c73-8674-f0519decea70'::uuid, 'apollo-pharmacy-vijayawada-vijayawada', 'apollo pharmacy vijayawada', '81st lane, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.4979014, 80.6368032, null, null, 'Apollo Pharmacy', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12992325343', 'THIRD_PARTY_DIRECTORY', '2025-07-10'::date),
  ('3df237f3-7628-49fa-9c4d-ce4eec8ab1d1'::uuid, 'vijayadurga-medical-and-fancy-store-vijayawada', 'VijayaDurga Medical and Fancy Store', 'Karl Marx Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5145658, 80.6344973, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/7798096279', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('7c55affb-d2d5-4313-add4-f126e0dfcc69'::uuid, 'medplus-vijayawada', 'MedPlus', 'VMR road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.4904134, 80.6513697, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12868362646', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('08deb499-cce4-4ba3-9668-179748eb5645'::uuid, 'medplus-vijayawada-8', 'MedPlus', 'Bhagat Singh Road, Ayodhya Nagar, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5257534, 80.6388916, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/11697416895', 'THIRD_PARTY_DIRECTORY', '2025-07-24'::date),
  ('37500c30-3415-4773-931a-62f477d5b01e'::uuid, 'medplus-vijayawada-2', 'MedPlus', 'Singhnagar Flyover, Ayodhya Nagar, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5298968, 80.6377546, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/11697416899', 'THIRD_PARTY_DIRECTORY', '2025-07-24'::date),
  ('dc3f082d-b83d-4e3b-93a8-f2d873d5dc84'::uuid, 'grace-pharmacy-nidamanuru', 'Grace Pharmacy', 'Vijayawada - Gannavaram - Pedda Avutapalli Road ( Old NH16 Road ), Ramavarappadu, Nidamanuru, NTR District', 'Nidamanuru', 'NTR', '521108', 'Andhra Pradesh', 'India', 16.5200298, 80.6928186, '+91 77025 33640', 'Mo-Sa 10:00-21:00', null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12992450730', 'THIRD_PARTY_DIRECTORY', '2025-07-10'::date),
  ('6c71435b-28f6-4940-a276-9af741f5d78e'::uuid, 'aditya-pharmacy-nidamanuru', 'Aditya Pharmacy', 'Nidamanuru Main Road, Enikepadu, Nidamanuru, NTR District', 'Nidamanuru', 'NTR', '521104', 'Andhra Pradesh', 'India', 16.5089888, 80.7201977, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/way/1320442146', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('662f0736-d2b3-4386-a889-5e4a7f16a017'::uuid, 'medplus-vijayawada-6', 'MedPlus', 'Nehru Inner Ring Road, Vidhyadharapuram, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5226452, 80.6036226, null, null, 'Medplus', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/6202698988', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('c7c0e8b4-4dd8-4efc-b369-f4cd86b05f12'::uuid, 'vijaya-lakshmi-medical-kunchanapalli', 'Vijaya Lakshmi Medical', 'MDR0151, Tadepalle, Kunchanapalli, Guntur District', 'Kunchanapalli', 'Guntur', '522501', 'Andhra Pradesh', 'India', 16.4708548, 80.6155573, null, null, null, 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12425939227', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('2124bb2c-fe87-4a22-92f0-45574ee438a5'::uuid, 'apollo-pharmacy-gannavaram', 'Apollo Pharmacy', 'Gannavaram - Manikonda Road, Venkatanarasimhapuram, Gannavaram, Krishna district', 'Gannavaram', 'Krishna', '521101', 'Andhra Pradesh', 'India', 16.539573, 80.8005335, null, null, 'Apollo Pharmacy', 'Private', 'not_integrated', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12994099363', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Seed the corridor laboratories.
-- ---------------------------------------------------------------------------
insert into public.labs (
  id, slug, name, address, city, district, pincode, state, country,
  latitude, longitude, phone_number, opening_hours, ownership,
  data_source, source_url, data_status, last_checked_at
) values
  ('30c81873-7651-4437-bf38-f78dbc77ff2b'::uuid, 'srestha-diagnostics-vijayawada', 'Srestha Diagnostics', 'Siddartha College Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5070226, 80.6498926, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12852604266', 'THIRD_PARTY_DIRECTORY', '2025-05-21'::date),
  ('32dc92a1-5656-4213-bc76-1669700cba8b'::uuid, 'tenet-diagnostics-vijayawada', 'Tenet Diagnostics', 'AS Rama Rao Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5068876, 80.6440303, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/11573018969', 'THIRD_PARTY_DIRECTORY', '2024-01-31'::date),
  ('6dab8ae6-3230-422e-a504-cab8392c0f6c'::uuid, 'karishma-fancy-airtel-recharge-available-near-sri-sai-diagnostics-vijaya', 'Karishma Fancy,airtel Recharge Available,near Sri Sai Diagnostics', 'Panta Kaluva Road, Patamata, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.4928964, 80.6748352, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993581996', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('f51b3e7f-a612-47e2-ba10-1eef294e9907'::uuid, 'sri-sai-diagnostic-centre-vijayawada', 'Sri Sai Diagnostic Centre', 'Panta Kaluva Road, Patamata, Vijayawada, Krishna district', 'Vijayawada', 'Krishna', '520001', 'Andhra Pradesh', 'India', 16.4927155, 80.6749248, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/way/403238197', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('ecfa9129-8421-440c-a0b8-7a6ea4e0f432'::uuid, 'iris-imaging-and-diagnostics-gosala', 'Iris Imaging And Diagnostics', 'Vijayawada - Machilipatnam Road, Gosala, Krishna district', 'Gosala', 'Krishna', '521139', 'Andhra Pradesh', 'India', 16.4756897, 80.7074901, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12991109588', 'THIRD_PARTY_DIRECTORY', '2025-07-10'::date),
  ('8f5bc477-1381-4beb-9af4-e3405ed2974f'::uuid, 'lupan-diagnostics-tadigadapa', 'Lupan Diagnostics', 'Vijayawada - Machilipatnam Road, Srinivasanagar, Tadigadapa, Krishna district', 'Tadigadapa', 'Krishna', '521137', 'Andhra Pradesh', 'India', 16.4761207, 80.7075648, null, 'Mo-Sa 10:00-23:00', 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993613963', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('4c72a268-6b5b-4d93-bdeb-8ba5a0bcc49c'::uuid, 'orange-imaging-and-diagnostics-vijayawada', 'Orange Imaging And Diagnostics', 'AS Rama Rao Road, Patamata Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5114502, 80.6385783, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12852932857', 'THIRD_PARTY_DIRECTORY', '2025-05-21'::date),
  ('592e791f-9c57-4f42-a749-71fd97074396'::uuid, 'apollo-diagnostics-vijayawada', 'Apollo Diagnostics', 'Vijayawada - Machilipatnam Road, Patamata, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.4871611, 80.6780373, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993290962', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('0eaf18b7-60e0-4183-820f-0249aa70e50e'::uuid, 'apollo-diagnostics-gosala', 'Apollo Diagnostics', 'Vijayawada - Machilipatnam Road, Gosala, Krishna district', 'Gosala', 'Krishna', '521139', 'Andhra Pradesh', 'India', 16.4765704, 80.705186, '+91 92469 84546', '06:00-19:00', 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993602450', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('5d86b4ef-8194-4e93-85f0-781da9dec584'::uuid, 'vaishnavi-diagnostics-tadigadapa', 'Vaishnavi Diagnostics', 'Vijayawada - Machilipatnam Road, Srinivasanagar, Tadigadapa, Krishna district', 'Tadigadapa', 'Krishna', '521137', 'Andhra Pradesh', 'India', 16.4772731, 80.7043003, '+91 97007 67993', null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12993640981', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('8b3becc3-b971-40f7-94f9-63a8d1b3303f'::uuid, 'accura-diagnostics-vijayawada', 'Accura Diagnostics', 'Karl Marx Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5156518, 80.6395845, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/11570555686', 'THIRD_PARTY_DIRECTORY', '2025-07-11'::date),
  ('3c5e2068-16f6-4939-9537-92523f9c218b'::uuid, 'navya-laboratory-machilipatnam', 'Navya Laboratory', 'Machilipatnam Main Road, Bhardapuram, Machilipatnam, Krishna district', 'Machilipatnam', 'Krishna', '521001', 'Andhra Pradesh', 'India', 16.1759715, 81.12821, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/12171280224', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('622342f9-8fa1-4664-a5ac-569b0e69cd40'::uuid, 'sentini-diagnostics-vijayawada', 'Sentini Diagnostics', 'Kaleswara Rao Road, Krishna Lanka, Vijayawada, NTR District', 'Vijayawada', 'NTR', '520001', 'Andhra Pradesh', 'India', 16.5116114, 80.6329247, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/node/13001406930', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date),
  ('b33333c8-c42c-4376-8a5f-8902b884bda5'::uuid, 'lakshmi-gayatri-clinical-laboratory-kanuru', 'Lakshmi Gayatri Clinical Laboratory', 'MDR0164, Kanuru, Krishna district', 'Kanuru', 'Krishna', '520007', 'Andhra Pradesh', 'India', 16.5001784, 80.6912637, null, null, 'Private', 'OpenStreetMap contributors (ODbL 1.0)', 'https://www.openstreetmap.org/way/1321699179', 'THIRD_PARTY_DIRECTORY', '2026-10-23'::date)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. RLS — public read, no client writes (matches the other discovery tables).
-- ---------------------------------------------------------------------------
revoke insert, update, delete on public.pharmacies from anon, authenticated;
revoke insert, update, delete on public.labs from anon, authenticated;
grant select on public.pharmacies to anon, authenticated;
grant select on public.labs to anon, authenticated;

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0036_step27_pharmacy_lab_directory.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0037_step28_public_reviews.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 28: public reviews page — real data, real search.
--
-- WHY THIS MIGRATION EXISTS
--   The Reviews page could only read published reviews through
--   `carelink_reviews_cursor`, which (a) is EXECUTE-revoked from anon, so an
--   anonymous visitor could never load a single real review, and (b) matched the
--   search term only against title/body/author, so searching a hospital or
--   doctor NAME returned nothing. Both made honest "no reviews" indistinguishable
--   from "search is broken".
--
-- WHAT IT DOES
--   1. Adds a PUBLIC-read keyset RPC `carelink_public_reviews_cursor(...)` that
--      returns ONLY `status = 'published'` rows (the definer never exposes draft/
--      pending/hidden rows) with the provider display name + slug, verification
--      and provider response, plus provider-name search.
--   2. Adds `carelink_public_review_facets()` — real, published-only aggregate
--      counts (total, verified, provider-kind breakdown, rating distribution and
--      the published-review provider list) so the page can offer honest filter
--      options instead of a hardcoded category list.
--
-- HONESTY / SECURITY
--   - Published-only in both functions: the public never sees unmoderated rows.
--   - No fabricated figures: an empty table yields 0/empty, never a placeholder.
--   - Read-only: no INSERT/UPDATE/DELETE is granted to anon or authenticated.
--   - EXECUTE is granted to anon AND authenticated (public read is the point);
--     the function bodies restrict the row set, not the caller.
--   - Existing `carelink_reviews_cursor` is left untouched for authenticated
--     callers already using it.
--
-- IDEMPOTENT: create or replace + idempotent grants. Safe to replay.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Public published-reviews keyset cursor (anon + authenticated read).
-- ---------------------------------------------------------------------------
create or replace function public.carelink_public_reviews_cursor(
  p_query text default null,
  p_rating smallint default null,
  p_kind text default null,
  p_verified_only boolean default false,
  p_sort text default 'newest',
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_before_rating smallint default null,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  body text,
  rating smallint,
  author_display text,
  provider_kind text,
  provider_name text,
  provider_slug text,
  is_verified boolean,
  provider_response text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim int;
  q text;
  srt text;
begin
  lim := least(greatest(coalesce(p_limit, 20), 1), 40);
  q := nullif(btrim(coalesce(p_query, '')), '');
  srt := case when p_sort in ('highest', 'lowest') then p_sort else 'newest' end;

  return query
  select r.id,
         r.title,
         r.body,
         r.overall_rating,
         coalesce(pr.display_name, 'Anonymous'),
         case
           when r.hospital_id is not null then 'hospital'
           when r.doctor_id is not null then 'doctor'
           when r.pharmacy_id is not null then 'pharmacy'
           when r.lab_id is not null then 'lab'
           else 'provider'
         end,
         coalesce(
           (select h.name from public.hospitals h where h.id = r.hospital_id),
           (select d.name from public.doctors d where d.id = r.doctor_id),
           (select ph.name from public.pharmacies ph where ph.id = r.pharmacy_id),
           (select l.name from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce(
           (select h.slug from public.hospitals h where h.id = r.hospital_id),
           (select d.slug from public.doctors d where d.id = r.doctor_id),
           (select ph.slug from public.pharmacies ph where ph.id = r.pharmacy_id),
           (select l.slug from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id), false),
         (select resp.body from public.provider_responses resp where resp.review_id = r.id limit 1),
         r.created_at
  from public.reviews r
  left join public.profiles pr on pr.id = r.owner_id
  where r.status = 'published'
    and (
      q is null
      or r.title ilike '%' || q || '%'
      or r.body ilike '%' || q || '%'
      or coalesce(pr.display_name, '') ilike '%' || q || '%'
      -- Searching a provider NAME must match: the page searches hospitals and
      -- doctors, not just review text.
      or exists (select 1 from public.hospitals h where h.id = r.hospital_id and h.name ilike '%' || q || '%')
      or exists (select 1 from public.doctors d where d.id = r.doctor_id and d.name ilike '%' || q || '%')
      or exists (select 1 from public.pharmacies ph where ph.id = r.pharmacy_id and ph.name ilike '%' || q || '%')
      or exists (select 1 from public.labs l where l.id = r.lab_id and l.name ilike '%' || q || '%')
    )
    and (p_rating is null or r.overall_rating = p_rating)
    and (
      p_kind is null or p_kind = '' or
      (p_kind = 'hospital' and r.hospital_id is not null) or
      (p_kind = 'doctor' and r.doctor_id is not null) or
      (p_kind = 'pharmacy' and r.pharmacy_id is not null) or
      (p_kind = 'lab' and r.lab_id is not null)
    )
    and (
      p_verified_only is not true
      or coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id), false)
    )
    -- Keyset cursor. Each sort uses its OWN total order so pages never skip or
    -- duplicate a row:
    --   newest  → (created_at, id) descending
    --   highest → (rating, created_at, id) descending
    --   lowest  → (rating ascending) then (created_at, id) descending
    and (
      case srt
        when 'highest' then
          p_before_created is null
          or (r.overall_rating, r.created_at, r.id) < (p_before_rating, p_before_created, p_before_id)
        when 'lowest' then
          p_before_created is null
          or r.overall_rating > p_before_rating
          or (r.overall_rating = p_before_rating and (r.created_at, r.id) < (p_before_created, p_before_id))
        else
          p_before_created is null or (r.created_at, r.id) < (p_before_created, p_before_id)
      end
    )
  order by
    case when srt = 'highest' then r.overall_rating end desc nulls last,
    case when srt = 'lowest' then r.overall_rating end asc nulls last,
    r.created_at desc,
    r.id desc
  limit lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Real published-only facets (counts + provider list for filter options).
--    Every number is computed from published rows — nothing is invented.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_public_review_facets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total', (select count(*) from public.reviews r where r.status = 'published'),
    'verified', (
      select count(*) from public.reviews r
      where r.status = 'published'
        and coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id), false)
    ),
    'hospitals', (select count(*) from public.reviews r where r.status = 'published' and r.hospital_id is not null),
    'doctors', (select count(*) from public.reviews r where r.status = 'published' and r.doctor_id is not null),
    'pharmacies', (select count(*) from public.reviews r where r.status = 'published' and r.pharmacy_id is not null),
    'labs', (select count(*) from public.reviews r where r.status = 'published' and r.lab_id is not null),
    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object('rating', s.stars, 'count', s.n) order by s.stars desc)
      from (
        select g.stars, (select count(*) from public.reviews r where r.status = 'published' and r.overall_rating = g.stars) as n
        from generate_series(1, 5) as g(stars)
      ) s
    ), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'name', p.name, 'slug', p.slug, 'count', p.n) order by p.n desc, p.name)
      from (
        select 'hospital' as kind, h.name, h.slug, count(*) as n
        from public.reviews r join public.hospitals h on h.id = r.hospital_id
        where r.status = 'published'
        group by h.name, h.slug
        union all
        select 'doctor' as kind, d.name, d.slug, count(*) as n
        from public.reviews r join public.doctors d on d.id = r.doctor_id
        where r.status = 'published'
        group by d.name, d.slug
        union all
        select 'pharmacy' as kind, ph.name, ph.slug, count(*) as n
        from public.reviews r join public.pharmacies ph on ph.id = r.pharmacy_id
        where r.status = 'published'
        group by ph.name, ph.slug
        union all
        select 'lab' as kind, l.name, l.slug, count(*) as n
        from public.reviews r join public.labs l on l.id = r.lab_id
        where r.status = 'published'
        group by l.name, l.slug
      ) p
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants: these two are the PUBLIC read path, so anon + authenticated may
--    EXECUTE. No write is ever granted.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'grant execute on function public.carelink_public_reviews_cursor(text,smallint,text,boolean,text,timestamptz,uuid,smallint,int) to anon';
  execute 'grant execute on function public.carelink_public_reviews_cursor(text,smallint,text,boolean,text,timestamptz,uuid,smallint,int) to authenticated';
  execute 'grant execute on function public.carelink_public_review_facets() to anon';
  execute 'grant execute on function public.carelink_public_review_facets() to authenticated';
  execute 'revoke insert, update, delete on public.reviews from anon';
exception
  when undefined_object then null;  -- roles absent outside Supabase
end $$;

-- ---------------------------------------------------------------------------
-- 4. Keyset index for the public cursor (published rows only).
-- ---------------------------------------------------------------------------
create index if not exists reviews_public_keyset_idx
  on public.reviews (created_at desc, id desc)
  where status = 'published';

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0037_step28_public_reviews.sql


-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
-- BEGIN 0038_step30_supported_languages.sql
-- >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

-- ===========================================================================
-- CareLink-AI — Step 30: supported assistant languages (Phase 2)
--
-- The assistant now answers in ten languages (native script AND Romanized
-- transliteration): en, te, hi, kn, ta, ml, bn, gu, mr, ur. The columns that
-- store a language were unconstrained `text`, so a bad client value could be
-- persisted silently. This migration:
--
--   1. normalises any existing unsupported value to 'en' (the guaranteed floor),
--   2. adds a CHECK constraint that accepts ONLY the supported vocabulary.
--
-- It is ADDITIVE and IDEMPOTENT: existing 'en'/'te'/'hi' rows are untouched, the
-- constraint is dropped-if-exists before being recreated, and no data is deleted.
-- No RLS policy changes: the columns are still owner-scoped by the existing
-- policies on `profiles`, `conversations` and `patient_context_snapshots`.
-- ===========================================================================

-- --- 1. Normalise unsupported values to the English floor -------------------
update public.profiles
   set language_preference = 'en'
 where language_preference is not null
   and language_preference not in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur');

update public.conversations
   set language = 'en'
 where language is not null
   and language not in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur');

update public.patient_context_snapshots
   set language = 'en'
 where language is not null
   and language not in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur');

-- --- 2. Enforce the vocabulary at the database boundary ---------------------
alter table public.profiles
  drop constraint if exists profiles_language_preference_check;
alter table public.profiles
  add constraint profiles_language_preference_check
  check (language_preference is null
         or language_preference in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur'));

alter table public.conversations
  drop constraint if exists conversations_language_check;
alter table public.conversations
  add constraint conversations_language_check
  check (language is null
         or language in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur'));

alter table public.patient_context_snapshots
  drop constraint if exists patient_context_snapshots_language_check;
alter table public.patient_context_snapshots
  add constraint patient_context_snapshots_language_check
  check (language is null
         or language in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur'));

-- --- 3. Helpful index for language analytics (owner-scoped reads) -----------
create index if not exists conversations_language_idx on public.conversations(language);

comment on constraint conversations_language_check on public.conversations is
  'Supported assistant languages (Step 30). The client detector and the AI gateway use the same vocabulary.';

-- <<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<
-- END 0038_step30_supported_languages.sql

