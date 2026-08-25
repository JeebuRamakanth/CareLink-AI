-- ===========================================================================
-- CareLink-AI — Step 10.5 §6: Reviews backend (replaces mock/client-only).
--
-- ADDITIVE ONLY.
--
-- Security properties:
--   - Exactly one target (hospital|doctor|pharmacy|lab) via nullable FKs +
--     CHECK constraint (no unsafe polymorphic reference).
--   - One published review per (author, target) via a unique expression index
--     (duplicate-review abuse prevention).
--   - Verified-review status lives in review_verification and can ONLY be set
--     by the guarded function below (client has no insert policy), so it
--     cannot be forged.
--   - Editing someone else's review: impossible (author-scoped policies).
--   - Moderation: server-side function only, always audited. Moderators must
--     hold admin/super_admin role; every action writes audit_events.
-- ===========================================================================

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete set null,
  hospital_id uuid references public.hospitals(id) on delete cascade,
  doctor_id uuid references public.doctors(id) on delete cascade,
  pharmacy_id uuid references public.pharmacies(id) on delete cascade,
  lab_id uuid references public.labs(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  title text,
  body text,
  overall_rating smallint not null check (overall_rating between 1 and 5),
  status text not null check (status in ('published','pending','hidden','removed')) default 'published',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (hospital_id is not null)::int + (doctor_id is not null)::int
    + (pharmacy_id is not null)::int + (lab_id is not null)::int = 1
  )
);
create index if not exists reviews_owner_id_idx on public.reviews(owner_id);
create index if not exists reviews_hospital_id_idx on public.reviews(hospital_id) where hospital_id is not null;
create index if not exists reviews_doctor_id_idx on public.reviews(doctor_id) where doctor_id is not null;
create index if not exists reviews_pharmacy_id_idx on public.reviews(pharmacy_id) where pharmacy_id is not null;
create index if not exists reviews_lab_id_idx on public.reviews(lab_id) where lab_id is not null;
-- one published review per (author, target)
create unique index if not exists reviews_one_per_target_uq
  on public.reviews (owner_id, (coalesce(hospital_id, doctor_id, pharmacy_id, lab_id)))
  where status = 'published';
-- one published review per completed appointment (verified path, when linked)
create unique index if not exists reviews_one_per_appointment_uq
  on public.reviews (appointment_id)
  where appointment_id is not null and status = 'published';

create table if not exists public.review_ratings (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  aspect text not null,
  rating smallint not null check (rating between 1 and 5),
  created_at timestamptz not null default now(),
  unique (review_id, aspect)
);
create index if not exists review_ratings_review_id_idx on public.review_ratings(review_id);

create table if not exists public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  status text not null check (status in ('open','dismissed','actioned')) default 'open',
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index if not exists review_reports_review_id_idx on public.review_reports(review_id);
create index if not exists review_reports_reporter_id_idx on public.review_reports(reporter_id);

