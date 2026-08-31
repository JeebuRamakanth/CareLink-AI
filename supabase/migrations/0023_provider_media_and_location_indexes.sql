-- ===========================================================================
-- CareLink-AI Step 1 16/ 17/ 29: Provider media + location-discovery indexes.
--
-- ADDITIVE ONLY. The provider ecosystem (0005) is preserved unchanged. This
-- migration adds:
-- 1. provider_media a single metadata table for provider imagery
-- (hospitals / doctors / pharmacies / labs). Every stored provider image
-- gets: provider_kind + provider_id, cloudinary_public_id, secure_url,
-- resource_type, width, height, byte_size, uploaded_at, uploaded_by.
-- Exactly one provider FK must be set (mirrors provider_memberships pattern.
-- 2. Source/verification provenance columns already live either on the provider
-- tables (rating, address, city, phone, website, photo_url) or on the
-- verification tables (status, verified_by, verified_at, notes) no
-- duplicate provenance columns are added; the *_verification tables remain the
-- single source of verification truth.
-- 3. Location-discovery + provider-relationship indexes so haversine / join
-- queries don't full-scan (mirroring the existing per-table indexes).
--
-- SECURITY:
-- - provider_media RLS: ACTIVE media rows are public-read (a provider image is
-- delivery content, not patient data); writes/updates/deletes are restricted to
-- the owning provider admin (hospital_admin / linked doctor / pharmacy_admin /
-- lab_admin) or super_admin verified_media always records the actor.
-- - Client cannot flip a provider's verification status on a media row; the
-- `verified_media` flag merely tags an uploaded asset as provider-approved and is
-- set only by the authorized writer.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. provider_media provider image metadata (Cloudinary + provider refs)
-- ---------------------------------------------------------------------------
create table if not exists public.provider_media (
 id uuid primary key default gen_random_uuid(),
 provider_kind text not null check (provider_kind in ('hospital','doctor','pharmacy','lab')),
 hospital_id uuid references public.hospitals(id) on delete cascade,
 doctor_id uuid references public.doctors(id) on delete cascade,
 pharmacy_id uuid references public.pharmacies(id) on delete cascade,
 lab_id uuid references public.labs(id) on delete cascade,
 -- Cloudinary asset references (never secrets; public id + delivery URL only).
 cloudinary_public_id text,
 secure_url text,
 resource_type text not null default 'image' check (resource_type in ('image','video','raw')),
 width integer check (width is null or width > 0),
 height integer check (height is null or height > 0),
 byte_size bigint check (byte_size is null or byte_size > 0),
 alt_text text,
 is_primary boolean not null default false,
 verified_media boolean not null default false,
 uploaded_at timestamptz not null default now(),
 uploaded_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 check (
 (provider_kind = 'hospital' and hospital_id is not null and doctor_id is null and pharmacy_id is null
 and lab_id is null)
 or (provider_kind = 'doctor'and doctor_id is not null and hospital_id is null
 and pharmacy_id is null and lab_id is null)
 or(provider_kind = 'pharmacy'and pharmacy_id is not null and hospital_id is null
 and doctor_id is null and lab_id is null)
 or(provider_kind = 'lab'and lab_id is not null and hospital_id is null and pharmacy_id is null
 and doctor_id is null)
 )
);

create index if not exists provider_media_hospital_id_idx on public.provider_media(hospital_id) where (provider_kind = 'hospital');
create index if not exists provider_media_doctor_id_idx on public.provider_media(doctor_id) where (provider_kind = 'doctor');
create index if not exists provider_media_pharmacy_id_idx on public.provider_media(pharmacy_id) where (provider_kind = 'pharmacy');
create index if not exists provider_media_lab_id_idx on public.provider_media(lab_id) where (provider_kind = 'lab');

-- ---------------------------------------------------------------------------
-- 2. Location-discovery indexes (haver/join acceleration).
-- ---------------------------------------------------------------------------
create index if not exists hospital_locations_city_idx on public.hospital_locations(city);
create index if not exists pharmacy_locations_city_idx on public.pharmacy_locations(city);
create index if not exists lab_locations_city_idx on public.lab_locations(city);

create index if not exists doctor_hospitals_doctor_id_idx on public.doctor_hospitals(doctor_id);
create index if not exists doctor_hospitals_is_primary_idx on public.doctor_hospitals(hospital_id, is_primary);
create index if not exists hospital_specialties_hospital_id_idx on public.hospital_specialties(hospital_id);
create index if not exists doctor_specialties_doctor_id_idx on public.doctor_specialties(doctor_id);
create index if not exists pharmacy_medicines_medicine_name_idx on public.pharmacy_medicines(medicine_name);
create index if not exists lab_tests_test_name_idx on public.lab_tests(test_name);

-- ---------------------------------------------------------------------------
-- 3. provider_media RLS public read for active delivery assets only; writes
-- never public authorized exclusively by the owning provider admin / super_admin.
-- ---------------------------------------------------------------------------
alter table public.provider_media enable row level security;

drop policy if exists provider_media_public_read on public.provider_media;
create policy provider_media_public_read on public.provider_media
 for select using (verified_media = true);

drop policy if exists provider_media_admin_insert on public.provider_media;
create policy provider_media_admin_insert on public.provider_media
 for insert with check (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 );

drop policy if exists provider_media_admin_update on public.provider_media;
create policy provider_media_admin_update on public.provider_media
 for update using (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 )
 with check (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 );

drop policy if exists provider_media_admin_delete on public.provider_media;
create policy provider_media_admin_delete on public.provider_media
 for delete using (
 (provider_kind = 'hospital'and public.carelink_is_hospital_admin(hospital_id))
 or (provider_kind = 'doctor'and public.carelink_is_doctor_linked(doctor_id))
 or (provider_kind = 'pharmacy'and public.carelink_is_pharmacy_admin(pharmacy_id))
 or (provider_kind = 'lab'and public.carelink_is_lab_admin(lab_id))
 or public.carelink_is_super_admin()
 );

drop trigger if exists set_updated_at on public.provider_media;
create trigger set_updated_at before update on public.provider_media
 for each row execute function carelink_set_updated_at();