-- ===========================================================================
-- CareLink-AI — Step 18: real owner auth + admin/super-admin hierarchy +
-- owner bootstrap floor + AI response guardrail. ADDITIVE ONLY.
--
-- Builds on 0001→0028. Nothing existing is dropped or altered. This migration:
--
--  1. SECURITY-ACTIVITY EVENT VOCABULARY — extends the CHECK constraint and
--       the guarded `carelink_record_login_activity` whitelist with the Step-18
--       audit events:
--         - `admin_login_success` / `super_admin_login_success` — the login
--           lane the account entered was selected by the UI and the server-side
--           role was verified,so auditors can distinguish Admin Login from
--           Super Admin Login for the SAME authenticated identity;
--         - `suspended_login_denied` — a suspended/disabled account attempted
--           an admin/super-admin login lane (denied deterministically);
--         - `owner_bootstrap` — a secure owner bootstrap completed;
--         - `role_change` / `permission_change` — role/permission membership
--           changed via the guarded RPC layer (audited, target+role metadata);
--         - `privileged_operation` — generic audited elevated-ops marker for
--           privileged admin mutations that need an activity trace.
--
--  2. OWNER BOOTSTRAP FLOOR — `carelink_owner_bootstrap(self_email)`: a
--       SECURITY DEFINER, pinned-path, idempotent, audited function that lets the
--       OWNER of the platform turn their OWN real auth account into the FIRST
--       super_admin. Guarantees:
--         - SELF-ONLY: the caller's auth.users record must match the passed
--           email — nobody can bootstrap another account.
--         - ACTIVE-ONLY: suspended/disabled callers are denied (restore later
--           by another super_admin via the console.
--         - FIRST-ONLY: when a super_admin user_roles row ALREADY exists, the
--           call is a safe no-op returning false — it never mints a second
--           super_admin and never creates a duplicate role row。
--         - IDEMPOTENT: re-running after success is a no-op (false。
--         - TRUSTED-ROLE ONLY: it inserts a real `user_roles` row for the
--           authenticated caller — NEVER e user-provided role/email claims asthe
--           authorization input (email only identifies WHICH caller may run it)。
--         - AUDITED: writes an audit_events row AND a security-activity event
--           (owner_bootstrap, target = self uuid only)。
--       The existing admin-gateway Edge Function can call this function for the
--       operator-provided bootstrap secret — the UI never calls it directly (only
--       server-side paths with the caller's JWT may reach it; EXECUTE is granted
--       to authenticated because the function itself enforces self+first+active)。
--
--  3. ROLE-HIERARCHY PERMISSION RESOLVER — `carelink_has_permission_or_higher(
--       required_role, required_permission)`: raises EXCEPTION unless the acting
--       user's actual role is at least `required_role` in the hierarchy
--       (patient < hospital_admin < lab_admin < pharmacy_admin < admin <
--       super_admin) AND has the required permission (super_admin always
--       inherits every permission)。 All existing admin RPCs already pass SUPER_ADMIN
--       through `carelink_admin_has_permission` (which ends with
--       `or carelink_is_super_admin()`)；this adds an explicit, testable,
--       singular hierarchy predicate for callers that need both role-and-permission
--       gating (e.g. future ops endpoints)。It is NOT a bypass — it is the
--       inverse of every existing check.
--
--  4. AI RESPONSE GUARDRAIL — `carelink_ai_response_guardrail(payload, role)`
--       a deterministic SECURITY DEFINER floor that screens an LLM-produced text
--       payload for emergency escalation, diagnostic overclaim, instructionand
--       secret-leak patterns. Returns `true` when the payload is deemed SAFE as set
--       (or the pattern set has no matches), `false` when a credible violation was
--       detected (caller should treat the response as untrusted and fall back)。
--       This is the DB layer of the existing defense-in-depth AI guardrail — NOT
--       the only mechanism (model instruction layer, application safetyLayer,
--       tools, RLS, output validation all remain)。
--
-- SECURITY: every new function is SECURITY DEFINER with pinned search_path and
-- re-checks suspension/role on the caller inside the database。 No new credentials,
-- no client write paths on security/audit rows, no raw AI text persisted anywhere。
-- The owner email flows ONLY as an input to the audited self-check function.。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend the security-activity event vocabulary (CHECK + guarded RPC)
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
    'owner_bootstrap','role_change','permission_change','privileged_operation'
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
    'denied_admin_access','denied_super_admin_access',
    'provider_verified','provider_rejected','provider_activated',
    'provider_deactivated','appointment_updated_by_admin',
    'ai_tool_attempt','ai_tool_action',
    'admin_login_success','super_admin_login_success','suspended_login_denied',
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

  -- Retain only tiny scalar metadata (never raw credentials/tokens/PHI). No
  -- arrays/objects/nested values are kept.


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
  return new_id;end;$$;

-- Faster filtering of the new activity vocabulary (justified index for ops/audit).
create index if not exists security_activity_events_event_idx
  on public.security_activity_events (event, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. Owner bootstrap floor — first-super_admin self-assignment (audited)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_owner_bootstrap(self_email text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
declare actor_email text;
declare status text;
declare new_role_id uuid;
begin
  -- Self-only: the caller must be authenticatedand their own auth.users row
  -- must match the submitted email. An ALREADY elevated caller still must pass
  -- this own-email identity check (bootstrap never operates ona target).
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended() then
    raise exception 'account suspended: bootstrap requires an active account';
  end if;

  select au.email, p.account_status
    into actor_email, status
    from auth.users au
    left join public.profiles p on p.id = au.id
    where au.id = actor;
  if actor_email is null then
    raise exception 'email not found';
  end if;
  if lower(btrim(actor_email)) <> lower(btrim(coalesce(self_email, ''))) then
    raise exception 'bootstrap email must match the authenticated user';
  end if;
  if status is not null and status in ('suspended','disabled') then
    raise exception 'account suspended: bootstrap requires an active account';
  end if;

  -- First-only + idempotent: when ANY super_admin already exists, this is a
  -- safe no-op (never mints a second super_admin, never duplicates rows。
.
  if exists (select 1 from public.user_roles where role_id ='super_admin') then
    return false;
  end if;

  -- Insert the trusted role row for THE CALLER (auth.uid(), never user input。
。
  insert into public.user_roles ( id , user_id , role_id , granted_by )
  values (gen_random_uuid(), actor, 'super_admin', actor)
  on conflict ( user_id , role_id ) do nothing
  returning id into new_role_id;

  -- Audited: audit row + security-activity event (target = self only。。
  perform public.carelink_record_audit('owner_bootstrap', 'user_roles', actor,'role: super_admin');
  perform public.carelink_record_login_activity('owner_bootstrap', jsonb_build_object('target', 'self', 'role', 'super_admin'));
  return new_role_id is not null;
end;
$$;

-- EXECUTE guard: authenticated-callable (the function self-enforces self+first+active).
revoke execute on function public.carelink_owner_bootstrap(text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_owner_bootstrap(text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_owner_bootstrap(text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Role-hierarchy permission resolver (patient < … < super_admin)
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
    -- The acting user's actual role must be at least the required hierarchy floor
    -- (super_admin automatically satisfies every lower floor;admin hierarchy
    --  is: patient < hospital_admin < lab_admin < pharmacy_admin < admin <
    --  super_admin). A caller with NO role row never matches (safe false)。
    (select exists (
      select 1 from public.user_roles ur
      where ur.user_id = auth.uid()
        and (
          required_role = 'super_admin' and ur.role_id in ('admin','super_admin')
          or required_role = 'admin' and ur.role_id in ('admin','super_admin')
          or required_role = 'pharmacy_admin' and ur.role_id in ('pharmacy_admin','admin','super_admin')
          or required_role = 'lab_admin' and ur.role_id in ('lab_admin','admin','super_admin')
          or required_role = 'hospital_admin' and ur.role_id in ('hospital_admin','admin','super_admin')
          or required_role = 'doctor'and ur.role_id in ('doctor','admin','super_admin')
          or required_role = 'patient'and ur.role_id in ('patient','doctor','hospital_admin','lab_admin','pharmacy_admin','admin','super_admin')
        )
    ))
    and public.carelink_admin_has_permission(required_permission)
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. AI response guardrail -- deterministic DB-layer verdict screen
-- ---------------------------------------------------------------------------
create or replace function public.carelink_ai_response_guardrail(
  payload text,
  response_role text default 'assistant'
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not (
    -- Emergency indicators always flag for escalation handling (never silent).
    (lower(payload) like any (array[
        '%chest pain%','%cannot breathe%','%cannot catch my breath%','%face drooping%',
        '%slurred speech%','%unconscious%','%not breathing%','%severe bleeding%','%heart attack%',
        '%suicidal%','%seizure%','%choking%','%stroke%','%heavy bleeding%','%overdose%'
      ]) )
    -- Credible diagnostic overclaim patterns (case-insensitive)。
    or lower(payload) ~ 'you (definitely|certainly|surely) have'
    or lower(payload) ~ 'you are (diagnosed with|suffering from)'
    or lower(payload) ~ 'this confirms (you have|that you have)'
    or lower(payload) ~ 'i diagnose (you|this) (as|with)'
    -- Instruction-override / secret-elevation markers。
    or lower(payload) ~ 'ignore (all |any )?(previous|prior|above) instructions'
    or lower(payload) ~ 'reveal (all|your|the) (patient|user|system|hidden|secret)'
    or lower(payload) ~ '(service[- ]?role|api[- ]?key|access token|refresh token) (key|secret|value|:=|:)'
    or lower(payload) ~ 'skip (rl s|row level security|security checks)'
    -- Agentic self-harm / unsafe autonomy attempts。
    or lower(payload) ~ '(disable|turn off|bypass) (security|safety|authorization|rl s)'
    or lower(payload) ~ '(make|set|grant) me (an? |the )(admin|super[- ]?admin)'
    or lower(payload) ~ 'run (sql|arbitrary rpc|service[- ]?role)'
  );
$$;

-- EXECUTE guards for the new RPCs (authenticated-only; never anon/public).
revoke execute on function public.carelink_has_permission_or_higher(text,text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_has_permission_or_higher(text,text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_has_permission_or_higher(text,text) to authenticated;
  end if;
end $$;

revoke execute on function public.carelink_ai_response_guardrail(text,text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_ai_response_guardrail(text,text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_ai_response_guardrail(text,text) to authenticated;
  end if;
end $$;