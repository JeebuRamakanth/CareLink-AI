-- ===========================================================================
-- CareLink-AI — Step 21 (Phase 7): review eligibility enforced in the database.
--
-- WHY: 0007 allowed a client to `insert` a published review for any target with
-- NO proof the author actually attended. The verified badge (carelink_verify_review)
-- only checked an appointment *when one was linked*. A review that omitted
-- appointment_id could therefore be posted by anyone for any provider.
--
-- FIX (additive + backward compatible with the 060 eligibility fixtures):
--   A BEFORE INSERT trigger requires every review to reference a genuine
--   COMPLETED appointment owned by the review author. When the appointment
--   records a provider id, that provider must match the review target. This
--   cannot be bypassed from the browser — it runs inside the database on the
--   only write path, so hiding the button is backed by a real server rule.
--
--   The trigger fires on INSERT and on UPDATEs that would re-point a review at
--   a different appointment/author/target (never on benign status/title/body
--   edits, so moderation + author edits keep working). It applies to EVERY
--   writer, including trusted imports — there is no bypass flag.
--
-- SECURITY: the trigger function is SECURITY DEFINER so it can read the
-- appointments row regardless of RLS, but it still enforces owner equality — it
-- never widens access.
-- ===========================================================================

create or replace function public.carelink_enforce_review_eligibility()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.appointments%rowtype;
begin
  if new.appointment_id is null then
    raise exception 'a review requires a completed appointment';
  end if;

  select * into a from public.appointments where id = new.appointment_id;
  if not found then
    raise exception 'review not allowed: linked appointment does not exist';
  end if;

  if a.owner_id <> new.owner_id then
    raise exception 'review not allowed: appointment belongs to another patient';
  end if;

  if a.status <> 'completed' then
    raise exception 'review not allowed: appointment is not completed';
  end if;

  -- Provider consistency — only when the appointment actually records a
  -- provider id (legacy/demo appointments may leave it null; the owner +
  -- completed checks above are the hard floor).
  if new.doctor_id is not null and a.doctor_id is not null
     and a.doctor_id <> new.doctor_id::text then
    raise exception 'review not allowed: appointment is with a different doctor';
  end if;
  if new.hospital_id is not null and a.hospital_id is not null
     and a.hospital_id <> new.hospital_id::text then
    raise exception 'review not allowed: appointment is at a different hospital';
  end if;

  return new;
end;
$$;

drop trigger if exists carelink_review_eligibility on public.reviews;
create trigger carelink_review_eligibility
  before insert on public.reviews
  for each row execute function public.carelink_enforce_review_eligibility();

drop trigger if exists carelink_review_eligibility_repoint on public.reviews;
create trigger carelink_review_eligibility_repoint
  before update of appointment_id, owner_id, doctor_id, hospital_id, pharmacy_id, lab_id on public.reviews
  for each row execute function public.carelink_enforce_review_eligibility();
