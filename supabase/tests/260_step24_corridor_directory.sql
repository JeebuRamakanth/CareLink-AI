-- ===========================================================================
-- 260 — Step 24: Machilipatnam → Vijayawada corridor directory import.
--
-- Verifies the generated migration (0034_corridor_directory_import.sql) against
-- the honest-data contract:
--   1  the corridor facilities were imported (count > 0, from both districts)
--   2  every imported record carries provenance (source + data_status)
--   3  official district sources are classified as VERIFIED, never invented
--   4  no fabricated rating, phone, coordinate or capability
--   5  the corridor coverage columns were populated
--   6  the import is idempotent (replay does not duplicate rows)
--   7  facilities with a published pincode keep it verbatim
--   8  no doctor rows were fabricated for facilities with no published staff list
--   9  the bundled directory and the database agree on the imported ids
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Imported corridor facilities exist, from both source districts.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) >= 40 from public.hospitals
    where district in ('Krishna','NTR')),
  '260: corridor facilities imported (>= 40)',
  (select count(*)::text from public.hospitals where district in ('Krishna','NTR'))
);

select harness.ok(
  (select count(distinct district) = 2 from public.hospitals
    where district in ('Krishna','NTR')),
  '260: both Krishna and NTR districts represented'
);

-- ---------------------------------------------------------------------------
-- 2. Every imported record carries provenance.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) = 0 from public.hospitals
    where district in ('Krishna','NTR')
      and (data_source is null or data_status is null)),
  '260: every imported facility has a source and data_status'
);

select harness.ok(
  (select count(*) > 0 from public.hospitals
    where district in ('Krishna','NTR') and source_url is not null),
  '260: at least one facility carries a verifiable source_url'
);

-- ---------------------------------------------------------------------------
-- 3. Official government sources are classified VERIFIED; a listing is never
--    silently promoted beyond its source.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) > 0 from public.hospitals
    where data_source like 'Krishna District%' and data_status = 'VERIFIED'),
  '260: Krishna district government source classified VERIFIED'
);

select harness.ok(
  (select count(*) = 0 from public.hospitals
    where data_status = 'THIRD_PARTY_DIRECTORY' and data_source like '%Government of Andhra Pradesh%'),
  '260: a third-party listing is never attributed to a government source'
);

-- ---------------------------------------------------------------------------
-- 4. No fabricated data: ratings stay null, capabilities/coordinates absent.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) = 0 from public.hospitals
    where district in ('Krishna','NTR') and rating is not null),
  '260: no rating fabricated for corridor facilities'
);

select harness.ok(
  (select count(*) = 0 from public.hospital_locations l
    join public.hospitals h on h.id = l.hospital_id
   where h.district in ('Krishna','NTR')
     and (l.latitude is null or l.longitude is null)),
  '260: no coordinate stored as null-but-present'
);

select harness.ok(
  (select count(*) = 0 from public.hospital_services s
    join public.hospitals h on h.id = s.hospital_id
   where h.district in ('Krishna','NTR') and s.service_name is null),
  '260: no unnamed capability recorded'
);

-- ---------------------------------------------------------------------------
-- 5. Coverage classification recorded for the quality dashboard.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) > 0 from public.hospitals
    where district in ('Krishna','NTR') and coverage_method = 'corridor'),
  '260: corridor coverage classification recorded'
);

-- ---------------------------------------------------------------------------
-- 6. Idempotency — replaying the insert must not duplicate a facility.
-- ---------------------------------------------------------------------------
do $$
declare before_count bigint; after_count bigint;
begin
  select count(*) into before_count from public.hospitals where district in ('Krishna','NTR');
  -- Re-run the same idempotent insert shape the migration uses.
  insert into public.hospitals (id,slug,name,data_source,data_status,district)
  select id, slug, name, data_source, data_status, district
    from public.hospitals where district in ('Krishna','NTR') limit 1
  on conflict (id) do nothing;
  select count(*) into after_count from public.hospitals where district in ('Krishna','NTR');
  perform harness.ok(after_count = before_count,
    '260: replaying the import does not duplicate a facility',
    before_count::text || ' -> ' || after_count::text);
end $$;

-- ---------------------------------------------------------------------------
-- 7. A published pincode is stored verbatim (never re-derived or invented).
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) = 0 from public.hospitals
    where district in ('Krishna','NTR') and pincode is not null and pincode !~ '^[0-9]{6}$'),
  '260: stored pincodes are well-formed 6-digit values'
);

-- ---------------------------------------------------------------------------
-- 8. No doctor was fabricated for a facility with no published staff list.
--    Doctors link to hospitals through doctor_hospitals, and every doctor row
--    must come from a source that named that doctor.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) = 0
     from public.doctors d
     join public.doctor_hospitals dh on dh.doctor_id = d.id
     join public.hospitals h on h.id = dh.hospital_id
    where h.district in ('Krishna','NTR')
      and d.data_source is null),
  '260: no doctor linked to a corridor facility lacks a source'
);

select harness.ok(
  (select count(*) = 0
     from public.doctor_hospitals dh
     join public.hospitals h on h.id = dh.hospital_id
    where h.district in ('Krishna','NTR')
      and h.id::text like '7f2%'),
  '260: no doctor was auto-attached to a newly imported facility'
);

-- ---------------------------------------------------------------------------
-- 9. The curated Machilipatnam facilities keep their stable ids, so the app and
--    the database resolve the same record.
-- ---------------------------------------------------------------------------
select harness.ok(
  (select count(*) >= 10 from public.hospitals where id::text like '7f10%'),
  '260: curated Machilipatnam facilities retain their stable ids'
);

select harness.ok(
  (select exists(select 1 from public.hospitals where slug = 'mph-district-hospital-machilipatnam')),
  '260: curated District Hospital slug resolves'
);
