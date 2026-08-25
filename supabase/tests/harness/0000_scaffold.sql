-- ===========================================================================
-- CareLink-AI — LOCAL TEST HARNESS SCAFFOLD (test-only, NEVER deployed).
--
-- Provides the minimum Supabase-compatible surface the production migrations
-- expect, so the REAL migration SQL runs against REAL PostgreSQL RLS:
--   - auth schema + auth.users fixture table
--   - auth.uid() / auth.jwt() reading request.jwt.claims (Supabase semantics)
--   - anon / authenticated roles with Supabase-like grants (RLS is the gate)
--   - storage.buckets / storage.objects / storage.foldername scaffolding
--   - harness.* assertion helpers (harness.ok / harness.expect_error / report)
--
-- SECURITY: this file is for the local disposable test database only. It is
-- NOT a production migration and is never applied to a real Supabase project
-- (Supabase already provides auth.* and storage.* natively).
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Roles (Supabase has these built-in; locally we create them)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- auth schema (test-only shim of Supabase GoTrue semantics)
-- ---------------------------------------------------------------------------
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text,
  created_at timestamptz not null default now()
);

-- auth.uid(): the sub claim of the simulated JWT, NULL when not signed in.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''),
    ''
  )::uuid;
$$;

-- auth.jwt(): full claims object ({} when not signed in).
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

grant usage on schema auth to anon, authenticated;
grant execute on function auth.uid() to anon, authenticated;
grant execute on function auth.jwt() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- storage schema (test-only scaffold matching the pieces migrations touch)
-- ---------------------------------------------------------------------------
create schema if not exists storage;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  metadata jsonb
);

-- storage.foldername('a/b/c') -> '{a,b}'
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1];
$$;

alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated;
grant all on storage.buckets to anon, authenticated;
grant all on storage.objects to anon, authenticated;
grant execute on function storage.foldername(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Supabase-like grants: clients can reach objects, RLS decides what they see.
-- Default privileges so migrations applied later are covered automatically.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
alter default privileges in schema public grant usage on sequences to anon, authenticated;

-- ---------------------------------------------------------------------------
-- harness: assertion + reporting helpers
-- ---------------------------------------------------------------------------
create schema if not exists harness;

create table if not exists harness.results (
  id bigint generated always as identity primary key,
  suite text not null default coalesce(current_setting('harness.suite', true), 'unknown'),
  label text not null,
  ok boolean not null,
  detail text,
  created_at timestamptz not null default now()
);

create or replace function harness.ok(cond boolean, label text, detail text default null)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into harness.results (label, ok, detail)
  values (label, coalesce(cond, false), detail);
  return coalesce(cond, false);
end;
$$;

-- Execute a statement as the CURRENT role and assert that it fails.
-- Security-invoker on purpose: the dynamic statement must run under the
-- caller's role/RLS context.
create or replace function harness.expect_error(stmt text, label text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  execute stmt;
  perform harness.ok(false, label, 'statement unexpectedly succeeded');
  return false;
exception when others then
  perform harness.ok(true, label, 'rejected: ' || sqlerrm);
  return true;
end;
$$;

-- Execute a statement as the CURRENT role and assert that it succeeds.
create or replace function harness.expect_ok(stmt text, label text)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  execute stmt;
  perform harness.ok(true, label);
  return true;
exception when others then
  perform harness.ok(false, label, 'unexpected error: ' || sqlerrm);
  return false;
end;
$$;

grant usage on schema harness to anon, authenticated;
grant select on harness.results to anon, authenticated;
grant execute on function harness.ok(boolean, text, text) to anon, authenticated;
grant execute on function harness.expect_error(text, text) to anon, authenticated;
grant execute on function harness.expect_ok(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Deterministic test users (A, B, C)
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('11111111-1111-1111-1111-111111111111', 'user-a@test.local'),
  ('22222222-2222-2222-2222-222222222222', 'user-b@test.local'),
  ('33333333-3333-3333-3333-333333333333', 'user-c@test.local')
on conflict (id) do nothing;
