-- ===========================================================================
-- 100 — Recovery expansion: plans, follow-up questions, escalation events.
-- ===========================================================================

set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

select harness.expect_ok(
  $$insert into public.recovery_plans (id, owner_id, family_profile_id, appointment_id, condition_label, plan)
    values ('a0000011-0000-0000-0000-000000000011', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000002-0000-0000-0000-000000000002', 'Post-viral', '{"steps":["rest","fluids"]}')$$,
  'recovery: A creates plan linked to own appointment'
);
select harness.expect_error(
  $$insert into public.recovery_plans (owner_id, appointment_id) values (auth.uid(), 'b0000002-0000-0000-0000-000000000002')$$,
  'recovery: plan linked to B appointment rejected'
);
select harness.expect_error(
  $$insert into public.recovery_plans (owner_id, family_profile_id) values (auth.uid(), 'b2222222-2222-2222-2222-222222222222')$$,
  'recovery: plan with B family profile rejected'
);
select harness.expect_error(
  $$insert into public.recovery_plans (owner_id, status) values (auth.uid(), 'bogus')$$,
  'recovery: invalid plan status rejected'
);

select harness.expect_ok(
  $$insert into public.recovery_followup_questions (owner_id, recovery_plan_id, question)
    values (auth.uid(), 'a0000011-0000-0000-0000-000000000011', 'Any fever today?')$$,
  'recovery: A adds follow-up question to own plan'
);

-- A check-in + escalation (Better/Same/Worse constrained)
select harness.expect_ok(
  $$insert into public.recovery_checkins (id, owner_id, family_profile_id, trend) values ('a0000012-0000-0000-0000-000000000012', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'worse')$$,
  'recovery: A records worse check-in'
);
select harness.expect_error(
  $$insert into public.recovery_checkins (owner_id, trend) values (auth.uid(), 'unknown')$$,
  'recovery: invalid trend rejected'
);
select harness.expect_ok(
  $$insert into public.recovery_escalation_events (owner_id, recovery_plan_id, checkin_id, trend_snapshot, reason)
    values (auth.uid(), 'a0000011-0000-0000-0000-000000000011', 'a0000012-0000-0000-0000-000000000012', 'worse', 'fever rising')$$,
  'recovery: A records escalation for own plan + check-in'
);

reset role;
reset request.jwt.claims;

-- B isolation + cross-references
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';

select harness.ok((select count(*) = 0 from public.recovery_plans where owner_id = '11111111-1111-1111-1111-111111111111'), 'recovery: B cannot see A plans');
select harness.ok((select count(*) = 0 from public.recovery_followup_questions where owner_id = '11111111-1111-1111-1111-111111111111'), 'recovery: B cannot see A follow-up questions');
select harness.ok((select count(*) = 0 from public.recovery_escalation_events where owner_id = '11111111-1111-1111-1111-111111111111'), 'recovery: B cannot see A escalations');
select harness.expect_error(
  $$insert into public.recovery_followup_questions (owner_id, recovery_plan_id, question) values (auth.uid(), 'a0000011-0000-0000-0000-000000000011', 'forged')$$,
  'recovery: B cannot add question to A plan'
);
select harness.expect_error(
  $$insert into public.recovery_escalation_events (owner_id, checkin_id, trend_snapshot) values (auth.uid(), 'a0000012-0000-0000-0000-000000000012', 'worse')$$,
  'recovery: B cannot escalate on A check-in'
);
reset role;
reset request.jwt.claims;
