-- ===========================================================================
-- CareLink-AI — Step 27 tests: corridor pharmacy + laboratory directory.
--
-- Asserts the sourced OpenStreetMap rows landed correctly, the honesty contract
-- holds (no stock level, no fabricated rating/coordinate, provenance present),
-- the replay is idempotent, and the security posture is least-privilege
-- (public read, no client writes).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Coverage + provenance.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.pharmacies) >= 20,
  'step27: corridor pharmacies imported'
);

-- Scoped to the SOURCED directory: unrelated dev-seed/test-fixture rows are
-- allowed to lack provenance, but an imported corridor record never may.
select harness.ok(
  (select count(*) from public.pharmacies
    where data_source = 'OpenStreetMap contributors (ODbL 1.0)'
      and (source_url is null or data_status is null)) = 0,
  'step27: every imported pharmacy carries a source URL and status'
);

select harness.ok(
  (select count(*) from public.pharmacies where stock_source <> 'not_integrated') = 0,
  'step27: no pharmacy claims a live stock integration'
);

select harness.ok(
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pharmacies'
      and column_name in ('stock', 'stock_level', 'units_available', 'inventory_quantity')
  ),
  'step27: pharmacies has NO stock-amount column (stock is never invented)'
);

select harness.ok(
  (select count(*) from public.pharmacies
    where data_source = 'OpenStreetMap contributors (ODbL 1.0)'
      and rating is not null and rating <> 0) = 0,
  'step27: no imported pharmacy carries a fabricated rating'
);

-- Coverage must span the corridor, not a single city.
select harness.ok(
  (select count(distinct city) from public.pharmacies) >= 4,
  'step27: pharmacies span multiple corridor localities'
);

select harness.ok(
  (select count(*) from public.pharmacies where city = 'Machilipatnam') > 0
    and (select count(*) from public.pharmacies where city = 'Vijayawada') > 0,
  'step27: both corridor anchor cities are represented'
);

-- A published coordinate must be plausible for the corridor (not a default/zero).
select harness.ok(
  (select count(*) from public.pharmacies where latitude is not null and (latitude < 15 or latitude > 18)) = 0,
  'step27: no pharmacy coordinate is outside a plausible Andhra Pradesh range'
);

select harness.ok(
  (select count(*) from public.pharmacies where latitude is not null and longitude is null) = 0,
  'step27: a coordinate is never half-populated'
);

-- ---------------------------------------------------------------------------
-- 2. Branch identity: distinct branches of one chain are distinct rows.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.pharmacies where name = 'Apollo Pharmacy') >= 2,
  'step27: distinct branches of one chain are NOT merged'
);

-- ---------------------------------------------------------------------------
-- 3. Laboratories.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.labs) >= 5,
  'step27: corridor laboratories imported'
);

select harness.ok(
  (select count(*) from public.labs
    where data_source = 'OpenStreetMap contributors (ODbL 1.0)'
      and (source_url is null or data_status is null)) = 0,
  'step27: every imported laboratory carries a source URL and status'
);

-- ---------------------------------------------------------------------------
-- 4. Idempotent replay: re-running the seed must not duplicate a row.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) from public.pharmacies) = (select count(distinct id) from public.pharmacies),
  'step27: pharmacy ids are unique'
);

select harness.ok(
  (select count(*) from public.labs) = (select count(distinct id) from public.labs),
  'step27: laboratory ids are unique'
);

-- ---------------------------------------------------------------------------
-- 5. Security: public read, no client writes.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select relrowsecurity from pg_class where oid = 'public.pharmacies'::regclass),
  'step27: RLS enabled on pharmacies'
);

select harness.ok(
  (select relrowsecurity from pg_class where oid = 'public.labs'::regclass),
  'step27: RLS enabled on labs'
);

select harness.ok(
  not has_table_privilege('anon', 'public.pharmacies', 'INSERT')
    and not has_table_privilege('anon', 'public.pharmacies', 'UPDATE')
    and not has_table_privilege('anon', 'public.pharmacies', 'DELETE'),
  'step27: anon cannot write pharmacies'
);

select harness.ok(
  not has_table_privilege('authenticated', 'public.labs', 'INSERT')
    and not has_table_privilege('authenticated', 'public.labs', 'UPDATE')
    and not has_table_privilege('authenticated', 'public.labs', 'DELETE'),
  'step27: authenticated cannot write labs'
);

select harness.ok(
  has_table_privilege('anon', 'public.pharmacies', 'SELECT')
    and has_table_privilege('anon', 'public.labs', 'SELECT'),
  'step27: discovery data is publicly readable'
);
