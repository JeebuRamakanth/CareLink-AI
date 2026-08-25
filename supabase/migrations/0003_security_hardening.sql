-- ===========================================================================
-- CareLink-AI — Step 10.5 §2: Security hardening of the Step 10 core schema.
--
-- ADDITIVE ONLY. No Step 10 table is dropped, renamed, or rebuilt.
--
-- What this migration adds and why:
--   1. Secure helper functions used by RLS policies and triggers. They are
--      SECURITY DEFINER with a pinned search_path, EXECUTE revoked from the
--      public/anon roles so only authorized server paths can call them.
--   2. BEFORE INSERT/UPDATE triggers on tables that carry family_profile_id:
--      the database now enforces that family_profile_id belongs to the same
--      owner_id as the row (previously frontend-only).
--   3. Cross-object ownership triggers: a row can only reference another
--      object (document, appointment, conversation) owned by the same user.
--   4. Storage consistency trigger on medical_documents: storage_path must
--      start with the owner id and the bucket must stay 'medical_documents'
--      (keeps DB metadata consistent with the storage RLS path convention).
--
-- No existing column is altered; no data is touched; existing rows remain.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Secure helper functions
-- ---------------------------------------------------------------------------

-- Is the given family profile owned by the current user? Used by RLS and by
-- cross-table validation. Volatility: stable (result fixed within a query).
create or replace function public.carelink_is_family_profile_owner(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.family_profiles fp
    where fp.id = profile_id
      and fp.owner_id = auth.uid()
  );
$$;

-- Is the given medical document owned by the current user?
create or replace function public.carelink_can_access_document(document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.medical_documents d
    where d.id = document_id
      and d.owner_id = auth.uid()
  );
$$;

-- Is the given appointment owned by the current user?
create or replace function public.carelink_can_access_appointment(appointment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.appointments a
    where a.id = appointment_id
      and a.owner_id = auth.uid()
  );
$$;

-- Does the given conversation belong to the current user?
create or replace function public.carelink_can_access_conversation(conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.owner_id = auth.uid()
  );
$$;

-- Generic "patient" accessor: a patient context is a family profile OR the
-- user's own profile. Every patient-scoped table resolves access through
-- owner_id, so this reduces to the same ownership predicate.
create or replace function public.carelink_can_access_patient(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.carelink_is_family_profile_owner(profile_id);
$$;

-- Privileged helpers: never callable by public/anon.
do $$
begin
  revoke execute on function public.carelink_is_family_profile_owner(uuid) from public;
  revoke execute on function public.carelink_can_access_document(uuid) from public;
  revoke execute on function public.carelink_can_access_appointment(uuid) from public;
  revoke execute on function public.carelink_can_access_conversation(uuid) from public;
  revoke execute on function public.carelink_can_access_patient(uuid) from public;
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_is_family_profile_owner(uuid) from anon;
    revoke execute on function public.carelink_can_access_document(uuid) from anon;
    revoke execute on function public.carelink_can_access_appointment(uuid) from anon;
    revoke execute on function public.carelink_can_access_conversation(uuid) from anon;
    revoke execute on function public.carelink_can_access_patient(uuid) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_is_family_profile_owner(uuid) to authenticated;
    grant execute on function public.carelink_can_access_document(uuid) to authenticated;
    grant execute on function public.carelink_can_access_appointment(uuid) to authenticated;
    grant execute on function public.carelink_can_access_conversation(uuid) to authenticated;
    grant execute on function public.carelink_can_access_patient(uuid) to authenticated;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Family-profile ownership enforcement (trigger-based, additive)
-- ---------------------------------------------------------------------------

-- Enforces: NEW.family_profile_id must be a family profile owned by
-- NEW.owner_id. NULL family_profile_id means "self" and is always allowed.
create or replace function public.carelink_enforce_family_profile_ownership()
returns trigger
language plpgsql
as $$
begin
  if new.family_profile_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.family_profiles fp
    where fp.id = new.family_profile_id
      and fp.owner_id = new.owner_id
  ) then
    raise exception 'family_profile_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'health_context','medical_documents','medical_reports','medicines',
    'appointments','recovery_checkins','vaccination_records','conversations',
    'saved_hospitals','saved_doctors','saved_pharmacies','saved_labs',
    'emergency_events'
  ]
  loop
    execute format(
      'drop trigger if exists carelink_family_profile_ownership on public.%I;
       create trigger carelink_family_profile_ownership
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_family_profile_ownership();',
      t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Cross-object ownership enforcement (same-owner references)
-- ---------------------------------------------------------------------------

-- appointment_events.appointment_id must reference an appointment owned by
-- the same owner_id.
create or replace function public.carelink_enforce_appointment_event_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.appointments a
    where a.id = new.appointment_id
      and a.owner_id = new.owner_id
  ) then
    raise exception 'appointment_events.appointment_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_appointment_event_owner on public.appointment_events;
