-- ===========================================================================
-- CareLink-AI — Step 10.5 §7: Recommendation provenance.
--
-- ADDITIVE ONLY. Stores why the agent recommended a provider entity: per-
-- factor scores, matched reasons, and live/mock provenance. Internal scores
-- are owner-visible only (RLS) and must be mapped to safe explanation text in
-- the UI — never shown as raw internals to other users (no public policy).
-- ===========================================================================

create table if not exists public.agent_recommendations (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  patient_profile_id uuid references public.family_profiles(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  entity_type text not null check (entity_type in ('hospital','doctor','pharmacy','lab')),
  -- entity_id is the provider slug or id from the active data source (real or mock)
  entity_id text not null,
  relevance_score numeric(4,3) check (relevance_score is null or (relevance_score >= 0 and relevance_score <= 1)),
  distance_score numeric(4,3) check (distance_score is null or (distance_score >= 0 and distance_score <= 1)),
  rating_score numeric(4,3) check (rating_score is null or (rating_score >= 0 and rating_score <= 1)),
  availability_score numeric(4,3) check (availability_score is null or (availability_score >= 0 and availability_score <= 1)),
  specialty_score numeric(4,3) check (specialty_score is null or (specialty_score >= 0 and specialty_score <= 1)),
  emergency_score numeric(4,3) check (emergency_score is null or (emergency_score >= 0 and emergency_score <= 1)),
  cost_score numeric(4,3) check (cost_score is null or (cost_score >= 0 and cost_score <= 1)),
  overall_score numeric(4,3) check (overall_score is null or (overall_score >= 0 and overall_score <= 1)),
  matched_reasons jsonb not null default '[]'::jsonb,
  source text not null default 'mock',          -- provider/source label
  is_mock boolean not null default true,        -- provenance: mock vs live
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists agent_recommendations_owner_id_idx on public.agent_recommendations(owner_id);
create index if not exists agent_recommendations_patient_profile_id_idx on public.agent_recommendations(patient_profile_id);
create index if not exists agent_recommendations_conversation_id_idx on public.agent_recommendations(conversation_id);
create index if not exists agent_recommendations_entity_idx on public.agent_recommendations(entity_type, entity_id);

-- patient_profile_ids must belong to the owner (same rule as family_profile)
create or replace function public.carelink_enforce_recommendation_patient_owner()
returns trigger
language plpgsql
as $$
begin
  if new.patient_profile_id is not null and not exists (
    select 1 from public.family_profiles fp
    where fp.id = new.patient_profile_id and fp.owner_id = new.owner_id
  ) then
    raise exception 'agent_recommendations.patient_profile_id must belong to the row owner';
  end if;
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.owner_id = new.owner_id
  ) then
    raise exception 'agent_recommendations.conversation_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_recommendation_patient_owner on public.agent_recommendations;
create trigger carelink_recommendation_patient_owner
  before insert or update on public.agent_recommendations
  for each row execute function public.carelink_enforce_recommendation_patient_owner();

-- RLS: owner-scoped only. Never public.
alter table public.agent_recommendations enable row level security;
do $$
begin
  perform public.carelink_apply_owner_rls('agent_recommendations');
end $$;
