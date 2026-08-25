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
