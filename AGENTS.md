# CareLink-AI — Repository Notes

## Project Overview
Healthcare platform with hospitals, doctors, appointments, reviews, and an AI
"command center" agent. Frontend is React + Vite + TypeScript + Tailwind v4.

## Commands
- `npm run dev` — Vite dev server (default port 5173)
- `npm run build` — `tsc -b && vite build` (type-checks then bundles)
- `npm run lint` — oxlint
- `npm run preview` — preview production build

## Running the dev server on the work host
The work host (`work-1-...prod-runtime.all-hands.dev`) maps port 12000. To serve
on it:
```
npm run dev -- --host 0.0.0.0 --port 12000
```
Vite blocks unknown hostnames by default. `vite.config.ts` has
`server.allowedHosts` configured for the work hostnames — keep these when
restarting the dev server for browser verification.

## Design system conventions
- Dark glassmorphism aesthetic. Reuse color tokens: `brand`, `accent`, `ink`.
- Spacing/typography/buttons/cards/badges defined globally — reuse, don't redefine.
- Use the `cn()` util from `src/components/common/cn.ts` for class merging.
- `surface-panel` and similar primitives exist; prefer them over ad-hoc styles.

## Agent command center architecture
- Workspace: `src/components/agent/` — `AgentCommandCenter` orchestrates
  `AgentHeader`, `ConversationSidebar`, `AgentConversation`, `AgentComposer`,
  `AttachmentTray`, `QuickActions`, `ContextPanel`.
- Response cards: `src/components/agent/cards/` — one component per response
  `kind`, dispatched by `AgentResponseCard.tsx`.
- Shared card primitives: `ResponseCardShell.tsx`, icons in `AgentIcons.tsx`,
  styles in `agent.css`.
- Mock intelligence: `src/services/agent/` — `agentService.ts`,
  `agentTypes.ts`, `mockAgentService.ts`, `agentIntentRouter.ts`.
- State: `src/contexts/AgentContext.tsx` (conversations, attachments, recovery,
  family profiles, language) — persisted to localStorage.
- Page: `src/pages/Agent/AgentCommandCenterPage.tsx`, route `/agent`.

### Safety architecture
The agent is navigational, not diagnostic. Response cards carry a
"Guidance, not a diagnosis" badge. Emergency inputs surface an
`EmergencyResponseCard` with tel: links and nearest facility — never buried in
plain chat. Mock interpretations are explicitly labelled.

### Deep-link integration (do not duplicate existing pages)
- Hospital card "View Hospital" → `/hospitals/:slug` (existing detail page)
- Doctor card "View Profile" → `/doctors/:slug` (existing profile)
- Appointment card "View appointments" → `/appointments` (existing system)

## Key gotchas
- Vite dev server must run on port 12000 with `--host 0.0.0.0` for the work host
  to proxy it; otherwise the work host URL returns Bad Gateway.
- `server.allowedHosts` in `vite.config.ts` must include the work hostnames or
  Vite returns "Blocked request".
- Conversation/attachment/recovery state is in localStorage — old persisted
  mock responses keep their original text even after a code fix. Clear the
  conversation to see corrected output.

## Supabase backend + auth (Step 10)
- `@supabase/supabase-js` is installed but lazily imported (dynamic import) so
  missing credentials never crash the app or bloat the main bundle.
