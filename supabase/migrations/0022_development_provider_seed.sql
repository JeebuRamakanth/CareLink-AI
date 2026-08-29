-- ===========================================================================
-- CareLink-AI - Step 15 (Phase 12): DEVELOPMENT provider/master seed.
--
-- Clearly-marked DEVELOPMENT/TEST provider records so a fresh Supabase project
-- has realistic-but-flagged discovery data for the directory / search /
-- relevant-doctor / booking flows the moment credentials are wired.
--
-- SAFETY:
--   - Slugs use a `dev-` prefix and ids use the deterministic `7d...` range so
--     they can never collide with the SQL test harness fixtures (5a../5e../6a..),
--     static frontend data, or real production records.
--   - No patient PHI is seeded (providers only). Verification stays `pending`
--     - dev records are never presented as production-verified.
--   - Additive + idempotent (`on conflict (id) do nothing`). Safe to replay
--     against a database that already has real providers.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Master data - specialties / conditions / symptoms (dev-flagged)
-- ---------------------------------------------------------------------------
insert into public.specialties (id,slug,name,description) values
  ('7d000001-0000-0000-0000-000000000001','dev-cardiology','Cardiology (dev)','Development seed specialty'),
  ('7d000002-0000-0000-0000-000000000002','dev-endocrinology','Endocrinology (dev)','Development seed specialty'),
  ('7d000003-0000-0000-0000-000000000003','dev-neurology','Neurology (dev)','Development seed specialty'),
  ('7d000004-0000-0000-0000-000000000004','dev-orthopedics','Orthopedics (dev)','Development seed specialty'),
  ('7d000005-0000-0000-0000-000000000005','dev-pediatrics','Pediatrics (dev)','Development seed specialty'),
  ('7d000006-0000-0000-0000-000000000006','dev-family-medicine','Family Medicine (dev)','Development seed specialty')
on conflict (id) do nothing;
insert into public.conditions (id,slug,name,description) values
  ('7d100001-0000-0000-0000-000000000001','dev-diabetes','Diabetes mellitus (dev)','Development seed condition'),
  ('7d100002-0000-0000-0000-000000000002','dev-hypertension','Hypertension (dev)','Development seed condition'),
  ('7d100003-0000-0000-0000-000000000003','dev-migraine','Migraine (dev)','Development seed condition'),
  ('7d100004-0000-0000-0000-000000000004','dev-arthritis','Arthritis (dev)','Development seed condition'),
  ('7d100005-0000-0000-0000-000000000005','dev-asthma','Asthma (dev)','Development seed condition')
on conflict (id) do nothing;
insert into public.symptoms (id,slug,name,description) values
  ('7d110001-0000-0000-0000-000000000001','dev-fatigue','Fatigue (dev)','Development seed symptom'),
  ('7d110002-0000-0000-0000-000000000002','dev-headache','Headache (dev)','Development seed symptom'),
  ('7d110003-0000-0000-0000-000000000003','dev-excessive-thirst','Excessive thirst (dev)','Development seed symptom'),
  ('7d110004-0000-0000-0000-000000000004','dev-joint-pain','Joint pain (dev)','Development seed symptom'),
  ('7d110005-0000-0000-0000-000000000005','dev-shortness-of-breath','Shortness of breath (dev)','Development seed symptom')
on conflict (id) do nothing;
insert into public.symptom_conditions (symptom_id,condition_id,weight) values
  ('7d110001-0000-0000-0000-000000000001','7d100001-0000-0000-0000-000000000001',0.6),
  ('7d110002-0000-0000-0000-000000000002','7d100003-0000-0000-0000-000000000003',0.5),
  ('7d110003-0000-0000-0000-000000000003','7d100001-0000-0000-0000-000000000001',0.4),
  ('7d110004-0000-0000-0000-000000000004','7d100004-0000-0000-0000-000000000004',0.5),
  ('7d110005-0000-0000-0000-000000000005','7d100005-0000-0000-0000-000000000005',0.5)
