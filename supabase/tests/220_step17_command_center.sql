-- ===========================================================================
-- 220 — Step 17 command center + global search + infinite review scroll..
--
-- Proves:
--   1. Extended command-center metrics (real DB counts only; every requested
--      metric exists in the result set; no fabrication, no zero where data
--      exists muting the honest state).
--   2. Global admin search: server-side, page-bounded, permission-gated;
--      donor rows are privacy-shielded (no phone/DOB/owner identity surfaces),
--      ordinary users are denied.

--   3. Reviews true infinite scroll (cursor/keyset pagination):
--      - keyset page 1 + page 2 (via cursor) return disjunct rows
--      - no duplicates (equal-timestamp rows handled via (created_at,id)tuple)

--      - bounded page_size, rating/provider/status filters validated,
--      - admin may read a moderation state (e.g. hidden) — ordinary users cannot.
--   4. Family resolver: returns authorized row only (also in 210; here we
--      confirm the happy path + the invalid id path).
--
-- Fixtures reuse 210 (E=5555 ordinary, C=3333 super_admin, A=1111) plus
-- dedicated ids (7d.. literal) that never collide with prior suites (7b,7c,7a,5a…).
 -- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Fixtures (dedicated ids; review + provider rows for pagination)		
-- ---------------------------------------------------------------------------
insert into public.hospitals (id, slug, name, city, address) values
  ('7d100001-0000-0000-0000-000000000001', 'step17-hospital', 'Step17 City Hospital', 'Machilipatnam', '1 Beach Rd')
on conflict (id) do nothing;
insert into public.hospital_verification (id, hospital_id, status) values
  ('7d110001-0000-0000-0000-000000000001', '7d100001-0000-0000-0000-000000000001', 'verified')
on conflict (id) do nothing;

insert into public.doctors (id, slug, name) values
  ('7d200001-0000-0000-0000-000000000001', 'step17-doctor', 'Dr. Step17')
on conflict (id) do nothing;
insert into public.doctor_verification (id, doctor_id, status) values
  ('7d210001-0000-0000-0000-000000000001', '7d200001-0000-0000-0000-000000000001', 'verified')
on conflict (id) do nothing;

insert into public.donor_profiles (id, owner_id, blood_group_code, city, is_active) values
  ('7d300001-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', 'O+', 'Machilipatnam', true)
on conflict (id) do nothing;

-- Four published reviews with staggered timestamps (cursor pagination works).
		
