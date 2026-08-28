-- ===========================================================================
-- 150 - Hospital -> doctor direction: relevant-doctor vs show-all modes.
--
-- Reuses 050 service fixtures:
--   Hospital One   = 5a111111-1111-1111-1111-111111111111
--   Hospital Two   = 5a222222-2222-2222-2222-222222222222
--   Doctor One     = 5e111111-1111-1111-1111-111111111111
--   Doctor Two     = 5e222222-2222-2222-2222-222222222222
--   Specialt Cardiology =  5c111111-1111-1111-1111-111111111111
--
-- Adds service fixtures:
--   condition 'diabetes' (new)
--   symptom 'fatigue'  (new)
--   symptom -> condition, condition -> specialty links (new)
--   hospital_condition_services: Hospital One treats diabetes (new)
--   doctor_hospitals: Doctor One + Doctor Two at Hospital One; Doctor
--     Three (new) at Hospital Two (unrelated) (new)
--   doctor_condition_expertise: Doctor One only for diabetes (new)
--   doctor_specialties: Doctor One + Doctor Two = Cardiology (new)
--
-- MODE A := hospital + condition/specialty context -> RELEVANT doctors:

--     exactly the doctors simultaneously linked to the hospital AND with
--     expertise for the condition
-- MODE B := hospital only -> ALL valid linked doctors(no relevance filter)
-- ===========================================================================

insert into public.conditions (id, slug, name) values
  ('15222222-2222-2222-2222-222222222222', 'diabetes', 'Diabetes')
on conflict ((id)) do nothing;

insert into public.symptoms (id, slug, name) values
  ('15333333-3333-3333-3333-333333333333', 'fatigue', 'Fatigue')
on conflict ((id)) do nothing;

insert into public.symptom_conditions (symptom_id, condition_id) values

  ('15333333-3333-3333-3333-333333333333', '15222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.condition_specialties (condition_id, specialty_id) values


  ('15222222-2222-2222-2222-222222222222', '5c111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into public.hospital_condition_services (hospital_id, condition_id) values


  ('5a111111-1111-1111-1111-111111111111', '15222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.doctors (id, slug, name) values


  ('15333333-3333-3333-3333-333333333333', 'doctor-three', 'Doctor Three')
on conflict ((id)) do nothing;

insert into public.doctor_hospitals (doctor_id, hospital_id, is_primary) values


  ('5e111111-1111-1111-1111-111111111111', '5a111111-1111-1111-1111-111111111111', true),
  ('5e222222-2222-2222-2222-222222222222', '5a111111-1111-1111-1111-111111111111', false),
  ('15333333-3333-3333-3333-333333333333', '5a222222-2222-2222-2222-222222222222', false)
on conflict do nothing;

insert into public.doctor_condition_expertise (doctor_id, condition_id) values


  ('5e111111-1111-1111-1111-111111111111', '15222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.doctor_specialties (doctor_id, specialty_id) values


  ('5e111111-1111-1111-1111-111111111111', '5c111111-1111-1111-1111-111111111111'),
  ('5e222222-2222-2222-2222-222222222222', '5c111111-1111-1111-1111-111111111111')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- MODE A -- relevant doctors for Hospital One + diabetes
-- ---------------------------------------------------------------------------
set role anon;

select harness.ok(
  (select count(*) =  1
   from public.doctor_hospitals dh
   join public.doctor_condition_expertise dce on dce.doctor_id = dh.doctor_id
   where dh.hospital_id = '5a111111-1111-1111-1111-111111111111'
     and dce.condition_id = '15222222-2222-2222-2222-222222222222'
     and dh.doctor_id = '5e111111-1111-1111-1111-111111111111'),
  '150: relevant doctors returns exactly Doctor One for Hospital One + diabetes'
);

-- ---------------------------------------------------------------------------
-- MODE B -- show all doctors linked to Hospital One (both Doctor One + Two)
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) =  2
   from public.doctor_hospitals dh
   where dh.hospital_id = '5a111111-1111-1111-1111-111111111111'),
  '150: show-all returns both linked doctors for Hospital One'
);

-- Unrelated hospital must NOT leak into Hospital One direction

select harness.ok(
  (select count(*) =  0
   from public.doctor_hospitals dh
   where dh.hospital_id = '5a222222-2222-2222-2222-222222222222'
     and dh.doctor_id = '5e111111-1111-1111-1111-111111111111'),
  '150: Doctor One is not linked to Hospital Two'
);

-- The two modes return different sets(relevance filter truly distinguishes)



select harness.ok(
  (select count(*) from public.doctor_hospitals dh
    join public.doctor_condition_expertise dce on dce.doctor_id = dh.doctor_id
    where dh.hospital_id = '5a111111-1111-1111-1111-111111111111'
      and dce.condition_id = '15222222-2222-2222-2222-222222222222')
  <> (select count(*) from public.doctor_hospitals dh
     where dh.hospital_id = '5a111111-1111-1111-1111-111111111111'),
  '150: MODE A (relevant) differs from MODE B (show-all)'
);

reset role;

-- ---------------------------------------------------------------------------
-- Recommendation provenance (0019): owner-scoped + sane defaults.
-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.expect_ok(
  $$insert into public.agent_recommendations (owner_id, patient_profile_id, entity_type, entity_id, source, provider, verification, provider_snapshot, overall_score, is_mock, matched_reasons)
    values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'hospital', 'hospital-one', 'carelink-ai', 'mock-demo', 'fallback', '{"mode":"mock","provider":"mock-demo","fetchedAt":"2026-08-28T00:00:00Z","verification":"fallback"}'::jsonb, 0.9, true, '["specialty match"]')$$,
  '150: A stores recommendation with provider provenance'
);

select harness.ok(
  (select bool_and(provider = 'mock-demo') and bool_and(verification = 'fallback')
   from public.agent_recommendations
   where owner_id = auth.uid()),
  '150: A reads provider + verification from own recommendation'
);

-- default verification for legacy rows(missing values) is 'fallback'
select harness.ok(
  (select count(*) = 1
   from public.agent_recommendations
   where owner_id = auth.uid() and provider is null and coalesce(verification,'fallback') = 'fallback'),
  '150: legacy recommendation (provider null) defaults to fallback verification'
);

select harness.expect_error(
  $$insert into public.agent_recommendations (owner_id, patient_profile_id, entity_type, entity_id, provider, verification)
    values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'doctor', 'x', 'mock', 'wrong-value')$$,
  '150: cross-family recommendation + invalid verification rejected'
);

reset role;
reset request.jwt.claims;

set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok(
  (select count(*) =   0 from public.agent_recommendations where owner_id = '11111111-1111-1111-1111-111111111111'),
  '150: B cannot see A recommendations'
);

reset role;;reset request.jwt.claims;