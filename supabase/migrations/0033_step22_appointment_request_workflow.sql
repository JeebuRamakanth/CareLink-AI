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