create trigger carelink_appointment_event_owner
  before insert or update on public.appointment_events
  for each row execute function public.carelink_enforce_appointment_event_owner();

-- Nullable appointment reference must point at an appointment owned by the
-- same owner_id. Used by recovery_checkins (0001) and recovery_plans (0012).
create or replace function public.carelink_enforce_recovery_appointment_owner()
returns trigger
language plpgsql
as $$
begin
  if new.appointment_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.appointments a
    where a.id = new.appointment_id
      and a.owner_id = new.owner_id
  ) then
    raise exception 'appointment_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_recovery_appointment_owner on public.recovery_checkins;
create trigger carelink_recovery_appointment_owner
  before insert or update on public.recovery_checkins
  for each row execute function public.carelink_enforce_recovery_appointment_owner();

-- medical_reports.medical_document_id (nullable) must reference a document
-- owned by the same owner_id AND (when family_profile_id is set on both) the
-- same family context.
create or replace function public.carelink_enforce_report_document_owner()
returns trigger
language plpgsql
as $$
begin
  if new.medical_document_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.medical_documents d
    where d.id = new.medical_document_id
      and d.owner_id = new.owner_id
      and (d.family_profile_id is not distinct from new.family_profile_id)
  ) then
    raise exception 'medical_reports.medical_document_id must belong to the same owner and family context';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_report_document_owner on public.medical_reports;
create trigger carelink_report_document_owner
  before insert or update on public.medical_reports
  for each row execute function public.carelink_enforce_report_document_owner();

-- medicines.medicine_image_document_id (nullable) must reference a document
-- owned by the same owner_id.
create or replace function public.carelink_enforce_medicine_image_owner()
returns trigger
language plpgsql
as $$
begin
  if new.medicine_image_document_id is null then
    return new;
  end if;
  if not exists (
    select 1
    from public.medical_documents d
    where d.id = new.medicine_image_document_id
      and d.owner_id = new.owner_id
  ) then
    raise exception 'medicines.medicine_image_document_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_medicine_image_owner on public.medicines;
create trigger carelink_medicine_image_owner
  before insert or update on public.medicines
  for each row execute function public.carelink_enforce_medicine_image_owner();

-- conversation_messages.conversation_id must reference a conversation owned by
-- the same owner_id.
create or replace function public.carelink_enforce_message_conversation_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.conversations c
    where c.id = new.conversation_id
      and c.owner_id = new.owner_id
  ) then
    raise exception 'conversation_messages.conversation_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_message_conversation_owner on public.conversation_messages;
create trigger carelink_message_conversation_owner
  before insert or update on public.conversation_messages
  for each row execute function public.carelink_enforce_message_conversation_owner();

-- ---------------------------------------------------------------------------
-- 4. medical_documents storage consistency (owner path + private bucket)
-- ---------------------------------------------------------------------------
-- storage_path must start with "<owner_id>/" so the storage RLS path
-- convention (<owner_id>/<document_id>/<file>) and the DB row can never
-- disagree; the bucket must remain the private medical_documents bucket.
create or replace function public.carelink_enforce_document_storage_consistency()
returns trigger
language plpgsql
as $$
begin
  if new.storage_bucket <> 'medical_documents' then
    raise exception 'medical_documents must use the private medical_documents bucket';
  end if;
  if new.storage_path not like (new.owner_id::text || '/%') then
    raise exception 'medical_documents.storage_path must start with the owner id';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_document_storage_consistency on public.medical_documents;
create trigger carelink_document_storage_consistency
  before insert or update on public.medical_documents
  for each row execute function public.carelink_enforce_document_storage_consistency();

-- ---------------------------------------------------------------------------
-- 5. Audit helper (safe, controlled entry point for audit_events inserts)
-- ---------------------------------------------------------------------------
-- Step 10 reserved audit inserts for service_role. This helper lets
-- server-side security-definer paths (and admin functions added later) write
-- structured audit rows while still never allowing arbitrary client SQL.
create or replace function public.carelink_record_audit(
  action text,
  target_table text default null,
  target_id uuid default null,
  safe_message text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare new_id uuid;
begin
  insert into public.audit_events (id, actor_id, action, target_table, target_id, safe_message)
  values (gen_random_uuid(), auth.uid(), action, target_table, target_id, safe_message)
  returning id into new_id;
  return new_id;
end;
$$;

revoke execute on function public.carelink_record_audit(text, text, uuid, text) from public;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke execute on function public.carelink_record_audit(text, text, uuid, text) from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    grant execute on function public.carelink_record_audit(text, text, uuid, text) to authenticated;
  end if;
end $$;
