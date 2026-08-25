-- ===========================================================================
-- CareLink-AI — Step 10.5 §13: Notifications.
--
-- ADDITIVE ONLY. Recipient-scoped notifications with delivery events, ready
-- for Edge Function / cron dispatch (status + scheduled_for indexes).
--
-- PRIVACY: payloads carry the minimum needed to render the notification —
-- never medical report contents or raw AI output. A size cap CHECK enforces
-- the "small payload" rule at the database level.
-- ===========================================================================

create table if not exists public.notification_templates (
  code text primary key,
  kind text not null check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup')),
  title_template text not null,
  body_template text not null,
  channel text not null check (channel in ('in_app','email','sms')) default 'in_app',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- recipient IS the owner: a user receives only their own notifications
  owner_id uuid not null references auth.users(id) on delete cascade,
  family_profile_id uuid references public.family_profiles(id) on delete cascade,
  template_code text references public.notification_templates(code) on delete set null,
  kind text not null check (kind in ('appointment','medication','vaccination','recovery','donor_request','sos','ai_followup')),
  title text not null,
  body text,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz not null default now(),
  sent_at timestamptz,
  status text not null check (status in ('scheduled','pending','sent','read','failed','cancelled')) default 'scheduled',
  created_at timestamptz not null default now(),
  -- payloads are render hints only: capped so they can never smuggle a report
  check (octet_length(payload::text) <= 2000)
);
create index if not exists notifications_owner_id_idx on public.notifications(owner_id);
create index if not exists notifications_family_profile_id_idx on public.notifications(family_profile_id);
create index if not exists notifications_recipient_scheduled_idx on public.notifications(owner_id, scheduled_for);
create index if not exists notifications_status_scheduled_idx on public.notifications(status, scheduled_for);

create table if not exists public.notification_delivery_events (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('queued','sent','delivered','failed')),
  detail text,
  occurred_at timestamptz not null default now()
);
create index if not exists notification_delivery_events_notification_id_idx on public.notification_delivery_events(notification_id);
create index if not exists notification_delivery_events_owner_id_idx on public.notification_delivery_events(owner_id);

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
drop trigger if exists carelink_family_profile_ownership on public.notifications;
create trigger carelink_family_profile_ownership
  before insert or update on public.notifications
  for each row execute function public.carelink_enforce_family_profile_ownership();

-- delivery events must reference an own notification
create or replace function public.carelink_enforce_notification_owner()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.notifications n
    where n.id = new.notification_id and n.owner_id = new.owner_id
  ) then
    raise exception 'notification_id must belong to the row owner';
  end if;
  return new;
end;
$$;

drop trigger if exists carelink_notification_owner on public.notification_delivery_events;
create trigger carelink_notification_owner
  before insert or update on public.notification_delivery_events
  for each row execute function public.carelink_enforce_notification_owner();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
-- Templates: public read; super_admin write (per-command policies).
alter table public.notification_templates enable row level security;
drop policy if exists notification_templates_public_read on public.notification_templates;
create policy notification_templates_public_read on public.notification_templates for select using (true);
do $$
begin
  perform public.carelink_apply_admin_write_rls('notification_templates', 'SUPER_ADMIN', null);
end $$;

-- Recipient-scoped tables
do $$
declare t text;
begin
  foreach t in array array['notifications','notification_delivery_events']
  loop
    execute format('alter table public.%I enable row level security;', t);
    perform public.carelink_apply_owner_rls(t);
  end loop;
end $$;
