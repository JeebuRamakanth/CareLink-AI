-- ===========================================================================
-- CareLink-AI — Step 14 security hardening: least-privilege EXECUTE
-- ===========================================================================
-- Trigger / internal no-arg SECURITY DEFINER helpers do not need client EXECUTE
-- (PostgreSQL only checks EXECUTE for direct CALL/expression use, not for trigger
--  firing). Remove the default PUBLIC + anon grants so no unauthenticated or
--  low-privilege role can invoke a mutating definer body standalone.
-- RLS predicate helpers (carelink_is_*, carelink_has_role, carelink_is_admin,
--  carelink_is_super_admin) intentionally keep anon where used in quals on
--  public-facing tables; those are read-only and required for RLS to evaluate.

-- apply donation cooldown (trigger on donation_records);
revoke execute on function public.carelink_apply_donation_cooldown() from public;
revoke execute on function public.carelink_apply_donation_cooldown() from anon;

-- appointment status history (trigger on appointments );
revoke execute on function public.carelink_track_appointment_status() from public;
revoke execute on function public.carelink_track_appointment_status() from anon;

-- auto-create profile on signup (trigger on profiles );
revoke execute on function public.handle_new_user() from public;
revoke execute on function public.handle_new_user() from anon;

-- Authenticated roles still trigger these naturally through DML; no direct grants needed.