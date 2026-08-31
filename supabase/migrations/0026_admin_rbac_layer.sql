-- CareLink-AI — Step 2: admin RBAC operation layer. ADDITIVE..
-- Builds on 0025 (account status + permission model)。 Adds real, guarded
-- admin RPCs scoped by permission codes + suspension-aware gates..
-- ===========================================================================

-- 1. Account notification kind (so suspension/reactivation reach the user)
alter table public.notification_templates drop constraint if exists notification_templates_kind_check;
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notification_templates
  add constraint notification_templates_kind_check
  check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup','account'));
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup','account'));

insert into public.notification_templates (code,kind,title_template,body_template,channel)
values
  ('account_status_changed','account','Account status updated','Your CareLink account status was updated.','in_app'),
  ('account_suspended','account','Account suspended','Your CareLink account has been suspended.','in_app'),
  ('account_reactivated','account','Account reactivated','Your CareLink account has been reactivated.','in_app'),
  ('account_disabled','account','Account disabled','Your CareLink account has been disabled.','in_app')
on conflict (code) do nothing;

-- 2. Admin read policies (writes ride guarded RPCs below)
drop policy if exists profiles_admin_select on public.profiles;
 create policy profiles_admin_select on public.profiles
  for select using (public.carelink_is_admin());
drop policy if exists security_activity_admin_select on public.security_activity_events;
create policy security_activity_admin_select on public.security_activity_events
  for select using (public.carelink_is_admin());

-- 3. Active-admin gate (not suspended)
create or replace function public.carelink_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (public.carelink_is_admin() and not public.carelink_is_suspended());
$$;