on conflict (id) do nothing;
insert into public.condition_specialties (condition_id,specialty_id) values
  ('7d100001-0000-0000-0000-000000000001','7d000002-0000-0000-0000-000000000002'),
  ('7d100001-0000-0000-0000-000000000001','7d000001-0000-0000-0000-000000000001'),
  ('7d100002-0000-0000-0000-000000000002','7d000001-0000-0000-0000-000000000001'),
  ('7d100003-0000-0000-0000-000000000003','7d000003-0000-0000-0000-000000000003'),
  ('7d100004-0000-0000-0000-000000000004','7d000004-0000-0000-0000-000000000004'),
  ('7d100005-0000-0000-0000-000000000005','7d000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Hospitals (dev-flagged)
-- ---------------------------------------------------------------------------
insert into public.hospitals (id,slug,name,description,city,address,phone_number,email,website,rating) values
  ('7d200001-0000-0000-0000-000000000001','dev-bloomfield-city-hospital','Bloomfield City Hospital (dev)','Development seed multispeciality hospital focused on cardiac and metabolic care.','Hyderabad','8-10 Bloomfield Road, Begumpet','+91 40 0000 0001','dev-bloomfield@example.in','https://example.in/dev-bloomfield',4.2),
  ('7d200002-0000-0000-0000-000000000002','dev-aurora-neuro-hospital','Aurora Neuro and Cardiac Institute (dev)','Development seed tertiary hospital for neurology and cardiology.','Bengaluru','42 Aurora Avenue, Indiranagar','+91 80 0000 0002','dev-aurora@example.in','https://example.in/dev-aurora',4.6),
  ('7d200003-0000-0000-0000-000000000003','dev-riverside-ortho-children-hospital','Riverside Ortho and Children Hospital (dev)','Development seed hospital for orthopedics, pediatrics and family care.','Chennai','19 Riverside Drive, Adyar','+91 44 0000 0003','dev-riverside@example.in','https://example.in/dev-riverside',4.4)
on conflict (id) do nothing;
insert into public.hospital_locations (id,hospital_id,label,address,city,latitude,longitude) values
  ('7d210001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','Main campus','8-10 Bloomfield Road, Begumpet','Hyderabad',17.441700,78.465400),
  ('7d210002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','Main campus','42 Aurora Avenue, Indiranagar','Bengaluru',12.971900,77.641200),
  ('7d210003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003','Main campus','19 Riverside Drive, Adyar','Chennai',13.001200,80.256500)
on conflict (id) do nothing;
insert into public.hospital_services (id,hospital_id,service_name,description) values
  ('7d220001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','24x7 emergency','Emergency department (dev)'),
  ('7d220002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','Cardiac ICU','ICU (dev)'),
  ('7d220003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','Stroke unit','Neuro ICU (dev)'),
  ('7d220004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','Pediatric ER','Children emergency (dev)'),
  ('7d220005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','Joint replacement unit','Ortho ward (dev)')
on conflict (id) do nothing;
insert into public.hospital_specialties (id,hospital_id,specialty_id) values
  ('7d230001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','7d000001-0000-0000-0000-000000000001'),
  ('7d230002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','7d000002-0000-0000-0000-000000000002'),
  ('7d230003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','7d000001-0000-0000-0000-000000000001'),
  ('7d230004-0000-0000-0000-000000000004','7d200002-0000-0000-0000-000000000002','7d000003-0000-0000-0000-000000000003'),
  ('7d230005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','7d000004-0000-0000-0000-000000000004'),
  ('7d230006-0000-0000-0000-000000000006','7d200003-0000-0000-0000-000000000003','7d000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.hospital_condition_services (id,hospital_id,condition_id) values
  ('7d240001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','7d100001-0000-0000-0000-000000000001'),
  ('7d240002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','7d100003-0000-0000-0000-000000000003'),
  ('7d240003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003','7d100004-0000-0000-0000-000000000004'),
  ('7d240004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','7d100005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.hospital_hours (id,hospital_id,day_of_week,open_time,close_time,is_24_hours) values
  ('7d250001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',0,null,null,true),
  ('7d250002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',0,null,null,true),
  ('7d250003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003',0,'08:00','22:00',false)
on conflict (id) do nothing;
insert into public.emergency_capabilities (id,hospital_id,has_emergency_department,has_ambulance,has_icu,capabilities) values
  ('7d260001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',true,true,true,'{"devSeed":true}'::jsonb),
  ('7d260002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',true,true,true,'{"devSeed":true}'::jsonb),
  ('7d260003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003',true,false,true,'{"devSeed":true}'::jsonb)
on conflict (id) do nothing;
insert into public.hospital_verification (id,hospital_id,status,notes) values
  ('7d270001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d270002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','pending','Development seed record - pending verification'),
  ('7d270003-0000-0000-0000-000000000003','7d200003-0000-0000-0000-000000000003','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Doctors (dev-flagged)
-- ---------------------------------------------------------------------------
insert into public.doctors (id,slug,name,gender,years_experience,bio,photo_url,languages,rating) values
  ('7d300001-0000-0000-0000-000000000001','dev-dr-a-sharma','Dr. A. Sharma (dev)','female',12,'Development seed endocrinologist treating diabetes and metabolic disorders.',null,'["English","Hindi","Telugu"]'::jsonb,4.3),
  ('7d300002-0000-0000-0000-000000000002','dev-dr-b-nair','Dr. B. Nair (dev)','male',16,'Development seed interventional cardiologist for cardiac care.',null,'["English","Malayalam"]'::jsonb,4.7),
  ('7d300003-0000-0000-0000-000000000003','dev-dr-c-rao','Dr. C. Rao (dev)','male',9,'Development seed neurologist specializing in migraine care.',null,'["English","Kannada","Hindi"]'::jsonb,4.5),
  ('7d300004-0000-0000-0000-000000000004','dev-dr-d-mehta','Dr. D. Mehta (dev)','female',14,'Development seed orthopedic surgeon for joint replacement.',null,'["English","Hindi"]'::jsonb,4.6),
  ('7d300005-0000-0000-0000-000000000005','dev-dr-e-iyer','Dr. E. Iyer (dev)','male',8,'Development seed pediatric pulmonologist for asthma care.',null,'["English","Tamil"]'::jsonb,4.4)
on conflict (id) do nothing;
insert into public.doctor_profiles (id,doctor_id,education_summary,experience_summary,about) values
  ('7d310001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','MBBS, MD (Endocrinology) - dev','12+ years - dev','Development seed profile.'),
  ('7d310002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','MBBS, DM (Cardiology) - dev','16+ years - dev','Development seed profile.'),
  ('7d310003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','MBBS, MD (Neurology) - dev','9+ years - dev','Development seed profile.'),
  ('7d310004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','MBBS, MS (Orthopedics) - dev','14+ years - dev','Development seed profile.'),
  ('7d310005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','MBBS, MD (Pediatrics) - dev','8+ years - dev','Development seed profile.')
on conflict (id) do nothing;
insert into public.doctor_specialties (id,doctor_id,specialty_id) values
  ('7d320001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d000002-0000-0000-0000-000000000002'),
  ('7d320002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d000001-0000-0000-0000-000000000001'),
  ('7d320003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','7d000003-0000-0000-0000-000000000003'),
  ('7d320004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','7d000004-0000-0000-0000-000000000004'),
  ('7d320005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','7d000005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.doctor_condition_expertise (id,doctor_id,condition_id) values
  ('7d330001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d100001-0000-0000-0000-000000000001'),
  ('7d330002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d100001-0000-0000-0000-000000000001'),
  ('7d330003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d100002-0000-0000-0000-000000000002'),
  ('7d330004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d100003-0000-0000-0000-000000000003'),
  ('7d330005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d100004-0000-0000-0000-000000000004'),
  ('7d330006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d100005-0000-0000-0000-000000000005')
on conflict (id) do nothing;
insert into public.doctor_hospitals (id,doctor_id,hospital_id,is_primary) values
  ('7d340001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',true),
  ('7d340002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001',true),
  ('7d340003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',false),
  ('7d340004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002',true),
  ('7d340005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003',true),
  ('7d340006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003',true)
on conflict (id) do nothing;
insert into public.doctor_availability (id,doctor_id,hospital_id,day_of_week,start_time,end_time,slot_duration_minutes) values
  ('7d350001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001',1,'09:00','17:00',30),
  ('7d350002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001',2,'10:00','18:00',30),
  ('7d350003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002',3,'10:00','16:00',30),
  ('7d350004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002',3,'08:30','15:30',30),
  ('7d350005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003',4,'09:00','17:00',30),
  ('7d350006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003',5,'09:30','16:30',30)
on conflict (id) do nothing;
insert into public.qualifications (id,doctor_id,degree,institution,year) values
  ('7d360001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','MD Endocrinology','Dev Medical College - dev',2014),
  ('7d360002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','DM Cardiology','Dev Medical College - dev',2012),
  ('7d360003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','MD Neurology','Dev Medical College - dev',2017),
  ('7d360004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','MS Orthopedics','Dev Medical College - dev',2013),
  ('7d360005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','MD Pediatrics','Dev Medical College - dev',2018)
on conflict (id) do nothing;
insert into public.certifications (id,doctor_id,title,issuer,year) values
  ('7d370001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','Board Certified - Endocrinology (dev)','Dev Medical Board',2015),
  ('7d370002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','Board Certified - Cardiology (dev)','Dev Medical Board',2013),
  ('7d370003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','Board Certified - Neurology (dev)','Dev Medical Board',2018)
on conflict (id) do nothing;
insert into public.consultation_fees (id,doctor_id,hospital_id,appointment_type,fee,currency) values
  ('7d380001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','Consultation',600.00,'INR'),
  ('7d380002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','Consultation',900.00,'INR'),
  ('7d380003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200002-0000-0000-0000-000000000002','Telehealth',750.00,'INR'),
  ('7d380004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','Consultation',800.00,'INR'),
  ('7d380005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','Consultation',700.00,'INR'),
  ('7d380006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','Consultation',500.00,'INR')
on conflict (id) do nothing;
insert into public.doctor_verification (id,doctor_id,status,notes) values
  ('7d390001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d390002-0000-0000-0000-000000000002','7d300002-0000-0000-0000-000000000002','pending','Development seed record - pending verification'),
  ('7d390003-0000-0000-0000-000000000003','7d300003-0000-0000-0000-000000000003','pending','Development seed record - pending verification'),
  ('7d390004-0000-0000-0000-000000000004','7d300004-0000-0000-0000-000000000004','pending','Development seed record - pending verification'),
  ('7d390005-0000-0000-0000-000000000005','7d300005-0000-0000-0000-000000000005','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Pharmacies (dev-flagged) + medicine inventory
-- ---------------------------------------------------------------------------
insert into public.pharmacies (id,slug,name,address,city,phone_number,rating) values
  ('7d400001-0000-0000-0000-000000000001','dev-city-meds','City Meds (dev)','3 Park Lane, Begumpet','Hyderabad','+91 40 0000 0101',4.1),
  ('7d400002-0000-0000-0000-000000000002','dev-wellness-care-pharmacy','Wellness Care Pharmacy (dev)','21 Wellness Street, Indiranagar','Bengaluru','+91 80 0000 0102',4.3)
on conflict (id) do nothing;
insert into public.pharmacy_locations (id,pharmacy_id,label,address,city,latitude,longitude) values
  ('7d410001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001','Main','3 Park Lane, Begumpet','Hyderabad',17.443200,78.462100),
  ('7d410002-0000-0000-0000-000000000002','7d400002-0000-0000-0000-000000000002','Main','21 Wellness Street, Indiranagar','Bengaluru',12.970500,77.639800)
on conflict (id) do nothing;
insert into public.pharmacy_hours (id,pharmacy_id,day_of_week,open_time,close_time,is_24_hours) values
  ('7d420001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001',0,null,null,true),
  ('7d420002-0000-0000-0000-000000000002','7d400002-0000-0000-0000-000000000002',0,'08:00','23:00',false)
on conflict (id) do nothing;
insert into public.pharmacy_medicines (id,pharmacy_id,medicine_name,brand,dosage_form,strength) values
  ('7d430001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001','Metformin','DevBrand','tablet','500 mg'),
  ('7d430002-0000-0000-0000-000000000002','7d400001-0000-0000-0000-000000000001','Amlodipine','DevBrand','tablet','5 mg'),
  ('7d430003-0000-0000-0000-000000000003','7d400002-0000-0000-0000-000000000002','Paracetamol','DevBrand','tablet','500 mg'),
  ('7d430004-0000-0000-0000-000000000004','7d400002-0000-0000-0000-000000000002','Salbutamol inhaler','DevBrand','inhaler','100 mcg/dose')
on conflict (id) do nothing;
insert into public.medicine_inventory (id,pharmacy_medicine_id,quantity,unit_price,in_stock) values
  ('7d440001-0000-0000-0000-000000000001','7d430001-0000-0000-0000-000000000001',120,42.00,true),
  ('7d440002-0000-0000-0000-000000000002','7d430002-0000-0000-0000-000000000002',80,58.00,true),
  ('7d440003-0000-0000-0000-000000000003','7d430003-0000-0000-0000-000000000003',200,15.50,true),
  ('7d440004-0000-0000-0000-000000000004','7d430004-0000-0000-0000-000000000004',40,180.00,true)
on conflict (id) do nothing;
insert into public.pharmacy_verification (id,pharmacy_id,status,notes) values
  ('7d450001-0000-0000-0000-000000000001','7d400001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d450002-0000-0000-0000-000000000002','7d400002-0000-0000-0000-000000000002','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Labs (dev-flagged) + tests + services
-- ---------------------------------------------------------------------------
insert into public.labs (id,slug,name,address,city,phone_number,rating) values
  ('7d500001-0000-0000-0000-000000000001','dev-city-diagnostics','City Diagnostics Centre (dev)','11 Lab Lane, Begumpet','Hyderabad','+91 40 0000 0201',4.2),
  ('7d500002-0000-0000-0000-000000000002','dev-precision-pathology','Precision Pathology Labs (dev)','7 Precision Drive, Adyar','Chennai','+91 44 0000 0202',4.5)
on conflict (id) do nothing;
insert into public.lab_locations (id,lab_id,label,address,city,latitude,longitude) values
  ('7d510001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','Main','11 Lab Lane, Begumpet','Hyderabad',17.441100,78.464900),
  ('7d510002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002','Main','7 Precision Drive, Adyar','Chennai',13.004200,80.251200)
on conflict (id) do nothing;
insert into public.lab_tests (id,lab_id,test_name,description,price) values
  ('7d520001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','HbA1c','Glycated haemoglobin - dev',350.00),
  ('7d520002-0000-0000-0000-000000000002','7d500001-0000-0000-0000-000000000001','Fasting blood glucose','Fasting plasma glucose - dev',120.00),
  ('7d520003-0000-0000-0000-000000000003','7d500002-0000-0000-0000-000000000002','Lipid profile','Total cholesterol + fractions - dev',450.00),
  ('7d520004-0000-0000-0000-000000000004','7d500002-0000-0000-0000-000000000002','Complete blood count','CBC - dev',300.00)
on conflict (id) do nothing;
insert into public.lab_services (id,lab_id,service_name,description) values
  ('7d530001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','Home sample collection','Available - dev'),
  ('7d530002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002','Home sample collection','Available - dev'),
  ('7d530003-0000-0000-0000-000000000003','7d500002-0000-0000-0000-000000000002','Same-day reports','Available - dev')
on conflict (id) do nothing;
insert into public.lab_hours (id,lab_id,day_of_week,open_time,close_time,is_24_hours) values
  ('7d540001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001',0,'06:00','20:00',false),
  ('7d540002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002',0,'06:30','19:30',false)
on conflict (id) do nothing;
insert into public.lab_verification (id,lab_id,status,notes) values
  ('7d550001-0000-0000-0000-000000000001','7d500001-0000-0000-0000-000000000001','pending','Development seed record - pending verification'),
  ('7d550002-0000-0000-0000-000000000002','7d500002-0000-0000-0000-000000000002','pending','Development seed record - pending verification')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Appointment slots (dev doctors, future dates) - used by booking flow
-- ---------------------------------------------------------------------------
insert into public.appointment_slots (id,doctor_id,hospital_id,slot_date,start_time,end_time,capacity,status) values
  ('7d600001-0000-0000-0000-000000000001','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','2026-09-14','09:00','09:30',1,'open'),
  ('7d600002-0000-0000-0000-000000000002','7d300001-0000-0000-0000-000000000001','7d200001-0000-0000-0000-000000000001','2026-09-14','09:30','10:00',1,'open'),
  ('7d600003-0000-0000-0000-000000000003','7d300002-0000-0000-0000-000000000002','7d200001-0000-0000-0000-000000000001','2026-09-14','10:00','10:30',1,'open'),
  ('7d600004-0000-0000-0000-000000000004','7d300003-0000-0000-0000-000000000003','7d200002-0000-0000-0000-000000000002','2026-09-15','09:00','09:30',1,'open'),
  ('7d600005-0000-0000-0000-000000000005','7d300004-0000-0000-0000-000000000004','7d200003-0000-0000-0000-000000000003','2026-09-16','09:00','09:30',1,'open'),
  ('7d600006-0000-0000-0000-000000000006','7d300005-0000-0000-0000-000000000005','7d200003-0000-0000-0000-000000000003','2026-09-16','09:30','10:00',1,'open')
on conflict (id) do nothing;

-- ===========================================================================
-- End of development provider seed. Replace with a real provider load before
-- production use. All records carry dev slugs/ids + pending verification.
-- ===========================================================================
