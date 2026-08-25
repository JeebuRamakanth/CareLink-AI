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