create or replace function public.carelink_admin_has_permission(permission_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (not public.carelink_is_suspended()  and (public.carelink_has_permission(permission_code)) or public.carelink_is_super_admin());
$$;

-- 4. Real-data admin readers (permission + suspension gates on every call)
create or replace function public.carelink_admin_list_users(
  search_text text default null,
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, email text, display_name text, account_status text, roles text[], created_at timestamptz, last_activity_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('users.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  return query
  select p.id, au.email, p.display_name, p.account_status,
         coalesce((select array_agg(ur.role_id order by ur.role_id)from public.user_roles ur where ur.user_id = p.id), array[]::text[]),
         p.created_at,
         (select max(sa.created_at)from public.security_activity_events sa where sa.user_id = p.id)
  from public.profiles p
  left join auth.users au on au.id = p.id
  where (search_text is null or p.display_name ilike '%' || search_text || '%' or au.email ilike '%' || search_text || '%')
    and (status_filter is null or p.account_status = status_filter)
  order by p.created_at desc
  limit page_size offset page * page_size;
end;
$$;

create or replace function public.carelink_admin_list_security_activity(
  limit_n int default 100,
  user_filter uuid default null
)
returns table (id uuid, user_id uuid, event text, metadata jsonb, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('security.view') then
    raise exception 'permission denied';
  end if;
  if limit_n < 1 or limit_n > 500 then
    raise exception 'invalid limit';
  end if;
  return query
  select sa.id, sa.user_id, sa.event, sa.metadata, sa.created_at
  from public.security_activity_events sa
  where (user_filter is null or sa.user_id = user_filter)
  order by sa.created_at desc
  limit limit_n;end;$$;

create or replace function public.carelink_admin_list_audit(
  limit_n int default 100,
  action_filter text default null
)
returns table (id uuid, actor_id uuid, action text, target_table text, target_id uuid, safe_message text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('audit.view') then
    raise exception 'permission denied';
  end if;
  if limit_n < 1 or limit_n > 500 then
    raise exception 'invalid limit';
  end if;
  return query
  select ae.id, ae.actor_id, ae.action, ae.target_table, ae.target_id, ae.safe_message, ae.created_at
  from public.audit_events ae
  where (action_filter is null or ae.action = action_filter)
  order by ae.created_at desc
  limit limit_n;end;$$;

create or replace function public.carelink_admin_list_providers(
  kind text,
  search_text text default null,
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, slug text, name text, city text, data_status text, verification_status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('providers.view') then
    raise exception 'permission denied';
  end if;
  if kind not in ('hospital','doctor','pharmacy','lab') then
    raise exception 'invalid provider kind';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  if kind = 'hospital' then
    return query
    select h.id,h.slug,h.name,h.city,h.data_status,hv.status,h.created_at
    from public.hospitals h
    left join public.hospital_verification hv on hv.hospital_id = h.id
    where (search_text is null or h.name ilike '%' || search_text || '%' or h.city ilike '%' || search_text || '%')
      and (status_filter is null or hv.status = status_filter)
    order by h.created_at desc
    limit page_size offset page * page_size;
  elsif kind = 'doctor' then
    return query
    select d.id,d.slug,d.name,
           coalesce((select h.city from public.doctor_hospitals dh join public.hospitals h on h.id = dh.hospital_id where dh.doctor_id = d.id limit 1), 'city'::text),
           d.data_status,dv.status,d.created_at
    from public.doctors d
    left join public.doctor_verification dv on dv.doctor_id = d.id
    where (search_text is null or d.name ilike '%' || search_text || '%')
      and (status_filter is null or dv.status = status_filter)
    order by d.created_at desc
    limit page_size offset page * page_size;
  elsif kind = 'pharmacy' then
    return query
    select p.id,p.slug,p.name,p.city,p.data_status,pv.status,p.created_at
    from public.pharmacies p
    left join public.pharmacy_verification pv on pv.pharmacy_id = p.id
    where (search_text is null or p.name ilike '%' || search_text || '%' or p.city ilike '%' || search_text || '%')
      and (status_filter is null or pv.status = status_filter)
    order by p.created_at desc
    limit page_size offset page * page_size;
  else
    return query
    select l.id,l.slug,l.name,l.city,l.data_status,lv.status,l.created_at
    from public.labs l
    left join public.lab_verification lv on lv.lab_id = l.id
    where (search_text is null or l.name ilike '%' || search_text || '%' or l.city ilike '%' || search_text || '%')
      and (status_filter is null or lv.status = status_filter)
    order by l.created_at desc
    limit page_size offset page * page_size;
  end if;
end;
$$;

create or replace function public.carelink_admin_list_reviews(
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, owner_id uuid, rating smallint, status text, title text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('reviews.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  return query
  select r.id,r.owner_id,r.overall_rating,r.status,r.title,r.created_at
  from public.reviews r
  where (status_filter is null or r.status = status_filter)
  order by r.created_at desc
  limit page_size offset page * page_size;end;$$;

create or replace function public.carelink_admin_list_appointments(
  status_filter text default null,
  page_size int default 50,
  page int default 0
)
returns table (id uuid, owner_id uuid, doctor_name text, hospital_name text, scheduled_date date, scheduled_time time, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('appointments.view') then
    raise exception 'permission denied';
  end if;
  if page_size < 1 or page_size > 100 or page < 0 then
    raise exception 'invalid paging';
  end if;
  return query
  select a.id,a.owner_id,a.doctor_name,a.hospital_name,a.scheduled_date,a.scheduled_time,a.status,a.created_at
  from public.appointments a
  where (status_filter is null or a.status = status_filter)
  order by a.created_at desc
  limit page_size offset page * page_size;end;$$;

create or replace function public.carelink_admin_list_notifications(
  status_filter text default null,
  limit_n int default 100
)
returns table (id uuid, owner_id uuid, kind text, title text, status text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('notifications.view') then
    raise exception 'permission denied';
  end if;
  if limit_n < 1 or limit_n > 500 then
    raise exception 'invalid limit';
  end if;
  return query
  select n.id,n.owner_id,n.kind,n.title,n.status,n.created_at
  from public.notifications n
  where (status_filter is null or n.status = status_filter)
  order by n.created_at desc
  limit limit_n;end;$$;

-- 5. Dashboard stats (real counts only; never fabricated)
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
  union select 'suspended_users',count(*) from public.profiles p where p.account_status = 'suspended'
  union select 'active_appointments',count(*) from public.appointments a where a.status in ('confirmed','upcoming')
  union select 'published_reviews',count(*) from public.reviews r where r.status = 'published'
  union select 'pending_reviews',count(*) from public.reviews r where r.status in ('pending','hidden')
  union select 'providers_hospitals',count(*) from public.hospitals h
  union select 'providers_doctors',count(*) from public.doctors d
  union select 'providers_pharmacies',count(*) from public.pharmacies p
  union select 'providers_labs',count(*) from public.labs l
  union select 'notifications',count(*) from public.notifications n;end;$$;

-- 6. Suspend / reactivate / disable (users.manage gate;
create or replace function public.carelink_admin_set_account_status(
  target_user uuid,
  new_status text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare current_status text;
declare notif_template text;
declare activity_event text;
begin
  if not public.carelink_admin_has_permission('users.manage') then
    raise exception 'permission denied';
  end if;
  if new_status not in ('active','suspended','disabled') then
    raise exception 'invalid account status';
  end if;
  select account_status into current_status from public.profiles where id = target_user;
  if current_status is null then
    raise exception 'profile not found';
  end if;
  if current_status = new_status then
    return;
  end if;
  if new_status = 'active' then
    notif_template := 'account_reactivated';
    activity_event := 'account_reactivated';
  elsif new_status = 'disabled' then
    notif_template := 'account_disabled';
    activity_event := 'account_disabled';
  else
    notif_template := 'account_suspended';
    activity_event := 'account_suspended';
  end if;
  update public.profiles
  set account_status = new_status,
      suspended_at = case when new_status in ('suspended','disabled') then now() else null end,
      suspended_reason = case when new_status in ('suspended','disabled') then left(coalesce(reason,''),300) else null end
  where id = target_user;
  perform public.carelink_record_audit('account_status_changed','profiles', target_user,'status: ' || current_status || ' -> ' || new_status);
  perform public.carelink_record_login_activity(activity_event, jsonb_build_object('target', target_user::text,'status', new_status));
  insert into public.notifications (id,owner_id,kind,template_code,title,body,status,scheduled_for)
  values (gen_random_uuid(), target_user,'account',notif_template,'Account status updated',left(coalesce(reason,''),180),'scheduled',now())
 on conflict (id) do nothing;end;$$;

-- 7. Grant / revoke roles with the roles.manage gate (super_admin only)
create or replace function public.carelink_admin_grant_user_role(target_user uuid, role_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('roles.manage') then
    raise exception 'permission denied';
  end if;
  return public.carelink_grant_role(target_user, role_name);end;$$;

create or replace function public.carelink_admin_revoke_user_role(target_user uuid, role_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_admin_has_permission('roles.manage') then
    raise exception 'permission denied';
  end if;
  perform public.carelink_revoke_role(target_user, role_name);end;$$;

-- 8. Permission exposure for the frontend (display only — never authorization)
create or replace function public.carelink_current_user_permissions()
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(distinct rp.permission_code order by rp.permission_code), array[]::text[])
  from public.user_roles ur
  join public.role_permissions rp on rp.role_id = ur.role_id
  where ur.user_id = auth.uid()$$;

-- 9. Restrict EXECUTE on admin RPCs; grant to authenticated。

do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_admin_has_permission(text)',
    'carelink_admin_list_users(text,text,int,int)',
    'carelink_admin_list_security_activity(int,uuid)',
    'carelink_admin_list_audit(int,text)',
    'carelink_admin_list_providers(text,text,text,int,int)',
    'carelink_admin_list_reviews(text,int,int)',
    'carelink_admin_list_appointments(text,int,int)',
    'carelink_admin_list_notifications(text,int)',
    'carelink_admin_stats()',
    'carelink_admin_set_account_status(uuid,text,text)',
    'carelink_admin_grant_user_role(uuid,text)',
    'carelink_admin_revoke_user_role(uuid,text)',
    'carelink_current_user_permissions()',
    'carelink_is_active_admin()'
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
