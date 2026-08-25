-- ===========================================================================
-- CareLink-AI — Step 10.5 §5: Provider ecosystem (hospitals / doctors /
-- pharmacies / labs).
--
-- ADDITIVE ONLY. The Step 10 patient bookmark tables saved_hospitals,
-- saved_doctors, saved_pharmacies, saved_labs are NOT duplicated — they stay
-- patient bookmarks; these new tables are the provider registry.
--
-- Design:
--   - Provider DISCOVERY tables (name, address, services, hours, fees…) are
--     public-read, so anonymous browsing keeps working. They never contain
--     private admin fields.
--   - Provider VERIFICATION/ADMIN data lives in separate *_verification
--     tables with NO public policy (admin policies added in 0006_rbac.sql).
--   - lab_bookings is patient-owned → owner-scoped RLS (reuses the Step 10
--     carelink_apply_owner_rls helper).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- HOSPITALS
-- ---------------------------------------------------------------------------
create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text,
  city text,
  address text,
  phone_number text,
  email text,
  website text,
  rating numeric(2,1) check (rating is null or (rating >= 0 and rating <= 5)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.hospital_locations (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  label text,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists hospital_locations_hospital_id_idx on public.hospital_locations(hospital_id);

create table if not exists public.hospital_services (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  service_name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists hospital_services_hospital_id_idx on public.hospital_services(hospital_id);

create table if not exists public.hospital_specialties (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  unique (hospital_id, specialty_id)
);
create index if not exists hospital_specialties_specialty_id_idx on public.hospital_specialties(specialty_id);

create table if not exists public.hospital_hours (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_24_hours boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hospital_hours_hospital_id_idx on public.hospital_hours(hospital_id);

create table if not exists public.emergency_capabilities (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null unique references public.hospitals(id) on delete cascade,
  has_emergency_department boolean not null default false,
  has_ambulance boolean not null default false,
  has_icu boolean not null default false,
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- hospital_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.hospital_verification (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null unique references public.hospitals(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- DOCTORS
-- ---------------------------------------------------------------------------
create table if not exists public.doctors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  gender text check (gender in ('male','female','other','prefer_not_to_say')),
  years_experience integer check (years_experience is null or years_experience >= 0),
  bio text,
  photo_url text,
  languages jsonb not null default '[]'::jsonb,
  rating numeric(2,1) check (rating is null or (rating <= 5 and rating >= 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_profiles (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.doctors(id) on delete cascade,
  education_summary text,
  experience_summary text,
  about text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.doctor_specialties (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  specialty_id uuid not null references public.specialties(id) on delete cascade,
  unique (doctor_id, specialty_id)
);
create index if not exists doctor_specialties_specialty_id_idx on public.doctor_specialties(specialty_id);

-- doctor ↔ condition expertise mapping (the ONLY doctor/condition link table
-- — see hospital_doctors note below)
create table if not exists public.doctor_condition_expertise (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete cascade,
  unique (doctor_id, condition_id)
);
create index if not exists doctor_condition_expertise_condition_id_idx on public.doctor_condition_expertise(condition_id);

-- canonical doctor ↔ hospital link
create table if not exists public.doctor_hospitals (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  is_primary boolean not null default false,
  unique (doctor_id, hospital_id)
);
create index if not exists doctor_hospitals_hospital_id_idx on public.doctor_hospitals(hospital_id);

create table if not exists public.doctor_availability (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid references public.hospitals(id) on delete set null,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  start_time time not null,
  end_time time not null,
  slot_duration_minutes smallint not null default 30 check (slot_duration_minutes between 5 and 240),
  created_at timestamptz not null default now()
);
create index if not exists doctor_availability_doctor_id_idx on public.doctor_availability(doctor_id);

create table if not exists public.qualifications (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  degree text not null,
  institution text,
  year smallint,
  created_at timestamptz not null default now()
);
create index if not exists qualifications_doctor_id_idx on public.qualifications(doctor_id);

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  title text not null,
  issuer text,
  year smallint,
  created_at timestamptz not null default now()
);
create index if not exists certifications_doctor_id_idx on public.certifications(doctor_id);

create table if not exists public.consultation_fees (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  hospital_id uuid references public.hospitals(id) on delete set null,
  appointment_type text check (appointment_type in ('Consultation','Follow-up','Telehealth')),
  fee numeric(10,2) not null check (fee >= 0),
  currency text not null default 'INR',
  created_at timestamptz not null default now()
);
create index if not exists consultation_fees_doctor_id_idx on public.consultation_fees(doctor_id);

-- doctor_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.doctor_verification (
  id uuid primary key default gen_random_uuid(),
  doctor_id uuid not null unique references public.doctors(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- hospital_condition_services: hospital ↔ condition treated (for the
-- "relevant doctors first / Show all doctors" hospital-detail flow)
create table if not exists public.hospital_condition_services (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null references public.hospitals(id) on delete cascade,
  condition_id uuid not null references public.conditions(id) on delete cascade,
  unique (hospital_id, condition_id)
);
create index if not exists hospital_condition_services_condition_id_idx on public.hospital_condition_services(condition_id);

-- hospital_doctors: compat VIEW over the canonical doctor_hospitals link so
-- both naming styles work without a duplicated table.
create or replace view public.hospital_doctors
  with (security_invoker = true)
  as select id, doctor_id, hospital_id, is_primary from public.doctor_hospitals;

-- ---------------------------------------------------------------------------
-- PHARMACIES
-- ---------------------------------------------------------------------------
create table if not exists public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  address text,
  city text,
  phone_number text,
  rating numeric(2,1) check (rating is null or (rating <= 5 and rating >= 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pharmacy_locations (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  label text,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_locations_pharmacy_id_idx on public.pharmacy_locations(pharmacy_id);

create table if not exists public.pharmacy_hours (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_24_hours boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_hours_pharmacy_id_idx on public.pharmacy_hours(pharmacy_id);

create table if not exists public.pharmacy_medicines (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies(id) on delete cascade,
  medicine_name text not null,
  brand text,
  dosage_form text,
  strength text,
  created_at timestamptz not null default now()
);
create index if not exists pharmacy_medicines_pharmacy_id_idx on public.pharmacy_medicines(pharmacy_id);

create table if not exists public.medicine_inventory (
  id uuid primary key default gen_random_uuid(),
  pharmacy_medicine_id uuid not null references public.pharmacy_medicines(id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  unit_price numeric(10,2) check (unit_price is null or unit_price >= 0),
  in_stock boolean not null default false,
  updated_at timestamptz not null default now()
);
create index if not exists medicine_inventory_pharmacy_medicine_id_idx on public.medicine_inventory(pharmacy_medicine_id);

-- pharmacy_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.pharmacy_verification (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null unique references public.pharmacies(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- LABS
-- ---------------------------------------------------------------------------
create table if not exists public.labs (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  address text,
  city text,
  phone_number text,
  rating numeric(2,1) check (rating is null or (rating <= 5 and rating >= 0)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_locations (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  label text,
  address text,
  city text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz not null default now()
);
create index if not exists lab_locations_lab_id_idx on public.lab_locations(lab_id);

create table if not exists public.lab_tests (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  test_name text not null,
  description text,
  price numeric(10,2) check (price is null or price >= 0),
  created_at timestamptz not null default now()
);
create index if not exists lab_tests_lab_id_idx on public.lab_tests(lab_id);

create table if not exists public.lab_services (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  service_name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists lab_services_lab_id_idx on public.lab_services(lab_id);

create table if not exists public.lab_hours (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.labs(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  open_time time,
  close_time time,
  is_24_hours boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists lab_hours_lab_id_idx on public.lab_hours(lab_id);

-- lab_verification: NO public read; admin/provider policies in 0006.
create table if not exists public.lab_verification (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null unique references public.labs(id) on delete cascade,
  status text not null check (status in ('pending','verified','rejected')) default 'pending',
  verified_by uuid references auth.users(id),
  notes text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- lab_bookings: PATIENT-OWNED (owner-scoped, not public)
create table if not exists public.lab_bookings (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  lab_id uuid not null references public.labs(id) on delete restrict,
  lab_test_id uuid references public.lab_tests(id) on delete set null,
  scheduled_at timestamptz not null,
  status text not null check (status in ('scheduled','completed','cancelled')) default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists lab_bookings_owner_id_idx on public.lab_bookings(owner_id);
create index if not exists lab_bookings_family_profile_id_idx on public.lab_bookings(family_profile_id);
create index if not exists lab_bookings_lab_id_idx on public.lab_bookings(lab_id);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'hospitals','hospital_verification','doctors','doctor_profiles',
    'doctor_verification','pharmacies','pharmacy_verification','labs',
    'lab_verification','lab_bookings','medicine_inventory'
  ]
  loop
    execute format(
      'drop trigger if exists set_updated_at on public.%I;
       create trigger set_updated_at before update on public.%I
       for each row execute function carelink_set_updated_at();', t, t);
  end loop;
end $$;

-- lab_bookings family-profile ownership enforcement (Step 10.5 §2 helper)
drop trigger if exists carelink_family_profile_ownership on public.lab_bookings;
create trigger carelink_family_profile_ownership
  before insert or update on public.lab_bookings
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- ---------------------------------------------------------------------------
-- RLS — enable + scoped policies
-- ---------------------------------------------------------------------------

-- Public discovery tables: SELECT for everyone (anon browsing works).
do $$
declare t text;
begin
  foreach t in array array[
    'hospitals','hospital_locations','hospital_services','hospital_specialties',
    'hospital_hours','emergency_capabilities','hospital_condition_services',
    'doctors','doctor_profiles','doctor_specialties','doctor_condition_expertise',
    'doctor_hospitals','doctor_availability','qualifications','certifications',
    'consultation_fees',
    'pharmacies','pharmacy_locations','pharmacy_hours','pharmacy_medicines',
    'medicine_inventory',
    'labs','lab_locations','lab_tests','lab_services','lab_hours'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format(
      'drop policy if exists %1$s_public_read on public.%1$I;
       create policy %1$s_public_read on public.%1$I
         for select using (true);',
      t);
  end loop;
end $$;

-- Verification tables: RLS enabled, deliberately WITHOUT any client policy yet
-- (no read/write). Admin/provider-member access is added in 0006_rbac.sql.
do $$
declare t text;
begin
  foreach t in array array[
    'hospital_verification','doctor_verification','pharmacy_verification','lab_verification'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
  end loop;
end $$;

-- lab_bookings: owner-scoped (Step 10 helper)
do $$
begin
  execute 'alter table public.lab_bookings enable row level security';
  perform public.carelink_apply_owner_rls('lab_bookings');
end $$;
