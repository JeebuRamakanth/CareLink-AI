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
