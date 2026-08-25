-- ===========================================================================
-- 070 — AI context backend + recommendation provenance.
--   Snapshots/intents/actions/feedback/followups are owner-scoped and
--   patient/conversation ownership is enforced by triggers.
--   (Fixtures: A conversation a0000003-..., B conversation b0000003-...,
--    A profiles a1111111-..., B profile b2222222-...)
-- ===========================================================================

-- Registry: public read, admin-only write
insert into public.ai_agents (id, label) values ('carelink-agent', 'CareLink Agent');

set role anon;
select harness.ok((select count(*) = 1 from public.ai_agents), 'ai: anon reads agent registry');
select harness.expect_error(
  $$insert into public.ai_agents (id, label) values ('rogue', 'Rogue')$$,
  'ai: anon cannot register agents'
);
reset role;

-- ---------------------------------------------------------------------------
set role authenticated;
set request.jwt.claims = '{"sub":"11111111-1111-1111-1111-111111111111"}';

-- snapshots: own profile + own conversation OK
select harness.expect_ok(
  $$insert into public.patient_context_snapshots (id, owner_id, family_profile_id, conversation_id, snapshot)
    values ('a0000007-0000-0000-0000-000000000007', auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000003-0000-0000-0000-000000000003', '{"profileRelation":"self","ageBand":"adult"}')$$,
  'ai: A stores snapshot for own profile + conversation'
);
select harness.expect_error(
  $$insert into public.patient_context_snapshots (owner_id, family_profile_id, snapshot)
    values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', '{}')$$,
  'ai: snapshot with B family profile rejected'
);
select harness.expect_error(
  $$insert into public.patient_context_snapshots (owner_id, conversation_id, snapshot)
    values (auth.uid(), 'b0000003-0000-0000-0000-000000000003', '{}')$$,
  'ai: snapshot linked to B conversation rejected'
);

-- intents/actions/feedback/followups ownership
select harness.expect_ok(
  $$insert into public.agent_intents (owner_id, conversation_id, intent, confidence)
    values (auth.uid(), 'a0000003-0000-0000-0000-000000000003', 'hospital', 'high')$$,
  'ai: A records intent on own conversation'
);
select harness.expect_error(
  $$insert into public.agent_intents (owner_id, conversation_id, intent)
    values (auth.uid(), 'b0000003-0000-0000-0000-000000000003', 'hospital')$$,
  'ai: intent on B conversation rejected'
);
select harness.expect_ok(
  $$insert into public.agent_actions (owner_id, conversation_id, action) values (auth.uid(), 'a0000003-0000-0000-0000-000000000003', 'view_hospital')$$,
  'ai: A records action'
);
select harness.expect_ok(
  $$insert into public.agent_feedback (owner_id, conversation_id, message_id, rating)
    values (auth.uid(), 'a0000003-0000-0000-0000-000000000003', null, 1)$$,
  'ai: A leaves feedback'
);
select harness.expect_error(
  $$insert into public.agent_followups (owner_id, conversation_id, question)
    values (auth.uid(), 'b0000003-0000-0000-0000-000000000003', 'how are you?')$$,
  'ai: follow-up on B conversation rejected'
);

-- recommendations: own patient profile + conversation OK; cross-user rejected
select harness.expect_ok(
  $$insert into public.agent_recommendations (owner_id, patient_profile_id, conversation_id, entity_type, entity_id, overall_score, is_mock, matched_reasons)
    values (auth.uid(), 'a1111111-1111-1111-1111-111111111111', 'a0000003-0000-0000-0000-000000000003', 'hospital', 'hospital-one', 0.9, true, '["nearby","specialty match"]')$$,
  'ai: A stores recommendation provenance'
);
select harness.expect_error(
  $$insert into public.agent_recommendations (owner_id, patient_profile_id, entity_type, entity_id)
    values (auth.uid(), 'b2222222-2222-2222-2222-222222222222', 'doctor', 'x')$$,
  'ai: recommendation for B patient profile rejected'
);
select harness.expect_error(
  $$insert into public.agent_recommendations (owner_id, conversation_id, entity_type, entity_id)
    values (auth.uid(), 'b0000003-0000-0000-0000-000000000003', 'doctor', 'x')$$,
  'ai: recommendation on B conversation rejected'
);

reset role;
reset request.jwt.claims;

-- B isolation on every AI table
set role authenticated;
set request.jwt.claims = '{"sub":"22222222-2222-2222-2222-222222222222"}';
select harness.ok((select count(*) = 0 from public.patient_context_snapshots where owner_id = '11111111-1111-1111-1111-111111111111'), 'ai: B cannot see A snapshots');
select harness.ok((select count(*) = 0 from public.agent_intents where owner_id = '11111111-1111-1111-1111-111111111111'), 'ai: B cannot see A intents');
select harness.ok((select count(*) = 0 from public.agent_actions where owner_id = '11111111-1111-1111-1111-111111111111'), 'ai: B cannot see A actions');
select harness.ok((select count(*) = 0 from public.agent_feedback where owner_id = '11111111-1111-1111-1111-111111111111'), 'ai: B cannot see A feedback');
select harness.ok((select count(*) = 0 from public.agent_followups where owner_id = '11111111-1111-1111-1111-111111111111'), 'ai: B cannot see A followups');
select harness.ok((select count(*) = 0 from public.agent_recommendations where owner_id = '11111111-1111-1111-1111-111111111111'), 'ai: B cannot see A recommendations');
-- forged owner insert
select harness.expect_error(
  $$insert into public.patient_context_snapshots (owner_id, snapshot) values ('11111111-1111-1111-1111-111111111111', '{}')$$,
  'ai: B cannot write snapshot with A owner_id'
);
reset role;
reset request.jwt.claims;
