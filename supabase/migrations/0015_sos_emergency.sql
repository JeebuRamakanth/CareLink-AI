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
