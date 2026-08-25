-- ===========================================================================
-- 010 — RLS harness probe (TEST-ONLY fixture).
--
-- This is the correctly-scoped replacement for the broken "TEST-RLS" fixture
-- class: it lives ONLY in the test harness (never in production migrations),
-- uses a normal identifier, has a real ownership column, enables RLS, and
-- uses a valid row predicate (owner_id = auth.uid()).
--
-- It proves the harness itself enforces real PostgreSQL RLS — if these
-- assertions pass, the harness can be trusted to catch cross-user leakage in
-- the production tables exercised by the later suites.
-- ===========================================================================

-- Fixture (superuser path; harness schema keeps it out of production tables)
create table if not exists harness.rls_probe (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  label text
);
alter table harness.rls_probe enable row level security;

drop policy if exists rls_probe_owner on harness.rls_probe;
create policy rls_probe_owner on harness.rls_probe
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

grant all on harness.rls_probe to anon, authenticated;

-- Seed rows (service path)
insert into harness.rls_probe (owner_id, label) values
  ('11111111-1111-1111-1111-111111111111', 'A row'),
  ('22222222-2222-2222-2222-222222222222', 'B row');

-- ---------------------------------------------------------------------------
-- User A context
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.ok(
  (select count(*) = 1 and bool_and(label = 'A row') from harness.rls_probe),
  'probe: User A SELECT sees only own row'
);

-- INSERT with forged owner_id violates the WITH CHECK predicate -> error
select harness.expect_error(
  $$insert into harness.rls_probe (owner_id, label) values ('22222222-2222-2222-2222-222222222222', 'forged')$$,
  'probe: User A INSERT with owner_id = User B rejected'
);

-- UPDATE/DELETE against invisible rows affect 0 rows (no error in PG) —
-- executed here as User A, then verified unchanged from the service view below.
update harness.rls_probe set label = 'hijacked' where label = 'B row';
delete from harness.rls_probe where label = 'B row';

select harness.ok(
  (select count(*) = 0 from harness.rls_probe where label = 'B row'),
  'probe: User B row invisible to User A'
);

reset role;
reset request.jwt.claims;

select harness.ok(
  (select count(*) = 2 and bool_and(label in ('A row','B row')) from harness.rls_probe),
  'probe: User A cross-user UPDATE/DELETE attempts changed nothing'
);

-- ---------------------------------------------------------------------------
-- User B context (mirror)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok(
  (select count(*) = 1 and bool_and(label = 'B row') from harness.rls_probe),
  'probe: User B SELECT sees only own row'
);

update harness.rls_probe set label = 'hijacked' where label = 'A row';
delete from harness.rls_probe where label = 'A row';

select harness.ok(
  (select count(*) = 0 from harness.rls_probe where label = 'A row'),
  'probe: User A row invisible to User B'
);

reset role;
reset request.jwt.claims;

select harness.ok(
  (select count(*) = 2 and bool_and(label in ('A row','B row')) from harness.rls_probe),
  'probe: User B cross-user UPDATE/DELETE attempts changed nothing'
);

-- ---------------------------------------------------------------------------
-- Anonymous context: no uid claim -> sees nothing
-- ---------------------------------------------------------------------------
set role anon;

select harness.ok(
  (select count(*) = 0 from harness.rls_probe),
  'probe: anonymous SELECT sees zero rows'
);

select harness.expect_error(
  $$insert into harness.rls_probe (owner_id, label) values ('11111111-1111-1111-1111-111111111111', 'anon forged')$$,
  'probe: anonymous INSERT rejected'
);

reset role;
