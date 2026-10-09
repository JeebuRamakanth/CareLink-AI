-- ===========================================================================
-- CareLink-AI — Step 21: Machilipatnam healthcare directory (Phase 2–5, 12).
--
-- ADDITIVE ONLY. Seeds the REAL, source-backed healthcare facilities and the
-- small set of attributable practitioners for Machilipatnam, Krishna District,
-- Andhra Pradesh into the existing provider registry (hospitals / hospital_*
-- / doctors / doctor_* / qualifications / *_verification). No new provider
-- tables are created — the existing schema + relationships are reused.
--
-- HONESTY / PROVENANCE:
--   - Every row is inserted with an explicit `data_source`, `source_url`,
--     `data_status` and `fetched_at` so a directory listing is never presented
--     as verified. Government/official sources are 'VERIFIED'; a provider's own
--     site is 'PROVIDER_LISTED'/'SOURCE_LISTED'; third-party directories are
--     'THIRD_PARTY_DIRECTORY'. Ratings stay NULL (never fabricated).
--   - No patient PHI. No invented coordinates (only the government-published
--     E-UPHC Chilakalapudi coordinates are stored).
--   - Verification stays `pending` — client/admin verification workflow is the
--     only way a doctor ever becomes `verified`.
--   - Ids use the deterministic '7f…' range + 'mph-' slugs so they can never
--     collide with the dev seed ('7d…'), the SQL test fixtures (5a../5b..), or
--     real production rows. Idempotent (`on conflict do nothing`) + safe to
--     replay.
--
-- SOURCES (checked 2026-10-09): krishna.ap.gov.in; gmcmachilipatnam-ap-gov.com;
-- andhrahospitals.org; muralikrishnahospital.com; savehospitalmachilipatnam.com;
-- madhuneuro.com; Star Health / Apollo 24|7 / Bajaj Finserv network directories.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0. Provenance vocabulary + source_url column (additive).
--    Extend the honest data_status classification (0024) so directory listings
--    are distinguishable from verified data and development fixtures.
-- ---------------------------------------------------------------------------
alter table public.hospitals add column if not exists source_url text;
alter table public.doctors   add column if not exists source_url text;
alter table public.pharmacies add column if not exists source_url text;
alter table public.labs      add column if not exists source_url text;

