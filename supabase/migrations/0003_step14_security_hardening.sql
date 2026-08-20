-- ===========================================================================
-- CareLink-AI — Step 14 security hardening (RLS referential integrity)
--
-- Closes the forged-FK gap left by 0002: owner-scoped INSERT policies checked
-- only owner_id, so a malicious authenticated user could attach a row to
-- ANOTHER user's family_profile / medical_document / appointment /
-- conversation id (FK checks bypass RLS). Every child reference is now
-- verified to belong to the caller inside the WITH CHECK clause.
--
-- Also:
--   - medical_documents.storage_path must live under the caller's own folder
--     (matches the storage.objects RLS path convention <owner_id>/<...>).
--   - Double-booking guard: one ACTIVE appointment per (owner, doctor, slot).
--   - Helper-function privilege lockdown (no PUBLIC EXECUTE on DDL helpers).
--
-- Idempotent: safe to re-run.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. family_profile_id ownership — a user may only reference their OWN family
--    profiles. Applies to every table carrying family_profile_id.
-- ---------------------------------------------------------------------------

create or replace function carelink_apply_family_ref_rls(table_name text)
returns void
language plpgsql
set search_path = public
as $$
begin
  execute format(
    'drop policy if exists %1$s_owner_insert on public.%1$I;
     create policy %1$s_owner_insert on public.%1$I
       for insert with check (
         owner_id = auth.uid()
         and (
           family_profile_id is null
           or exists (
             select 1 from public.family_profiles fp
             where fp.id = family_profile_id and fp.owner_id = auth.uid()
           )
         )
       );

     drop policy if exists %1$s_owner_update on public.%1$I;
     create policy %1$s_owner_update on public.%1$I
       for update using (owner_id = auth.uid())
       with check (
         owner_id = auth.uid()
         and (
           family_profile_id is null
           or exists (
             select 1 from public.family_profiles fp
             where fp.id = family_profile_id and fp.owner_id = auth.uid()
           )
         )
       );',
    table_name
  );
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
    perform carelink_apply_family_ref_rls(t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. appointment_events — appointment_id must belong to the caller.
-- ---------------------------------------------------------------------------
drop policy if exists appointment_events_owner_insert on public.appointment_events;
create policy appointment_events_owner_insert on public.appointment_events
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.appointments a
      where a.id = appointment_id and a.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. conversation_messages — conversation_id must belong to the caller.
-- ---------------------------------------------------------------------------
drop policy if exists conversation_messages_owner_insert on public.conversation_messages;
create policy conversation_messages_owner_insert on public.conversation_messages
  for insert with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists conversation_messages_owner_update on public.conversation_messages;
create policy conversation_messages_owner_update on public.conversation_messages
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and exists (
      select 1 from public.conversations c
      where c.id = conversation_id and c.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. medical_reports — medical_document_id must belong to the caller.
-- ---------------------------------------------------------------------------
drop policy if exists medical_reports_owner_insert on public.medical_reports;
create policy medical_reports_owner_insert on public.medical_reports
  for insert with check (
    owner_id = auth.uid()
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
    and (
      medical_document_id is null
      or exists (select 1 from public.medical_documents d
        where d.id = medical_document_id and d.owner_id = auth.uid())
    )
  );

drop policy if exists medical_reports_owner_update on public.medical_reports;
create policy medical_reports_owner_update on public.medical_reports
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
    and (
      medical_document_id is null
      or exists (select 1 from public.medical_documents d
        where d.id = medical_document_id and d.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 5. recovery_checkins — appointment_id must belong to the caller.
-- ---------------------------------------------------------------------------
drop policy if exists recovery_checkins_owner_insert on public.recovery_checkins;
create policy recovery_checkins_owner_insert on public.recovery_checkins
  for insert with check (
    owner_id = auth.uid()
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
    and (
      appointment_id is null
      or exists (select 1 from public.appointments a
        where a.id = appointment_id and a.owner_id = auth.uid())
    )
  );

drop policy if exists recovery_checkins_owner_update on public.recovery_checkins;
create policy recovery_checkins_owner_update on public.recovery_checkins
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
    and (
      appointment_id is null
      or exists (select 1 from public.appointments a
        where a.id = appointment_id and a.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 6. medicines — medicine_image_document_id must belong to the caller.
-- ---------------------------------------------------------------------------
drop policy if exists medicines_owner_insert on public.medicines;
create policy medicines_owner_insert on public.medicines
  for insert with check (
    owner_id = auth.uid()
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
    and (
      medicine_image_document_id is null
      or exists (select 1 from public.medical_documents d
        where d.id = medicine_image_document_id and d.owner_id = auth.uid())
    )
  );

drop policy if exists medicines_owner_update on public.medicines;
create policy medicines_owner_update on public.medicines
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
    and (
      medicine_image_document_id is null
      or exists (select 1 from public.medical_documents d
        where d.id = medicine_image_document_id and d.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 7. medical_documents — storage_path must live under the caller's folder so
--    metadata can never point at another user's storage object (defense in
--    depth alongside the storage.objects RLS on foldername[1]).
-- ---------------------------------------------------------------------------
drop policy if exists medical_documents_owner_insert on public.medical_documents;
create policy medical_documents_owner_insert on public.medical_documents
  for insert with check (
    owner_id = auth.uid()
    and storage_path like (auth.uid()::text || '/%')
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
  );

drop policy if exists medical_documents_owner_update on public.medical_documents;
create policy medical_documents_owner_update on public.medical_documents
  for update using (owner_id = auth.uid())
  with check (
    owner_id = auth.uid()
    and storage_path like (auth.uid()::text || '/%')
    and (
      family_profile_id is null
      or exists (select 1 from public.family_profiles fp
        where fp.id = family_profile_id and fp.owner_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 8. Double-booking guard — one ACTIVE appointment per (owner, doctor, slot).
--    A user cannot hold two confirmed/upcoming bookings for the same doctor
--    at the same date+time. Cross-user slot contention cannot be enforced
--    until providers/slots are modeled server-side (documented limitation).
-- ---------------------------------------------------------------------------
create unique index if not exists appointments_active_slot_uniq
  on public.appointments (owner_id, doctor_id, scheduled_date, scheduled_time)
  where status in ('confirmed','upcoming') and doctor_id is not null;

-- ---------------------------------------------------------------------------
-- 9. Helper-function privilege lockdown. The DDL helpers are migration tools,
--    not runtime API — nobody should EXECUTE them via PostgREST/anon.
--    handle_new_user stays SECURITY DEFINER with a fixed search_path and is
--    only invoked by the auth trigger.
-- ---------------------------------------------------------------------------
revoke execute on function public.carelink_apply_owner_rls(text) from public, anon, authenticated;
revoke execute on function public.carelink_apply_family_ref_rls(text) from public, anon, authenticated;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.carelink_set_updated_at() from public, anon, authenticated;
