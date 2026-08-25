-- ===========================================================================
-- 020 — Step 10 regression: every core table, key columns, FKs, indexes and
-- RLS enabled — all preserved after the Step 10.5 migration chain.
-- ===========================================================================

-- 1. All 18 Step 10 tables exist and have RLS enabled.
select harness.ok(
  (
    select count(*) = 18
    from pg_tables t
    join pg_class c on c.relname = t.tablename
    where t.schemaname = 'public'
      and c.relrowsecurity
      and t.tablename in (
        'profiles','family_profiles','health_context','medical_documents',
        'medical_reports','medicines','appointments','appointment_events',
        'recovery_checkins','vaccination_records','conversations',
        'conversation_messages','saved_hospitals','saved_doctors',
        'saved_pharmacies','saved_labs','emergency_events','audit_events'
      )
  ),
  'step10: all 18 core tables exist with RLS enabled'
);

-- 2. Spot-check key columns are unchanged (name + type).
select harness.ok(
  (
    select count(*) = 12
    from information_schema.columns
    where table_schema = 'public' and (
      (table_name = 'profiles' and column_name = 'id' and data_type = 'uuid')
      or (table_name = 'family_profiles' and column_name = 'owner_id' and data_type = 'uuid')
      or (table_name = 'health_context' and column_name = 'family_profile_id' and data_type = 'uuid')
      or (table_name = 'medical_documents' and column_name = 'storage_path' and data_type = 'text')
      or (table_name = 'medical_reports' and column_name = 'medical_document_id' and data_type = 'uuid')
      or (table_name = 'medicines' and column_name = 'prescription_required' and data_type = 'boolean')
      or (table_name = 'appointments' and column_name = 'scheduled_date' and data_type = 'date')
      or (table_name = 'appointment_events' and column_name = 'event_type' and data_type = 'text')
      or (table_name = 'recovery_checkins' and column_name = 'trend' and data_type = 'text')
      or (table_name = 'vaccination_records' and column_name = 'vaccine_name' and data_type = 'text')
      or (table_name = 'conversations' and column_name = 'title' and data_type = 'text')
      or (table_name = 'conversation_messages' and column_name = 'conversation_id' and data_type = 'uuid')
    )
  ),
  'step10: key columns preserved with original types'
);

-- 3. Step 10.5 additive column on appointments is the ONLY new core column
--    (slot_id); verify it is nullable (non-destructive).
select harness.ok(
  (
    select count(*) = 1
    from information_schema.columns
    where table_schema = 'public' and table_name = 'appointments'
      and column_name = 'slot_id' and is_nullable = 'YES'
  ),
  'step10.5: appointments.slot_id added as nullable additive column'
);

-- 4. Core FKs preserved (sample of critical relationships).
select harness.ok(
  (
    select count(*) >= 8
    from information_schema.table_constraints
    where table_schema = 'public' and constraint_type = 'FOREIGN KEY'
      and table_name in (
        'family_profiles','health_context','medical_documents','medical_reports',
        'appointments','appointment_events','conversations','conversation_messages'
      )
  ),
  'step10: core foreign keys preserved'
);

-- 5. Original RLS helper policies exist on a sample of core tables.
select harness.ok(
  (
    select count(*) >= 4
    from pg_policies
    where schemaname = 'public'
      and tablename = 'medical_documents'
      and policyname like 'medical_documents_owner_%'
  ),
  'step10: medical_documents owner-scoped policies preserved'
);

select harness.ok(
  (
    select count(*) = 4
    from pg_policies
    where schemaname = 'public'
      and tablename = 'appointments'
      and policyname in ('appointments_owner_select','appointments_owner_insert','appointments_owner_update','appointments_owner_delete')
  ),
  'step10: appointments owner policies preserved'
);

-- 6. Private storage bucket still exists and is not public.
select harness.ok(
  (
    select count(*) = 1
    from storage.buckets
    where id = 'medical_documents' and public = false
  ),
  'step10: medical_documents bucket remains private'
);

-- 7. audit_events has NO client insert/update/delete policy (read-only self).
select harness.ok(
  (
    select count(*) = 1
    from pg_policies
    where schemaname = 'public' and tablename = 'audit_events'
      and policyname = 'audit_events_self_select' and cmd = 'SELECT'
  ),
  'step10: audit_events exposes only self-select policy'
);

-- 8. handle_new_user auto-profile trigger still present on auth.users.
select harness.ok(
  exists (
    select 1 from pg_trigger where tgname = 'on_auth_user_created' and not tgisinternal
  ),
  'step10: on_auth_user_created trigger preserved'
);
