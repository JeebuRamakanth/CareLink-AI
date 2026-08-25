-- ===========================================================================
-- CareLink-AI — Step 10.5 §3: RBAC + provider membership.
--
-- ADDITIVE ONLY.
--
-- SECURITY RULES ENCODED HERE:
--   - Roles live ONLY in user_roles; frontend role values are never trusted.
--   - Provider membership is scoped: hospital admins can only reach their own
--     hospital, pharmacy admins their own pharmacy, lab admins their own lab.
--   - All privileged helpers are SECURITY DEFINER with pinned search_path and
--     EXECUTE revoked from public/anon.
--   - Role/membership changes have NO client write policy — they go through
--     the audited guard functions below (or the service_role edge functions).
--   - Super-admin actions are audited (carelink_grant_role writes audit_events).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.roles (
  id text primary key,
  description text,
  created_at timestamptz not null default now()
);

insert into public.roles (id, description) values
  ('patient','End user of the platform'),
  ('doctor','Linked medical practitioner'),
  ('hospital_admin','Administrator of exactly one hospital'),
  ('pharmacy_admin','Administrator of exactly one pharmacy'),
  ('lab_admin','Administrator of exactly one lab'),
  ('admin','Platform administrator (non-medical ops)'),
  ('super_admin','Full platform administrator; all actions must be audited')
on conflict (id) do nothing;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id text not null references public.roles(id) on delete restrict,
  granted_by uuid references auth.users(id),
  granted_at timestamptz not null default now(),
  unique (user_id, role_id)
);
create index if not exists user_roles_user_id_idx on public.user_roles(user_id);
create index if not exists user_roles_role_id_idx on public.user_roles(role_id);

-- One membership = one provider entity. Exactly one FK must be set.
create table if not exists public.provider_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider_kind text not null check (provider_kind in ('hospital','pharmacy','lab')),
  hospital_id uuid references public.hospitals(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete cascade,
  created_at timestamptz not null default now(),
  check (
    (provider_kind = 'hospital' and hospital_id is not null and pharmacy_id is null and lab_id is null)
    or (provider_kind = 'pharmacy' and pharmacy_id is not null and hospital_id is null and lab_id is null)
    or (provider_kind = 'lab' and lab_id is not null and hospital_id is null and pharmacy_id is null)
  )
);
create index if not exists provider_memberships_user_id_idx on public.provider_memberships(user_id);
create index if not exists provider_memberships_hospital_id_idx on public.provider_memberships(hospital_id);
create index if not exists provider_memberships_pharmacy_id_idx on public.provider_memberships(pharmacy_id);
create index if not exists provider_memberships_lab_id_idx on public.provider_memberships(lab_id);
create unique index if not exists provider_memberships_hospital_user_uq
  on public.provider_memberships(user_id, hospital_id) where hospital_id is not null;
create unique index if not exists provider_memberships_pharmacy_user_uq
  on public.provider_memberships(user_id, pharmacy_id) where pharmacy_id is not null;
create unique index if not exists provider_memberships_lab_user_uq
  on public.provider_memberships(user_id, lab_id) where lab_id is not null;

-- doctor ↔ auth user link (a doctor account only reaches their own doctor row)
create table if not exists public.doctor_user_links (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  status text not null check (status in ('pending','approved','revoked')) default 'pending',
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, doctor_id)
);
create index if not exists doctor_user_links_user_id_idx on public.doctor_user_links(user_id);
create index if not exists doctor_user_links_doctor_id_idx on public.doctor_user_links(doctor_id);

-- ---------------------------------------------------------------------------
-- Secure role/membership helpers (SECURITY DEFINER, pinned path)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_has_role(role_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_roles ur
    where ur.user_id = auth.uid() and ur.role_id = role_name
  );
$$;

create or replace function public.carelink_is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.carelink_has_role('super_admin'); $$;

create or replace function public.carelink_is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$ select public.carelink_has_role('admin') or public.carelink_has_role('super_admin'); $$;

