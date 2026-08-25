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
