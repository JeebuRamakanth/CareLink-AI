-- ===========================================================================
-- CareLink-AI — Step 10.5 §8: AI context / snapshot backend.
--
-- ADDITIVE ONLY. Completes the DB side of the existing Step 13 AI gateway
-- architecture. It does NOT create a second AI system and it does NOT
-- duplicate conversation storage — it links to conversations /
-- conversation_messages from Step 10.
--
-- Guarantees (enforced here):
--   - snapshots are bounded payloads (jsonb capped by the app; column keeps
--     only the redacted minimum-necessary snapshot from Step 13 §5),
--   - patient-scoped + authorization-checked (owner_id + family ownership
--     trigger + conversation ownership trigger),
--   - timestamped + source-linked (conversation/message references),
--   - no arbitrary private-table AI access: the AI itself never reads these
--     tables; only the user’s own session fetches context, and privileged AI
--     access stays behind the ai-gateway Edge Function.
-- ===========================================================================

-- Registry of agent configurations (no patient data; public read).
create table if not exists public.ai_agents (
  id text primary key,                     -- e.g. 'carelink-agent'
  label text not null,
  model_label text,
  configuration jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Bounded, redacted patient context snapshots (Step 13 context snapshot rows)
create table if not exists public.patient_context_snapshots (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  -- redacted minimum-necessary snapshot only (relation, age band, capped tags)
  snapshot jsonb not null default '{}'::jsonb,
  language text not null default 'en',
  created_at timestamptz not null default now()
);
create index if not exists patient_context_snapshots_owner_id_idx on public.patient_context_snapshots(owner_id);
create index if not exists patient_context_snapshots_family_profile_id_idx on public.patient_context_snapshots(family_profile_id);
create index if not exists patient_context_snapshots_created_at_idx on public.patient_context_snapshots(created_at);

create table if not exists public.agent_intents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete set null,
  intent text not null,
  confidence text check (confidence in ('low','medium','high')),
  created_at timestamptz not null default now()
);
create index if not exists agent_intents_owner_id_idx on public.agent_intents(owner_id);
create index if not exists agent_intents_conversation_id_idx on public.agent_intents(conversation_id);

create table if not exists public.agent_actions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  action text not null,
  parameters jsonb not null default '{}'::jsonb,
  status text not null check (status in ('suggested','completed','dismissed')) default 'suggested',
  created_at timestamptz not null default now()
);
create index if not exists agent_actions_owner_id_idx on public.agent_actions(owner_id);
create index if not exists agent_actions_conversation_id_idx on public.agent_actions(conversation_id);

create table if not exists public.agent_feedback (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  message_id uuid references public.conversation_messages(id) on delete set null,
  rating smallint not null check (rating in (-1, 0, 1)),
  comment text,
  created_at timestamptz not null default now(),
  unique (conversation_id, message_id, owner_id)
);
create index if not exists agent_feedback_owner_id_idx on public.agent_feedback(owner_id);

create table if not exists public.agent_followups (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  question text not null,
  source_intent text,
  status text not null check (status in ('offered','answered','dismissed')) default 'offered',
  due_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_followups_owner_id_idx on public.agent_followups(owner_id);
create index if not exists agent_followups_conversation_id_idx on public.agent_followups(conversation_id);

-- ---------------------------------------------------------------------------
-- Triggers: family ownership + conversation ownership
-- ---------------------------------------------------------------------------
drop trigger if exists carelink_family_profile_ownership on public.patient_context_snapshots;
create trigger carelink_family_profile_ownership
  before insert or update on public.patient_context_snapshots
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- conversation_id (when set) must belong to the snapshot owner.
-- (Separate function for message ownership below — a single tg_argv-branching
-- function is unsafe because tables without message_id fail field evaluation.)
create or replace function public.carelink_enforce_ai_conversation_owner()
returns trigger
language plpgsql
as $$
begin
  if new.conversation_id is not null and not exists (
    select 1 from public.conversations c
    where c.id = new.conversation_id and c.owner_id = new.owner_id
  ) then
    raise exception 'conversation_id must belong to the row owner';
  end if;
  return new;
end;
$$;

-- message_id (when set) must belong to the row owner. Attached ONLY to the
-- tables that actually carry a message_id column.
create or replace function public.carelink_enforce_ai_message_owner()
returns trigger
language plpgsql
as $$
begin
  if new.message_id is not null and not exists (
    select 1 from public.conversation_messages m
    where m.id = new.message_id and m.owner_id = new.owner_id
  ) then
    raise exception 'message_id must belong to the row owner';
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['patient_context_snapshots','agent_intents','agent_actions','agent_feedback','agent_followups']
  loop
    execute format(
      'drop trigger if exists carelink_ai_conversation_owner on public.%I;
       create trigger carelink_ai_conversation_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_ai_conversation_owner();', t, t);
  end loop;
  -- message ownership additionally enforced on the tables carrying message_id
  foreach t in array array['agent_intents','agent_feedback']
  loop
    execute format(
      'drop trigger if exists carelink_ai_message_owner on public.%I;
       create trigger carelink_ai_message_owner
         before insert or update on public.%I
         for each row execute function public.carelink_enforce_ai_message_owner();', t, t);
  end loop;
end $$;

-- updated_at for the registry table
drop trigger if exists set_updated_at on public.ai_agents;
create trigger set_updated_at before update on public.ai_agents
  for each row execute function carelink_set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.ai_agents enable row level security;
drop policy if exists ai_agents_public_read on public.ai_agents;
create policy ai_agents_public_read on public.ai_agents for select using (true);
drop policy if exists ai_agents_superadmin_write on public.ai_agents;
create policy ai_agents_superadmin_write on public.ai_agents
  for all using (public.carelink_is_super_admin())
  with check (public.carelink_is_super_admin());

do $$
declare t text;
begin
  foreach t in array array[
    'patient_context_snapshots','agent_intents','agent_actions',
    'agent_feedback','agent_followups'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;
