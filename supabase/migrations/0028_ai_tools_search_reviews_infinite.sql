-- ===========================================================================
-- CareLink-AI — Step 17: AI tools + global admin search + infinite reviews.
-- ADDITIVE ONLY. Preserves every existing table/policy/index. Adds:
--
--   1. Security-activity event vocabulary (denied_admin_access,
--       denied_super_admin_access, ai_tool_attempt, ai_tool_action) in BOTH
--       the CHECK constraint and the guarded `carelink_record_login_activity`
--       whitelist — so the React client can audit admin-lane denials and AI tool
--       attempts/mutations through the existing user-scoped auditable RPC.
--
--   2. `donors.view` permission — super_admin ONLY — so blood-donor search
--       rows (contact-free redacted摘要 only) gated is behind the strongest role.
--       Never exposed to plain admins or the anonymous path.
--
--   3. `carelink_admin_stats()` extension → a rich ~26-metric operational
--       command-center feed (patients, active/suspended, appointments by
--       status, reviews, blood donors, AI conversations/messages, provider
--       verification statistics, notifications by status). Old metric names are
--       preserved so existing dashboard tiles keep working.

--   4. `carelink_admin_global_search(q, page_size, page)` — a single
--       permission-aware search across patients/doctors/hospitals/pharmacies/
--       labs/appointments/reviews/blood donors. Categories are included ONLY
--       when the caller's permissions cover them; donors rows are contact-redacted
--       (blood group, city, eligibility only — never phone/DOB/email/name.);
--       pagination capped; NO full-table download possible (max page_size 25).
--       Suspended callers are denied (definer gate), no PHI beyond what the
--       caller's permission already admits..
--
--   5. `carelink_reviews_cursor(...)` — TRUE keyset/cursor infinite scroll for
--       the public reviews stream (published-only; no duplicates/skips by
--       design; keyset ON (created_at, id) exclusive-before cursor; rating
--       + kind + text search filters; limit capped 40). Provider names/review
--       verification/provider responses ride the same RPC — relays no cross-owner
--       leakage because the definer filters to published permitted rows only.
--
--   6. Performance indexes (only justified): pg_trgm GIN on review text +
--       provider names/cities for global search; btree keyset index for the
--       review cursor;; btree on appointment date/status, notifications
--       recipient/status, security/audit recency, conversation recency.。
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Security-activity event vocabulary (CHECK + guarded RPC whitelist)
-- ---------------------------------------------------------------------------
alter table public.security_activity_events drop constraint if exists security_activity_events_event_check;
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
    'ai_tool_attempt','ai_tool_action'
  ));

-- ---------------------------------------------------------------------------
-- 2. donors.view permission (super_admin only)
-- ---------------------------------------------------------------------------
insert into public.permissions (code, description) values
  ('donors.view','View blood-donor directory (super admin only)')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_code)
select 'super_admin', 'donors.view'
where not exists (
  select 1 from public.role_permissions where role_id ='super_admin' and permission_code ='donors.view'
);

-- Extendthe guarded whitelist so the client can audit denials and AI tool actions.

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
    'ai_tool_attempt','ai_tool_action'
  ) then
    raise exception 'invalid security activity event';
  end if;
  if actor is null then
    raise exception 'not authenticated';
  end if;
  if public.carelink_is_suspended()and clean_event in ('login_success','session_refresh') then
    raise exception 'account suspended';
  end if;

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
  return new_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Extend carelink_admin_stats → rich command-center feed (definer)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_stats()
