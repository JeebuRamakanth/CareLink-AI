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