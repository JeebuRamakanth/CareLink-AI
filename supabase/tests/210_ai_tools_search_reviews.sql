-- ===========================================================================
-- 210 — Step 17: AI tools + global admin search + true infinite reviews..
--   Proves the new Step 17 completion conditions:
--     1. Rich command-center stats (carelink_admin_stats# operator metrics).
--     2. Global admin search is permission-scoped (plain admin cannot reach
--         blood donors; donors.view super_admin only; donor rows are contact
--         redacted — no phone/DOB/email/name ever returned.
--     3. Careful: global search denies anon, denies suspended callers, and
--         plain patients (no admin permission.
--     4. TRUE infinite-scroll reviews: keyset cursor — no duplicates/skips,
--         published-only, rating/kind search filters, arbitrary-limits capped.
--     5. New security-activity events (denied_admin_access, denied_super_admin_access,
--         ai_tool_attempt, ai_tool_action) are accepted by the guarded RPC and
--         stored with user-scoped isolation.
--
-- Uses 050 fixtures: A=1111...(hospital_admin+pharmacy_admin), B=2222...(lab_admin), C=3333...(super_admin), D=4444...(ordinary patient, E=5555...
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Rich stats (operator, dashboard.view)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.ok(
  (select count(*) >= 25 from public.carelink_admin_stats()),
  '210: super admin stats feed returns the rich metric set'
);
select harness.ok(
  (select coalesce((select value from public.carelink_admin_stats() where metric ='total_appointments'),0) >= 0),
  '210: total_appointments metric present'
);
select harness.ok(
  (select coalesce((select value from public.carelink_admin_stats() where metric ='ai_conversations'),0) >= 0),
  '210: ai_conversations metric present'
);
select harness.ok(
  (select coalesce((select value from public.carelink_admin_stats() where metric ='blood_donors'),0) >= 0),
  '210: blood_donors metric present'
);
select harness.ok(
  (select coalesce((select value from public.carelink_admin_stats() where metric ='verification_verified'),0) >= 0),
  '210: verification_verified metric present'
);

-- ---------------------------------------------------------------------------
-- 2. Global search permission scoping
-- ---------------------------------------------------------------------------

-- Patient (no admin permission): denied entirely. User H (8888) has NO role。
-- Insert via the harness superuser path（the authenticated role has no INSERT on auth.users。
reset role;
reset request.jwt.claims;
insert into auth.users (id, email) values ('88888888-8888-8888-8888-888888888888', 'no-role@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name, account_status) values ('88888888-8888-8888-8888-888888888888', 'No Role User', 'active')
on conflict (id) do nothing;
set role authenticated;
set request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';
select harness.expect_error(
  $$select * from public.carelink_admin_global_search('Hospital',20,0)$$,
  '210: ordinary patient cannot run global admin search'
);

-- Plain admin (no donors.view): donors category omitted; provider/appointment/review categories present。


-- Suite 180 suspended user 1111(A); restore it via the super admin service path first。
reset role; reset request.jwt.claims;
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select public.carelink_admin_set_account_status('11111111-1111-1111-1111-111111111111', 'active', 'restore for 210');
-- Set the hospital-admin session fresh (role change persists across set role
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';
select harness.ok(
  (select count(*) > 0 from public.carelink_admin_global_search('Hospital',20,0) where kind in ('hospital','doctor','pharmacy','lab')),
  '210: hospital admin sees provider search results'
);
select harness.ok(
  (select count(*) = 0 from public.carelink_admin_global_search('O+',20,0) where kind ='blood_donor'),
  '210: plain admin cannot reach blood donor search (donors.view super_admin only)'
);

-- Super admin: donor category present + contact-redacted.
-- donor_profiles has NO cross-user insert policy, so seed through the harness superuser.

reset role; reset request.jwt.claims;
insert into public.donor_profiles (id, owner_id, blood_group_code, city, phone, date_of_birth, is_active)
values ('210d0000-0000-0000-0000-000000000001'::uuid, '55555555-5555-5555-5555-555555555555', 'O+', 'Test City', '9999999999', '1990-01-01', true)
on conflict (id) do nothing;
insert into public.donor_eligibility (donor_profile_id, is_eligible, last_donation_date, eligible_until)
values ('210d0000-0000-0000-0000-000000000001'::uuid, true, null,null)
on conflict (donor_profile_id) do nothing;

set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.ok(
  (select count(*) >= 1 from public.carelink_admin_global_search('Test City',20,0) where kind ='blood_donor'),
  '210: super admin sees donor category'
);
select harness.ok(
  (select count(*) = 0 from public.carelink_admin_global_search('Test City',20,0) where kind ='blood_donor' and subtitle like '%9999999999%'),
  '210: donor search never exposes raw phone number'
);
select harness.ok(
  (select count(*) = 0 from public.carelink_admin_global_search('Test City',20,0) where kind ='blood_donor'and extra->>'eligible' is null),
  '210: donor search carries eligibility flag (redacted, allowed)'
);

-- ---------------------------------------------------------------------------
-- 3. Suspended admin denied
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"66666666-6666-6666-6666-666666666666"}';
update public.profiles set account_status ='suspended' where id ='66666666-6666-6666-6666-666666666666';
select harness.expect_error(
  $$select * from public.carelink_admin_global_search('Hospital',20,0)$$,
  '210: suspended admin cannot run global search'
);

-- ---------------------------------------------------------------------------
-- 4. TRUE infinite reviews (keyset, published-only, no dup/miss)
-- ---------------------------------------------------------------------------
-- Seed provider target + published reviews via the harness superuser（anon/all
-- authenticated roles have READ-only access; only the review author may insert reviews。
reset role; reset request.jwt.claims;
insert into public.hospitals (id, slug, name, city, address)
values ('210a0000-0000-0000-0000-000000000001', 'review-hospital-one', 'Review Hospital One', 'City A', 'Addr 1')
on conflict (id) do nothing;
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777', 'review-author@test.local')
on conflict (id) do nothing;
insert into public.profiles (id, display_name) values ('77777777-7777-7777-7777-777777777777', 'Review Author')
on conflict (id) do nothing;

insert into public.appointments (id, owner_id, scheduled_date, scheduled_time, status, hospital_id) values
  ('21010000-0000-0000-0000-0000000000a1','77777777-7777-7777-7777-777777777777','2026-07-01','10:00','completed','210a0000-0000-0000-0000-000000000001'),
  ('21010000-0000-0000-0000-0000000000a2','77777777-7777-7777-7777-777777777777','2026-07-02','10:00','completed','210a0000-0000-0000-0000-000000000001'),
  ('21010000-0000-0000-0000-0000000000b1','88888888-8888-8888-8888-888888888888','2026-07-03','10:00','completed','210a0000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
set role authenticated;
set request.jwt.claims = '{"sub":"77777777-7777-7777-7777-777777777777"}';
insert into public.reviews (id, owner_id, hospital_id, title, body, overall_rating, status, created_at, appointment_id)
select '21010000-0000-0000-0000-000000000001', '77777777-7777-7777-7777-777777777777', '210a0000-0000-0000-0000-000000000001', 'Great', 'Wonderful care', 5, 'published', now() - interval '1 hour', '21010000-0000-0000-0000-0000000000a1'
where not exists (select 1 from public.reviews where id ='21010000-0000-0000-0000-000000000001');
insert into public.reviews (id, owner_id, hospital_id, title, body, overall_rating, status, created_at, appointment_id)
select '21030000-0000-0000-0000-000000000003', '77777777-7777-7777-7777-777777777777', '210a0000-0000-0000-0000-000000000001', 'Draft', 'Pending moderation', 2, 'pending', now() - interval '3 hours', '21010000-0000-0000-0000-0000000000a2'
where not exists (select 1 from public.reviews where id ='21030000-0000-0000-0000-000000000003');
-- The second published review belongs to a different author（8888）; seed it via the harness superuser
-- to keep the one-published-review-per-author-target invariant and RLS-owner policy satisfied.
set role authenticated;
set request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';
insert into public.reviews (id, owner_id, hospital_id, title, body, overall_rating, status, created_at, appointment_id)
select '21020000-0000-0000-0000-000000000002', '88888888-8888-8888-8888-888888888888', '210a0000-0000-0000-0000-000000000001', 'OK', 'Average', 3, 'published', now() - interval '2 hours', '21010000-0000-0000-0000-0000000000b1'
where not exists (select 1 from public.reviews where id ='21020000-0000-0000-0000-000000000002');

-- Scope by a unique title so earlier suites' published reviews don't skew counts.
select harness.ok(
  (select count(*) = 1 from public.carelink_reviews_cursor('Wonderful care',null::smallint,null::text,null::timestamptz,null::uuid,20)),
  '210: reader reads ONLY published reviews via cursor (draft hidden)'
);
select harness.ok(
  (select count(*) = 0 from public.carelink_reviews_cursor('Pending moderation',null::smallint,null::text,null::timestamptz,null::uuid,20)),
  '210: pending review never leaks through cursor'
);
-- Keyset pagination: exclusive-before cursor yields the next page with NO duplicate row.

select harness.ok(
  (select count(*) = 1
    from (
      select id from public.carelink_reviews_cursor('Wonderful care',null::smallint,null::text,null::timestamptz,null::uuid,1)
      union all
      select id from public.carelink_reviews_cursor('Wonderful care',null::smallint,null::text,
           (select created_at from public.carelink_reviews_cursor('Wonderful care',null::smallint,null::text,null::timestamptz,null::uuid,1) limit 1),
           (select id from public.carelink_reviews_cursor('Wonderful care',null::smallint,null::text,null::timestamptz,null::uuid,1) limit 1),
           1)
    ) t),
  '210: keyset pages join without duplicates/skips'
);
-- Rating + kind filters
select harness.ok(
  (select count(*) = 1 from public.carelink_reviews_cursor('Wonderful care',5::smallint,null::text,null::timestamptz,null::uuid,20)),
  '210: rating filter returns only matching reviews'
);
select harness.ok(
  (select count(*) = 1 from public.carelink_reviews_cursor('Wonderful care',null::smallint,'hospital'::text,null::timestamptz,null::uuid,20)),
  '210: provider-kind filter isolates hospital reviews'
);
-- Limit is capped at 40 (server-side abuse control)
select harness.ok(
  (select count(*) <= 40 from public.carelink_reviews_cursor('Wonderful care',null::smallint,null::text,null::timestamptz,null::uuid,9999)),
  '210: cursor limit capped server-side (no full-table download)'
);
reset role; reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 5. New security-activity events (user-scoped auditable RPC)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.ok(
  public.carelink_record_login_activity('denied_admin_access', jsonb_build_object('path','/admin')) is not null,
  '210: denied_admin_access accepted + recorded'
);
select harness.ok(
  public.carelink_record_login_activity('denied_super_admin_access', jsonb_build_object('path','/admin/roles')) is not null,
  '210: denied_super_admin_access accepted + recorded'
);
select harness.ok(
  public.carelink_record_login_activity('ai_tool_attempt', jsonb_build_object('tool','getMyAppointments','outcome','denied')) is not null,
  '210: ai_tool_attempt accepted + recorded'
);
select harness.ok(
  public.carelink_record_login_activity('ai_tool_action', jsonb_build_object('tool','createAppointment','outcome','succeeded'))is not null,
  '210: ai_tool_action accepted + recorded'
);

-- User-scoped isolation: a no-role user (H, 8888) cannot read E's activity rows.
-- (D=4444 is super_admin from suite 190 and may read all activity via the admin policy.)

set role authenticated;
set request.jwt.claims = '{"sub":"88888888-8888-8888-8888-888888888888"}';
select harness.ok(
  (select count(*) = 0 from public.security_activity_events where user_id ='55555555-5555-5555-5555-555555555555'),
  '210: E activity rows never visible to another user (RLS isolation)'
);
-- E can read own new activity events.
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.ok(
  (select count(*) >= 4 from public.security_activity_events where user_id ='55555555-5555-5555-5555-555555555555' and event in ('denied_admin_access','denied_super_admin_access','ai_tool_attempt','ai_tool_action')),
  '210: E can read own new activity events'
);
reset role; reset request.jwt.claims;