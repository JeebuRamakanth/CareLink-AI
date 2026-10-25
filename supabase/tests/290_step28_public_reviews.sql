-- ===========================================================================
-- 290 — Step 28: PUBLIC reviews page backend.
--
-- Asserts the public read path is correct AND least-privilege:
--   1. an anonymous visitor CAN read published reviews through
--      carelink_public_reviews_cursor (the whole point of the Reviews page),
--   2. the definer NEVER returns a non-published row (draft / pending / hidden),
--   3. searching matches the PROVIDER NAME, not just the review text,
--   4. rating / kind / verified filters and the keyset cursor behave,
--   5. sorting by newest / highest / lowest uses real fields,
--   6. carelink_public_review_facets() reports real published-only counts,
--   7. the public functions are the ONLY new grant (no write path to anon).
--
-- Fixtures: 050 created Hospital One/Two, Doctor One, Pharmacy One, Lab One;
-- 060 published review a0000006 (Hospital One, 5★) and hid b0000006.
--
-- NOTE ON COUNTS: later suites (200/210/220) add their own published reviews, so
-- the assertions below hold for ANY superset of the Step 28 fixtures: they assert
-- the presence of the specific published row, the ABSENCE of every non-published
-- row, and that the facet total equals the public row count. A fixed
-- `count(*) = 1` would be a false failure, not a bug.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. anon can read the published stream, and NOTHING else.
-- ---------------------------------------------------------------------------
set role anon;
select harness.ok(
  (select count(*) >= 1 from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 40)),
  'step28: anon can read published reviews through the public cursor'
);
select harness.ok(
  (select count(*) = 1
     from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 40)
     where id = 'a0000006-0000-0000-0000-000000000006'),
  'step28: the published review is visible to anon exactly once'
);
select harness.ok(
  (select count(*) = 0
     from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 40)
     where id in (
       'b0000006-0000-0000-0000-000000000006',  -- hidden (060)
       '21030000-0000-0000-0000-000000000003',  -- pending (210)
       '7d400004-0000-0000-0000-000000000004'   -- hidden (220)
     )),
  'step28: hidden and pending reviews never reach the public cursor'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Provider name is searchable (the real bug this migration fixes).
-- ---------------------------------------------------------------------------
set role anon;
select harness.ok(
  (select count(*) >= 1
     from public.carelink_public_reviews_cursor('Hospital One', null, null, false, 'newest', null, null, null, 40)),
  'step28: searching a hospital NAME matches its published reviews'
);
select harness.ok(
  (select count(*) = 1
     from public.carelink_public_reviews_cursor('Hospital One', null, null, false, 'newest', null, null, null, 40)
     where id = 'a0000006-0000-0000-0000-000000000006'),
  'step28: provider-name search matches the provider’s own published review'
);
select harness.ok(
  (select count(*) = 0
     from public.carelink_public_reviews_cursor('No Such Facility', null, null, false, 'newest', null, null, null, 40)),
  'step28: an unmatched provider name returns an honest empty result'
);
reset role;

-- ---------------------------------------------------------------------------
-- 3. Filters + cursor (anon).
-- ---------------------------------------------------------------------------
set role anon;
select harness.ok(
  (select count(*) >= 1
     from public.carelink_public_reviews_cursor(null, 5::smallint, null, false, 'newest', null, null, null, 40)),
  'step28: rating filter matches the published 5-star review'
);
select harness.ok(
  (select bool_and(rating = 5)
     from public.carelink_public_reviews_cursor(null, 5::smallint, null, false, 'newest', null, null, null, 40)),
  'step28: the rating filter never returns a different rating'
);
select harness.ok(
  (select count(*) >= 1
     from public.carelink_public_reviews_cursor(null, null, 'hospital', false, 'newest', null, null, null, 40)),
  'step28: kind filter selects hospital reviews'
);
select harness.ok(
  (select bool_and(provider_kind = 'hospital')
     from public.carelink_public_reviews_cursor(null, null, 'hospital', false, 'newest', null, null, null, 40)),
  'step28: the kind filter never returns another provider kind'
);
select harness.ok(
  (select count(*) >= 1
     from public.carelink_public_reviews_cursor(null, null, null, true, 'newest', null, null, null, 40)),
  'step28: verified-only returns the verified published review'
);
select harness.ok(
  (select bool_and(is_verified)
     from public.carelink_public_reviews_cursor(null, null, null, true, 'newest', null, null, null, 40)),
  'step28: verified-only never returns an unverified review'
);
-- Keyset: paging past the first page must not repeat it.
select harness.ok(
  (select count(*) = 0
     from public.carelink_public_reviews_cursor(
       null, null, null, false, 'newest',
       (select created_at from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 1) limit 1),
       (select id from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 1) limit 1),
       (select rating from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 1) limit 1),
       40)
     where id = (select id from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 1) limit 1)),
  'step28: the keyset cursor never repeats the first page'
);
-- limit is clamped server-side.
select harness.ok(
  (select count(*) <= 40
     from public.carelink_public_reviews_cursor(null, null, null, false, 'newest', null, null, null, 9999)),
  'step28: the public cursor clamps the page limit'
);
reset role;

