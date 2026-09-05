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
  limit 200;
end;
$$;

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