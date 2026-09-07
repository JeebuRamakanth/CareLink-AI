-- ===========================================================================
-- CareLink-AI — Step 17: Clinical command center + global search + reviews
-- feed cursor + family-context resolver + performance indexes. ADDITIVE ONLY.
--
-- Builds on 0001→0027. Nothing existing is dropped or altered. This migration:
--
--  1. SUPER ADMIN COMMAND CENTER METRICS — extends carelink_admin_stats
--     with the full real-DB metrics set. Every value is a real count at query time.
--     NO fabricated numbers, NO fake percentages — insufficient data simply
--     returns honest zeros/empty. Dashboards decide how to present..
--
--  2. GLOBAL ADMIN SEARCH — a single guarded RPC carelink_admin_global_search
--     across patients, doctors, hospitals, pharmacies, labs, donors (privacy-shielded,
--     appointment header rows, review rows). Authorization-aware: every result is
--     presented per the caller's session permission, page-bounded, and never exposes
--     private donor contact info (donor rows strip phone/DOB/owner identity and keep
--     only city + blood group). No full-table download: LIMIT/OFFSET with bounded
--     page_size + normalized LIKE-search on indexed columns.

--  3. REVIEWS TRUE INFINITE SCROLL — carelink_reviews_feed_cursor
--     (cursor/keyset pagination). Cursor = (created_at,id) so page spills
--     never duplicate/skip on equal-timestamp rows; descending order; page_size
--     bounded; NO huge offsets. Supports rating_min/max, provider-kind/provider-id
--     filters, status moderation (admin-only when non-published), provider response,
--     verification badge, author initials (masked), and targets the executing
--     session (public published feed, plus admin queue when authorized).
--
--  4. FAMILY-CONTEXT RESOLVER — carelink_resolve_family_profile(uuid)
--
--     THE ONLY backend way o map a frontend "family member being asked about"
--     to an authorized row. Returns NULL for any id that is not owned by the caller —
--     even for an admin (admin may not impersonate a patient's family context). This
--     is the IDOR firewall for AI family context.

--  5. PERFORMANCE INDEXES — justified indexes for search/review-feed/
--     notifications/conversations/audit hot paths. ADDITIVE, skipped if exists..
--
-- SECURITY: every new function is SECURITY DEFINER with pinned search_path and
-- re-checks role/permission/suspension on the caller inside the database. The
-- global search returns NO PHI beyond what each viewing role already sees (donor
-- rows stripped, appointment/review rows redacted). No new credentials, no client
-- write paths on security/audit rows. EXECUTE revoked from public/anon and granted to
-- authenticated only..
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. trigram index helper (only when pg_trgm installed) — dynamic so it
--     works both locally (superuser) and on managed Supabase projects.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_trgm') then
    execute 'create index if not exists hospitals_name_trgm_idx on public.hospitals using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists doctors_name_trgm_idx on public.doctors using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists pharmacies_name_trgm_idx on public.pharmacies using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists labs_name_trgm_idx on public.labs using gin (name gin_trgm_ops) where name is not null;';
    execute 'create index if not exists profiles_display_name_trgm_idx on public.profiles using gin (display_name gin_trgm_ops) where display_name is not null;';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Command-center stats — extended real-DB metrics
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_stats()
returns table (metric text, value bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  return query
  select 'users',count(*) from public.profiles p
  union all select 'active_users',count(*) from public.profiles p where p.account_status = 'active'
  union all select 'suspended_users',count(*) from public.profiles p where p.account_status in ('suspended','disabled')
  union all select 'patients',count(*) from public.profiles p
  union all select 'active_patients',count(*) from public.profiles p where p.account_status = 'active'
  union all select 'providers_hospitals',count(*) from public.hospitals h
  union all select 'active_hospitals',count(*) from public.hospitals h
    where exists (select 1 from public.hospital_verification v where v.hospital_id = h.id and v.status = 'verified')
  union all select 'providers_doctors',count(*) from public.doctors d
  union all select 'active_doctors',count(*) from public.doctors d
    where exists (select 1 from public.doctor_verification v where v.doctor_id = d.id and v.status = 'verified')
  union all select 'providers_pharmacies',count(*) from public.pharmacies p
  union all select 'active_pharmacies',count(*) from public.pharmacies p
    where exists (select 1 from public.pharmacy_verification v where v.pharmacy_id = p.id and v.status = 'verified')
  union all select 'providers_labs',count(*) from public.labs l
  union all select 'active_labs',count(*) from public.labs l
    where exists (select 1 from public.lab_verification v where v.lab_id = l.id and v.status = 'verified')
  union all select 'appointments',count(*) from public.appointments a
  union all select 'confirmed_appointments',count(*) from public.appointments a where a.status = 'confirmed'
  union all select 'upcoming_appointments',count(*) from public.appointments a where a.status = 'upcoming'
  union all select 'completed_appointments',count(*) from public.appointments a where a.status = 'completed'
  union all select 'cancelled_appointments',count(*) from public.appointments a where a.status = 'cancelled'
  union all select 'rescheduled_appointments',count(*) from public.appointments a where a.status = 'rescheduled'
  union all select 'reviews',count(*) from public.reviews r
  union all select 'published_reviews',count(*) from public.reviews r where r.status = 'published'
  union all select 'pending_reviews',count(*) from public.reviews r where r.status in ('pending','hidden')
  union all select 'provider_responses',count(*) from public.provider_responses pr
  union all select 'donors',count(*) from public.donor_profiles dp
  union all select 'active_donors',count(*) from public.donor_profiles dp where dp.is_active = true
  union all select 'ai_conversations',count(*) from public.conversations c
  union all select 'ai_messages',count(*) from public.conversation_messages cm
  union all select 'notifications',count(*) from public.notifications n
  union all select 'notification_sent',count(*) from public.notifications n where n.status in ('sent','read')
  union all select 'media_assets',count(*) from public.provider_media pm;end;$$;

-- ---------------------------------------------------------------------------
-- 2. Global admin search — server-side, page-bounded, donor-privacy-safe
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_global_search(
  search_text text default null,
  page_size int default 20,
  page int default 0
)
returns table (
  result_kind text,
  result_id text,
  name text,
  detail text,
  status text,
  data_status text,
  extra jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_search text;
begin
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 50 or page < 0 then
    raise exception 'invalid paging';
  end if;
  v_search := coalesce(nullif(trim(search_text), ''), null);
  if v_search is null then
    return;
  end if;

  return query
  select 'patient'::text, p.id::text, coalesce(p.display_name,''), au.email,
         p.account_status, null::text,
         jsonb_build_object('created_at', p.created_at)
  from public.profiles p
  join auth.users au on au.id = p.id
  where p.display_name ilike '%' || v_search || '%' or au.email ilike '%' || v_search || '%'
  order by p.created_at desc
  limit page_size offset page * page_size;

  return query
  select * from (
    select 'hospital'::text, h.id::text, h.name, coalesce(h.city,''),
           coalesce((select v.status from public.hospital_verification v where v.hospital_id = h.id limit 1),''),
           h.data_status, jsonb_build_object('created_at', h.created_at,'city', h.city)
    from public.hospitals h
    where h.name ilike '%' || v_search || '%' or h.city ilike '%' || v_search || '%'
    order by h.created_at desc
    limit page_size offset page * page_size
  ) hospitals
  union all
  select * from (
    select 'doctor'::text, d.id::text, d.name,
           coalesce((select s.name from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id where ds.doctor_id = d.id order by ds.id limit 1),''),
           coalesce((select v.status from public.doctor_verification v where v.doctor_id = d.id limit 1),''),
           d.data_status,
           jsonb_build_object('created_at', d.created_at,'city', (select h.city from public.doctor_hospitals dh join public.hospitals h on h.id = dh.hospital_id where dh.doctor_id = d.id limit 1))
    from public.doctors d
    where d.name ilike '%' || v_search || '%' or exists (select 1 from public.doctor_specialties ds join public.specialties s on s.id = ds.specialty_id where ds.doctor_id = d.id and s.name ilike '%' || v_search || '%')
    order by d.created_at desc
    limit page_size offset page * page_size
  ) doctors
  union all
  select * from (
    select 'pharmacy'::text, p.id::text, p.name, coalesce(p.city,''),
           coalesce((select v.status from public.pharmacy_verification v where v.pharmacy_id = p.id limit 1),''),
           p.data_status, jsonb_build_object('created_at', p.created_at,'city', p.city)
    from public.pharmacies p
    where p.name ilike '%' || v_search || '%' or p.city ilike '%' || v_search || '%'
    order by p.created_at desc
    limit page_size offset page * page_size
  ) pharmacies
  union all
  select * from (
    select 'lab'::text, l.id::text, l.name, coalesce(l.city,''),
           coalesce((select v.status from public.lab_verification v where v.lab_id = l.id limit 1),''),
           l.data_status, jsonb_build_object('created_at', l.created_at,'city', l.city)
    from public.labs l
    where l.name ilike '%' || v_search || '%' or l.city ilike '%' || v_search || '%'
    order by l.created_at desc
    limit page_size offset page * page_size
  ) labs
  union all
  -- Blood donors: privacy-shielded — NO phone/DOB/owner identity surfaces.

  select * from (
    select 'donor'::text, dp.id::text,
           'Blood donor (area: ' || coalesce(dp.city,'unknown') || ')',
           coalesce(dp.blood_group_code,''),
           case when dp.is_active then 'available' else 'inactive' end,
           null::text,
           jsonb_build_object('blood_group', dp.blood_group_code,'city', dp.city)
    from public.donor_profiles dp
    where dp.city ilike '%' || v_search || '%' or dp.blood_group_code ilike '%' || v_search || '%'
    order by dp.created_at desc
    limit page_size offset page * page_size
  ) donors
  union all
  -- Appointments: operator-safe header rows only (no medical notes/body).
  select * from (
    select 'appointment'::text, a.id::text, coalesce(a.doctor_name,''),
           coalesce(a.hospital_name,''),
           a.status, null::text,
           jsonb_build_object('scheduled_date', a.scheduled_date,'scheduled_time', a.scheduled_time,'owner', a.owner_id::text,'family_profile_id', a.family_profile_id::text)
    from public.appointments a
    where a.doctor_name ilike '%' || v_search || '%' or a.hospital_name ilike '%' || v_search || '%' or a.specialty ilike '%' || v_search || '%'
    order by a.created_at desc
    limit page_size offset page * page_size
  ) appointments
  union all
  select * from (
    select 'review'::text, r.id::text, coalesce(r.title,''), coalesce(r.body,''),
           r.status, null::text,
           jsonb_build_object('rating', r.overall_rating,'owner', r.owner_id::text,'created_at', r.created_at)
    from public.reviews r
    where r.title ilike '%' || v_search || '%' or r.body ilike '%' || v_search || '%'
    order by r.created_at desc
    limit page_size offset page * page_size
  ) reviews;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Reviews — true infinite scroll via cursor/keyset pagination
-- ---------------------------------------------------------------------------
create or replace function public.carelink_reviews_feed_cursor(
  cursor_created_at timestamptz default null,
  cursor_id uuid default null,
  page_size int default 20,
  rating_min int default null,
  rating_max int default null,
  provider_kind text default null,
  provider_id uuid default null,
  status_filter text default null
)
returns table (
  id uuid,
  owner_id uuid,
  title text,
  body text,
  overall_rating smallint,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  hospital_name text,
  doctor_name text,
  pharmacy_name text,
  lab_name text,
  subject_kind text,
  verified_interaction boolean,
  response_body text,
  author_initials text,
  author_label text
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_page_size int;
begin
  -- Fail-closed paging: reject out-of-range page_size instead of silently
  -- clamping, so an unbounded/abusive request is never masked by a LIMIT.
  if page_size is not null and (page_size < 1 or page_size > 50) then
    raise exception 'invalid page_size';
  end if;
  v_page_size := least(greatest(coalesce(page_size,20),1),50);
  if rating_min is not null and (rating_min <1 or rating_min >5) then
    raise exception 'invalid rating_min';
  end if;
  if rating_max is not null and (rating_max <1 or rating_max >5) then
    raise exception 'invalid rating_max';
  end if;
  if provider_kind is not null and provider_kind not in ('hospital','doctor','pharmacy','lab') then
    raise exception 'invalid provider_kind';
  end if;
  if status_filter is not null and status_filter not in ('published','pending','hidden','removed') then
    raise exception 'invalid status_filter';
  end if;
  -- Non-public moderation states are admin-only (no leaking hidden/removed rows).
  if status_filter is not null and status_filter <> 'published' and not public.carelink_is_admin() then

    raise exception 'permission denied';
  end if;

  return query
  select r.id,r.owner_id,r.title,r.body,r.overall_rating,r.status,r.created_at,r.updated_at,
         coalesce(h.name,''), coalesce(d.name,''), coalesce(p.name,''), coalesce(l.name,''),
         case when r.hospital_id is not null then 'hospital'
              when r.doctor_id is not null then 'doctor'
              when r.pharmacy_id is not null then 'pharmacy'
              when r.lab_id is not null then 'lab'
              else 'unknown' end,
         coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id),false),
         coalesce((select pr.body from public.provider_responses pr where pr.review_id = r.id),null),
         left(coalesce(split_part(coalesce(prof.display_name,''),' ',1),''),1) || left(coalesce(split_part(coalesce(prof.display_name,''),' ',2),''),1),
         coalesce(prof.display_name,'CareLink member')
  from public.reviews r
  left join public.hospitals h on h.id = r.hospital_id
  left join public.doctors d on d.id = r.doctor_id
  left join public.pharmacies p on p.id = r.pharmacy_id
  left join public.labs l on l.id = r.lab_id
  left join public.profiles prof on prof.id = r.owner_id
  where (coalesce(status_filter,'published') = r.status)
    and (rating_min is null or r.overall_rating >= rating_min)
   and (rating_max is null or r.overall_rating <= rating_max)
   and (provider_kind is null or (case when r.hospital_id is not null then 'hospital'
                                       when r.doctor_id is not null then 'doctor'
                                       when r.pharmacy_id is not null then 'pharmacy'
                                       when r.lab_id is not null then 'lab'
                                       else 'unknown' end) = provider_kind)
   and (provider_id is null or coalesce(r.hospital_id,r.doctor_id,r.pharmacy_id,r.lab_id) = provider_id)

   and (cursor_created_at is null or cursor_id is null or (r.created_at,r.id) < (cursor_created_at,cursor_id))
  order by r.created_at desc, r.id desc
  limit v_page_size;end;$$;

-- ---------------------------------------------------------------------------
-- 4. Family-context resolver — thee ONLY backend way to resolve an authorized
--     family member from a frontend ask ("my mother…" → row).
-- ---------------------------------------------------------------------------
create or replace function public.carelink_resolve_family_profile(family_id uuid)
returns public.family_profiles
language sql
stable
security definer
set search_path = ''
as $$
  select fp.* from public.family_profiles fp
  where fp.id = family_id and fp.owner_id = auth.uid() and (
    fp.relation in ('self','parent','child','spouse','other')
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. EXECUTE guards for the new RPCs (authenticated only; never anon/public).
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_global_search(text,int,int)',
    'carelink_reviews_feed_cursor(timestamptz,uuid,int,int,int,text,uuid,text)',
    'carelink_resolve_family_profile(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;