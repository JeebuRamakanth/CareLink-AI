-- ===========================================================================
-- CareLink-AI — Step 10.5 §15: Blood donation network.
--
-- ADDITIVE ONLY.
--
-- MANDATORY RULES ENFORCED DATABASE-SIDE (frontend cannot bypass):
--   1. After a successful donation the donor is unavailable for 4 months:
--      - donation_records insert trigger upserts donor_eligibility
--        (eligible_until = donated_on + 4 months, is_eligible = false)
--      - carelink_record_donation() rejects donations inside the cooldown
--      - carelink_match_donors() never matches an ineligible donor
--   2. Privacy flow:
--      - Before donor consent: donor sees only the request (blood group, city,
--        units, urgency) — NO patient identity/contact anywhere in what the
--        donor can read; the requester sees only that a donor exists.
--      - Donor NO: nothing is disclosed (audited).
--      - Donor YES: minimum contact details are exchanged ONLY through the
--        guarded disclosure functions, each call audited in audit_events.
--      - donor_profiles / donation_records / eligibility have NO cross-user
--        SELECT policy at all.
-- ===========================================================================

create table if not exists public.blood_groups (
  code text primary key check (code in ('A+','A-','B+','B-','AB+','AB-','O+','O-')),
  label text not null
);
insert into public.blood_groups (code, label) values
  ('A+','A positive'),('A-','A negative'),('B+','B positive'),('B-','B negative'),
  ('AB+','AB positive'),('AB-','AB negative'),('O+','O positive'),('O-','O negative')
on conflict (code) do nothing;

-- Donor profile: contact details are NEVER cross-user readable.
create table if not exists public.donor_profiles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  blood_group_code text not null references public.blood_groups(code),
  city text,
  phone text,
  date_of_birth date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists donor_profiles_blood_group_idx on public.donor_profiles(blood_group_code);

create table if not exists public.donor_locations (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  updated_at timestamptz not null default now()
);
create index if not exists donor_locations_donor_profile_id_idx on public.donor_locations(donor_profile_id);

create table if not exists public.donor_availability (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null unique references public.donor_profiles(id) on delete cascade,
  is_available boolean not null default true,
  available_from date,
  available_until date,
  notes text,
  updated_at timestamptz not null default now()
);

