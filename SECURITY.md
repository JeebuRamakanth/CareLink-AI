# CareLink-AI — Security & Threat Model (Step 14)

Evidence-based hardening notes. This document does **not** claim absolute
security; it records the threat model, the mitigations that exist in code and
migrations, and how each is verified.

## Architecture trust boundaries

```
Browser (React SPA) ──► Supabase (Auth + Postgres RLS + private Storage)
                    ──► Cloudinary (unsigned preset only)
                    ──► AI Gateway (Supabase Edge Function) ──► LLM provider
                    ──► Google Maps (browser-restricted key)
```

- The browser bundle contains **no privileged secrets** (anon key, unsigned
  upload preset, browser-restricted Maps key only — all public by design).
- The AI provider key exists **only** as an edge-function secret.
- Postgres RLS is the authorization layer of record; the client is never
  trusted. Client-side checks are UX conveniences only.

## Threat model

| # | Attacker | Attack path | Component | Mitigation | Verification |
|---|----------|-------------|-----------|------------|--------------|
| 1 | Unauthenticated attacker | Direct URL to `/profile`, private API calls | `ProtectedRoute`, repositories | Route guard redirects; repositories require verified `auth.getUser()`; RLS denies anon | Browser E2E: logged-out `/profile` → login redirect; smoketest RLS static checks |
| 2 | Authenticated malicious user | Forged `owner_id` in insert/update | repositories + RLS | `owner_id` always from `auth.getUser()` server-side; RLS `with check (owner_id = auth.uid())` | Migration 0002/0003 policy audit; smoketest |
| 3 | Cross-user attacker | Read/write/delete User B rows | Postgres RLS | Every patient table: owner-scoped SELECT/INSERT/UPDATE/DELETE; no broad authenticated-read policy | 0002/0003 static policy matrix in smoketest |
| 4 | Cross-family attacker | Attach User B `family_profile_id` / `medical_document_id` / `appointment_id` / `conversation_id` | FK checks bypass RLS | Migration 0003: WITH CHECK subqueries require referenced row `owner_id = auth.uid()` | 0003 policies; smoketest asserts presence per table |
| 5 | Malicious doctor/provider account | Access patient data beyond scope | — | **No provider roles exist yet** (no RBAC tables). Providers have no data path at all. | Schema audit — documented limitation |
| 6 | Malicious admin | Privileged misuse | — | No admin role in client; service_role never shipped; `audit_events` insert is service-role-only, self-select read-only | 0002 audit policy; secret scan |
| 7 | Compromised API client | Token replay, key theft | AI gateway, Supabase | JWT required at edge fn; short-lived tokens; per-user server rate limit; client token bucket; keys server-side | aiGateway + edge fn code review; smoketest rate limiter |
| 8 | Malicious document/PDF | Polyglot upload, traversal filename, MIME spoof | `fileValidation.ts`, storage | Extension allowlist + MIME/extension agreement + traversal rejection + size cap + sanitized public ids + private bucket + ext sanitized to `[a-z0-9]{1,8}` | Smoketest upload suite (12 cases) |
| 9 | Prompt-injection attacker | "Ignore previous instructions", injected PDF/OCR text | `promptGuards.ts`, edge fn | Injection screening; document text wrapped `<untrusted_document>`; system prompt server-side; action allowlist; schema-validated output | Smoketest injection suite (10 cases) |
| 10 | Stolen session | localStorage token theft via XSS | Supabase client, CSP | XSS surface minimized (no `dangerouslySetInnerHTML`, React escaping, CSP `script-src 'self'`); accepted SPA risk: refresh token in localStorage is required by supabase-js | Code audit (zero unsafe sinks); CSP in build |
| 11 | API abuse / bot | Request flooding, oversized bodies | `http.ts`, aiGateway, edge fn | Client token bucket (8/60s), 48 KB body cap, 15 s timeout, ≤1 retry; server per-user rate limit + 20 KB cap | Smoketest rate-limit + retry cases |
| 12 | Manipulated client payload | Malformed JSON, wrong types | `aiSchemas.ts`, repositories | All external output schema-validated before use; malformed → safe fallback | Smoketest schema validators |
| 13 | Forged IDs | UUID guessing of documents/appointments | RLS + storage RLS | Ownership enforced by RLS regardless of id knowledge; storage path must start with caller uid (0003 §7) | 0003 policy checks |
| 14 | Malicious external URLs | Open redirect, javascript: links | maps lib, cards | Directions/place URLs built by allowlisted builders (`www.google.com/maps/...`); `window.open` always `noopener,noreferrer`; no user-controlled hrefs rendered | Code audit |

