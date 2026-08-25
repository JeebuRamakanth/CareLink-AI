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
