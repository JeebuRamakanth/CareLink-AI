-- ===========================================================================
-- 040 — Cross-object ownership + storage security.
--   - medical_reports.medical_document_id must be same owner + family context
--   - appointment_events / recovery_checkins must reference own appointment
--   - medicines image doc must be own document
--   - conversation_messages must reference own conversation
--   - medical_documents storage_path must start with owner id, private bucket
--   - storage.objects owner-folder RLS (read/insert/move/delete)
-- ===========================================================================

-- Seed: B's document + appointment + conversation (service path fixtures)
insert into public.medical_documents (id, owner_id, file_name, mime_type, file_size, storage_path)
values ('b0000001-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'b.pdf', 'application/pdf', 50, '22222222-2222-2222-2222-222222222222/docB/b.pdf');
insert into public.appointments (id, owner_id, doctor_name, scheduled_date, scheduled_time)
values ('b0000002-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Dr B', '2026-09-05', '09:00');
insert into public.conversations (id, owner_id)
values ('b0000003-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222');
-- A gets a second family profile for family-context mismatch tests
insert into public.family_profiles (id, owner_id, relation, label)
values ('a2222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'parent', 'A parent');
-- A document bound to the parent profile
insert into public.medical_documents (id, owner_id, family_profile_id, file_name, mime_type, file_size, storage_path)
values ('a0000004-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'a2222222-2222-2222-2222-222222222222', 'p.pdf', 'application/pdf', 60, '11111111-1111-1111-1111-111111111111/docP/p.pdf');

-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- report ← document linkage
select harness.expect_error(
  $$insert into public.medical_reports (owner_id, medical_document_id, report_title)
    values (auth.uid(), 'b0000001-0000-0000-0000-000000000001', 'link to B doc')$$,
  'cross-object: A cannot link B document to own report'
);
select harness.expect_ok(
  $$insert into public.medical_reports (owner_id, family_profile_id, medical_document_id, report_title)
    values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000001-0000-0000-0000-000000000001', 'own doc ok')$$,
  'cross-object: A links own document with same family context'
);
select harness.expect_error(
  $$insert into public.medical_reports (owner_id, family_profile_id, medical_document_id, report_title)
    values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000004-0000-0000-0000-000000000004', 'mismatched context')$$,
  'cross-object: family-context mismatch (self report vs parent document) rejected'
);

-- appointment_events ← appointment
select harness.expect_error(
  $$insert into public.appointment_events (owner_id, appointment_id, event_type)
    values (auth.uid(), 'b0000002-0000-0000-0000-000000000002', 'booked')$$,
  'cross-object: A cannot attach event to B appointment'
);
select harness.expect_ok(
  $$insert into public.appointment_events (owner_id, appointment_id, event_type)
    values (auth.uid(), 'a0000002-0000-0000-0000-000000000002', 'booked')$$,
  'cross-object: A attaches event to own appointment'
);

-- recovery_checkins ← appointment
select harness.expect_error(
  $$insert into public.recovery_checkins (owner_id, appointment_id, trend)
    values (auth.uid(), 'b0000002-0000-0000-0000-000000000002', 'same')$$,
  'cross-object: A cannot link B appointment in recovery check-in'
);

-- medicines ← image document
select harness.expect_error(
  $$insert into public.medicines (owner_id, name, medicine_image_document_id)
    values (auth.uid(), 'MedX', 'b0000001-0000-0000-0000-000000000001')$$,
  'cross-object: A cannot use B document as medicine image'
);

-- conversation_messages ← conversation
select harness.expect_error(
  $$insert into public.conversation_messages (owner_id, conversation_id, role, content)
    values (auth.uid(), 'b0000003-0000-0000-0000-000000000003', 'user', 'hi')$$,
  'cross-object: A cannot post into B conversation'
);
select harness.expect_ok(
  $$insert into public.conversation_messages (owner_id, conversation_id, role, content)
    values (auth.uid(), 'a0000003-0000-0000-0000-000000000003', 'user', 'hi')$$,
  'cross-object: A posts into own conversation'
);

-- ---------------------------------------------------------------------------
-- medical_documents storage consistency
-- ---------------------------------------------------------------------------
select harness.expect_error(
  $$insert into public.medical_documents (owner_id, file_name, mime_type, file_size, storage_path)
    values (auth.uid(), 'evil.pdf', 'application/pdf', 10, '22222222-2222-2222-2222-222222222222/docX/evil.pdf')$$,
  'storage: storage_path under another owner rejected'
);
select harness.expect_error(
  $$insert into public.medical_documents (owner_id, file_name, mime_type, file_size, storage_bucket, storage_path)
    values (auth.uid(), 'evil.pdf', 'application/pdf', 10, 'public_bucket', '11111111-1111-1111-1111-111111111111/docX/evil.pdf')$$,
  'storage: non-private bucket rejected'
);

-- ---------------------------------------------------------------------------
-- storage.objects owner-folder RLS
-- ---------------------------------------------------------------------------
select harness.expect_ok(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('medical_documents', '11111111-1111-1111-1111-111111111111/doc1/r.pdf', auth.uid())$$,
  'storage: A uploads under own folder'
);
select harness.expect_error(
  $$insert into storage.objects (bucket_id, name, owner)
    values ('medical_documents', '22222222-2222-2222-2222-222222222222/docB/evil.pdf', auth.uid())$$,
  'storage: A cannot upload under B folder'
);

reset role;
reset request.jwt.claims;

-- B: cannot read/update/delete A's object
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok(
  (select count(*) = 0 from storage.objects where name like '11111111-1111-1111-1111-111111111111/%'),
  'storage: B cannot read A object metadata'
);
-- move/rename attempt to own folder: invisible row, 0 affected
update storage.objects set name = '22222222-2222-2222-2222-222222222222/docB/stolen.pdf'
  where name = '11111111-1111-1111-1111-111111111111/doc1/r.pdf';
delete from storage.objects where name like '11111111-1111-1111-1111-111111111111/%';

reset role;
reset request.jwt.claims;

select harness.ok(
  (select count(*) = 1 from storage.objects where name = '11111111-1111-1111-1111-111111111111/doc1/r.pdf'),
  'storage: A object untouched after B move/delete attempts'
);
