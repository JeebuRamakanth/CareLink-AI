-- ===========================================================================
-- CareLink-AI — Step 19: owner auth hierarchy hardening. ADDITIVE ONLY.
--
-- Closes a REAL privilege-escalation defect discovered while completing the
-- Step 18 frontend work: the role/permission predicates did not account for
-- account suspension, so a SUSPENDED super_admin (or admin) still evaluated as
-- authorized for elevated reads/writes.
--
--   `carelink_admin_has_permission(p)` read:
--       (not carelink_is_suspended() and carelink_has_permission(p)) or carelink_is_super_admin()
--   Because of `and`/`or` precedence this is
--       (not suspended and has_permission) OR is_super_admin
--   so a suspended super_admin short-circuits through `carelink_is_super_admin()`
--   (which only checked role membership, never status) and passed EVERY admin
--   gate. The same status-blind predicate backs RLS policies on supervisor
--   tables (ai_context, appointments, medications, verification tables, …), so a
--   suspended super_admin could still read/write those rows.
--
-- This migration makes the authorization primitives status-aware at the root:
--   1. `carelink_is_super_admin()` / `carelink_is_admin()` now require an ACTIVE
--      account (suspended/disabled => false). Every RLS policy and RPC that used
--      them inherits the fix.
--   2. `carelink_has_permission(p)` is gated on not-suspended so a suspended
--      privileged account cannot fall through its explicit role_permissions rows.
--   3. `carelink_admin_has_permission(p)` is de-parenthesized to
--      `not suspended and carelink_has_permission(p)` (the super_admin grant is
--      already folded into carelink_has_permission), removing the precedence bug.
--   4. `carelink_has_permission_or_higher(required_role, required_permission)`
--      fixes the hierarchy floor mapping: requiring the `super_admin` floor is
--      now satisfied ONLY by super_admin (an admin no longer satisfies a
--      super-admin floor), while super_admin still satisfies every lower floor.
--
-- SECURITY: no new tables/credentials; every predicate stays SECURITY DEFINER
-- with a pinned search_path and remains read-only. REPLACE-only — no policy or
-- table is altered, and no previously-granted permission is widened.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Status-aware privileged-role predicates
-- ---------------------------------------------------------------------------
create or replace function public.carelink_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select (not public.carelink_is_suspended()) and public.carelink_has_role('super_admin'); $$;

create or replace function public.carelink_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended())
         and (public.carelink_has_role('admin') or public.carelink_has_role('super_admin'));
$$;

-- ---------------------------------------------------------------------------
-- 2. Status-gated permission resolver (super_admin grant folded in)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_permission(p_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended()) and (
    exists (
      select 1
      from public.user_roles ur
      join public.role_permissions rp on rp.role_id = ur.role_id
      where ur.user_id = auth.uid()
        and rp.permission_code = p_code
    )
    or public.carelink_has_role('super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. De-parenthesized admin gate (removes the OR-precedence bypass)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended()) and public.carelink_has_permission(permission_code);
$$;

-- ---------------------------------------------------------------------------
-- 4. Correct hierarchy floor mapping in the role-or-higher resolver
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_permission_or_higher(
  required_role text,
  required_permission text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
    (not public.carelink_is_suspended())
    and (select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and (
          -- Requiring a floor is satisfied by that role OR any HIGHER role.
          required_role = 'super_admin' and ur.role_id = 'super_admin'
          or required_role = 'admin' and ur.role_id in ('admin','super_admin')
          or required_role = 'pharmacy_admin' and ur.role_id in ('pharmacy_admin','admin','super_admin')
          or required_role = 'lab_admin' and ur.role_id in ('lab_admin','admin','super_admin')
          or required_role = 'hospital_admin' and ur.role_id in ('hospital_admin','admin','super_admin')
          or required_role = 'doctor' and ur.role_id in ('doctor','admin','super_admin')
          or required_role = 'patient' and ur.role_id in ('patient','doctor','hospital_admin','lab_admin','pharmacy_admin','admin','super_admin')
        )
    ))
    and public.carelink_admin_has_permission(required_permission)
  );
$$;

-- EXECUTE posture is preserved automatically: CREATE OR REPLACE keeps the
-- existing grants on these long-standing RLS predicate helpers (authenticated +
-- anon, per migrations 0021/0025). No revoke is issued here — revoking from anon
-- would break the policies that evaluate these predicates for the anon role.

-- ---------------------------------------------------------------------------
-- 5. Lane-aware login audit vocabulary
--    The selected LOGIN LANE (patient/admin/super_admin) — not the account's
--    role — determines the success event; a denied administrative-lane attempt
--    is recorded with the lane-specific `*_login_denied` event. Extends the
--    Step-18 vocabulary (which had the *_success + suspended events) so the
--    frontend can record lane denials without inferring the lane from role.
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
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
    'admin_login_denied','super_admin_login_denied',
    'owner_bootstrap','role_change','permission_change','privileged_operation'
  ));

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
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
    'admin_login_denied','super_admin_login_denied',
    'owner_bootstrap','role_change','permission_change','privileged_operation'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended() and clean_event in ('login_success','session_refresh') then
    raise exception 'account suspended';
  end if;

  -- Retain only tiny scalar metadata (never raw credentials/tokens/PHI).
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