-- verified-review badge state (filled only by carelink_verify_review)
create table if not exists public.review_verification (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null unique references public.reviews(id) on delete cascade,
  verified_interaction boolean not null default false,
  appointment_id uuid references public.appointments(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

-- provider response to a review
create table if not exists public.provider_responses (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  responder_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (review_id)  -- one provider response per review
);

-- moderation history (written only via the guarded function)
create table if not exists public.review_moderation (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews(id) on delete cascade,
  moderator_id uuid references auth.users(id),
  action text not null check (action in ('publish','hide','remove')),
  reason text,
  created_at timestamptz not null default now()
);
create index if not exists review_moderation_review_id_idx on public.review_moderation(review_id);

-- ---------------------------------------------------------------------------
-- Guarded verification: marks a review verified ONLY when the linked
-- appointment is completed and belongs to the review author. Client cannot
-- call this with arbitrary success — every precondition is checked here.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_verify_review(review_uuid uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare r public.reviews%rowtype;
begin
  select * into r from public.reviews where id = review_uuid;
  if not found then
    raise exception 'review not found';
  end if;
  -- Only the author (or an admin) may request verification.
  if r.owner_id <> auth.uid() and not public.carelink_is_admin() then
    raise exception 'not authorized to verify this review';
  end if;
  if r.appointment_id is null then
    return false; -- no linked appointment: nothing to verify against
  end if;
  if not exists (
    select 1 from public.appointments a
    where a.id = r.appointment_id
      and a.owner_id = r.owner_id
      and a.status = 'completed'
  ) then
    return false; -- eligibility not met (must be a completed appointment)
  end if;
  insert into public.review_verification (id, review_id, verified_interaction, appointment_id, verified_at)
  values (gen_random_uuid(), review_uuid, true, r.appointment_id, now())
  on conflict (review_id)
  do update set verified_interaction = true, appointment_id = r.appointment_id, verified_at = now();
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guarded moderation: admin/super_admin only; always audited.
-- ---------------------------------------------------------------------------
create or replace function public.carelink_moderate_review(
  review_uuid uuid,
  action text,
  reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.carelink_is_admin() then
    raise exception 'only admins can moderate reviews';
  end if;
  if action not in ('publish','hide','remove') then
    raise exception 'invalid moderation action';
  end if;
  insert into public.review_moderation (id, review_id, moderator_id, action, reason)
  values (gen_random_uuid(), review_uuid, auth.uid(), action, reason);
  update public.reviews
  set status = case action when 'publish' then 'published'
                           when 'hide' then 'hidden'
                           when 'remove' then 'removed' end
  where id = review_uuid;
  perform public.carelink_record_audit('review_moderated', 'reviews', review_uuid, 'action: ' || action);
end;
$$;

do $$
begin
  revoke execute on function public.carelink_verify_review(uuid) from public;
  revoke execute on function public.carelink_moderate_review(uuid, text, text) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_verify_review(uuid) from anon;
    revoke execute on function public.carelink_moderate_review(uuid, text, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_verify_review(uuid) to authenticated;
    grant execute on function public.carelink_moderate_review(uuid, text, text) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['reviews','provider_responses']
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

-- reviews.family_profile_id must belong to owner
drop trigger if exists carelink_family_profile_ownership on public.reviews;
create trigger carelink_family_profile_ownership
  before insert or update on public.reviews
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'reviews','review_ratings','review_reports','review_verification',
    'provider_responses','review_moderation'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- reviews: published reviews are public; author sees their own any-status rows
drop policy if exists reviews_public_or_self_select on public.reviews;
create policy reviews_public_or_self_select on public.reviews
  for select using (status = 'published' or owner_id = auth.uid());

drop policy if exists reviews_author_insert on public.reviews;
create policy reviews_author_insert on public.reviews
  for insert with check (owner_id = auth.uid() and status in ('published','pending'));

-- author may edit ONLY their own review and can never change status away by
-- moderation states (status changes flow through carelink_moderate_review)
drop policy if exists reviews_author_update on public.reviews;
create policy reviews_author_update on public.reviews
  for update using (owner_id = auth.uid() and status in ('published','pending'))
  with check (owner_id = auth.uid() and status in ('published','pending'));

drop policy if exists reviews_author_delete on public.reviews;
create policy reviews_author_delete on public.reviews
  for delete using (owner_id = auth.uid());

-- review_ratings: readable for public reviews, writable only by the review author
drop policy if exists review_ratings_select on public.review_ratings;
create policy review_ratings_select on public.review_ratings
  for select using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and (r.status = 'published' or r.owner_id = auth.uid())
    )
  );

drop policy if exists review_ratings_author_write on public.review_ratings;
create policy review_ratings_author_write on public.review_ratings
  for all using (
    exists (select 1 from public.reviews r where r.id = review_id and r.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.reviews r where r.id = review_id and r.owner_id = auth.uid())
  );

-- review_reports: anyone authenticated can report; reporter sees own reports;
-- admins see all reports.
drop policy if exists review_reports_insert on public.review_reports;
create policy review_reports_insert on public.review_reports
  for insert with check (reporter_id = auth.uid());

drop policy if exists review_reports_select on public.review_reports;
create policy review_reports_select on public.review_reports
  for select using (reporter_id = auth.uid() or public.carelink_is_admin());

-- review_verification: READ public (badge), NO client write (function only)
drop policy if exists review_verification_public_read on public.review_verification;
create policy review_verification_public_read on public.review_verification
  for select using (true);

-- provider_responses: public read when the parent review is published; write
-- only by the authorized provider account (hospital/pharmacy/lab admin of the
-- target, or the linked doctor).
drop policy if exists provider_responses_public_select on public.provider_responses;
create policy provider_responses_public_select on public.provider_responses
  for select using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id and r.status = 'published'
    )
  );

-- Uses the RAW membership helpers: a super_admin must NOT be able to pose as
-- the provider in a response without an actual membership/link.
drop policy if exists provider_responses_provider_insert on public.provider_responses;
create policy provider_responses_provider_insert on public.provider_responses
  for insert with check (
    responder_id = auth.uid()
    and exists (
      select 1 from public.reviews r
      where r.id = review_id
        and (
          (r.hospital_id is not null and public.carelink_is_hospital_member(r.hospital_id))
          or (r.pharmacy_id is not null and public.carelink_is_pharmacy_member(r.pharmacy_id))
          or (r.lab_id is not null and public.carelink_is_lab_member(r.lab_id))
          or (r.doctor_id is not null and public.carelink_is_linked_doctor(r.doctor_id))
        )
    )
  );

drop policy if exists provider_responses_provider_update on public.provider_responses;
create policy provider_responses_provider_update on public.provider_responses
  for update using (responder_id = auth.uid())
  with check (responder_id = auth.uid());

drop policy if exists provider_responses_provider_delete on public.provider_responses;
create policy provider_responses_provider_delete on public.provider_responses
  for delete using (responder_id = auth.uid());

-- review_moderation: admins can READ moderation history; writes only via fn
drop policy if exists review_moderation_admin_select on public.review_moderation;
create policy review_moderation_admin_select on public.review_moderation
  for select using (public.carelink_is_admin());