- Schema + RLS migrations live in `supabase/migrations/`:
  `0001_initial_health_schema.sql` (18 tables, UUID PKs, ownership columns,
  indexes, private `medical_documents` storage bucket, auto-profile trigger)
  and `0002_rls_policies.sql` (per-user, per-bucket RLS — NO broad "authenticated
  can read everything" policies). Apply both before enabling Supabase Auth.
- Typed DB row types: `src/services/health-data/types.ts`.
- Typed client: `src/services/supabase/client.ts` (anon key only; `persistSession`
  on). Never put `service_role` in `VITE_*`.
- Auth: `src/services/auth/authService.ts` + `src/contexts/AuthContext.tsx`.
  Real Supabase Auth when configured; deterministic LOCAL mock when not, so the
  auth UX + protected routes are exercisable without credentials. Mock accounts
  live in localStorage key `carelink_ai_mock_auth_*`.
- Repositories (no Supabase queries in UI): `src/services/health-data/*Repository.ts`.
  Each returns null/empty when Supabase is unavailable → existing
  localStorage-backed flows (AgentContext, AppointmentContext) remain the
  fallback source of truth.
- Storage boundary: `src/services/storage/supabaseStorage.ts` — private bucket,
  signed URLs only, metadata separate from binary. Path convention
  `<owner_id>/<document_id>/<file>` so RLS authorizes by folder name.
- Routes: `/login`, `/register` are real pages; `/profile` is protected
  (`ProtectedRoute`). Public browsing (hospitals/doctors/reviews) is NOT gated.
- Agent patient context: `AgentContext` loads the authenticated user's real
  family profiles into the profile switcher (falls back to mock otherwise).
  The agent reads only minimum-necessary context via `healthContextRepository`.

## Home hero + agent integration (verified)
The agent lives inside the Home hero, not a separate middle-page section:
- `src/features/health-agent/components/HealthCommandCenter.tsx` is a
  `forwardRef` exposing `focus()` and `ask(prompt)` (useImperativeHandle) so
  hero CTAs ("Ask CareLink AI", "Find Care Near Me") drive the agent without
  lifting state.
- `src/pages/Home/components/Hero.tsx` renders the agent in the right column on
  `lg+` (two-column hero), single column below. Agent wrapper motion.div and
  `.agent-shell` and the composer textarea all have `min-w-0` to prevent
  mobile overflow/clipping.
- Responsive composition verified clean (no horizontal overflow / clipping) at
  360/390/412/768/820/1024/1280/1440. Mobile stacks: headline → CTAs (full
  width, vertical) → agent. CTAs go side-by-side ≥768.
- Navbar breakpoint is `xl` (not `lg`) in `GlobalLayout.tsx` so the hamburger
  shows at 1024 instead of overflowing.

## Step 11 — Secure medical documents + Cloudinary + image intelligence (VERIFIED)
Service/UI/agent foundation for uploading, validating, storing, and analyzing
medical documents (blood/lab reports, prescriptions, medicine photos, PDFs,
DOC/DOCX, images) integrated into the existing Health Agent.

### Architecture boundaries (UI never calls storage/API directly)
- `src/features/documents/services/fileValidation.ts` — MIME, extension, size,
  filename, duplicate, malformed checks; `sanitizePublicIdSlug()` (user
  filename NEVER used as public id), `detectDocumentKind()`, `formatFileSize()`.
- `src/features/documents/services/storageService.ts` — storage boundary.
  Precedence: Cloudinary (unsigned) → Supabase private storage → local mock.
  `getStorageMode()` → 'real'|'mock'|'unavailable'; `storageModeLabel()` →
  "Cloudinary"|"Supabase Storage"|"Local (demo)". Reuses Step 9
  `realCloudinaryStorage` (upload_preset only, NO api secret) and Step 10
  `supabaseStorage.ts` (signed URLs, owner-scoped paths `<owner>/<doc>/<file>`).
- `src/features/documents/services/documentService.ts` — upload pipeline:
  validate → upload → persist metadata → process → analyze. Pipeline states:
  idle/validating/uploading/uploaded/processing/analyzing/completed/failed/cancelled.
  Cancel/retry/remove supported.
- `src/features/documents/services/documentAnalysisService.ts` — structured
  lab extraction (test name, value, unit, ref range, abnormal flag, collection
  date), safety assessment, schema-validated output. Mock always tagged.
- `src/features/documents/services/medicineRecognitionService.ts` — name,
  strength, dosage form, confidence, safety warning. NEVER invents dosage.
- `src/features/documents/types.ts` — HealthDocument, DocumentAttachment,
  DocumentProcessingState, DocumentAnalysisResult, MedicalReport, LabResult,
  MedicineInput, MedicineRecognitionResult, ExtractedMedicalValue,
  DocumentSafetyAssessment.
- Metadata persistence: `documentsRepository.ts` extends Step 10
  (createDocument/getDocument/listDocumentsForProfile/updateAnalysisStatus/
  updateDocumentStatus/deleteDocument). Returns null/empty → localStorage
  fallback. RLS-compatible, owner-scoped queries, NO raw medical content in rows.

### UI components
- `src/features/documents/components/` — DocumentUploadZone (drag-drop +
  camera + browse), DocumentUploadCard (preview/progress/retry/remove),
  DocumentLibrary (filter chips All/Reports/Lab/Prescriptions/Medicines/Other,
  family-profile switcher, View/Analyze/Delete).
- `DocumentAnalysisResultCard.tsx` — extracted-vs-explained distinction.
- `src/features/health-agent/components/AgentDocumentAnalysisPanel.tsx` —
  "Secure document analysis" panel in AIChatPage (/ai route).
- Page: `src/pages/Documents/DocumentsLibraryPage.tsx`, route `/documents`
  (added to GlobalLayout nav + routeConstants + AppRoutes).

### Agent integration (no unsafe diagnosis)
- AIChatPage renders AgentDocumentAnalysisPanel below conversation.
- agentOrchestrator handles report/lab/medicine intents with mock lab values
  (FBS 132, HbA1c 6.8%, Total Cholesterol 212, LDL 138), explicit mock label,
  "Guidance, not a diagnosis", action cards → existing routes
  (/doctors?q=Endocrinology, /hospitals, /appointments).
- Context propagation: active patient, document id/type, health intent kept
  across turns ("Remembered context: Diabetes — Endocrinology focus").
  No sensitive health details in URL params.

### Family-profile isolation
Documents belong to the selected AgentContext profile (Self/Parent/Child/
Spouse/Family member). `useDocumentLibrary` reads `agent.activeProfile.id`
from the shared `useAgent()` context — switching profiles swaps the document
list. Cross-profile leakage prevented at the repository query level.

### Security measures
- No API secrets / service-role keys in frontend; Cloudinary unsigned preset only.
- No public medical-document URLs; signed/controlled access; owner-scoped refs.
- MIME + size + filename validation + sanitization before upload.
- Safe deletion, safe errors, no document contents in logs.
- AI output schema-validated before render; no unsafe HTML from OCR/AI.
- Mock always labelled; never claims real AI analysis.

### Verification (all green)
- `npm run build`: 680 modules, 0 errors.
- `npm run lint`: 0 errors, 12 pre-existing warnings (none in Step 11 files).
- Smoketest (node ESM): 30/30 pass — validation, lab/medicine/prescription
  pipelines, mock tagging, schema validation, family isolation, secure storage
  refs, delete. File-validation test: valid PDF accepted; .exe/oversized/
  duplicate rejected.
- Browser: Home + hero agent, /ai conversation (mock lab card + action cards
  → /doctors?q=Endocrinology), /documents (upload zone, filters, profile
  switching Self→Parent), /hospitals + detail, /doctors + profile,
  /appointments, /login, /profile (protected redirect). Documents nav link in
  GlobalLayout. No console/runtime errors.

### Gotchas
- Smoketest runs against transpiled JS in /tmp/docbuild (use
  `node --import /tmp/register-hooks.mjs` — the loader's `resolve` hook needs
  `register()` from node:module, not bare `--import`, to resolve extensionless
  directory imports like `'../../../lib'`).
- docbuild must be re-transpiled after source changes or smoketest is stale.
- Without Cloudinary/Supabase credentials, `storageModeLabel()` = "Local
  (demo)" and the pipeline runs end-to-end against localStorage + blob URLs.

## Step 13 — Nav cleanup + About/Help/Contact (VERIFIED)
- Primary nav (GlobalLayout `navItems`): Home, Hospitals, Doctors, Reviews,
  Appointments, Documents only. About/Help/Contact live ONLY in the footer
  (grouped: Product / CareLink / Support / Trust & Safety). Header CTA is
  "Ask CareLink AI" → `/ai` (desktop + top of mobile menu).
- Footer Trust & Safety links are hash links into HelpPage sections:
  `/help#privacy|terms|medical-disclaimer|emergency-disclaimer`; HelpPage
  scrolls via `location.hash` + `scrollIntoView` (cards have `scroll-mt-28`).
  `/about#mission` targets the mission section.
- Pages: `src/pages/About/AboutPage.tsx`, `src/pages/Help/HelpPage.tsx`
  (+ `helpData.ts` — 18 FAQ articles, searchable, category chips, accessible
  accordion), `src/pages/Contact/ContactPage.tsx` (5 topic cards, validated
  form, DEMO-ONLY mock submit — no backend, success state explicitly says
  "No email has been sent").
- Page metadata: `src/hooks/useDocumentTitle.ts` sets `document.title` +
  meta description per page (no react-helmet in project).
- `Card` accepts an optional `id` prop (used for footer hash anchors).
- Verification gotcha: the OpenHands browser tool reports the STATIC
  index.html `<title>`; verify live titles with headless chromium
  (`--dump-dom`) or CDP instead.

## Step 13b — Real AI + Medical Intelligence Engine (VERIFIED)
Single engine, never a second agent system. All AI goes through one gateway.
- `src/features/health-agent/services/ai/` — the engine:
  - `aiGateway.ts` — ONLY network path for AI. Token-bucket rate limit
    (8/60s), 9s timeout (AbortController), one retry on 429/5xx with
    backoff+jitter, abort != retry. `sendToAIGateway()` returns
    ok/rate-limit/timeout/unavailable — never throws.
  - `aiSchemas.ts` — payload validators (chat/document/medicine). Every
    external response validated BEFORE render; malformed -> mock fallback.
  - `safetyLayer.ts` — deterministic floor/ceiling: `inputSafetyFloor()`
    (emergency keyword escalation, Telugu+Hinglish), `enforceResponseSafety()`
    (replaces diagnostic overclaims "you have X", strips leaked
    Bearer/api_key patterns, clamps enums). Runs on EVERY response incl. mock.
  - `promptGuards.ts` — injection screening, untrusted-document wrapping.
  - `contextSnapshot.ts` — minimum-necessary redacted context (relation not
    name, <=4 conditions/medicines); `boundHistory()` caps 6 turns/280 chars.
  - `aiEngine.ts` — real -> mock -> unavailable chain. `mockAIResponder.ts`
    reuses mockAdapters intent classification; output ALWAYS tagged
    "CareLink demo response (mock)".
- Server adapter: `supabase/functions/ai-gateway/index.ts` (Deno edge fn).
  The ONLY holder of `AI_PROVIDER_API_KEY` (secret, never VITE_*). Requires
  Supabase JWT, per-user rate limit, system prompt assembled server-side,
  channel separation (developer channel holds context + wrapped
  `<untrusted_document>` data), JSON-schema-constrained output, provenance
  attached server-side. Client hits it via `VITE_AI_PROVIDER_BASE_URL`.
- Orchestrator merges AI output: explanation/follow-ups/warnings/safetyLevel/
  provenance; emergency short-circuit BEFORE AI call; severity never
  decreases (escalateUrgency). Medicine: never silently substitutes —
  unknown medicine -> `uncertainMedicineWarning` + verify-with-pharmacist;
  LLM strength/dosage shown only when confidence >= 0.85, else flagged
  uncertain.
- UI: AIChatPage result header shows "Live AI" vs "CareLink demo response"
  provenance badge (title attr = provider + timestamp); hospital cards show
  "View Relevant Doctors" when a focus topic exists.
- Env for real mode: `VITE_AI_PROVIDER_BASE_URL` (edge fn URL) +
  `VITE_AI_PROVIDER_API_KEY` (optional; Supabase JWT preferred). Without
  them: full mock experience, clearly labelled.
- Smoketest: rolldown bundle (NOT tsc docbuild) — `/tmp/build-smoke.mjs`
  uses `transform.define: { 'import.meta.env': '({})' }` + stubs
  `globalThis.window = globalThis` (mockAdapters uses window.setTimeout).
  48/48 pass.

## Step 14 — Capacitor Android shell + Play Store readiness (VERIFIED)
- Capacitor 8 wraps the web app; web remains source of truth. Config:
  `capacitor.config.ts` (appId `com.carelinkai.app` — placeholder, confirm with
  owner before first Play upload; splash/status bar bg `#050816`).
- `android/` generated project: minSdk 24, target/compileSdk 36, versionCode 1
  / versionName "1.0.0". Manifest: INTERNET/CAMERA/LOCATION only (uses-feature
  optional), `allowBackup="false"`, `windowSoftInputMode="adjustResize"`.
- Release signing: `android/app/build.gradle` reads git-ignored
  `android/keystore.properties` or `CARELINK_KEYSTORE_FILE/_PASSWORD,
  CARELINK_KEY_ALIAS, CARELINK_KEY_PASSWORD` env vars; unsigned release build
  + warning otherwise. Never commit keystores.
- Icons/splash: masters in `assets/*.svg` (brand bolt from favicon),
  `npm run android:assets` (scripts/generate-android-assets.mjs, sharp +
  @capacitor/assets) regenerates all 148 mipmap/drawable resources.
- Safe-area: `viewport-fit=cover` in index.html + env(safe-area-inset-*) body
  padding in design-system.css (edge-to-edge enforced on targetSdk 35+).
- Scripts: android:sync/open/run/apk/aab/assets. Debug APK builds in ~75s with
  JDK 21 + Android SDK platform 36. Workflow: .github/workflows/android-build.yml
  (signs AAB only when ANDROID_KEYSTORE_BASE64 etc. secrets exist).
- Docs: PLAY_STORE_RELEASE.md (build/sign/version/Play Console/data safety).
- Verified: web build + lint green, app-debug.apk (5.8MB) + app-release.aab
  (4.1MB, unsigned by design) both generated; APK badging confirms package,
  SDK levels, permissions. Not yet tested on a physical device/emulator.

## Step 14 — Security + production hardening (VERIFIED)
- Migrations now 0001→0021 (20 schema/RLS + `0021_security_least_privilege_execute`).
  Clean replay harness: 293 passed / 0 failed / 0 tool errors.

- `0021` revokes PUBLIC+anon EXECUTE from no-arg/trigger SECURITY DEFINER
  helpers (`handle_new_user`, `carelink_track_appointment_status`,
  `carelink_apply_donation_cooldown`) — triggers don't need client EXECUTE;
 RLS predicate helpers keep anon where their quals run on public tables (read-only)。
- `0020_review_verification_rls.sql` closed a public-read policy on
  `review_verification` (exposed cross-object appointment_id); owner-only now。
  Tests in `060_reviews.sql` cover anon/other-owner/author rows。
- Responsive: `/reviews` @320px horizontal overflow fixed in
  `ReviewDiscoverySection.tsx` (add `min-w-0` to grid + grid children);
  viewport sweep 320/375/390/768/1024/1440 over 8 routes = 0 overflows。
- Console/network sweep (11 routes: `/`, `/ai`, `/hospitals`,
  `/hospitals/luma-children-hospital`, `/doctors`, `/reviews`, `/appointments`,
  `/documents`, `/login`, `/register`, `/profile`) = 0 exceptions /
  0 console errors / 0 failed network calls。- Production dep audit: `npm audit --omit=dev` = 0 vulnerabilities;
  dev-only advisories: Capacitor toolchain (`@capacitor/assets`/`cli`
  via sharp/uuid/xcode), build-time only, charged in audit。
- Env `.env.example` sanitized placeholders only; no tracked secrets/keystores/
  apk/aab; secret scan clean。

- Docs:`SECURITY.md` + `PRODUCTION_READINESS.md` (post-Step-14 audit)))
- Scripts under /tmp:) `carelink_replay.sh`, `vp-check.mjs`(viewport),
  `vp-console-sweep.mjs`(console/network), `vp-offender.mjs`(320px offender）。
- Harness DB: `carelink_test` owner openhands; psql needs `-d postgres`
  for admin ops（openhands role; postgres peer auth fails）。

## Step 15 — Production backend activation + live integrations (VERIFIED)
- Real-first wiring: typed repos + adapters gate every live call; they activate
  automatically when Supabase/AI/Cloudinary/Maps credentials exist. Zero code
  changes needed to go live — just `.env` values.

- UI real-first consumers: `hospitalService`/`doctorService` (list):
  `getHospitals()`/`getDoctors()` → repo live when configured, else static;
  `getHospitalById`, `getDoctorById`, search, and filter all resolve the same
  live list/detail first。 Hospital detail page loads live hospital→doctors via
  `fetchRealDoctorsByHospital` when configured (static cards otherwise)。

- Provider discovery adapters in `src/services/health-data/providerDiscovery.ts`:
  `fetchRealHospitals`, `fetchRealDoctors`, `fetchRealHospitalDetail`,
  `fetchRealDoctorDetail`, `fetchRealDoctorsByHospital`, `fetchRelevantDoctorsForHospital`
  (MODE A condition→hospital→doctors),and `fetchAllDoctorsAtHospital` (MODE B show-all。
- Dev seed: `supabase/migrations/0022_development_provider_seed.sql` (dev- slugs,
  idempotent `on conflict (id) do nothing`, no patient PHI。 SQL suite:
  293 PASS / 0 FAIL。


- External blockers (this environment): NO real Supabase project URL/,anon key,
  AI base URL, Cloudinary, or Maps key are present —— runtime remains truthful
  demo/mock; live DB paths exercised at repo/adapter/sql-suite level。

## Step 21 — Machilipatnam directory + review eligibility + dev test login (VERIFIED)
Real, source-backed healthcare discovery for Machilipatnam, Krishna District, AP —
connected to the EXISTING UI without redesigning it.

- **Directory data** (`src/data/hospitals.ts`, `src/data/doctors.ts`) replaced the old
  US mock set. 13 facilities (government + private + PHC) and 5 attributable
  doctors. EVERY record carries `provenance` (`src/types/models.ts` → `DataProvenance`/
  `DataStatus`): `VERIFIED` (krishna.ap.gov.in / official site), `PROVIDER_LISTED`,
  `SOURCE_LISTED`, `THIRD_PARTY_DIRECTORY`. NO fabricated ratings/review counts
  (0 until real reviews), no fabricated experience, no invented coordinates, no
  fabricated portraits (omitted → existing fallback avatar), nothing marked verified.
- **DB seed**: `supabase/migrations/0031_step21_machilipatnam_directory.sql` inserts the
  same facilities/doctors into the existing registry tables (hospitals / hospital_* /
  doctors / doctor_* / qualifications / *_verification), reusing `doctor_hospitals`
  for real many-to-many links. Adds a `source_url` column + extends the `data_status`
  CHECK. Ids `7f…` / slugs `mph-…`. Doctors stay `pending` (never auto-verified).
- **Review eligibility**: `0032_step21_review_eligibility.sql` adds a BEFORE
  INSERT/UPDATE trigger requiring a genuine COMPLETED appointment owned by the
  author (+ provider consistency when the appointment records an id). Unconditional,
  no bypass flag — hiding the button is now backed by a DB rule.
- **Dev test login** (`src/services/auth/devTestAuth.ts`): `abcd` / `1234` →
  synthetic `source:'dev-test'` identity with EMPTY roles. Double-gated: only when
  `import.meta.env.DEV === true` AND `VITE_ENABLE_DEV_TEST_AUTH=true` (build-time, not
  a browser flag). `loadUserAuthorization` short-circuits dev-test users to empty
  roles, so localStorage role spoofs are still denied (verified in browser).
  Production `vite preview` ignores the flag entirely (verified).
- **UI integration (no redesign — reused EXISTING components)**: list pages already
  consume `getHospitals`/`getDoctors`; added directory→detail adapters
  (`buildHospitalDetailFromDirectory`, `buildDoctorProfileFromDirectory`) so the
  existing hospital/doctor detail pages render any directory id, with static
  linked-doctor fallback (only doctors EXPLICITLY linked, never name/city matching).
  Made previously-fabricated UI strings honest: `HospitalCard` doctor count,
  `DoctorCard` credentials, `HospitalHero` verified/experience/distance,
  `HospitalLocation` distance, `DoctorHero`/`DoctorProfessionalProfile`/`HospitalConnection`
  verified badges, `DoctorMatchSummary` "Premium match" → "Directory listing".
  Home page Emergency/Hospitals/Doctors/Testimonials + stats now derive from the real
  directory (invented "Aurora/Luma/Beacon" hospitals removed; reviews relabelled
  SAMPLE). `hospitalsData` swap also feeds the blood-bank section.
- **Tests**: `scripts/verify-directory.mjs` (12 directory-integrity checks, wired to
  `npm run verify:directory`); wiring audit extended to 48 checks; NEW SQL suite
  `supabase/tests/240_step21_directory_eligibility.sql`. SQL suite now **540 PASS / 0 FAIL**
  from clean replay. Existing suites (060/200/210/220) updated so review fixtures carry
  legitimate completed appointments.
- **Browser (dev-test login, work host)**: `/hospitals` (13 sourced facilities, honest
  "Distance unavailable"/"Unlisted"), `/hospitals/mph-save-hospital` (2 correctly linked
  doctors), `/doctors` (5 listed), `/doctors/doc-venkat-basu` (honest "Unverified listing"),
  home page sourced, `/admin` denied as dev-test user (even after a role-spoof), booking
  flow on preview doctors intact. Build green, lint green, wiring 48/48, directory 12/12.
- **BLOCKED (live credentials)**: no real Supabase URL/anon key, Cloudinary, Maps, or AI
  base URL exist here, so live directory/AI paths are exercised at repo/adapter/SQL-suite
  level; runtime stays honest demo. Google Places images are NOT copied — no image filed
  because no licensed source was available (UI falls back).
- Gotchas: Vite dev server module cache can serve a stale module after edits — restart
  `npm run dev` before trusting browser output. `vite.config.ts` `allowedHosts` must list
  this workspace's work host. The home-page review samples are intentionally labelled
  "Sample".

## Post-Step-1.5 sanity repair (committed 11d58ca)
- Committed syntax corruption existed in `storageService.ts` (`uploadDocumentToStorage`),
  `src/services/media/imageOptimizer.ts`,和 `src/services/media/magicBytes.ts` — misplaced
  parens/braces/scoping made `npm run build` fail (exit 2)and `npm run lint` fail.
- Fixed: rewrote `uploadDocumentToStorage` cleanly — balanced braces, function-scoped
  `width/height/optimized/optimizedByteSize`, type-safe `providerMetadata`
  (`Record<string,string>`: use `''` not `undefined`), explicit catch bodies + terminal
  return; repaired parens in optimizer/magicBytes. Pipeline semantics preserved
  (magic-byte validation → raster optimization → Cloudinary → Supabase signed →
  tagged local mock. Verified: build green (710 modules), lint green (15 pre-existing
  warnings, none in repaired files), rolldown smoke: HTML payload rejected,, docFolder
  owner-scoped, storage mode honest ("Local (demo)" when unconfigured..

## Step 15.1 — Real persistence wiring (VERIFIED)
- **Auth security activity** (`authorization.ts` → `carelink_record_login_activity`):
  the ONLY valid logout event is `logout` (the old `logout_success` is rejected by the
  DB CHECK). `recordLoginActivity(enrichedUser)` auto-derives `super_admin_login` /
  `admin_login` from server-side roles. `AdminRoute` fires `admin_access_denied`.
- **Appointment bridge**: `AppointmentContext.addAppointment` stores the created DB row
  id into the UI record (`dbId`); reschedule/cancel prefer `dbId` over the static
  `appointmentId`; `refreshFromBackend()` merges real `appointments` rows on mount and
  never drops local-only rows. `AppointmentRecord.familyProfileId` exists for family links.
- **Booking modal patients** come from AgentContext `patientProfiles` (self + real family
  profiles when configured) — the selected profile id is persisted as `family_profile_id`.
- **Conversations persist** when Supabase is configured: `persistMessageDb` creates the
  conversation row (lazily) + adds messages; `deleteConversation` removes the DB row;
  real conversations restore on login. All RLS-scoped to `owner_id`.
- **Reviews**: `src/components/reviews/ReviewComposer.tsx` writes via `createReview`/
  `listMyReviews` (RLS + duplicate check) on doctor/hospital detail pages and is honestly
  disabled without a backend. Admin moderation stays server-side (`carelink_moderate_review`).
- **Registration email-confirm queue**: `src/services/auth/pendingProfileSave.ts`
  (sessionStorage) stores entered profile/family fields when the session needs email
  confirmation; AuthContext drains it on restore — no submitted field is silently dropped.
- **Tests**: SQL suite now 375 assertions (added `supabase/tests/190_auth_activity_appointment_conversation.sql` —
  auth events, appointment dbId/IDOR, conversation isolation, family ownership). Static
  wiring audit: `node scripts/verify-wiring.mjs` (19 checks). Browser/console sweep on the
  work host: 14 routes clean, no horizontal overflow at 320→1440.
- Gotchas: appointments table keeps `doctor_id`/`hospital_id` as TEXT (static demo ids like
  `doc-001` work); `vite.config.ts` `allowedHosts` includes this workspace's work host —
  keep entries when restarting the dev server for browser verification.

## Step 16 — Operational completion + data quality (VERIFIED)
- **Migration 0027** (`supabase/migrations/0027_step16_operations_and_quality.sql`):
  - Appointment lifecycle notifications: AFTER INSERT/UPDATE trigger on `appointments`
    emits recipient-scoped `appointment_booked`/`cancelled`/`rescheduled` notifications
    (safe templates, small payload). `notification_templates`/`notifications` kind CHECK
    re-allows `appointment` (0026 had narrowed it).
  - `carelink_admin_set_provider_status(kind,uuid,status,note)` — verify/reject require
    `providers.verify` (super-admin-only); activate/deactivate require `providers.manage`.
    Writes `*_verification` + `data_status`, records audit + security activity event.
  - `carelink_admin_set_appointment_status(uuid,status,reason)` — `appointments.manage`
    gate; complete/cancel with audit + recipient notification.
  - `carelink_admin_data_quality()` — `data_quality.view` gate; flags duplicate/
    missing-coordinate/unverified/orphaned rows; NEVER deletes.
  - Security-activity event vocabulary extended (provider_verified/rejected/activated/
    deactivated, appointment_updated_by_admin) in BOTH the CHECK and the guarded
    `carelink_record_login_activity` whitelist.
  - New permissions: `appointments.manage`, `providers.manage`, `data_quality.view`
    (super_admin all; admin gets appointments.manage + data_quality.view).
- **Admin console**: `AdminLayout` now gates modules by permission (display only; backend
  denies too). Super-admin-only modules: Roles & Permissions (`/admin/roles`,
  `AdminRolesPage.tsx` — role matrix + server-gated grant/revoke, last-super-admin
  protected) and Data Quality (`/admin/data-quality`, `AdminDataQualityPage.tsx`).
  `AdminProvidersPage` uses the audited RPC (no more un-audited gateway path);
  `AdminAppointmentsPage` offers Complete/Cancel via the audited RPC.
- **Reviews**: `ReviewComposer` supports edit/delete-own (updateMyReview/deleteMyReview,
  author-only RLS). "Manage your review" state.
- **Notifications**: `NotificationBell` in header (recipient-scoped unread count + mark
  read; renders nothing without a backend).
- **Profile**: account-status banner + write buttons disabled when suspended/disabled.
- **Home**: `useHomeStats` real-first counts (hospitals/doctors from registry when
  Supabase configured; demo figures flagged otherwise). `LocationBanner` on Hospitals
  page (honest coords/permission state + manual entry). `useHospitals` recomputes
  distance from live location when coords exist (never fabricated).
- **Tests**: SQL suite now 409 assertions (`supabase/tests/200_step16_operations.sql` —
  appointment notifications + IDOR, provider verify/reject/activate/deactivate +
  audit/activity, admin appointment ops, data quality flags, event vocabulary).
  Static wiring audit now 31 checks (`node scripts/verify-wiring.mjs`).
- **Verification**: build green, lint green (pre-existing warnings only), SQL
  409 PASS / 0 FAIL from clean replay, console sweep 16 routes 0 errors, viewport
  sweep 105 checks 0 overflow (320→1440). Registration→profile→family persistence
  verified in mock mode on the work host.
- Gotchas: admin RPC tests assert persisted state as the harness owner (bypasses RLS —
  client roles never see those rows); `reviews` FK cascades on provider delete so the
  orphaned-review fixture drops the FK in the disposable test DB only.

## Step 19 — Owner auth hierarchy completion + real owner login (VERIFIED)

### Critical defects found & fixed (Step 18 was merged but NOT deployable)
- **Two migrations numbered `0028_`** both defined `carelink_admin_global_search`
  and `carelink_admin_stats` with INCOMPATIBLE shapes → the whole replay chain
  aborted at `0028_step17_carelink_command_center.sql` (`cannot change return
  type of existing function`). Fix: `0028_step17` now names its richer search
  `carelink_admin_search_results(text,int,int)` (6-col shape) and its
  `carelink_admin_stats` is merged into ONE superset definition (union of both
  metric sets). `0028_ai_tools_search_reviews_infinite.sql` keeps the canonical
  `carelink_admin_global_search`. `220_step17_command_center.sql` updated.
- **`0029_step18_owner_auth_hierarchy.sql` had a syntax error** — two stray lines
  (a lone `.` and a lone fullwidth period) inside `carelink_owner_bootstrap` →
  the migration could never apply. Removed.
- **AI response guardrail regex gap** — the secret pattern required
  `(key|secret|…)` after `service[- ]?role`, so `service_role` leaked undetected.
  Now matches `service[-_ ]?role|api[-_ ]?key|…`.

### REAL privilege-escalation vulnerability (closed by migration `0030`)
`carelink_admin_has_permission(p)` read
`(not is_suspended() and has_permission(p)) or is_super_admin()` — precedence
made it `(not suspended and has_permission) OR is_super_admin`, and
`carelink_is_super_admin()` only checked role membership. A **SUSPENDED
super_admin passed every admin gate**, and RLS policies on supervisor tables
(ai_agents, appointment_types, patient_context_snapshots, …) used the
status-blind predicate too.
Fix (`supabase/migrations/0030_step19_owner_auth_hardening.sql`):
- `carelink_is_super_admin()` / `carelink_is_admin()` now require an ACTIVE
  account (suspended/disabled ⇒ false) — every RLS policy inherits it.
- `carelink_has_permission()` gated on not-suspended.
- `carelink_admin_has_permission()` de-parenthesized to
  `not suspended and carelink_has_permission(p)`.
- `carelink_has_permission_or_higher()` floor fixed: `super_admin` floor is
  satisfied ONLY by super_admin (admin no longer passes).
- Drops no grants (CREATE OR REPLACE preserves them; revoking from `anon` would
  break the anon-evaluated RLS predicates).

### Frontend role hierarchy (centralized — no scattered exact-role checks)
`src/services/auth/authorization.ts` exports `ROLE_RANK` +
`hasRoleOrHigher(user, requiredRole)`; `hasAdminRole`/`isSuperAdmin`/
`hasPermission` delegate to it and fail for suspended/disabled accounts (mirrors
the DB). Roles come ONLY from server-resolved `user.roles`
(`carelink_current_user_roles`) — localStorage/URL/user_metadata are never
authorization inputs.

### Lane-aware login + audit
- `AuthContext.signIn(email, password, lane?)` forwards the lane;
  `recordLoginActivity(user, lane, meta)` records `admin_login_success` /
  `super_admin_login_success` / `admin_login_denied` / `super_admin_login_denied`
  / `suspended_login_denied` — the LANE, not the role, decides the event. `0030`
  extends the DB vocabulary with the `*_login_denied` events.
- `LoginPage` gates the destination on the lane and refuses suspended accounts.
- Owner bootstrap: `admin-gateway` Edge Function `bootstrap` now calls the
  self-only `carelink_owner_bootstrap(self_email)` instead of
  `carelink_grant_role` (which required an existing super_admin — the
  first-owner chicken-and-egg).

### AI family-profile integration (real, RLS-scoped)
- `familyRepository.resolveAuthorizedFamilyProfile(id)` calls the guarded RPC
  `carelink_resolve_family_profile` (ownership firewall; NULL for non-owned ids).
- `aiTools.getAuthorizedMedicalContext` resolves a `familyProfileId` through that
  RPC — a spoofed family id never surfaces another user's data.
- `useAgentConversation` reads patient/family profiles from `AgentContext`
  (`useOptionalAgent`) instead of the hardcoded mock list, so the AI family
  resolver and the profile switcher share ONE real source.
- `searchPharmacies` / `searchLabs` tools now return real registry rows.

### Tests / verification
- New suite `supabase/tests/230_step19_owner_auth_hierarchy.sql`: hierarchy
  floors, suspended escalation closure, owner bootstrap (first/idempotent/
  second/spoofed/ordinary/anon/suspended), lane-audit vocabulary, AI guardrail.
- Repaired latent test bugs surfaced now that the chain applies cleanly:
  `210_ai_security_matrix.sql` used `from (update …) changed` (invalid SQL) and
  ran the review/appointment tamper + owner-visibility checks under the wrong
  role; `220_step17_command_center.sql` had a stray `)` (syntax), a malformed
  donor-privacy predicate, a 30-vs-31 metric count, search calls needing the new
  name, a `donor_profiles` owner-unique collision (E→D), and composite-row
  `is not null` in the family-resolver check.
- `scripts/verify-wiring.mjs` extended to 40 checks.
- Results: build green (746 modules), lint green (18 pre-existing warnings, none
  in Step 19 files), SQL **517 PASS / 0 FAIL** from clean replay, wiring 40/40.
- Browser (mock mode, work host): patient register → `/profile`; direct `/admin`
  URL as patient → "Administrative access denied"; **localStorage
  `roles:["super_admin","admin"]` spoof → still denied** (roles re-resolved);
  Super Admin lane as patient → "not authorized for Super Admin access … the
  attempt has been recorded"; `/ai`, `/documents`, `/reviews`, `/appointments`
  render cleanly.

### BLOCKED (live Supabase required — cannot be faked)
No Supabase URL/anon key, AI base URL, or Cloudinary creds exist in this
environment, and the real owner account `ramakanthjeebu05@gmail.com` lives in
the owner's Supabase project. The REAL owner Admin/Super-Admin-login E2E
(TEST A–B) is **BLOCKED — LIVE SUPABASE ENVIRONMENT REQUIRED**; verified instead
in mock mode at the UI + authorization layer and at the DB layer via the SQL
suite. Owner-side steps to go live:
1. Apply migrations through `0030` (`supabase db push` or SQL editor, in order).
2. Set `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` (anon only) and
   `SUPER_ADMIN_BOOTSTRAP_SECRET` on the `admin-gateway` function. NEVER put
   `service_role` in `VITE_*`.
3. Ensure the owner auth user exists (Supabase Auth UI / invite for
   `ramakanthjeebu05@gmail.com` with the owner's real password — do NOT create a
   duplicate). If it already exists, keep its UUID.
4. Run the bootstrap once: sign in as the owner, then
   `curl -X POST "$ADMIN_GATEWAY_URL" -H "Authorization: Bearer <owner JWT>" -H "x-bootstrap-secret: $SUPER_ADMIN_BOOTSTRAP_SECRET" -d '{"action":"bootstrap","email":"ramakanthjeebu05@gmail.com"}'`
   → self-only, first-only, audited (`owner_bootstrap`). Then sign out/in so the
   session picks up the fresh role row.
5. Admin Login and Super Admin Login both work for the same account/password;
   both land on `/admin` (admin floor; super_admin inherits).