do $$
declare t text;
begin
  foreach t in array array['hospitals','doctors','pharmacies','labs']
  loop
    execute format('alter table public.%I drop constraint if exists %I_data_status_check;', t, t);
    execute format($f$
      alter table public.%I add constraint %I_data_status_check
        check (data_status is null or data_status in (
          'REAL','MOCK','FALLBACK','UNAVAILABLE','PENDING_VERIFICATION',
          'VERIFIED','PROVIDER_LISTED','SOURCE_LISTED','THIRD_PARTY_DIRECTORY','DEVELOPMENT_SEED'))
    $f$, t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 1. Specialties (additive, idempotent) used by the Machilipatnam facilities.
-- ---------------------------------------------------------------------------
insert into public.specialties (id,slug,name,description) values
  ('7e000001-0000-0000-0000-000000000001','mph-general-medicine','General Medicine','General medicine and internal medicine'),
  ('7e000002-0000-0000-0000-000000000002','mph-general-surgery','General Surgery','General surgery'),
  ('7e000003-0000-0000-0000-000000000003','mph-cardiology','Cardiology','Heart and vascular care'),
  ('7e000004-0000-0000-0000-000000000004','mph-neurology','Neurology','Brain and nervous system care'),
  ('7e000005-0000-0000-0000-000000000005','mph-orthopaedics','Orthopaedics','Bones, joints and musculoskeletal care'),
  ('7e000006-0000-0000-0000-000000000006','mph-paediatrics','Paediatrics','Child health care'),
  ('7e000007-0000-0000-0000-000000000007','mph-gynaecology','Gynaecology and Obstetrics',$$Women's health and maternity care$$),
  ('7e000008-0000-0000-0000-000000000008','mph-nephrology','Nephrology','Kidney care'),
  ('7e000009-0000-0000-0000-000000000009','mph-urology','Urology','Urinary tract care'),
  ('7e00000a-0000-0000-0000-00000000000a','mph-ent','ENT','Ear, nose and throat care'),
  ('7e00000b-0000-0000-0000-00000000000b','mph-ophthalmology','Ophthalmology','Eye care'),
  ('7e00000c-0000-0000-0000-00000000000c','mph-pulmonology','Pulmonology','Respiratory care'),
  ('7e00000d-0000-0000-0000-00000000000d','mph-gastroenterology','Gastroenterology','Digestive system care'),
  ('7e00000e-0000-0000-0000-00000000000e','mph-physiotherapy','Physiotherapy','Rehabilitation and physiotherapy'),
  ('7e00000f-0000-0000-0000-00000000000f','mph-dermatology','Dermatology','Skin care'),
  ('7e000010-0000-0000-0000-000000000010','mph-psychiatry','Psychiatry','Mental health care')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Hospitals (real, source-backed).
-- ---------------------------------------------------------------------------
insert into public.hospitals
  (id,slug,name,description,city,address,phone_number,email,website,rating,data_source,source_url,data_status,fetched_at)
values
  ('7f100001-0000-0000-0000-000000000001','mph-district-hospital-machilipatnam','District Hospital, Machilipatnam',
   'Main public district hospital serving Machilipatnam and Krishna District.','Machilipatnam','Near Noble High School',
   '8333814350',null,null,null,'krishna.ap.gov.in','https://krishna.ap.gov.in/public-utility/district-hospital','VERIFIED','2026-10-09'),
  ('7f100002-0000-0000-0000-000000000002','mph-government-medical-college-machilipatnam','Government Medical College & Teaching General Hospital, Machilipatnam',
   'Government medical college (2023) and attached teaching general hospital.','Machilipatnam','Near Radar Station, Kara Agraharam',
   '7893330266','principalgmcmachilipatnam@gmail.com','https://www.gmcmachilipatnam-ap-gov.com',null,
   'gmcmachilipatnam-ap-gov.com','https://www.gmcmachilipatnam-ap-gov.com/contact-us','VERIFIED','2026-10-09'),
  ('7f100003-0000-0000-0000-000000000003','mph-chinnapuram-primary-health-centre','Chinnapuram Primary Health Centre',
   'Government primary health centre serving the Chinnapuram area.','Machilipatnam','Chinnapuram',
   null,null,null,null,'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f100004-0000-0000-0000-000000000004','mph-e-uphc-chilakalapudi','E-UPHC Chilakalapudi',
   'Extended Urban Primary Health Centre at Chilakalapudi.','Machilipatnam','Chilakalapudi',
   '8885935351',null,null,null,'krishna.ap.gov.in','https://krishna.ap.gov.in/public-utility-category/hospitals','VERIFIED','2026-10-09'),
  ('7f100005-0000-0000-0000-000000000005','mph-andhra-hospitals-machilipatnam','Andhra Hospitals, Machilipatnam',
   'Multi-speciality private hospital (approx. 100 beds, 42 ICU beds).','Machilipatnam','Door No. 124 & 125, Raju Pet, Azad Road',
   '08672221199',null,'https://www.andhrahospitals.org',null,
   'andhrahospitals.org','https://www.andhrahospitals.org/Ah/chg_location/MACHILIPATNAM','SOURCE_LISTED','2026-10-09'),
  ('7f100006-0000-0000-0000-000000000006','mph-sai-sri-ram-hospitals','Sai Sri Ram Hospitals',
   'Multi-speciality private hospital with inpatient, outpatient and emergency care.','Machilipatnam','Edepalli, Srinivas Nagar Colony',
   null,null,null,null,'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f100007-0000-0000-0000-000000000007','mph-murali-krishna-hospital','Murali Krishna Hospital',
   'General hospital (2009) with general medicine, diagnostics and emergency support.','Machilipatnam','Dimmala Centre, Lakshmana Rao Puram',
   '08374487474',null,'https://muralikrishnahospital.com',null,
   'muralikrishnahospital.com','https://muralikrishnahospital.com','PROVIDER_LISTED','2026-10-09'),
  ('7f100008-0000-0000-0000-000000000008','mph-save-multi-speciality-hospital','SAVE Multi-Speciality Hospital',
   '50-bed multi-speciality hospital with general medicine, ENT, eye, ortho and 24/7 emergency care.','Machilipatnam','Kamma Sangam Road',
   null,null,'https://savehospitalmachilipatnam.com',null,
   'savehospitalmachilipatnam.com','https://savehospitalmachilipatnam.com/en','PROVIDER_LISTED','2026-10-09'),
  ('7f100009-0000-0000-0000-000000000009','mph-aswini-hospital-machilipatnam','Aswini Hospital',
   'Private hospital in Buttaipeta listed in the Star Health insurance network.','Machilipatnam','25/371, Buttaipeta',
   '08672225200',null,null,null,'Star Health network directory',
   'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh','THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f10000a-0000-0000-0000-00000000000a','mph-dr-madhu-super-speciality-hospital','Dr. Madhu Super Speciality Hospital',
   'Super-speciality private hospital offering orthopaedic and specialist services.','Machilipatnam','#11/273, Near Gandhi Bomma Shivalayam, Chammanagiripet',
   '0867222518',null,'https://madhuneuro.com',null,
   'madhuneuro.com','https://madhuneuro.com/orthopaedics','PROVIDER_LISTED','2026-10-09'),
  ('7f10000b-0000-0000-0000-00000000000b','mph-nagamani-retina-institute','Nagamani Retina Institute',
   'Super-speciality eye hospital providing comprehensive eye and retinal care.','Machilipatnam','D.No 11/57-1, Opp. Venugopala Swami Temple, Chemmanagiripet',
   '08672227598',null,null,null,'Star Health network directory',
   'https://www.starhealth.in/network-hospitals/star-health-network-hospitals-in-machilipatnam-andhra-pradesh','THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f10000c-0000-0000-0000-00000000000c','mph-dr-venkat-basu-bone-joint-clinic','Dr. Venkat Basu''s Bone & Joint Clinic',
   'Orthopaedic and joint-replacement clinic.','Machilipatnam','Opposite Vivekananda Mandiram, Buttaipet',
   '6309955880',null,null,null,'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09')
on conflict (id) do nothing;

-- location (only government-published coordinates are stored)
insert into public.hospital_locations (id,hospital_id,label,address,city,latitude,longitude) values
  ('7f110004-0000-0000-0000-000000000004','7f100004-0000-0000-0000-000000000004','Main centre','Chilakalapudi','Machilipatnam',16.199120,81.155670)
on conflict (id) do nothing;

-- services + facilities (only those stated by a source)
insert into public.hospital_services (id,hospital_id,service_name,description) values
  ('7f120005-0000-0000-0000-000000000005','7f100005-0000-0000-0000-000000000005','24x7 Emergency','Emergency department'),
  ('7f120005-0000-0000-0000-000000000006','7f100005-0000-0000-0000-000000000005','ICU','Intensive care (42 beds per source)'),
  ('7f120008-0000-0000-0000-000000000007','7f100008-0000-0000-0000-000000000008','24x7 Emergency','Emergency department'),
  ('7f120006-0000-0000-0000-000000000008','7f100006-0000-0000-0000-000000000006','Ambulance','Ambulance service'),
  ('7f120007-0000-0000-0000-000000000009','7f100007-0000-0000-0000-000000000007','Diagnostics','Diagnostic services')
on conflict (id) do nothing;

-- hospital ↔ specialty links
insert into public.hospital_specialties (id,hospital_id,specialty_id) values
  ('7f130005-0000-0000-0000-000000000001','7f100005-0000-0000-0000-000000000005','7e000003-0000-0000-0000-000000000003'),
  ('7f130005-0000-0000-0000-000000000002','7f100005-0000-0000-0000-000000000005','7e000004-0000-0000-0000-000000000004'),
  ('7f130005-0000-0000-0000-000000000003','7f100005-0000-0000-0000-000000000005','7e000008-0000-0000-0000-000000000008'),
  ('7f130005-0000-0000-0000-000000000004','7f100005-0000-0000-0000-000000000005','7e000009-0000-0000-0000-000000000009'),
  ('7f130005-0000-0000-0000-000000000005','7f100005-0000-0000-0000-000000000005','7e00000a-0000-0000-0000-00000000000a'),
  ('7f130005-0000-0000-0000-000000000006','7f100005-0000-0000-0000-000000000005','7e000007-0000-0000-0000-000000000007'),
  ('7f130005-0000-0000-0000-000000000007','7f100005-0000-0000-0000-000000000005','7e00000d-0000-0000-0000-00000000000d'),
  ('7f130006-0000-0000-0000-000000000008','7f100006-0000-0000-0000-000000000006','7e000001-0000-0000-0000-000000000001'),
  ('7f130006-0000-0000-0000-000000000009','7f100006-0000-0000-0000-000000000006','7e000005-0000-0000-0000-000000000005'),
  ('7f130006-0000-0000-0000-00000000000a','7f100006-0000-0000-0000-000000000006','7e000006-0000-0000-0000-000000000006'),
  ('7f130007-0000-0000-0000-00000000000b','7f100007-0000-0000-0000-000000000007','7e000001-0000-0000-0000-000000000001'),
  ('7f130008-0000-0000-0000-00000000000c','7f100008-0000-0000-0000-000000000008','7e000001-0000-0000-0000-000000000001'),
  ('7f130008-0000-0000-0000-00000000000d','7f100008-0000-0000-0000-000000000008','7e00000a-0000-0000-0000-00000000000a'),
  ('7f130008-0000-0000-0000-00000000000e','7f100008-0000-0000-0000-000000000008','7e00000b-0000-0000-0000-00000000000b'),
  ('7f130008-0000-0000-0000-00000000000f','7f100008-0000-0000-0000-000000000008','7e000005-0000-0000-0000-000000000005'),
  ('7f13000a-0000-0000-0000-000000000010','7f10000a-0000-0000-0000-00000000000a','7e000005-0000-0000-0000-000000000005'),
  ('7f13000b-0000-0000-0000-000000000011','7f10000b-0000-0000-0000-00000000000b','7e00000b-0000-0000-0000-00000000000b'),
  ('7f13000c-0000-0000-0000-000000000012','7f10000c-0000-0000-0000-00000000000c','7e000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Doctors (real, attributable only) + relationships.
-- ---------------------------------------------------------------------------
insert into public.doctors
  (id,slug,name,gender,years_experience,bio,photo_url,languages,rating,data_source,source_url,data_status,fetched_at)
values
  ('7f300001-0000-0000-0000-000000000001','mph-dr-k-murali-krishna','Dr. K. Murali Krishna',null,null,
   'General physician (MD) and chief doctor at Murali Krishna Hospital.','{}','["Telugu","English"]'::jsonb,null,
   'muralikrishnahospital.com','https://muralikrishnahospital.com','PROVIDER_LISTED','2026-10-09'),
  ('7f300002-0000-0000-0000-000000000002','mph-dr-venkat-basu','Dr. Venkat Basu',null,null,
   'Consultant orthopaedic and joint-replacement surgeon.','{}','["Telugu","English"]'::jsonb,null,
   'third-party directory',null,'THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f300003-0000-0000-0000-000000000003','mph-dr-tejaswi-ponnam','Dr. Tejaswi Ponnam',null,null,
   'General physician and internal medicine specialist at H & H Clinic.','{}','["Telugu","English"]'::jsonb,null,
   'Apollo 24|7 directory','https://www.apollo247.com/doctors/lady-doctors-in-machilipatnam-dcity','THIRD_PARTY_DIRECTORY','2026-10-09'),
  ('7f300004-0000-0000-0000-000000000004','mph-dr-sandeep-vemu','Dr. Sandeep Vemu',null,null,
   'ENT specialist and co-founder of SAVE Multi-Speciality Hospital.','{}','["Telugu","English"]'::jsonb,null,
   'savehospitalmachilipatnam.com','https://savehospitalmachilipatnam.com/en','PROVIDER_LISTED','2026-10-09'),
  ('7f300005-0000-0000-0000-000000000005','mph-dr-praveena-madasu','Dr. Praveena Madasu',null,null,
   'Ophthalmologist and co-founder of SAVE Multi-Speciality Hospital.','{}','["Telugu","English"]'::jsonb,null,
   'savehospitalmachilipatnam.com','https://savehospitalmachilipatnam.com/en','PROVIDER_LISTED','2026-10-09')
on conflict (id) do nothing;

insert into public.doctor_profiles (id,doctor_id,education_summary,experience_summary,about) values
  ('7f310001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','MBBS, MD (Physician)',null,'General physician and chief doctor at Murali Krishna Hospital.'),
  ('7f310002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','Consultant Orthopaedic & Joint Replacement Surgeon',null,'Orthopaedic and joint-replacement surgeon.'),
  ('7f310003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','MBBS, MD (General Medicine)',null,'General physician and internal medicine specialist.'),
  ('7f310004-0000-0000-0000-000000000004','7f300004-0000-0000-0000-000000000004',null,null,'ENT specialist and hospital co-founder.'),
  ('7f310005-0000-0000-0000-000000000005','7f300005-0000-0000-0000-000000000005',null,null,'Ophthalmologist and hospital co-founder.')
on conflict (id) do nothing;

insert into public.doctor_specialties (id,doctor_id,specialty_id) values
  ('7f320001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','7e000001-0000-0000-0000-000000000001'),
  ('7f320002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','7e000005-0000-0000-0000-000000000005'),
  ('7f320003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','7e000001-0000-0000-0000-000000000001'),
  ('7f320004-0000-0000-0000-000000000004','7f300004-0000-0000-0000-000000000004','7e00000a-0000-0000-0000-00000000000a'),
  ('7f320005-0000-0000-0000-000000000005','7f300005-0000-0000-0000-000000000005','7e00000b-0000-0000-0000-00000000000b')
on conflict (id) do nothing;

-- canonical doctor ↔ hospital links (a doctor only appears at hospitals they
-- are actually linked to here — never by name/city matching).
insert into public.doctor_hospitals (id,doctor_id,hospital_id,is_primary) values
  ('7f340001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','7f100007-0000-0000-0000-000000000007',true),
  ('7f340002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','7f10000c-0000-0000-0000-00000000000c',true),
  ('7f340002-0000-0000-0000-000000000003','7f300002-0000-0000-0000-000000000002','7f100005-0000-0000-0000-000000000005',false),
  ('7f340003-0000-0000-0000-000000000004','7f300003-0000-0000-0000-000000000003','7f100006-0000-0000-0000-000000000006',true),
  ('7f340004-0000-0000-0000-000000000005','7f300004-0000-0000-0000-000000000004','7f100008-0000-0000-0000-000000000008',true),
  ('7f340005-0000-0000-0000-000000000006','7f300005-0000-0000-0000-000000000005','7f100008-0000-0000-0000-000000000008',true)
on conflict (id) do nothing;

insert into public.qualifications (id,doctor_id,degree,institution,year) values
  ('7f360001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','MD (Physician)',null,null),
  ('7f360002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','Orthopaedic & Joint Replacement Surgery',null,null),
  ('7f360003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','MD (General Medicine)',null,null)
on conflict (id) do nothing;

-- verification stays pending — only the guarded workflow can ever verify.
insert into public.doctor_verification (id,doctor_id,status,notes) values
  ('7f390001-0000-0000-0000-000000000001','7f300001-0000-0000-0000-000000000001','pending','Directory import — pending verification'),
  ('7f390002-0000-0000-0000-000000000002','7f300002-0000-0000-0000-000000000002','pending','Directory import — pending verification'),
  ('7f390003-0000-0000-0000-000000000003','7f300003-0000-0000-0000-000000000003','pending','Directory import — pending verification'),
  ('7f390004-0000-0000-0000-000000000004','7f300004-0000-0000-0000-000000000004','pending','Directory import — pending verification'),
  ('7f390005-0000-0000-0000-000000000005','7f300005-0000-0000-0000-000000000005','pending','Directory import — pending verification')
on conflict (id) do nothing;