create table if not exists public.donation_records (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  donated_on date not null,
  units smallint not null default 1 check (units between 1 and 2),
  hospital_id uuid references public.hospitals(id) on delete set null,
  recorded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists donation_records_donor_profile_id_idx on public.donation_records(donor_profile_id);
create index if not exists donation_records_donated_on_idx on public.donation_records(donated_on);

create table if not exists public.donor_eligibility (
  id uuid primary key default gen_random_uuid(),
  donor_profile_id uuid not null unique references public.donor_profiles(id) on delete cascade,
  last_donation_date date,
  eligible_until date,
  is_eligible boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.blood_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  blood_group_code text not null references public.blood_groups(code),
  units_needed smallint not null default 1 check (units_needed between 1 and 10),
  hospital_id uuid references public.hospitals(id) on delete set null,
  city text,
  urgency text not null check (urgency in ('routine','urgent','critical')) default 'routine',
  status text not null check (status in ('open','fulfilled','cancelled','expired')) default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists blood_requests_owner_id_idx on public.blood_requests(owner_id);
create index if not exists blood_requests_blood_group_idx on public.blood_requests(blood_group_code);
create index if not exists blood_requests_status_idx on public.blood_requests(status);

-- Match results: prove a match exists WITHOUT exposing donor identity
-- (donor_profiles has no cross-user read; requester reads only these rows).
create table if not exists public.donor_match_results (
  id uuid primary key default gen_random_uuid(),
  blood_request_id uuid not null references public.blood_requests(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- requester
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  matched_at timestamptz not null default now(),
  notified boolean not null default false,
  unique (blood_request_id, donor_profile_id)
);
create index if not exists donor_match_results_request_idx on public.donor_match_results(blood_request_id);
create index if not exists donor_match_results_owner_idx on public.donor_match_results(owner_id);
create index if not exists donor_match_results_donor_idx on public.donor_match_results(donor_profile_id);

-- Donor-facing request: donor sees request details, NOT patient identity.
create table if not exists public.donor_requests (
  id uuid primary key default gen_random_uuid(),
  blood_request_id uuid not null references public.blood_requests(id) on delete cascade,
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade, -- requester
  status text not null check (status in ('sent','accepted','declined','expired')) default 'sent',
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  unique (blood_request_id, donor_profile_id)
);
create index if not exists donor_requests_donor_profile_id_idx on public.donor_requests(donor_profile_id);
create index if not exists donor_requests_owner_id_idx on public.donor_requests(owner_id);

create table if not exists public.donor_notifications (
  id uuid primary key default gen_random_uuid(),
  donor_request_id uuid references public.donor_requests(id) on delete cascade,
  donor_profile_id uuid not null references public.donor_profiles(id) on delete cascade,
  kind text not null check (kind in ('match','request','reminder','result')),
  payload jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default now(),
  check (octet_length(payload::text) <= 1000)
);
create index if not exists donor_notifications_donor_profile_id_idx on public.donor_notifications(donor_profile_id);

-- ---------------------------------------------------------------------------
-- 4-month cooldown: trigger keeps eligibility in sync with donation history
-- ---------------------------------------------------------------------------
create or replace function public.carelink_apply_donation_cooldown()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.donor_eligibility (id, donor_profile_id, last_donation_date, eligible_until, is_eligible)
  values (
    gen_random_uuid(), new.donor_profile_id, new.donated_on,
    (new.donated_on + interval '4 months')::date,
    false
  )
  on conflict (donor_profile_id) do update
    set last_donation_date = greatest(donor_eligibility.last_donation_date, excluded.last_donation_date),
        eligible_until = greatest(donor_eligibility.eligible_until, excluded.eligible_until),
        is_eligible = false,
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists carelink_donation_cooldown on public.donation_records;
create trigger carelink_donation_cooldown
  after insert on public.donation_records
  for each row execute function public.carelink_apply_donation_cooldown();

-- ---------------------------------------------------------------------------
-- Guarded functions
-- ---------------------------------------------------------------------------

-- Record a donation. Callable by the donor themself or a super_admin. The
-- cooldown window is enforced HERE as well as via the eligibility trigger.
-- p_ prefixes avoid PL/pgSQL parameter/column ambiguity.
create or replace function public.carelink_record_donation(
  donor_profile_uuid uuid,
  p_donated_on date,
  hospital_uuid uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare dp record;
declare new_id uuid;
begin
  select id, owner_id into dp from public.donor_profiles where id = donor_profile_uuid;
  if not found then
    raise exception 'donor profile not found';
  end if;
  if dp.owner_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized to record a donation for this donor';
  end if;
  -- 4-month cooldown: reject donations inside the window
  if exists (
    select 1 from public.donation_records d
    where d.donor_profile_id = donor_profile_uuid
      and (d.donated_on + interval '4 months')::date > p_donated_on
  ) then
    raise exception 'donor is within the 4-month cooldown period';
  end if;
  insert into public.donation_records (id, donor_profile_id, donated_on, hospital_id, recorded_by)
  values (gen_random_uuid(), donor_profile_uuid, p_donated_on, hospital_uuid, auth.uid())
  returning id into new_id;
  perform public.carelink_record_audit('donation_recorded', 'donation_records', new_id, null);
  return new_id;
end;
$$;

-- Match eligible donors for a blood request (requester or super_admin only).
-- Ineligible (cooldown), inactive, unavailable, and wrong-group donors are
-- never matched.
create or replace function public.carelink_match_donors(blood_request_uuid uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare req record;
declare matched integer := 0;
begin
  select id, owner_id, blood_group_code, city, status into req
  from public.blood_requests where id = blood_request_uuid;
  if not found then
    raise exception 'blood request not found';
  end if;
  if req.owner_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized to match donors for this request';
  end if;
  if req.status <> 'open' then
    raise exception 'blood request is not open';
  end if;

  insert into public.donor_match_results (id, blood_request_id, owner_id, donor_profile_id)
  select gen_random_uuid(), req.id, req.owner_id, dp.id
  from public.donor_profiles dp
  left join public.donor_eligibility e on e.donor_profile_id = dp.id
  left join public.donor_availability av on av.donor_profile_id = dp.id
  where dp.blood_group_code = req.blood_group_code
    and dp.is_active
    and dp.owner_id <> req.owner_id                     -- never self-match
    and coalesce(av.is_available, true)
    and (e.eligible_until is null or e.eligible_until <= current_date)  -- cooldown
    and (req.city is null or dp.city = req.city)
  on conflict (blood_request_id, donor_profile_id) do nothing;

  get diagnostics matched = row_count;
  perform public.carelink_record_audit('donor_matching_run', 'blood_requests', blood_request_uuid, 'matches: ' || matched);
  return matched;
end;
$$;

-- Create donor requests from match results (requester only). The donor sees
-- the request but NOT the requester identity beyond an opaque user id.
create or replace function public.carelink_send_donor_request(blood_request_uuid uuid, donor_profile_uuid uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare req record;
declare new_id uuid;
begin
  select id, owner_id, status into req from public.blood_requests where id = blood_request_uuid;
  if not found then
    raise exception 'blood request not found';
  end if;
  if req.owner_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized';
  end if;
  if req.status <> 'open' then
    raise exception 'blood request is not open';
  end if;
  -- must be an existing match for this request (no arbitrary donor pings)
  if not exists (
    select 1 from public.donor_match_results m
    where m.blood_request_id = blood_request_uuid and m.donor_profile_id = donor_profile_uuid
  ) then
    raise exception 'donor is not a match for this request';
  end if;
  insert into public.donor_requests (id, blood_request_id, donor_profile_id, owner_id)
  values (gen_random_uuid(), blood_request_uuid, donor_profile_uuid, req.owner_id)
  on conflict (blood_request_id, donor_profile_id) do nothing
  returning id into new_id;

  if new_id is not null then
    insert into public.donor_notifications (id, donor_request_id, donor_profile_id, kind, payload)
    select gen_random_uuid(), new_id, donor_profile_uuid, 'request',
           jsonb_build_object('blood_group', br.blood_group_code, 'city', br.city, 'urgency', br.urgency, 'units', br.units_needed)
    from public.blood_requests br where br.id = blood_request_uuid;
  end if;
  return new_id;
end;
$$;

-- Donor answers YES/NO. Only the donor may respond, only while pending.
-- YES/NO both audited; NO discloses nothing.
create or replace function public.carelink_donor_respond(donor_request_uuid uuid, accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare dr record;
begin
  select dr1.id, dr1.status, dr1.blood_request_id, dp.owner_id as donor_owner
  into dr
  from public.donor_requests dr1
  join public.donor_profiles dp on dp.id = dr1.donor_profile_id
  where dr1.id = donor_request_uuid;
  if not found then
    raise exception 'donor request not found';
  end if;
  if dr.donor_owner <> auth.uid() then
    raise exception 'only the donor can respond';
  end if;
  if dr.status <> 'sent' then
    raise exception 'donor request already answered';
  end if;

  update public.donor_requests
  set status = case when accept then 'accepted' else 'declined' end,
      responded_at = now()
  where id = donor_request_uuid;

  perform public.carelink_record_audit(
    case when accept then 'donor_consent_yes' else 'donor_consent_no' end,
    'donor_requests', donor_request_uuid, null);
end;
$$;

-- Disclosure: requester reads the donor's MINIMUM contact details — only
-- after donor YES, audited every time.
create or replace function public.carelink_get_donor_contact(donor_request_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dr record;
begin
  select dr1.id, dr1.status, dr1.owner_id as requester_id, dp.owner_id as donor_owner,
         dp.phone as donor_phone, p.display_name as donor_name
  into dr
  from public.donor_requests dr1
  join public.donor_profiles dp on dp.id = dr1.donor_profile_id
  left join public.profiles p on p.id = dp.owner_id
  where dr1.id = donor_request_uuid;
  if not found then
    raise exception 'donor request not found';
  end if;
  if dr.requester_id <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized';
  end if;
  if dr.status <> 'accepted' then
    raise exception 'donor has not consented to share contact details';
  end if;
  perform public.carelink_record_audit('donor_contact_disclosed', 'donor_requests', donor_request_uuid, null);
  return jsonb_build_object('donor_name', dr.donor_name, 'donor_phone', dr.donor_phone);
end;
$$;

-- Disclosure: donor reads the requester's MINIMUM contact details — only
-- after their own YES, audited every time.
create or replace function public.carelink_get_requester_contact(donor_request_uuid uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare dr record;
begin
  select dr1.id, dr1.status, dr1.owner_id as requester_id, dp.owner_id as donor_owner,
         p.display_name as requester_name
  into dr
  from public.donor_requests dr1
  join public.donor_profiles dp on dp.id = dr1.donor_profile_id
  left join public.profiles p on p.id = dr1.owner_id
  where dr1.id = donor_request_uuid;
  if not found then
    raise exception 'donor request not found';
  end if;
  if dr.donor_owner <> auth.uid() and not public.carelink_is_super_admin() then
    raise exception 'not authorized';
  end if;
  if dr.status <> 'accepted' then
    raise exception 'no contact details before you accept';
  end if;
  perform public.carelink_record_audit('requester_contact_disclosed', 'donor_requests', donor_request_uuid, null);
  return jsonb_build_object('requester_name', dr.requester_name);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_record_donation(uuid, date, uuid)',
    'carelink_match_donors(uuid)',
    'carelink_send_donor_request(uuid, uuid)',
    'carelink_donor_respond(uuid, boolean)',
    'carelink_get_donor_contact(uuid)',
    'carelink_get_requester_contact(uuid)'
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

-- ---------------------------------------------------------------------------
-- Triggers + RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['donor_profiles','blood_requests']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

drop trigger if exists set_updated_at on public.donor_availability;
create trigger set_updated_at before update on public.donor_availability
  for each row execute function carelink_set_updated_at();
drop trigger if exists set_updated_at on public.donor_eligibility;
create trigger set_updated_at before update on public.donor_eligibility
  for each row execute function carelink_set_updated_at();
drop trigger if exists set_updated_at on public.donor_locations;
create trigger set_updated_at before update on public.donor_locations
  for each row execute function carelink_set_updated_at();

drop trigger if exists carelink_family_profile_ownership on public.blood_requests;
create trigger carelink_family_profile_ownership
  before insert or update on public.blood_requests
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- donor child tables must reference the caller's own donor profile
create or replace function public.carelink_enforce_donor_profile_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.donor_profiles dp
    where dp.id = new.donor_profile_id and dp.owner_id = new.owner_id
  ) then
    raise exception 'donor_profile_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['donor_locations','donor_availability']
  loop
    execute format(
      'drop trigger if exists carelink_donor_profile_owner on public.%I;
       create trigger carelink_donor_profile_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_donor_profile_owner();', t, t);
  end loop;
end $$;

-- RLS -----------------------------------------------------------------------
alter table public.blood_groups enable row level security;
drop policy if exists blood_groups_public_read on public.blood_groups;
create policy blood_groups_public_read on public.blood_groups for select using (true);

-- donor_profiles: STRICTLY self (no cross-user select — identity protected)
alter table public.donor_profiles enable row level security;
drop policy if exists donor_profiles_self_select on public.donor_profiles;
create policy donor_profiles_self_select on public.donor_profiles
  for select using (owner_id = auth.uid());
drop policy if exists donor_profiles_self_insert on public.donor_profiles;
create policy donor_profiles_self_insert on public.donor_profiles
  for insert with check (owner_id = auth.uid());
drop policy if exists donor_profiles_self_update on public.donor_profiles;
create policy donor_profiles_self_update on public.donor_profiles
  for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists donor_profiles_self_delete on public.donor_profiles;
create policy donor_profiles_self_delete on public.donor_profiles
  for delete using (owner_id = auth.uid());

-- donor_locations / donor_availability: self via profile ownership
do $$
declare t text;
begin
  foreach t in array array['donor_locations','donor_availability']
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_self_select on public.%1$I;
       create policy %1$s_self_select on public.%1$I for select using (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );
       drop policy if exists %1$s_self_insert on public.%1$I;
       create policy %1$s_self_insert on public.%1$I for insert with check (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );
       drop policy if exists %1$s_self_update on public.%1$I;
       create policy %1$s_self_update on public.%1$I for update using (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       ) with check (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );
       drop policy if exists %1$s_self_delete on public.%1$I;
       create policy %1$s_self_delete on public.%1$I for delete using (
         exists (select 1 from public.donor_profiles dp where dp.id = donor_profile_id and dp.owner_id = auth.uid())
       );', t);
  end loop;
end $$;

-- donation_records / donor_eligibility: NO client read/write policies at all.
-- Reads happen through guarded functions; writes via carelink_record_donation.
do $$
begin
  execute 'alter table public.donation_records enable row level security';
  execute 'alter table public.donor_eligibility enable row level security';
end $$;

-- blood_requests: requester-owned
do $$
begin
  execute 'alter table public.blood_requests enable row level security';
  perform public.carelink_apply_owner_rls('blood_requests');
end $$;

-- donor_match_results: requester sees matches for own requests (no identity
-- resolution possible — donor_profiles is not cross-readable). No client write
-- (matching function only).
alter table public.donor_match_results enable row level security;
drop policy if exists donor_match_results_owner_select on public.donor_match_results;
create policy donor_match_results_owner_select on public.donor_match_results
  for select using (owner_id = auth.uid());

-- donor_requests: requester reads own requests' STATUS; donor reads requests
-- addressed to them (minimal columns exist — no patient identity on the row).
-- No client write: responses go through carelink_donor_respond.
alter table public.donor_requests enable row level security;
drop policy if exists donor_requests_owner_select on public.donor_requests;
create policy donor_requests_owner_select on public.donor_requests
  for select using (owner_id = auth.uid());
drop policy if exists donor_requests_donor_select on public.donor_requests;
create policy donor_requests_donor_select on public.donor_requests
  for select using (
    exists (
      select 1 from public.donor_profiles dp
      where dp.id = donor_profile_id and dp.owner_id = auth.uid()
    )
  );

-- donor_notifications: donor-only
alter table public.donor_notifications enable row level security;
drop policy if exists donor_notifications_donor_select on public.donor_notifications;
create policy donor_notifications_donor_select on public.donor_notifications
  for select using (
    exists (
      select 1 from public.donor_profiles dp
      where dp.id = donor_profile_id and dp.owner_id = auth.uid()
    )
  );
