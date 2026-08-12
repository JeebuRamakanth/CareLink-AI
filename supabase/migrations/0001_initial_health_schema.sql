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
