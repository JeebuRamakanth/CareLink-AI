-- ===========================================================================
-- CareLink-AI — Step 2: Data provenance + booking integrity + media dedupe.
--
-- ADDITIVE ONLY. Preserves every existing table/policy/index. This migration:
--
-- 1. adds provenance columns to the public provider-registry tables
--    (hospitals / doctors / pharmacies / labs)):
--      data_source   — who/what produced the record (e.g. 'supabase-seed',
--                       'geoapify', 'nppes', 'manual-admin'. NULL = un-known).
--      source_ref    — provider-specific external id / reference (nullable).
--      data_status   — honest data-quality classification so the UI can say
--                       REAL / MOCK / FALLBACK / UNAVAILABLE / PENDING_VERIFICATION
--                       (the *_verification tables remain the single source of
--                        verification truth; data_status is record-origin quality).
--      fetched_at    — when this record was last fetched from an external source.

-- 2. backfills the development seed rows (dev- ids / slug) as
--    'development-seed' + data_status 'PENDING_VERIFICATION' so a fresh project
--    can never present dev seed data as production-verified real-world data..
-- 3. adds a partial UNIQUE index on appointments to prevent double-booking
--    the same doctor + slot when the booking is active (uncancelled).
--    (NULL doctor_id / tele-appointments are deliberately excluded — the slot
--     constraint only applies when a real doctor + date + time is known..
-- 4. adds content-hash columns + owner-scoped partial unique indexes so the
--    media/document pipelines can dedupe identical uploads without ever
--    deduping across owners (a user's private media is never reusable by
--    another user without authorization).
--
-- SECURITY: provenance/dedup columns are non-sensitive public-read delivery
-- metadata only; no PHI, no credentials, no private URLs live here..
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Provenance columns on provider-registry tables
-- ---------------------------------------------------------------------------
alter table public.hospitals add column if not exists data_source text;
alter table public.hospitals add column if not exists source_ref text;
alter table public.hospitals add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.hospitals add column if not exists fetched_at timestamptz;

alter table public.doctors add column if not exists data_source text;
alter table public.doctors add column if not exists source_ref text;
alter table public.doctors add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.doctors add column if not exists fetched_at timestamptz;

alter table public.pharmacies add column if not exists data_source text;
alter table public.pharmacies add column if not exists source_ref text;
alter table public.pharmacies add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.pharmacies add column if not exists fetched_at timestamptz;
alter table public.labs add column if not exists data_source text;
alter table public.labs add column if not exists source_ref text;
alter table public.labs add column if not exists data_status text
  check (data_status is null or data_status in ('REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION'));
alter table public.labs add column if not exists fetched_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Backfill dev-seed provenance (idempotent, dev-first)
-- ---------------------------------------------------------------------------
update public.hospitals h
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (h.data_source is null)
    and (h.slug like 'dev-%' or h.id::text like '7d2%');

update public.doctors d
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (d.data_source is null)
    and (d.slug like 'dev-%' or d.id::text like '7d3%');

update public.pharmacies p
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (p.data_source is null)
    and (p.slug like 'dev-%' or p.id::text like '7d4%');

update public.labs l
  set data_source = 'development-seed',
      data_status = 'PENDING_VERIFICATION',
      source_ref = 'dev-seed'
  where (l.data_source is null)
    and (l.slug like 'dev-%' or l.id::text like '7d5%');

-- ---------------------------------------------------------------------------
-- 3. Double-booking protection on appointments
-- ---------------------------------------------------------------------------
-- Prevents two ACTIVE appointments for the same doctor + date + time. Cancelled
-- bookings free the slot (so a patient can rebook after cancelling).
create unique index if not exists appointments_active_slot_uq
  on public.appointments (doctor_id, scheduled_date, scheduled_time)
  where status <> 'cancelled';

-- ---------------------------------------------------------------------------
-- 4. Content-hash columns + owner-scoped dedupe (media isolation safe(
-- ---------------------------------------------------------------------------
alter table public.medical_documents add column if not exists content_hash text;
create unique index if not exists medical_documents_owner_content_hash_uq
  on public.medical_documents (owner_id, content_hash) where content_hash is not null;

alter table public.provider_media add column if not exists content_hash text;
create unique index if not exists provider_media_owner_content_hash_uq
  on public.provider_media (uploaded_by, content_hash) where (uploaded_by is not null and content_hash is not null);