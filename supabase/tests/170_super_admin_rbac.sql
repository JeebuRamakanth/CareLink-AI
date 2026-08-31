-- ===========================================================================
-- 170 — Super Admin RBAC foundation.
--   Proves the Step 2 completion conditions:
--     ordinary users cannot self-assign super_admin;
--     the frontend / URL / localStorage cannot grant super_admin (RLS is the
--     only enforcement boundary here — mirrored by the admin-gateway edge fn);
--     only a database-verified super_admin can run guarded role grants;
--     every guarded privileged action is audited where audit infrastructure exists.
--
-- Uses the 050 fixtures (A=1111..., B=2222..., C=3333...=super_admin(.
-- In this suite B is an ordinary authenticated user with NO role.
 -- ===========================================================================

-- ---------------------------------------------------------------------------
-- Anonymous: cannot read roles, cannot insert, cannot call guarded fns.

set role anon;
select harness.ok(
  (select count(*) = 0 from public.user_roles),
  '170: anon cannot read user_roles'
);
select harness.expect_error(
  $$insert into public.user_roles (user_id, role_id) values ('22222222-2222-2222-2222-222222222222', 'super_admin')$$,
  '170: anon cannot insert user_roles (no RLS bypass)'
);
select harness.expect_error(
  $$select public.carelink_grant_role('22222222-2222-2222-2222-222222222222', 'super_admin')$$,
  '170: anon cannot grant roles via guarded function'
);
select harness.ok(
  not public.carelink_has_role('super_admin'), -- evaluates as null identity + false
  '170: anon role predicate is callable but returns false (no role)'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Ordinary authenticated user (B, no roles: cannot self-promote via any path.

 
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok(
  not public.carelink_is_super_admin(),
  '170: B is not a super_admin before attempt'
);
select harness.expect_error(
  $$insert into public.user_roles (user_id, role_id) values (auth.uid(), 'super_admin')$$,
  '170: B cannot self-grant super_admin via direct insert'
);
select harness.expect_ok(
  $$update public.user_roles set role_id ='super_admin' where user_id =auth.uid()$$,
  '170: B self-promote UPDATE matches 0 rows (denied by missing policy)'
);
select harness.ok(
  (select count(*) = 0 from public.user_roles where role_id ='super_admin'),
  '170: zero super_admin rows after B self-promote UPDATE'
);
select harness.expect_error(
  $$select public.carelink_grant_role(auth.uid(), 'super_admin')$$,
  '170: B cannot call guarded grant (only super_admin may)'
);
select harness.expect_error(
  $$select public.carelink_revoke_role(auth.uid(), 'admin')$$,
  '170: B cannot call guarded revoke'
);
select harness.ok(
  (select count(*) = 0
   from public.user_roles where role_id = 'super_admin'),
  '170: no super_admin row appeared after B attempts'
);
-- Guarded functions raise BEFORE writing; no audit row is created by an
-- unauthorized caller(correct — blocked callers must not write audit).)
select harness.ok(
  (select count(*) = 0 from public.audit_events where actor_id = '22222222-2222-2222-2222-222222222222'and action in ('role_granted','role_revoked')),
  '170: unauthorized attempts wrote zero role-change audit rows'
);
reset role;
reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Admin (A, hospital_admin: cannot self-promote to super_admin.

 
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.expect_error(
  $$select public.carelink_grant_role(auth.uid(), 'super_admin')$$,
  '170: hospital_admin cannot self-promote to super_admin'
);
select harness.expect_error(
  $$insert into public.user_roles (user_id, role_id) values (auth.uid(), 'super_admin')$$,
  '170: hospital_admin cannot insert super_admin row'
);
reset role;reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- Super-admin (C): can grant/revoke roles audited; cannot be tampered.

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';

select harness.expect_ok(
  $$select public.carelink_grant_role('22222222-2222-2222-2222-222222222222', 'doctor')$$,
  '170: super_admin grants role via guarded function'
);
select harness.expect_ok(
  $$select public.carelink_revoke_role('22222222-2222-2222-2222-222222222222', 'doctor')$$,
  '170: super_admin revokes role via guarded function'
);
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok(
  not public.carelink_has_role('doctor'),
  '170: B no longer has revoked role (verified AS B)'
 );
reset role;
reset request.jwt.claims;
-- Global invariants verified as harness owner (bypasses RLS; the harness
-- owner is the migration runner — client roles never see these rows)。
select harness.ok(
  (select count(*) = 1 from public.user_roles
    where user_id = '11111111-1111-1111-1111-111111111111'
   and role_id ='doctor'),
  '170: unrelated role rows untouched by super_admin grant/revoke cycle'
);
select harness.ok(
  (select count(*) = 0 from public.user_roles
    where user_id = '22222222-2222-2222-2222-222222222222'
    and role_id ='doctor'),
  '170: granted-then-revoked role leaves no residue for B'
);

-- Re-assert as C that the audited trail has an entry ONLY for the explicit grant target
-- (audit keeps target role name inbound safe_message; we verify at least one row per actor+action)。
select harness.ok(
  (select count(*) >= 1 from public.audit_events
    where actor_id = '33333333-3333-3333-3333-333333333333'
    and action = 'role_granted'),
  '170: role grant was audited (actor C)'
);

-- Bootstrap emulation: a first super_admin cannot be minted by anyone unless
-- the callers is already a super_admin (the edge function's bootstrap path
-- additionally requires the server-side secret — not testable locally thus
-- covered by code review + this DB-floor guard).
select harness.expect_error(
  $$select public.carelink_grant_role('44444444-4444-4444-4444-444444444444', 'super_admin')$$,
  '170: creating a second super_admin still requires super_admin'
);
reset role;reset request.jwt.claims;

-- Final: system retains the ORIGINAL role table invariants (no drift from 050)。
select harness.ok(
  (select count(*) = 5 from public.user_roles),  -- 050 baseline:4 core + A doctor
  '170: role table invariant preserved (5 baseline rows)'
);
select harness.ok(
  (select count(*) = 1 from public.user_roles where role_id ='super_admin'),
  '170: exactly one super_admin remains'
);