create or replace function public.carelink_is_hospital_admin(hospital_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'hospital'
      and pm.hospital_id = hospital_uuid
  ) or public.carelink_is_super_admin();
$$;

create or replace function public.carelink_is_pharmacy_admin(pharmacy_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'pharmacy'
      and pm.pharmacy_id = pharmacy_uuid
  ) or public.carelink_is_super_admin();
$$;

create or replace function public.carelink_is_lab_admin(lab_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'lab'
      and pm.lab_id = lab_uuid
  ) or public.carelink_is_super_admin();
$$;

create or replace function public.carelink_is_doctor_linked(doctor_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doctor_user_links dl
    where dl.user_id = auth.uid()
      and dl.doctor_id = doctor_uuid
      and dl.status = 'approved'
  ) or public.carelink_is_super_admin();
$$;

-- RAW membership checks WITHOUT the super_admin bypass. Use these wherever the
-- caller must be an ACTUAL member of the provider (e.g. speaking as the
-- provider in a review response) rather than administering the platform.
create or replace function public.carelink_is_hospital_member(hospital_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'hospital'
      and pm.hospital_id = hospital_uuid
  );
$$;

create or replace function public.carelink_is_pharmacy_member(pharmacy_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'pharmacy'
      and pm.pharmacy_id = pharmacy_uuid
  );
$$;

create or replace function public.carelink_is_lab_member(lab_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.provider_memberships pm
    where pm.user_id = auth.uid()
      and pm.provider_kind = 'lab'
      and pm.lab_id = lab_uuid
  );
$$;

create or replace function public.carelink_is_linked_doctor(doctor_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.doctor_user_links dl
    where dl.user_id = auth.uid()
      and dl.doctor_id = doctor_uuid
      and dl.status = 'approved'
  );
$$;

-- EXECUTE policy: the pure self-membership PREDICATES must remain callable by
-- every role that policy evaluation can run as (including anon) — they reveal
-- nothing beyond a boolean about the caller's own (possibly null) identity,
-- and PostgreSQL evaluates them inside policies on publicly readable tables.
-- The MUTATING guarded functions (below) stay revoked from anon/public.
do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_has_role(text)','carelink_is_super_admin()','carelink_is_admin()',
    'carelink_is_hospital_admin(uuid)','carelink_is_pharmacy_admin(uuid)',
    'carelink_is_lab_admin(uuid)','carelink_is_doctor_linked(uuid)',
    'carelink_is_hospital_member(uuid)','carelink_is_pharmacy_member(uuid)',
    'carelink_is_lab_member(uuid)','carelink_is_linked_doctor(uuid)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('grant execute on function public.%s to anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Audited, guarded role/membership mutation functions