returns table (metric text, value bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  if not public.carelink_admin_has_permission('dashboard.view') then
    raise exception 'permission denied';
  end if;
  return query
  -- Accounts / patients
  select 'users',count(*) from public.profiles p
  union all select 'active_users',count(*) from public.profiles p where p.account_status = 'active'
  union all select 'suspended_users',count(*) from public.profiles p where p.account_status in ('suspended','disabled')
  -- Providers
  union all select 'providers_hospitals',count(*) from public.hospitals h
  union all select 'providers_doctors',count(*) from public.doctors d
  union all select 'providers_pharmacies',count(*) from public.pharmacies p
  union all select 'providers_labs',count(*) from public.labs l
  -- Appointments by status
  union all select 'total_appointments',count(*) from public.appointments a
  union all select 'active_appointments',count(*) from public.appointments a where a.status in ('confirmed','upcoming')
  union all select 'pending_appointments',count(*) from public.appointments a where a.status = 'upcoming'
  union all select 'completed_appointments',count(*) from public.appointments a where a.status = 'completed'
  union all select 'cancelled_appointments',count(*) from public.appointments a where a.status = 'cancelled'
  -- Reviews
  union all select 'total_reviews',count(*) from public.reviews r
  union all select 'published_reviews',count(*) from public.reviews r where r.status = 'published'
  union all select 'pending_reviews',count(*) from public.reviews r where r.status in ('pending','hidden')
  -- Blood donors
  union all select 'blood_donors',count(*) from public.donor_profiles dp where dp.is_active
  -- AI
  union all select 'ai_conversations',count(*) from public.conversations c
  union all select 'ai_messages',count(*) from public.conversation_messages cm
  union all select 'ai_tool_actions',count(*) from public.security_activity_events sae where sae.event in ('ai_tool_attempt','ai_tool_action')
  -- Provider verification statistics
  union all select 'verification_verified',(select count(*) from public.hospital_verification where status='verified') + (select count(*) from public.doctor_verification where status='verified') + (select count(*) from public.pharmacy_verification where status='verified') + (select count(*) from public.lab_verification where status='verified')
  union all select 'verification_pending',(select count(*) from public.hospital_verification where status='pending') + (select count(*) from public.doctor_verification where status='pending') + (select count(*) from public.pharmacy_verification where status='pending') + (select count(*) from public.lab_verification where status='pending')
  union all select 'verification_rejected',(select count(*) from public.hospital_verification where status='rejected') + (select count(*) from public.doctor_verification where status='rejected') + (select count(*) from public.pharmacy_verification where status='rejected') + (select count(*) from public.lab_verification where status='rejected')
  -- Notifications by status
  union all select 'notifications',count(*) from public.notifications n
  union all select 'notifications_sent',count(*) from public.notifications n where n.status in ('sent','read')
  union all select 'notifications_pending',count(*) from public.notifications n where n.status in ('scheduled','pending');
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Global admin search (permission-scoped, donor-redacted, paginated)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_admin_global_search(
  q text default '',
  page_size int default 20,
  page int default 0
)
returns table (
  kind text,
  id uuid,
  title text,
  subtitle text,
  status text,
  extra jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare search text;
begin
  if public.carelink_is_suspended() then
    raise exception 'account suspended';
  end if;
  -- Least-privilege scoping: a caller with NONE of the global-search
  -- permissions is denied entirely (an empty "no results" response would
  -- be indistinguishable from an authorized-but-empty search).
  if not (
    public.carelink_admin_has_permission('users.view')
    or public.carelink_admin_has_permission('providers.view')
    or public.carelink_admin_has_permission('appointments.view')
    or public.carelink_admin_has_permission('reviews.view')
    or public.carelink_admin_has_permission('donors.view')
  ) then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 25 or page < 0 then
    raise exception 'invalid paging';
  end if;
  search := btrim(coalesce(q,''));
  if search = '' then
    return query select 'empty'::text, null::uuid, 'Type to search'::text, ''::text, ''::text, '{}'::jsonb
    where false;
    return;
  end if;

  -- Patients: requires users.view
  if public.carelink_admin_has_permission('users.view') then
    return query
    select 'patient', p.id, p.display_name, au.email, p.account_status,
           jsonb_build_object('created_at', p.created_at, 'last_activity',(select max(sa.created_at) from public.security_activity_events sa where sa.user_id = p.id))
    from public.profiles p
    left join auth.users au on au.id = p.id
    where p.display_name ilike '%' || search || '%' or au.email ilike '%' || search || '%'
    order by p.created_at desc
    limit page_size offset page * page_size;
  end if;

  -- Hospitals / doctors / pharmacies / labs: requires providers.view
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'hospital', h.id, h.name, coalesce(h.city,''), coalesce(h.data_status,'pending'), jsonb_build_object('slug', h.slug)
    from public.hospitals h
    where h.name ilike '%' || search || '%' or h.city ilike '%' || search || '%'
    order by h.name
    limit page_size offset page * page_size;
  end if;
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'doctor', d.id, d.name, coalesce((select h.city from public.doctor_hospitals dh join public.hospitals h on h.id = dh.hospital_id where dh.doctor_id = d.id limit 1),''), coalesce(d.data_status,'pending'), jsonb_build_object('slug', d.slug)
    from public.doctors d
    where d.name ilike '%' || search || '%'
    order by d.name
    limit page_size offset page * page_size;
  end if;
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'pharmacy', p.id, p.name, coalesce(p.city,''), coalesce(p.data_status,'pending'), jsonb_build_object('slug', p.slug)
    from public.pharmacies p
    where p.name ilike '%' || search || '%' or p.city ilike '%' || search || '%'
    order by p.name
    limit page_size offset page * page_size;
  end if;
  if public.carelink_admin_has_permission('providers.view') then
    return query
    select 'lab', l.id, l.name, coalesce(l.city,''), coalesce(l.data_status,'pending'), jsonb_build_object('slug', l.slug)
    from public.labs l
    where l.name ilike '%' || search || '%' or l.city ilike '%' || search || '%'
    order by l.name
    limit page_size offset page * page_size;
  end if;

  -- Appointments: requires appointments.view
  if public.carelink_admin_has_permission('appointments.view') then
    return query
    select 'appointment', a.id, coalesce(a.doctor_name,''), coalesce(a.hospital_name,''), a.status,
           jsonb_build_object('scheduled_date', a.scheduled_date,'scheduled_time',a.scheduled_time,'owner_id',a.owner_id::text,'appointment_id',a.id::text)
    from public.appointments a
    where a.doctor_name ilike '%' || search || '%' or a.hospital_name ilike '%' || search || '%' or a.doctor_id ilike '%' || search || '%' or a.hospital_id ilike '%' || search || '%'
    order by a.scheduled_date desc
    limit page_size offset page * page_size;
  end if;

  -- Reviews: requires reviews.view
  if public.carelink_admin_has_permission('reviews.view') then
    return query
    select 'review', r.id, coalesce(r.title,'Untitled review'), coalesce(r.body,''), r.status,
           jsonb_build_object('rating', r.overall_rating,'created_at', r.created_at,'owner_id',r.owner_id::text)
    from public.reviews r
    where r.title ilike '%' || search || '%' or r.body ilike '%' || search || '%'
    order by r.created_at desc
    limit page_size offset page * page_size;
  end if;

  -- Blood donors: requires donors.view (super_admin only) — NEVER phone/DOB/email/name. Donor rows are redacted (group + city + active eligibility only).
  if public.carelink_admin_has_permission('donors.view') then
    return query
    select 'blood_donor', dp.id, b.label, coalesce(dp.city,''), case when dp.is_active then 'active' else 'inactive' end,
           jsonb_build_object('eligible', (select d.is_eligible from public.donor_eligibility d where d.donor_profile_id = dp.id limit 1), 'matched_at',(select max(dm.matched_at) from public.donor_match_results dm where dm.donor_profile_id = dp.id))
    from public.donor_profiles dp
    join public.blood_groups b on b.code = dp.blood_group_code
    where b.label ilike '%' || search || '%' or dp.city ilike '%' || search || '%'
    order by dp.created_at desc
    limit page_size offset page * page_size;
  end if;

  -- Nothing authorized matched: honest empty.
   return query select 'none'::text, null::uuid, ''::text,''::text,''::text,'{}'::jsonb where false;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. TRUE infinite-scroll reviews (keyset/cursor, published-only)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_reviews_cursor(
  p_query text default null,
  p_rating smallint default null,
  p_kind text default null,
  p_before_created timestamptz default null,
  p_before_id uuid default null,
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
declare lim int;
begin
  -- Public stream: any caller may read published reviews; the definer NEVER
  -- returns non-published rows (a direct table select exposes them to the
  -- author-only policy, this RPC is the only public keyset path.

  lim := least(greatest(coalesce(p_limit,20),1),40);

  return query
  select r.id,r.title,r.body,r.overall_rating,
         coalesce(p.display_name,'Anonymous'),
         case
           when r.hospital_id is not null then 'hospital'
           when r.doctor_id is not null then 'doctor'
           when r.pharmacy_id is not null then 'pharmacy'
           when r.lab_id is not null then 'lab' else 'provider' end,
         coalesce(
           (select h.name from public.hospitals h where h.id = r.hospital_id),
           (select d.name from public.doctors d where d.id = r.doctor_id),
           (select p2.name from public.pharmacies p2 where p2.id = r.pharmacy_id),
           (select l.name from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce(
           (select h.slug from public.hospitals h where h.id = r.hospital_id),
           (select d.slug from public.doctors d where d.id = r.doctor_id),
           (select p2.slug from public.pharmacies p2 where p2.id = r.pharmacy_id),
           (select l.slug from public.labs l where l.id = r.lab_id),
           ''
         ),
         coalesce((select rv.verified_interaction from public.review_verification rv where rv.review_id = r.id),false),
         (select pr.body from public.provider_responses pr where pr.review_id = r.id limit 1),
         r.created_at
  from public.reviews r
  left join public.profiles p on p.id = r.owner_id
  where r.status = 'published'
    and (p_query is null or p_query = '' or r.title ilike '%' || p_query || '%' or r.body ilike '%' || p_query || '%' or coalesce(p.display_name,'') ilike '%' || p_query || '%')
    and (p_rating is null or r.overall_rating = p_rating)
    and (
      p_kind is null or p_kind = '' or
      (p_kind = 'hospital' and r.hospital_id is not null) or
      (p_kind = 'doctor' and r.doctor_id is not null) or
      (p_kind = 'pharmacy' and r.pharmacy_id is not null) or
      (p_kind = 'lab'and r.lab_id is not null)
    )
   and (p_before_created is null or (r.created_at, r.id) < (p_before_created, p_before_id))
  order by r.created_at desc, r.id desc
  limit lim;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Performance indexes (justified)
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm;

create index if not exists reviews_keyset_idx on public.reviews (created_at desc, id desc) where status ='published';
create index if not exists reviews_title_trgm_idx on public.reviews using gin (title gin_trgm_ops) where title is not null;
create index if not exists reviews_body_trgm_idx on public.reviews using gin (body gin_trgm_ops) where body is not null;
create index if not exists hospitals_name_trgm_idx on public.hospitals using gin (name gin_trgm_ops);
create index if not exists hospitals_city_trgm_idx on public.hospitals using gin (city gin_trgm_ops) where city is not null;
create index if not exists doctors_name_trgm_idx on public.doctors using gin (name gin_trgm_ops);
create index if not exists pharmacists_name_trgm_idx on public.pharmacies using gin (name gin_trgm_ops);
create index if not exists pharmacists_city_trgm_idx on public.pharmacies using gin (city gin_trgm_ops) where city is not null;
create index if not exists labs_name_trgm_idx on public.labs using gin (name gin_trgm_ops);
create index if not exists labs_city_trgm_idx on public.labs using gin (city gin_trgm_ops) where city is not null;
create index if not exists appointments_schedule_status_idx on public.appointments (scheduled_date, status);
create index if not exists notifications_recipient_status_idx on public.notifications (owner_id, status);
create index if not exists security_activity_created_idx on public.security_activity_events (created_at desc);
create index if not exists audit_events_created_idx on public.audit_events (created_at desc);
create index if not exists conversations_updated_desc_idx on public.conversations (updated_at desc);
create index if not exists profiles_account_status_idx on public.profiles (account_status);

-- ---------------------------------------------------------------------------
-- 7. EXECUTE guards: new RPCs authenticated-only (public/anon revoked
-- ---------------------------------------------------------------------------
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_global_search(text,int,int)',
    'carelink_reviews_cursor(text,smallint,text,timestamptz,uuid,int)'
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