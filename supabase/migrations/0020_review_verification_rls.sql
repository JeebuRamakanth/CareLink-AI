-- ===========================================================================
-- 0020 — Review verification row-level access hardening.
--
-- WHY: review_verification held a public-read policy (FOR SELECT USING (true))
-- that exposed appointment_id (a cross-object private reference) to even
-- the anonymous role. The verified badge value is a single boolean that the UI
-- renders from its own review list; no anonymous UI data dependency needs
-- THAT raw row (which also contains the completing appointment's UUID).
--
-- FIX (additive, backward-compatible):
--  1. Drop the public-read policy on review_verification.

--  2. Revoke anonymous privileges on that table entirely (default table grants
--     used by Supabase grant anon SELECT via the default privileges; explicit
--     revoke closes that hole regardless of default-privilege drift.).
--  3. Add an owner-scoped authenticated read policy: a caller may only see
--     the verification row of a review THEY authored. This keeps the repository
--     method getReviewVerification working for the author while denying cross-user
--     and anonymous enumeration. The guarded function carelink_verify_review
--     remains the sole write path.
-- ===========================================================================

drop policy if exists review_verification_public_read on public.review_verification;

revoke all on table public.review_verification from anon;

create policy review_verification_author_read on public.review_verification
  for select to authenticated
  using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id
        and r.owner_id = auth.uid()
    )
  );

-- 4. Harden handle_new_user (SECURITY DEFINER trigger) by pinning its
--    search_path to '' fand fully qualifying the only table it touches. Avoids
--    any future search_path hijack in the public schema.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, language_preference)
  values (new.id, 'en')
  on conflict (id) do nothing;
  return new;
end;
$$;