## Data isolation matrix

Roles `doctor`, `hospital_admin`, `pharmacy_admin`, `lab_admin`, `admin`,
`super_admin` **do not exist** in the current schema (Step 10.5 RBAC was never
implemented). There is exactly one client role: the patient (owner). This is
a documented limitation, not a claim of RBAC security.

| Actor | Can read | Can write | Can delete | Can NEVER access |
|-------|----------|-----------|------------|------------------|
| Anonymous | Public pages (hospitals/doctors/reviews mock data) | Nothing | Nothing | All `public.*` health tables (RLS), storage objects, `/profile` |
| Patient (User A) | Own rows in all 18 tables; own storage objects; own audit rows | Rows with `owner_id = self`, referencing only own family profiles/documents/appointments/conversations | Own rows; own storage objects | User B rows/objects; audit insert; other users' conversations/recovery |
| User B | Same, scoped to B | Same, scoped to B | Same, scoped to B | User A rows/objects |
| Child profile | Not an account — a `family_profiles` row owned by the parent user | — | — | Other owners' rows |
| Doctor / provider admins | — (no role exists) | — | — | Everything (no data path) |
| service_role (server only) | All (bypasses RLS) | All | All | Never present in the browser bundle |

## Medical-document security

- Private `medical_documents` bucket; signed URLs only (60 s), never public.
- Object path `<owner_id>/<document_id>/<file>`; storage RLS on
  `foldername[1] = auth.uid()`; metadata `storage_path` must match the
  caller's folder (0003 §7) so metadata cannot point at another user's object.
- Validation before upload: size ≤ 10 MB, extension allowlist, MIME/extension
  agreement, traversal rejection, duplicate detection, ≤ 8 files per batch.
- No document contents in logs (`safeLog` redaction) or analytics.

## AI security

- Browser → edge function only; provider key is a server secret.
- Edge function requires a Supabase JWT, rate-limits per user, caps request
  size, assembles the system prompt server-side, separates channels, wraps
  document text as untrusted data, constrains output to a JSON schema, and
  attaches provenance server-side.
- Client: token bucket, body cap, timeout, ≤1 bounded retry, schema validation
  before render, deterministic safety layer (emergency escalation EN/TE/
  Hinglish, no-diagnosis enforcement, overclaim replacement, secret-leak
  stripping) on **every** response including mock.

## Location privacy

- One-shot `getCurrentPosition` only — no `watchPosition` tracking.
- Manual location stored in `sessionStorage` (tab-scoped), city-scale.
- Distances/ETA shown only from real provider output; never fabricated.
- No coordinates in URLs beyond user-initiated directions deep-links.

## Known limitations (not hidden)

1. **No live Supabase in this environment** — RLS correctness is verified by
   static policy audit + smoketest assertions on the migration SQL, not by
   executing against a live database. Apply migrations to a staging project
   and re-run cross-user probes before production launch.
2. **No RBAC / provider roles / blood donation / SOS / notifications** — those
   features do not exist; related isolation requirements are documented as
   future work, not as passed tests.
3. **Mock auth** stores salted SHA-256 hashes in localStorage (demo only).
   Real deployments must use Supabase Auth.
4. **Refresh tokens in localStorage** — inherent to supabase-js SPA mode;
   mitigated by XSS hardening + CSP, not eliminated.
5. **Double-booking guard** prevents a user double-booking the same doctor+
   slot; cross-user slot contention requires a server-side slot inventory
   (not yet modeled).
