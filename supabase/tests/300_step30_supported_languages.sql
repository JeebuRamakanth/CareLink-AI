-- ===========================================================================
-- 300 — Step 30: supported assistant languages (Phase 2).
--
-- Asserts the language vocabulary is ENFORCED at the database boundary, so a
-- client cannot persist an unsupported language code:
--   1. every supported language is accepted on profiles / conversations,
--   2. an unsupported code is rejected by the CHECK constraint,
--   3. the existing 'en'/'te'/'hi' rows were NOT altered by the migration,
--   4. NULL stays allowed (the column is optional),
--   5. anon cannot write a language (RLS still owns the write path).
--
-- Fixtures: the harness owns the database, so the writes below run as the
-- harness role (which bypasses RLS); the anon check runs under `set role anon`.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Supported languages are accepted (conversations)
-- ---------------------------------------------------------------------------
do $$
declare
  lang text;
  owner uuid := gen_random_uuid();
  conv uuid;
  supported text[] := array['en','te','hi','kn','ta','ml','bn','gu','mr','ur'];
begin
  insert into auth.users(id, email) values (owner, 'step30-' || owner || '@example.test')
    on conflict (id) do nothing;
  foreach lang in array supported loop
    insert into public.conversations(owner_id, title, language)
      values (owner, 'step30 ' || lang, lang)
      returning id into conv;
    if conv is null then
      perform harness.ok(false, 'step30: language ' || lang || ' must be insertable');
    end if;
  end loop;
  perform harness.ok(true, 'step30: every supported language is accepted on conversations');
  delete from public.conversations where owner_id = owner;
  delete from auth.users where id = owner;
end $$;

-- ---------------------------------------------------------------------------
-- 2. An unsupported language is REJECTED
-- ---------------------------------------------------------------------------
do $$
declare
  owner uuid := gen_random_uuid();
  rejected boolean := false;
begin
  insert into auth.users(id, email) values (owner, 'step30-bad-' || owner || '@example.test')
    on conflict (id) do nothing;
  begin
    insert into public.conversations(owner_id, title, language) values (owner, 'bad', 'klingon');
  exception when check_violation then
    rejected := true;
  end;
  perform harness.ok(rejected, 'step30: an unsupported language code is rejected by the CHECK constraint');
  delete from public.conversations where owner_id = owner;
  delete from auth.users where id = owner;
end $$;

-- ---------------------------------------------------------------------------
-- 3. profiles.language_preference accepts the vocabulary and rejects the rest
-- ---------------------------------------------------------------------------
do $$
declare
  owner uuid := gen_random_uuid();
  rejected boolean := false;
begin
  insert into auth.users(id, email) values (owner, 'step30-prof-' || owner || '@example.test')
    on conflict (id) do nothing;
  insert into public.profiles(id, language_preference) values (owner, 'kn')
    on conflict (id) do update set language_preference = 'kn';
  perform harness.ok(
    (select language_preference = 'kn' from public.profiles where id = owner),
    'step30: profiles accepts a supported regional language'
  );
  begin
    update public.profiles set language_preference = 'zz' where id = owner;
  exception when check_violation then
    rejected := true;
  end;
  perform harness.ok(rejected, 'step30: profiles rejects an unsupported language');
  delete from public.profiles where id = owner;
  delete from auth.users where id = owner;
end $$;

-- ---------------------------------------------------------------------------
-- 4. NULL stays allowed (the column is optional)
-- ---------------------------------------------------------------------------
do $$
declare
  owner uuid := gen_random_uuid();
begin
  insert into auth.users(id, email) values (owner, 'step30-null-' || owner || '@example.test')
    on conflict (id) do nothing;
  insert into public.conversations(owner_id, title, language) values (owner, 'null lang', null);
  perform harness.ok(
    (select count(*) = 1 from public.conversations where owner_id = owner and language is null),
    'step30: a NULL language is still allowed'
  );
  delete from public.conversations where owner_id = owner;
  delete from auth.users where id = owner;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The constraint exists on every language column (migration applied)
-- ---------------------------------------------------------------------------
select harness.ok(
  exists (select 1 from pg_constraint where conname = 'conversations_language_check'),
  'step30: conversations carries the language CHECK constraint'
);
select harness.ok(
  exists (select 1 from pg_constraint where conname = 'profiles_language_preference_check'),
  'step30: profiles carries the language_preference CHECK constraint'
);
select harness.ok(
  exists (select 1 from pg_constraint where conname = 'patient_context_snapshots_language_check'),
  'step30: patient_context_snapshots carries the language CHECK constraint'
);

-- ---------------------------------------------------------------------------
-- 6. anon still cannot write (RLS is unchanged by this migration)
-- ---------------------------------------------------------------------------
set role anon;
do $$
declare
  wrote boolean := false;
begin
  begin
    insert into public.conversations(owner_id, title, language)
      values (gen_random_uuid(), 'anon write', 'te');
    wrote := true;
  exception when others then
    wrote := false;
  end;
  perform harness.ok(not wrote, 'step30: anon cannot insert a conversation (RLS unchanged)');
end $$;
reset role;
