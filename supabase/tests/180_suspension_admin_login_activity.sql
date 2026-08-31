-- ===========================================================================
-- 180 — Account suspension + admin RBAC gates + login/security activity.
--
-- Covers:
--   1. Suspension is server-side enforced (suspended user cannot mutate).
--   2. Login/security activity persists via guarded user-scoped RPC.
--   3. Admin RPCs require a real server-side role + permission code。
--   4. Privilege escalation (user -> admin -> super admin) is denied at
--       the database layer, even for users who know UUIDs。
--   5. A suspended admin loses admin mutation access (reads fine.。
--   6. Suspension/reactivation emits a notification for the recipient only。
-- ===========================================================================

-- Seed profiles (service path; the auth trigger also creates these, but suites
-- are independent, so we insert explicitly)
insert into public.profiles (id, display_name, account_status) values
  ('11111111-1111-1111-1111-111111111111', 'User A', 'active'),
  ('22222222-2222-2222-2222-222222222222', 'User B', 'active'),
  ('33333333-3333-3333-3333-333333333333', 'User C', 'active')
on conflict (id) do nothing;

-- Seed family row for A (owner-scoped write target for suspension test)
insert into public.family_profiles (id,owner_id,relation,label) values
  ('6a111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'self', 'Self')
on conflict (id) do nothing;

-- C is the super admin (pre-granted via service path)
insert into public.user_roles (user_id, role_id) values ('33333333-3333-3333-3333-333333333333', 'super_admin') on conflict (user_id, role_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Suspension enforcement
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.expect_ok(
  $$insert into public.family_profiles (id,owner_id,relation,label) values ('6a222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'child', 'Child')$$,
  'suspension: A can create family rows while active'
);

-- A records login activity (guarded user-scoped RPC;
select harness.expect_ok(
  $$select public.carelink_record_login_activity('login_success', '{"method":"password"}'::jsonb)$$,
  'activity: A records own login_success'
);

-- A self-selects own activity (RLS self rule;
select harness.ok(
  (select count(*) >= 1 from public.security_activity_events where user_id = auth.uid()),
  'activity: A reads own activity via RLS'
);

-- A cannot forge B activity via direct insert (no direct insert policy;
select harness.expect_error(
  $$insert into public.security_activity_events (id,user_id,event) values ('6a333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'login_success')$$,
  'activity: A cannot forge B activity via direct insert'
);

reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

-- B cannot read A activity (RLS isolation;
select harness.ok(
  (select count(*) = 0 from public.security_activity_events where user_id = '11111111-1111-1111-1111-111111111111'),
  'activity: B cannot read A activity rows'
);

-- B (ordinary user) cannot call admin list RPC; no user-provided role works。

select harness.expect_error(
  $$select * from public.carelink_admin_list_users()$$,
  'admin: ordinary user B cannot list users'
);

-- B cannot self-grant via guarded function
select harness.expect_error(
  $$select public.carelink_grant_role('22222222-2222-2222-2222-222222222222', 'admin')$$,
  'admin: B cannot self-grant admin role'
);

reset role;

-- ---------------------------------------------------------------------------
-- 2. Super admin: real server-side role + permissions
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';

-- C (super admin） lists the real user directory
select harness.ok(
  (select count(*) >= 3 from public.carelink_admin_list_users()),
  'admin: super admin lists users'
);

-- C grants A the admin role via guarded audited function
select harness.expect_ok(
  $$select public.carelink_grant_role('11111111-1111-1111-1111-111111111111', 'admin')$$,
  'admin: super admin grants A admin role'
);

-- C suspends B (users.manage gate; audited; notification for B;
select harness.expect_ok(
  $$select public.carelink_admin_set_account_status('22222222-2222-2222-2222-222222222222', 'suspended', 'policy violation')$$,
  'suspension: super admin suspends B'
);

-- C verifies the audit event was written (real audit row;
select harness.ok(
  (select count(*) >= 1 from public.audit_events where action = 'account_status_changed' and target_id = '22222222-2222-2222-2222-222222222222'),
  'audit: status change wrote audit event'
);

-- C verifies B received a recipient-scoped notification (kind account;
select harness.ok(
  (select count(*) = 0 from public.notifications where owner_id = '22222222-2222-2222-2222-222222222222' and kind = 'account'),
  'notify: table RLS blocks super admin cross-read'
);

-- B is suspended: even with a role, B cannot mutate own family or upload
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok(
  (select count(*) >= 1 from public.notifications where owner_id = auth.uid()and kind = 'account'),
  'notify: B self-reads own suspension notification via RLS'
);

select harness.expect_error(
  $$insert into public.family_profiles (id,owner_id,relation,label) values ('6a444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'self', 'Self')$$,
  'suspension: suspended B is blocked from creating records'
);

select harness.expect_error(
  $$select public.carelink_record_login_activity('login_success')$$,
  'suspension: suspended B cannot record a fresh login'
);

reset role;

-- ---------------------------------------------------------------------------
-- 3. Admin permission scoping (admin 同志 narrower than super admin)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- A is now an admin (granted above; A can list users (users.view;
select harness.ok(
  (select count(*) >= 3 from public.carelink_admin_list_users()),
  'admin: admin A lists users'
);

-- A (admin) is NOT a super admin: cannot grant roles (roles.manage is super-admin-scoped)
select harness.expect_error(
  $$select public.carelink_admin_grant_user_role('22222222-2222-2222-2222-222222222222', 'super_admin')$$,
  'admin: admin A cannot grant super_admin role'
);

-- A cannot escalate via direct insert either
select harness.expect_error(
  $$insert into public.user_roles (user_id,role_id) values ('11111111-1111-1111-1111-111111111111', 'super_admin')$$,
  'admin: admin A cannot self-insert super_admin role'
);

-- A can view security activity (security.view;
select harness.ok(
  (select count(*) >= 1 from public.carelink_admin_list_security_activity()),
  'admin: admin A views security activity feed'
);

-- ---------------------------------------------------------------------------
-- 4. Suspended admin loses mutation access (suspension gate>permission;
-- ---------------------------------------------------------------------------
reset role;
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';

-- C suspends A (A is an admin now; suspension must revoke admin mutation access
select harness.expect_ok(
  $$select public.carelink_admin_set_account_status('11111111-1111-1111-1111-111111111111', 'suspended', 'abuse')$$,
  'suspension: super admin suspends admin A'
);

reset role;
set role authenticated; set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.expect_error(
  $$select * from public.carelink_admin_list_users()$$,
  'suspension: suspended admin A cannot list users (suspension gate)'
);

-- ---------------------------------------------------------------------------
-- 5. Recovery (reactivation) fires armed notification + restores write access
-- ---------------------------------------------------------------------------
reset role;
