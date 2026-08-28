-- ===========================================================================
-- CareLink-AI — Step 10.5 §REC: Agent recommendation provenance.
--
-- ADDITIVE ONLY. Extends public.agent_recommendations (0008) with the
-- verification/provenance fields the Step 13 AI gateway emits per response:
--   provider          — which AI provider/engine produced the recommendation
--   verification       — provenance status (validated / fallback / unverified)
--   provider_snapshot  — full provider payload snapshot (mode, provider,
--                        fetchedAt, verification) for auditability. No PHI.
--
-- Backward-compatible: legacy mock rows automatically keeptheir existing
-- source/is_mock semantics; provider stays null for them and verification
-- defaults to 'fallback' (unverified-by-validators mock data. Deterministic,
-- replayable on a clean database and safe with existing data。
-- ===========================================================================

alter table public.agent_recommendations
  add column if not exists provider text,
  add column if not exists verification text not null default 'fallback',
  add column if not exists provider_snapshot jsonb;

-- verification values mirror the Step 13 AI provenance enum.
 do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.agent_recommendations'::regclass
      and conname = 'agent_recommendations_verification_check'
  ) then
    alter table public.agent_recommendations
      add constraint agent_recommendations_verification_check
      check (verification in ('validated','fallback','unverified'));
  end if;
end $$;