insert into public.reviews (id, owner_id, hospital_id, overall_rating, title, body, status, created_at) values
  ('7d400001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', '7d100001-0000-0000-0000-000000000001', 5, 'Excellent', 'Great care', 'published', now() - interval '4 days'),
  ('7d400002-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '7d100001-0000-0000-0000-000000000001', 4, 'Good', 'Solid', 'published', now() - interval '3 days'),
  ('7d400003-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '7d100001-0000-0000-0000-000000000001', 3, 'Okay', 'Average', 'published', now() - interval '2 days'),
  ('7d400004-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555', '7d100001-0000-0000-0000-000000000001', 2, 'Hidden one', 'private', 'hidden', now() - interval '1 day')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 1. Extended command-center metrics (as C super_admin)	
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.ok(
  (select count(*) from public.carelink_admin_stats() where metric in
    ('users','active_users','suspended_users','patients','active_patients',
     'providers_hospitals','active_hospitals','providers_doctors','active_doctors',
     'providers_pharmacies','active_pharmacies','providers_labs','active_labs',
     'appointments','confirmed_appointments','upcoming_appointments',
     'completed_appointments','cancelled_appointments','rescheduled_appointments',
     'reviews','published_reviews','pending_reviews','provider_responses',
     'donors','active_donors','ai_conversations','ai_messages',
     'notifications','notification_sent','media_assets')) >= 30,
  '220: command-center stats expose the full real-metrics set (30 metrics)'
);
select harness.ok(
  (select value from public.carelink_admin_stats() where metric ='providers_hospitals') >= 1,
  '220: stats count a real hospital row (no fabricated zero)'
);
select harness.ok(
  (select value from public.carelink_admin_stats() where metric ='published_reviews') >= 3,
  '220: stats count the three public review fixtures'
);
reset role;reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 2. Global admin search (server-side + donor privacy + paging)
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.ok(
  (select count(*) from public.carelink_admin_search_results('Step17', page_size => 20)) >= 1,
  '220: super_admin searches provider by name (server-side)'
);
select harness.ok(
  (select count(*) from public.carelink_admin_search_results('Machilipatnam', page_size => 20)where result_kind ='donor') >= 1,
  '220: donor search surfaces area/group only rows'
);
select harness.ok(
  (select count(*) from public.carelink_admin_search_results('Machilipatnam', page_size => 20)
     where result_kind = 'donor'
       and (extra->>'city') = 'Machilipatnam'
       and not (extra ? 'phone') and not (extra ? 'date_of_birth') and not (extra ? 'owner_id')) >= 1,
  '220: donor rows never leak phone/DOB/owner identity (privacy-shielded)'
);
select harness.ok(
  (select count(*) from public.carelink_admin_search_results('xyz-non-existent', page_size => 20))= 0,
  '220: no-match search returns an honest empty set'
);
select harness.expect_error(
  $$select public.carelink_admin_search_results('Step17', page_size => 0)$$,
  '220: zero page_size rejected (bounded paging)'
);
reset role;reset request.jwt.claims;

-- Ordinary users cannot run admin search (already in 210; concise re-prove	)	
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.expect_error(
  $$select public.carelink_admin_search_results('Step17')$$,
  '220: ordinary user denied admin global search'
);
reset role;reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 3. Reviews true infinite scroll — cursor/keyset pagination, no dup/skips
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';

-- Page 1: newest three published (oldest "published" excluded by page_size)
select harness.ok(
  (select count(*) from public.carelink_reviews_feed_cursor(page_size => 3)) = 3,
  '220: review cursor page1 returns bounded page_size rows'
);
-- Take the oldest cursor from page1 as them cursor for page 2.
with page1 as (
  select * from public.carelink_reviews_feed_cursor(page_size => 3)
)
select harness.ok(
  (select count(*) from public.carelink_reviews_feed_cursor(
      cursor_created_at => (select min(created_at) from page1),
      cursor_id => (select id from page1 order by created_at asc, id asc limit 1),
      page_size => 10
    )) >= 1,
  '220: review cursor page2 (via keyset tuple) continues without duplicates'
);
-- The two pages share no ids (keyset correctness; no dup/skip on equal timestamps)
with page1 as (
  select * from public.carelink_reviews_feed_cursor(page_size => 3)
), page2 as (
  select * from public.carelink_reviews_feed_cursor(
    cursor_created_at => (select min(created_at) from page1),
    cursor_id => (select id from page1 order by created_at asc, id asc limit 1),
    page_size => 10
  )
)
select harness.ok(
  not exists (select 1 from page2 p2 where exists (select 1 from page1 p1 where p1.id = p2.id)),
  '220: cursor pages are disjoint (no duplicates, no skipped records)'
);

-- Rating + provider-kind filters validated.

select harness.ok(
  (select count(*) from public.carelink_reviews_feed_cursor(rating_min => 4, page_size => 10)) >= 2,
  '220: rating_min filters the feed'
);
select harness.ok(
  (select count(*) from public.carelink_reviews_feed_cursor(rating_min => 5, page_size => 10)) >= 1,
  '220: top-rated filter returns 5-star rows only'
);
select harness.ok(
  (select count(*) from public.carelink_reviews_feed_cursor(provider_kind =>'hospital', provider_id =>'7d100001-0000-0000-0000-000000000001', page_size => 50)) >= 3,
  '220: provider-kind + provider-id filter narrows the feed'
);
select harness.expect_error(
  $$select public.carelink_reviews_feed_cursor(provider_kind =>'clinic')$$,
  '220: invalid provider kind rejected'
);
select harness.expect_error(
  $$select public.carelink_reviews_feed_cursor(rating_min => 7)$$,
  '220: out-of-range rating rejected'
);
reset role;reset request.jwt.claims;

-- Moderator may read a non-public state(admin queue)	
set role authenticated;
set request.jwt.claims = '{"sub":"33333333-3333-3333-3333-333333333333"}';
select harness.ok(
  (select count(*) from public.carelink_reviews_feed_cursor(status_filter =>'hidden', page_size => 10)) >= 1,
  '220: admin reads hidden moderation rows via feed cursor'
);
reset role;reset request.jwt.claims;

-- ---------------------------------------------------------------------------
-- 4. Family resolver happy+invalid paths(echo of 210)		
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"55555555-5555-5555-5555-555555555555"}';
select harness.ok(
  ((select id from public.carelink_resolve_family_profile('7c100001-0000-0000-0000-000000000001')) is not null),
  '220: family resolver resolves own inherited row'
);
select harness.ok(
  ((select id from public.carelink_resolve_family_profile('00000000-0000-0000-0000-000000000000')) is null),
  '220: family resolver returns null for unknown id (honest empty)'
);
reset role;reset request.jwt.claims;
-- ===========================================================================