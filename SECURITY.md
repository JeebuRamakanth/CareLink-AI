# CareLink-AI — Security Model

This document describes the security posture verified as of Step 14
(2026-08-28,. It is a living document; update it whenever the security
model or migrations change.

## Trust boundaries

| Boundary | Enforced by |
|---|---|
| Anonymous browsing (hospitals/doctors/reviews/search) | Public RLS policies with read-only predicates |
| Authenticated patient data | Row Level Security (RLS, Supabase `auth.uid()`|
| Provider staff scope | `carelink_*_member`/`carelink_*_admin` SECURITY DEFINER predicates called inside RLS quals |
| Documents | Private `medical_documents` storage bucket + owner-path policy |
| AI | Server-side edge function (only holder of provider key); schema-validated output |

The frontend never constitutes an authorization boundary. Every protected
row/object is additionally enforced at the database/storage layer by RLS.

## RBAC model

Roles: `patient`, `doctor`, `hospital_admin`, `pharmacy_admin`,
`lab_admin`, `admin`, `super_admin` (see `0006_rbac_provider_membership.sql`)。

Role membership lives in `user_roles` / `provider_memberships`;
privileged operations call guarded SECURITY DEFINER helpers that:
- verify the caller via `auth.uid()`,
- check role/provider membership server-side,
- audit the action (`carelink_record_audit`),
- never trust frontend claims, query params,or hidden UI.

Admin/super_admin elevation requires a server-verified grant (no
client-asserted role).

## Row Level Security

- Every private table has RLS enabled with owner-scoped policies
  (`owner_id = auth.uid()` / `family_profile.owner_id = auth.uid()`,
  provider-membership predicates for staff scopes)。
- No `USING (true)` / `WITH CHECK (true)` permissive policies remain on
  private tables. `review_verification` public-read was closed in `0020`.
- Storage objects are scoped to `<owner_id>/<...>` folder paths in all four
  CRUD policies。
- Trigger/helper definer functions have least-privilege EXECUTE
  (`0021` removes PUBLIC/anon from no-arg mutating definers)。RLS
  predicate helpers retain anon EXECUTE where required to evaluate public
  reads——they are read-only.and never expand row access.

## Relationship ownership integrity

Cross-object relations (medical_report→document, medicine→document,
appointment_event→appointment, conversation_message→conversation,
recovery→appointment) are enforced by RLS predicates that chain to the
root `owner_id`; the frontend cannot construct a cross-owner relation via
plain RPC because policies require ownership coherence at row level.

## Storage security

- Bucket: `medical_documents` (private)。
- Path convention `<owner_id>/<document_id>/<file>`; RLS requires
  `(storage.foldername(name))[1] = auth.uid()::text` on read/write/update/delete.
- Access: Supabase signed URLs (expiring) or local blob fallback;
  no public object URL.
 Never store metadata/PHI in the object name/over-stuffed path
  (user filename is sanitized and used only as display).

## Upload hardening

- Client pipeline validates MIME, size limit, extension, filename
  sanitization, duplicate detection, and malformed checks before upload
  (`src/features/documents/services/fileValidation.ts`)；storage service
  precedence: Cloudinary unsigned preset → Supabase private bucket →
  local mock。 No uploaded file is ever executed as code; analysis output
  is schema-validated before render。



## AI safety

- Single gateway: `supabase/functions/ai-gateway` (edge fn) is the only
  holder of the provider API key (`AI_PROVIDER_API_KEY`, never `VITE_*`)。
- Client hits the gateway via `VITE_AI_PROVIDER_BASE_URL`; absence of
  credentials yields a clearly-labelled mock experience, never fake "live"
  claims。
- Server-side channel separation（developer channel holds system/${untrusted_
  document} data)；input prompt-injection screening; output JSON-schema
  validated before render; rate-limited (8 req/60s), 9s timeout, one
  retry on 29/5xx with backoff+jitter。
- Safety floor/ceiling: emergency keywords escalate internally; diagnostic
  overclaims (e.g. "you have X") are rewritten/or clamped;
  medicine dosage/ strength only surfaced when confidence≥0.85, else
  flagged uncertain; no autonomous dosage/prescription/HL7 writes。
- Context snapshot minimizes PHI: relation (not name), ≤4
  conditions/medicines, ≤6 history turns/280 chars。
- Output provenance badge distinguishes Live AI from mock。

## PHI minimization

- No symptoms/conditions/report contents/medicine strings/notes/
  donor identity/emergency details in URLs/query strings unless a
  secured feature requires it (e.g. `?focus=Ophthalmology` specialty等 filters，
  which are non-PHI)。Search URLs carry provider/service terms only。
- No console/analytics logging of PHI or tokens; no raw document contents
  in logs; safe error messages never expose stack/SQL/tokens/paths。



## Incident considerations

- On suspicion: Rotate the anon key/Cloudinary presetsand AI key; revoke
  sessions; verify RLS replay on the fresh DB (harness; see
  `supabase/tests/`）before redeploy।
- Blast radius is bounded by per-owner RLS、object-path policies, endpoint
  auth, and least-privilege server functions。



## Environment variables (browser-safe subset;

 see `.env.example`:

`VITE_*` — API base URLs, Supabase anon key, Cloudinary unsigned
preset, map key (restricted, optional), AI gateway URL. Server-only:
`AI_PROVIDER_API_KEY`(edge fn only); `service_role` keys must never appear
in `VITE_*` or the repo。

 ## Deployment requirements Other

      Supabase project with the migrations applied in order; edge fn deployed;
      bucket+storage policies present; Capacitor shell (Android) as per
      `PLAY_STORE_RELEASE.md`）、、安全 headers deemed environment-appropriate
      (platform-level, e.g. Supabase/edge host;无需在 SPA runtime 重写
      CSP that could break Capacitor）。

## Known limitations

- Client mock flows (no Supabase/Cloudinary/AI creds) are demo-only and
  always labelled。
- AI responses are guidance, not diagnosis/prescription; emergency
  surfaces via tel:/nearest-facility cards。
- Real-device Android testing not yet performed (SDK/build verified only。。