-- (callable only by super_admin; every call writes audit_events)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_grant_role(target_user uuid, role_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can grant roles';
  end if;
  insert into public.user_roles (id, user_id, role_id, granted_by)
  values (gen_random_uuid(), target_user, role_name, auth.uid())
  on conflict (user_id, role_id) do nothing
  returning id into new_id;
  perform public.carelink_record_audit('role_granted', 'user_roles', new_id, 'role: ' || role_name);
  return new_id;
end;
$$;

create or replace function public.carelink_revoke_role(target_user uuid, role_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can revoke roles';
  end if;
  delete from public.user_roles where user_id = target_user and role_id = role_name;
  perform public.carelink_record_audit('role_revoked', 'user_roles', null, 'role: ' || role_name);
end;
$$;

create or replace function public.carelink_add_provider_membership(
  target_user uuid,
  kind text,
  provider_uuid uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can add provider memberships';
  end if;
  if kind not in ('hospital','pharmacy','lab') then
    raise exception 'invalid provider kind';
  end if;
  insert into public.provider_memberships (id, user_id, provider_kind, hospital_id, pharmacy_id, lab_id)
  values (
    gen_random_uuid(), target_user, kind,
    case when kind = 'hospital' then provider_uuid end,
    case when kind = 'pharmacy' then provider_uuid end,
    case when kind = 'lab' then provider_uuid end
  )
  returning id into new_id;
  perform public.carelink_record_audit('provider_membership_added', 'provider_memberships', new_id, 'kind: ' || kind);
  return new_id;
end;
$$;

create or replace function public.carelink_remove_provider_membership(membership_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_is_super_admin() then
    raise exception 'only super_admin can remove provider memberships';
  end if;
  delete from public.provider_memberships where id = membership_id;
  perform public.carelink_record_audit('provider_membership_removed', 'provider_memberships', membership_id, null);
end;
$$;

do $$
begin
  revoke execute on function public.carelink_grant_role(uuid, text) from public;
  revoke execute on function public.carelink_revoke_role(uuid, text) from public;
  revoke execute on function public.carelink_add_provider_membership(uuid, text, uuid) from public;
  revoke execute on function public.carelink_remove_provider_membership(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_grant_role(uuid, text) from anon;
    revoke execute on function public.carelink_revoke_role(uuid, text) from anon;
    revoke execute on function public.carelink_add_provider_membership(uuid, text, uuid) from anon;
    revoke execute on function public.carelink_remove_provider_membership(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_grant_role(uuid, text) to authenticated;
    grant execute on function public.carelink_revoke_role(uuid, text) to authenticated;
    grant execute on function public.carelink_add_provider_membership(uuid, text, uuid) to authenticated;
    grant execute on function public.carelink_remove_provider_membership(uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.roles enable row level security;
alter table public.user_roles enable row level security;
alter table public.provider_memberships enable row level security;
alter table public.doctor_user_links enable row level security;

-- roles: readable by anyone (id + description only)
drop policy if exists roles_public_read on public.roles;
create policy roles_public_read on public.roles for select using (true);

-- user_roles: a user may read their own granted roles (transparency); NO
-- client insert/update/delete (guarded functions only).
drop policy if exists user_roles_self_select on public.user_roles;
create policy user_roles_self_select on public.user_roles
  for select using (user_id = auth.uid());

-- provider_memberships: a user may read their own membership rows.
drop policy if exists provider_memberships_self_select on public.provider_memberships;
create policy provider_memberships_self_select on public.provider_memberships
  for select using (user_id = auth.uid());

-- doctor_user_links: a user may read their own link status.
drop policy if exists doctor_user_links_self_select on public.doctor_user_links;
create policy doctor_user_links_self_select on public.doctor_user_links
  for select using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Admin write policies on the master-data + provider + verification tables
-- (0004/0005 created them read-only / no-policy; writes are enabled here).
--
-- IMPORTANT: these are PER-COMMAND policies, not FOR ALL. A FOR ALL admin
-- SELECT policy would be OR-combined with the public-read policy and then
-- invoke the membership helper as `anon`, which (correctly) has no EXECUTE.
-- SELECT stays governed by the 0004/0005 public-read policies; verification
-- tables get an explicit admin SELECT policy (they have no public read).
-- ---------------------------------------------------------------------------

-- Helper: attach insert/update/delete admin policies to a table using a
-- provider-scope predicate (a column name on that table) or 'SUPER_ADMIN'.
create or replace function public.carelink_apply_admin_write_rls(table_name text, scope text, helper text)
returns void
language plpgsql
as $$
declare pred text;
begin
  if scope = 'SUPER_ADMIN' then
    pred := 'public.carelink_is_super_admin()';
  elsif scope = 'INVENTORY' then
    pred := 'exists (select 1 from public.pharmacy_medicines pm where pm.id = pharmacy_medicine_id and public.carelink_is_pharmacy_admin(pm.pharmacy_id))';
  else
    pred := format('public.%I(%I)', helper, scope);
  end if;

  execute format(
    'drop policy if exists %1$s_admin_insert on public.%1$I;
     create policy %1$s_admin_insert on public.%1$I for insert with check (%2$s);
     drop policy if exists %1$s_admin_update on public.%1$I;
     create policy %1$s_admin_update on public.%1$I for update using (%2$s) with check (%2$s);
     drop policy if exists %1$s_admin_delete on public.%1$I;
     create policy %1$s_admin_delete on public.%1$I for delete using (%2$s);',
    table_name, pred);

  if table_name like '%_verification' then
    execute format(
      'drop policy if exists %1$s_admin_select on public.%1$I;
       create policy %1$s_admin_select on public.%1$I for select using (%2$s);',
      table_name, pred);
  end if;
end;
$$;

-- Master data (0004): super_admin only.
do $$
declare t text;
begin
  foreach t in array array['specialties','conditions','symptoms','condition_specialties','symptom_conditions']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'SUPER_ADMIN', null);
  end loop;
end $$;

-- HOSPITAL group
select public.carelink_apply_admin_write_rls('hospitals', 'id', 'carelink_is_hospital_admin');
do $$
declare t text;
begin
  foreach t in array array['hospital_locations','hospital_services','hospital_specialties','hospital_hours','emergency_capabilities','hospital_condition_services']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'hospital_id', 'carelink_is_hospital_admin');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('hospital_verification', 'hospital_id', 'carelink_is_hospital_admin');

-- DOCTOR group
select public.carelink_apply_admin_write_rls('doctors', 'id', 'carelink_is_doctor_linked');
do $$
declare t text;
begin
  foreach t in array array['doctor_profiles','doctor_specialties','doctor_condition_expertise','doctor_hospitals','doctor_availability','qualifications','certifications','consultation_fees']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'doctor_id', 'carelink_is_doctor_linked');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('doctor_verification', 'doctor_id', 'carelink_is_doctor_linked');
-- doctor verification WRITE is verification-body only (super_admin), linked doctor may READ
do $$
begin
  execute 'drop policy if exists doctor_verification_admin_insert on public.doctor_verification;
           create policy doctor_verification_admin_insert on public.doctor_verification for insert with check (public.carelink_is_super_admin())';
  execute 'drop policy if exists doctor_verification_admin_update on public.doctor_verification;
           create policy doctor_verification_admin_update on public.doctor_verification for update using (public.carelink_is_super_admin()) with check (public.carelink_is_super_admin())';
  execute 'drop policy if exists doctor_verification_admin_delete on public.doctor_verification;
           create policy doctor_verification_admin_delete on public.doctor_verification for delete using (public.carelink_is_super_admin())';
end $$;

-- PHARMACY group
select public.carelink_apply_admin_write_rls('pharmacies', 'id', 'carelink_is_pharmacy_admin');
do $$
declare t text;
begin
  foreach t in array array['pharmacy_locations','pharmacy_hours','pharmacy_medicines']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'pharmacy_id', 'carelink_is_pharmacy_admin');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('medicine_inventory', 'INVENTORY', null);
select public.carelink_apply_admin_write_rls('pharmacy_verification', 'pharmacy_id', 'carelink_is_pharmacy_admin');

-- LAB group
select public.carelink_apply_admin_write_rls('labs', 'id', 'carelink_is_lab_admin');
do $$
declare t text;
begin
  foreach t in array array['lab_locations','lab_tests','lab_services','lab_hours']
  loop
    perform public.carelink_apply_admin_write_rls(t, 'lab_id', 'carelink_is_lab_admin');
  end loop;
end $$;
select public.carelink_apply_admin_write_rls('lab_verification', 'lab_id', 'carelink_is_lab_admin');

-- lab_bookings: lab admin can READ bookings for their lab (never the patient
-- list of OTHER labs). Write stays owner-only (0005 policy).
drop policy if exists lab_bookings_lab_admin_select on public.lab_bookings;
create policy lab_bookings_lab_admin_select on public.lab_bookings
  for select using (public.carelink_is_lab_admin(lab_id));
