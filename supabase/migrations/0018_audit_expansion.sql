-- ===========================================================================
-- CareLink-AI — Step 10.5 §18: Audit system expansion.
--
-- ADDITIVE ONLY. The Step 10 audit_events table is preserved (read-only
-- self-select; no client insert/update/delete policy — unchanged).
--
-- Adds:
--   1. Appointment modifications are audited (status-change trigger now also
--      writes an audit row).
--   2. carelink_audit_document_access() — document view/sign/download/delete
--      audit, called by the document-access Edge Function; the caller must
--      own the document (or be super_admin).
--   3. carelink_audit_health_access() — health-record access audit with a
--      WHITELIST of auditable owner tables (no dynamic SQL).
--   4. Hard guarantees re-asserted: UPDATE/DELETE on audit_events are denied
--      for all client roles (RLS + explicit revokes).
--
-- Already audited elsewhere: role changes + provider membership (0006),
-- review moderation (0007), SOS transitions (0015), donor disclosure (0016).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Appointment modification audit (extends the 0010 status trigger)
-- ---------------------------------------------------------------------------
-- SECURITY DEFINER: the audit write crosses the RLS boundary by design —
-- audit_events has no client insert policy, so the trigger must execute with
-- definer privileges. auth.uid() still reports the real caller (GUC-based).
create or replace function public.carelink_track_appointment_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    insert into public.appointment_status_history
      (id, appointment_id, owner_id, old_status, new_status, changed_by)
    values
      (gen_random_uuid(), new.id, new.owner_id, old.status, new.status, auth.uid());
    insert into public.audit_events
      (id, actor_id, action, target_table, target_id, safe_message)
    values
      (gen_random_uuid(), auth.uid(), 'appointment_status_changed', 'appointments', new.id,
       'status: ' || old.status || ' -> ' || new.status);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Document access audit (document-access Edge Function calls this)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_audit_document_access(document_uuid uuid, action text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
begin
  if action not in ('view','sign','download','delete') then
    raise exception 'invalid document access action';
  end if;
  if not public.carelink_can_access_document(document_uuid)
     and not public.carelink_is_super_admin() then
    raise exception 'not authorized to audit-access this document';
  end if;
  return public.carelink_record_audit('document_' || action, 'medical_documents', document_uuid, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Health-record access audit (whitelist — no dynamic SQL, no arbitrary
--    table probing; the caller must own the row being audited)
-- ---------------------------------------------------------------------------
create or replace function public.carelink_audit_health_access(
  target_table text,
  target_id uuid,
  action text default 'read'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare is_owner boolean := false;
begin
  if action not in ('read','export','share') then
    raise exception 'invalid health access action';
  end if;

  if target_table = 'health_context' then
    select exists (select 1 from public.health_context r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'medical_reports' then
    select exists (select 1 from public.medical_reports r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'medicines' then
    select exists (select 1 from public.medicines r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'vaccination_records' then
    select exists (select 1 from public.vaccination_records r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'recovery_checkins' then
    select exists (select 1 from public.recovery_checkins r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  elsif target_table = 'conversations' then
    select exists (select 1 from public.conversations r where r.id = target_id and r.owner_id = auth.uid()) into is_owner;
  else
    raise exception 'table not auditable';
  end if;

  if not is_owner and not public.carelink_is_super_admin() then
    raise exception 'not authorized to audit-access this record';
  end if;

  return public.carelink_record_audit('health_record_' || action, target_table, target_id, null);
end;
$$;

do $$
declare fn text;
begin
  foreach fn in array array[
    'carelink_audit_document_access(uuid, text)',
    'carelink_audit_health_access(text, uuid, text)'
  ]
  loop
    execute format('revoke execute on function public.%s from public', fn);
    if exists (select 1 from pg_roles where rolname = 'anon') then
      execute format('revoke execute on function public.%s from anon', fn);
    end if;
    if exists (select 1 from pg_roles where rolname = 'authenticated') then
      execute format('grant execute on function public.%s to authenticated', fn);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Re-assert audit immutability for client roles (RLS already denies; these
--    revokes make the table privilege level airtight too)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke update, delete, truncate on public.audit_events from anon;
  end if;
  if exists (select 1 from pg_roles where rolname = 'authenticated') then
    revoke update, delete, truncate on public.audit_events from authenticated;
  end if;
end $$;
