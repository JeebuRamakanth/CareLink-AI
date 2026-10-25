-- ===========================================================================
-- CareLink-AI — Step 30: supported assistant languages (Phase 2)
--
-- The assistant now answers in ten languages (native script AND Romanized
-- transliteration): en, te, hi, kn, ta, ml, bn, gu, mr, ur. The columns that
-- store a language were unconstrained `text`, so a bad client value could be
-- persisted silently. This migration:
--
--   1. normalises any existing unsupported value to 'en' (the guaranteed floor),
--   2. adds a CHECK constraint that accepts ONLY the supported vocabulary.
--
-- It is ADDITIVE and IDEMPOTENT: existing 'en'/'te'/'hi' rows are untouched, the
-- constraint is dropped-if-exists before being recreated, and no data is deleted.
-- No RLS policy changes: the columns are still owner-scoped by the existing
-- policies on `profiles`, `conversations` and `patient_context_snapshots`.
-- ===========================================================================

-- --- 1. Normalise unsupported values to the English floor -------------------
update public.profiles
   set language_preference = 'en'
 where language_preference is not null
   and language_preference not in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur');

update public.conversations
   set language = 'en'
 where language is not null
   and language not in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur');

update public.patient_context_snapshots
   set language = 'en'
 where language is not null
   and language not in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur');

-- --- 2. Enforce the vocabulary at the database boundary ---------------------
alter table public.profiles
  drop constraint if exists profiles_language_preference_check;
alter table public.profiles
  add constraint profiles_language_preference_check
  check (language_preference is null
         or language_preference in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur'));

alter table public.conversations
  drop constraint if exists conversations_language_check;
alter table public.conversations
  add constraint conversations_language_check
  check (language is null
         or language in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur'));

alter table public.patient_context_snapshots
  drop constraint if exists patient_context_snapshots_language_check;
alter table public.patient_context_snapshots
  add constraint patient_context_snapshots_language_check
  check (language is null
         or language in ('en','te','hi','kn','ta','ml','bn','gu','mr','ur'));

-- --- 3. Helpful index for language analytics (owner-scoped reads) -----------
create index if not exists conversations_language_idx on public.conversations(language);

comment on constraint conversations_language_check on public.conversations is
  'Supported assistant languages (Step 30). The client detector and the AI gateway use the same vocabulary.';
