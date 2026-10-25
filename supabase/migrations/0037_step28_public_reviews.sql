-- ===========================================================================
-- CareLink-AI — Step 28: public reviews page — real data, real search.
--
-- WHY THIS MIGRATION EXISTS
--   The Reviews page could only read published reviews through
--   `carelink_reviews_cursor`, which (a) is EXECUTE-revoked from anon, so an
--   anonymous visitor could never load a single real review, and (b) matched the
--   search term only against title/body/author, so searching a hospital or
--   doctor NAME returned nothing. Both made honest "no reviews" indistinguishable
--   from "search is broken".
--
-- WHAT IT DOES
--   1. Adds a PUBLIC-read keyset RPC `carelink_public_reviews_cursor(...)` that
--      returns ONLY `status = 'published'` rows (the definer never exposes draft/
--      pending/hidden rows) with the provider display name + slug, verification
--      and provider response, plus provider-name search.
--   2. Adds `carelink_public_review_facets()` — real, published-only aggregate
--      counts (total, verified, provider-kind breakdown, rating distribution and
--      the published-review provider list) so the page can offer honest filter
--      options instead of a hardcoded category list.
--
-- HONESTY / SECURITY
--   - Published-only in both functions: the public never sees unmoderated rows.
--   - No fabricated figures: an empty table yields 0/empty, never a placeholder.
--   - Read-only: no INSERT/UPDATE/DELETE is granted to anon or authenticated.
--   - EXECUTE is granted to anon AND authenticated (public read is the point);
--     the function bodies restrict the row set, not the caller.
--   - Existing `carelink_reviews_cursor` is left untouched for authenticated
--     callers already using it.
--
-- IDEMPOTENT: create or replace + idempotent grants. Safe to replay.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Public published-reviews keyset cursor (anon + authenticated read).
-- ---------------------------------------------------------------------------
create or replace function public.carelink_public_reviews_cursor(
  p_query text default null,
  p_rating smallint default null,
  p_kind text default null,
  p_verified_only boolean default false,
  p_sort text default 'newest',
  p_before_created timestamptz default null,
  p_before_id uuid default null,
  p_before_rating smallint default null,
  p_limit int default 20
)
returns table (
  id uuid,
  title text,
  body text,
  rating smallint,
  author_display text,
  provider_kind text,
  provider_name text,
  provider_slug text,
  is_verified boolean,
  provider_response text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  lim int;
  q text;
  srt text;
begin
  lim := least(greatest(coalesce(p_limit, 20), 1), 40);
  q := nullif(btrim(coalesce(p_query, '')), '');
  srt := case when p_sort in ('highest', 'lowest') then p_sort else 'newest' end;

  return query
  select r.id,
         r.title,
         r.body,
         r.overall_rating,
         coalesce(pr.display_name, 'Anonymous'),
         case
           when r.hospital_id is not null then 'hospital'
           when r.doctor_id is not null then 'doctor'
           when r.pharmacy_id is not null then 'pharmacy'
           when r.lab_id is not null then 'lab'
           else 'provider'
         end,
         coalesce(
           (select h.name from public.hospitals h where h.id = r.hospital_id),
           (select d.name from public.doctors d where d.id = r.doctor_id),
           (select ph.name from public.pharmacies ph where ph.id = r.pharmacy_id),
           (select l.name from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce(
           (select h.slug from public.hospitals h where h.id = r.hospital_id),
           (select d.slug from public.doctors d where d.id = r.doctor_id),
           (select ph.slug from public.pharmacies ph where ph.id = r.pharmacy_id),
           (select l.slug from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id), false),
         (select resp.body from public.provider_responses resp where resp.review_id = r.id limit 1),
         r.created_at
  from public.reviews r
  left join public.profiles pr on pr.id = r.owner_id
  where r.status = 'published'
    and (
      q is null
      or r.title ilike '%' || q || '%'
      or r.body ilike '%' || q || '%'
      or coalesce(pr.display_name, '') ilike '%' || q || '%'
      -- Searching a provider NAME must match: the page searches hospitals and
      -- doctors, not just review text.
      or exists (select 1 from public.hospitals h where h.id = r.hospital_id and h.name ilike '%' || q || '%')
      or exists (select 1 from public.doctors d where d.id = r.doctor_id and d.name ilike '%' || q || '%')
      or exists (select 1 from public.pharmacies ph where ph.id = r.pharmacy_id and ph.name ilike '%' || q || '%')
      or exists (select 1 from public.labs l where l.id = r.lab_id and l.name ilike '%' || q || '%')
    )
    and (p_rating is null or r.overall_rating = p_rating)
    and (
      p_kind is null or p_kind = '' or
      (p_kind = 'hospital' and r.hospital_id is not null) or
      (p_kind = 'doctor' and r.doctor_id is not null) or
      (p_kind = 'pharmacy' and r.pharmacy_id is not null) or
      (p_kind = 'lab' and r.lab_id is not null)
    )
    and (
      p_verified_only is not true
      or coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id), false)
    )
    -- Keyset cursor. Each sort uses its OWN total order so pages never skip or
    -- duplicate a row:
    --   newest  → (created_at, id) descending
    --   highest → (rating, created_at, id) descending
    --   lowest  → (rating ascending) then (created_at, id) descending
    and (
      case srt
        when 'highest' then
          p_before_created is null
          or (r.overall_rating, r.created_at, r.id) < (p_before_rating, p_before_created, p_before_id)
        when 'lowest' then
          p_before_created is null
          or r.overall_rating > p_before_rating
          or (r.overall_rating = p_before_rating and (r.created_at, r.id) < (p_before_created, p_before_id))
        else
          p_before_created is null or (r.created_at, r.id) < (p_before_created, p_before_id)
      end
    )
  order by
    case when srt = 'highest' then r.overall_rating end desc nulls last,
    case when srt = 'lowest' then r.overall_rating end asc nulls last,
    r.created_at desc,
    r.id desc
  limit lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Real published-only facets (counts + provider list for filter options).
--    Every number is computed from published rows — nothing is invented.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_public_review_facets()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  select jsonb_build_object(
    'total', (select count(*) from public.reviews r where r.status = 'published'),
    'verified', (
      select count(*) from public.reviews r
      where r.status = 'published'
        and coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id), false)
    ),
    'hospitals', (select count(*) from public.reviews r where r.status = 'published' and r.hospital_id is not null),
    'doctors', (select count(*) from public.reviews r where r.status = 'published' and r.doctor_id is not null),
    'pharmacies', (select count(*) from public.reviews r where r.status = 'published' and r.pharmacy_id is not null),
    'labs', (select count(*) from public.reviews r where r.status = 'published' and r.lab_id is not null),
    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object('rating', s.stars, 'count', s.n) order by s.stars desc)
      from (
        select g.stars, (select count(*) from public.reviews r where r.status = 'published' and r.overall_rating = g.stars) as n
        from generate_series(1, 5) as g(stars)
      ) s
    ), '[]'::jsonb),
    'providers', coalesce((
      select jsonb_agg(jsonb_build_object('kind', p.kind, 'name', p.name, 'slug', p.slug, 'count', p.n) order by p.n desc, p.name)
      from (
        select 'hospital' as kind, h.name, h.slug, count(*) as n
        from public.reviews r join public.hospitals h on h.id = r.hospital_id
        where r.status = 'published'
        group by h.name, h.slug
        union all
        select 'doctor' as kind, d.name, d.slug, count(*) as n
        from public.reviews r join public.doctors d on d.id = r.doctor_id
        where r.status = 'published'
        group by d.name, d.slug
        union all
        select 'pharmacy' as kind, ph.name, ph.slug, count(*) as n
        from public.reviews r join public.pharmacies ph on ph.id = r.pharmacy_id
        where r.status = 'published'
        group by ph.name, ph.slug
        union all
        select 'lab' as kind, l.name, l.slug, count(*) as n
        from public.reviews r join public.labs l on l.id = r.lab_id
        where r.status = 'published'
        group by l.name, l.slug
      ) p
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Grants: these two are the PUBLIC read path, so anon + authenticated may
--    EXECUTE. No write is ever granted.
-- ---------------------------------------------------------------------------
do $$
begin
  execute 'grant execute on function public.carelink_public_reviews_cursor(text,smallint,text,boolean,text,timestamptz,uuid,smallint,int) to anon';
  execute 'grant execute on function public.carelink_public_reviews_cursor(text,smallint,text,boolean,text,timestamptz,uuid,smallint,int) to authenticated';
  execute 'grant execute on function public.carelink_public_review_facets() to anon';
  execute 'grant execute on function public.carelink_public_review_facets() to authenticated';
  execute 'revoke insert, update, delete on public.reviews from anon';
exception
  when undefined_object then null;  -- roles absent outside Supabase
end $$;

-- ---------------------------------------------------------------------------
-- 4. Keyset index for the public cursor (published rows only).
-- ---------------------------------------------------------------------------
create index if not exists reviews_public_keyset_idx
  on public.reviews (created_at desc, id desc)
  where status = 'published';