-- ---------------------------------------------------------------------------
-- 4. Sorting uses real fields.
-- ---------------------------------------------------------------------------
set role anon;
select harness.ok(
  (select coalesce(bool_and(rating >= lead_rating), true)
     from (
       select rating, lead(rating) over (order by idx) as lead_rating
       from (
         select rating, row_number() over () as idx
         from public.carelink_public_reviews_cursor(null, null, null, false, 'highest', null, null, null, 40)
       ) t
     ) ordered
     where lead_rating is not null),
  'step28: highest-rated sort is non-increasing by rating'
);
select harness.ok(
  (select coalesce(bool_and(rating <= lead_rating), true)
     from (
       select rating, lead(rating) over (order by idx) as lead_rating
       from (
         select rating, row_number() over () as idx
         from public.carelink_public_reviews_cursor(null, null, null, false, 'lowest', null, null, null, 40)
       ) t
     ) ordered
     where lead_rating is not null),
  'step28: lowest-rated sort is non-decreasing by rating'
);
-- An unknown sort value falls back to newest instead of erroring.
select harness.ok(
  (select count(*) >= 1
     from public.carelink_public_reviews_cursor(null, null, null, false, 'not-a-sort', null, null, null, 40)),
  'step28: an unknown sort falls back safely'
);
reset role;

-- ---------------------------------------------------------------------------
-- 5. Facets are real and published-only.
-- ---------------------------------------------------------------------------
-- This comparison must run as the harness owner: under `set role anon` RLS
-- filters `count(*) from public.reviews` down to published rows, which would
-- make the assertion compare 9 with 9 instead of 9 with the raw 12.
select harness.ok(
  (select (public.carelink_public_review_facets() ->> 'total')::int
        = (select count(*) from public.reviews r where r.status = 'published')),
  'step28: the facet total equals the published row count (nothing hidden or invented)'
);
select harness.ok(
  (select (public.carelink_public_review_facets() ->> 'total')::int
        < (select count(*) from public.reviews)::int),
  'step28: the facet total is smaller than the raw table (non-published rows excluded)'
);

set role anon;
select harness.ok(
  (select (carelink_public_review_facets() ->> 'verified')::int >= 1),
  'step28: facets count the verified published review'
);
select harness.ok(
  (select (carelink_public_review_facets() ->> 'hospitals')::int >= 1),
  'step28: facets count the published hospital reviews'
);
select harness.ok(
  (select (carelink_public_review_facets() ->> 'providers') like '%Hospital One%'),
  'step28: facets name the real reviewed provider'
);
select harness.ok(
  (select (carelink_public_review_facets() ->> 'ratings') like '%"rating"%'),
  'step28: facets publish a real rating distribution'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. Least privilege: anon gains READ, never WRITE.
-- ---------------------------------------------------------------------------
select harness.ok(
  not has_table_privilege('anon', 'public.reviews', 'insert')
    and not has_table_privilege('anon', 'public.reviews', 'update')
    and not has_table_privilege('anon', 'public.reviews', 'delete'),
  'step28: anon has no write privilege on reviews'
);
set role anon;
select harness.expect_error(
  $$insert into public.reviews (owner_id, hospital_id, overall_rating)
    values ('11111111-1111-1111-1111-111111111111', '5a111111-1111-1111-1111-111111111111', 5)$$,
  'step28: anon cannot insert a review'
);
reset role;

-- ---------------------------------------------------------------------------
-- 7. The existing authenticated cursor is untouched and still exists.
-- ---------------------------------------------------------------------------
select harness.ok(
  exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'carelink_reviews_cursor'
  ),
  'step28: the authenticated reviews cursor is preserved'
);
