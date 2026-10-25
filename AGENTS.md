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
    (8/60s), authenticated Supabase function invocation, 25s timeout,
    cancellation, no automatic retries (to avoid duplicate billing).
    `sendToAIGateway()` returns validated/unavailable — never throws.
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
- Server adapter: `supabase/functions/ai-gateway/index.ts` (Deno Edge
  Function). The ONLY holder of `XAI_API_KEY` and `XAI_MODEL` (server secrets,
  never VITE_*). Requires a Supabase JWT, per-user rate limit, bounded request
  validation, server-controlled healthcare instructions, schema-validated
  xAI Chat Completions output, and server-attached provenance. The browser
  invokes it with `supabase.functions.invoke('ai-gateway')`, which forwards
  the authenticated session.
- Orchestrator merges AI output: explanation/follow-ups/warnings/safetyLevel/
  provenance; emergency short-circuit BEFORE AI call; severity never
  decreases (escalateUrgency). Medicine: never silently substitutes —
  unknown medicine -> `uncertainMedicineWarning` + verify-with-pharmacist;
  LLM strength/dosage shown only when confidence >= 0.85, else flagged
  uncertain.
- UI: AIChatPage result header shows "Live AI" vs "CareLink demo response"
  provenance badge (title attr = provider + timestamp); hospital cards show
  "View Relevant Doctors" when a focus topic exists.
- Env for real mode: browser-safe `VITE_SUPABASE_URL` +
  `VITE_SUPABASE_ANON_KEY`, plus server-only `XAI_API_KEY` and an explicitly
  selected `XAI_MODEL` in the Supabase Edge Function environment. Without
  configured Supabase browser credentials the app remains in clearly labelled
  demo mode; a configured backend that is unavailable is not replaced with a
  fake live answer.
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
## Step 22 — Application-wide interaction & navigation audit (VERIFIED)

Requirement: every visible interactive element must perform its intended
function or navigate to the correct related destination — across the WHOLE app,
not just the homepage/chatbot.

### Root causes fixed (all real, all browser-verified)
- **Dead card buttons**: `DoctorCard` "View profile"/"Book visit" and
  `HospitalCard` "View details"/"Book appointment" were styled `<button>`s with
  NO handler (rendered live, did nothing). Now router `Link`s →
  `/doctors/:id`, `/hospitals/:slug`, `/appointments?hosp=<id>`.
- **Dead hero buttons**: Doctors/Hospitals `Hero` "Find a doctor / Explore
  specialists / Find a hospital / Explore network" had no handler. Now focus the
  page search input (id `doctor-search-input` / `hospital-search-input`).
- **Mock-alert actions** (never navigated): Lab/Pharmacy card "View lab" /
  "View pharmacy" and the Lab/Pharmacy/Doctor/Route/Emergency "Get Directions"
  actions now open a real maps deep-link (`directionsUrl`) or route to
  `/labs` / `/pharmacies`. The doctor-profile HospitalConnection directions
  alert is also gone.
- **Unavailable features now honest**: FollowUp "set reminder" (no calendar
  integration) shows an explicit inline "not connected" status instead of a
  `window.alert('Reminder set (mock)')`; voice input buttons are visibly
  `disabled` (they previously fired "coming soon" alerts).
- **Dropped chatbot context**: hospital/doctor/lab "Book" links carried
  `?hosp=/?doc=/?lab=` that the appointments page IGNORED. `AppointmentsPage`
  now redirects a provider deep-link to the owning page (doctor profile /
  hospital detail / labs) so the selection is never lost.
- **SPA navigation**: internal `to`/href targets in `ResponseCardShell`
  `CardActionButton`, `AIChatPage` result actions + cards, `HealthCommandCenter`
  and the Home hero quick-access now use react-router `Link` (preserve history,
  no full reload). External (`http`/`tel`/`mailto`) stay `<a>` with
  `rel="noopener noreferrer"`.
- **Search param preservation**: `/doctors?q=` and `/hospitals?q=` now pre-fill
  and filter the list (agent "Find a <specialty>" / "Show hospitals treating X").
- **Slug resolution**: `getHospitalById` accepts the record id OR its public
  slug, so directory deep-links (`/hospitals/district-hospital-machilipatnam`)
  resolve instead of showing "not found".
- **320px overflow**: Home "Hospitals near you" cards overflowed by 10px
  (long facility names). Fixed with `min-w-0`/`break-words` + `shrink-0` icons.

### Safety/architecture notes
- Chatbot `AgentAction.href` values are authored ONLY by the deterministic
  orchestrator builders — the AI owns language (summary/explanation), never the
  action list — so an unvalidated model path can never reach `navigate()`.
- Route/action mapping stays centralized in `src/routes/routeConstants.ts`;
  no second router, no hardcoded ad-hoc paths.

### Automated tests added
- `scripts/verify-navigation.mjs` (`npm run verify:navigation`, 7 checks):
  every `ROUTES.<key>` reference resolves; literal nav targets are registered;
  no enabled `<button>` without a handler; no `window.alert` mocks remain;
  chatbot hrefs are internal routes or validated schemes; provider deep-links
  are handled; `CardActionButton` supports `to`/`onClick`.
- `scripts/verify-e2e.mjs` (`npm run verify:e2e`, 13 checks, headless Chromium
  over CDP, zero extra deps): Home→Hospitals/Doctors, Home agent→/ai, doctor
  card→profile, chatbot View Hospital→/hospitals/:slug, chatbot Book deep-link,
  header/footer links, browser Back, anonymous `/profile` guard, unknown-route
  fallback.
- `scripts/verify-sweep.mjs` (`npm run verify:sweep`): console/exception sweep
  over 15 routes + horizontal-overflow sweep at 320/375/768/1024/1440.

### Results (this environment)
- `npm run build`: green (746 modules). `npm run lint`: 0 errors (pre-existing
  warnings only). `verify:navigation` 7/7, `verify:wiring` all PASS,
  `verify:directory` 12/12, browser E2E 13/13, sweep: 0 console errors /
  0 horizontal overflows.
- `npm audit --omit=dev`: 1 advisory (`source-map-js` GHSA-68fv-2mgg-jv7q) —
  transitive build-tool dependency of Vite/PostCSS/Tailwind, not shipped to the
  client bundle and not runtime-reachable by app input; not force-bumped to
  avoid breaking the build toolchain.

### Gotchas
- `vite.config.ts` `server.allowedHosts` must list this workspace's work host
  (`work-1-ejsanxkqderhqwow…`) or the dev server returns "Blocked request".
- The mock `hospitalRecommendations`/`doctorRecommendations` dataset
  (`src/features/health-agent/data/mockData.ts`) still names the legacy demo
  hospitals (Aurora/Beacon/Luma/Northside) which are NOT in the sourced
  Machilipatnam directory; their agent card links resolve to the legacy
  hand-authored detail pages in `hospitalDetailsData.ts`. Reconciling the agent
  mock dataset with the sourced directory is a data task, out of scope for this
  interaction audit.
  **UPDATE (Step 22):** the Health Agent AND the legacy `/agent` command center
  now read the REAL directory via `directoryRecommendations.ts` /
  `services/agent/directoryBridge.ts`; the fabricated set is retained only as a
  last-resort fallback in `mockAdapters.ts` and is no longer the primary path.

## Step 22 — Connected healthcare workflow + honest appointment requests (VERIFIED)

Requirement: connect Homepage → Hospital Search → Hospital Details → Hospital's
Doctors → Doctor Profile → Appointment Booking → Persisted Appointment → My
Appointments, with the chatbot reading the SAME verified hospital/doctor data.

### Chatbot ↔ directory integration (Phase 9.4/9.5)
- NEW `src/features/health-agent/services/directoryRecommendations.ts` — adapts
  the real `Hospital`/`Doctor` models into the agent's recommendation cards,
  carrying real stable ids (slug/id) so `/hospitals/:id` + `/doctors/:id`
  resolve. Honest-data flags: `distanceAvailable` (real distance only when
  coords exist), `availabilityLabel` ("Availability unlisted"), `hospitalIds`
  (explicit affiliation). Ratings/review counts copied verbatim (0 stays 0).
- `agentOrchestrator.ts` hospital/doctor/symptom/disease/child/elder/mental/
  route/location builders now use `directoryHospitals()`/`directoryDoctors()`
  instead of the private mock set. `mockAdapters.ts` search + emergency adapters
  read the directory too.
- NEW `src/features/health-agent/data/specialtyTaxonomy.ts` — canonical
  specialties + synonyms (Orthopaedics≡Orthopedics, Paediatrics≡Pediatrics,
  lay terms like "heart"/"children's doctor"); clinically different specialties
  are never equated.
- UI cards (`AIChatPage`, `HealthCommandCenter`, legacy `HospitalResponseCard`,
  `DoctorResponseCard`) render "—"/"No verified ratings yet"/"Distance
  unavailable"/"Availability unlisted" instead of fabricated values.

### Legacy `/agent` command center
- NEW `src/services/agent/directoryBridge.ts` — single-flight cached bridge;
  `AgentContext` primes it before every message/quick action. The legacy
  `mockAgentService` builders read it (empty state when unloaded — never the
  fabricated US demo hospitals).

### Honest appointment REQUEST workflow (Phase 6/7/8)
- NEW `supabase/migrations/0033_step22_appointment_request_workflow.sql`:
  - `appointment_requests` table (status `pending|confirmed|rejected|cancelled|
    completed`, `unique(owner_id, request_key)` for idempotency, owner-scoped
    RLS + provider/staff scoped READ policy).
  - `carelink_request_appointment(...)` — the ONLY client write path; validates
    auth/suspension/doctor/hospital/affiliation/slot/future-date/reason-length
    server-side, idempotent on `request_key`, ALWAYS inserts `pending` (never
    auto-confirms). SECURITY DEFINER, pinned search_path.
  - `carelink_decide_appointment_request(...)` — permission-gated
    (`appointments.manage`) confirm/reject; confirmation creates the real
    `appointments` row and links it; catches `unique_violation` →
    "slot just taken" (no overbooking); idempotent.
  - `carelink_list_my_appointment_requests()` / `carelink_cancel_appointment_request()`.
  - EXECUTE revoked from anon/public; new notification templates.
- NEW `src/services/health-data/appointmentRequestsRepository.ts` — typed client
  over the RPCs; never inserts into `appointments` directly.
- `DoctorBookingModal` now has two honest modes: real published slots (if any) →
  confirm; otherwise a date/time REQUEST with explicit "not a confirmed
  appointment yet" copy + duplicate-submit guard.
- `DoctorProfilePage.handleBookingConfirm` submits the request when Supabase is
  configured (else honest local demo), marks `isRequest`, and never writes a
  pending request into `appointments` (`AppointmentContext.addAppointment` skips
  `isRequest` rows). No fabricated contact details.
- `AppointmentsPage`: new "Pending requests" tab + demo-mode disclosure banner.
  `AppointmentStatus` gained `pending` across UI + DB types.

### Tests / verification (all green)
- SQL: NEW `supabase/tests/250_step22_appointment_request.sql` (33 assertions:
  pending creation, idempotency, past-date/unknown-doctor/non-affiliation/
  over-long-reason validation, IDOR, authorized confirm/reject + idempotency,
  owner cancel, provider-scoped read, suspension, anon denial, no-overbooking).
  Clean replay: **573 PASS / 0 FAIL**.
- NEW `npm run verify:workflow` (`scripts/verify-workflow.mjs`, 37 checks).
- `npm run build` green; `npm run lint` 0 errors; `verify:wiring`/`directory`/
  `navigation` all PASS; browser E2E 13/13; sweep 15 routes × 5 widths = 0
  console errors / 0 horizontal overflows.

### BLOCKED (live credentials)
No Supabase URL/anon key, AI base URL, Cloudinary, Maps, or scheduling
integration exist here, so a REAL persisted request/confirmation is exercised at
the SQL-suite + repository + adapter level; runtime stays honest demo (the
request path degrades to clearly-labelled local demo data). Live real slots are
only used when a provider publishes them AND Supabase is configured.

## Step 22b — LIVE Supabase wiring (credentials provided, schema deploy PENDING)

The owner supplied the live project + browser-safe anon key:
- `VITE_SUPABASE_URL=https://drpbukyjdkzhczabisxx.supabase.co` (in git-ignored `.env`)
- `VITE_SUPABASE_ANON_KEY=eyJ…` (anon only; NEVER service_role in VITE_*)

### Verified working against the LIVE project
- Supabase client initialises; `isSupabaseConfigured()` is true.
- Supabase Auth reachable: signup returns a real user (email confirmation ON,
  `mailer_autoconfirm=false`).
- App boots + degrades gracefully with the partial live schema: `verify:sweep`
  15 routes × 5 widths = 0 console errors / 0 overflow; `verify:e2e` 13/13;
  `/hospitals` falls back to the sourced static directory (13 records).
- Build with live env bakes the project URL into the bundle.

### BLOCKER — live DB schema is PARTIAL / DIVERGENT (needs DDL access)
Only the anon key was provided; the anon role cannot run DDL, so migrations
cannot be applied from here. `npm run verify:live-schema` reports:
- PRESENT: profiles, family_profiles, appointments, appointment_events,
  conversations, conversation_messages, medical_documents, medical_reports,
  medicines, health_context, saved_*, roles, user_roles, audit_events,
  thread_summaries, messages.
- MISSING (provider registry + everything after ~migration 0001): hospitals,
  doctors, pharmacies, labs, specialties + all *_specialties/_services/_hours/
  _locations/_verification/_profiles, qualifications, consultation_fees,
  doctor_availability, provider_*, appointment_slots, appointment_types,
  appointment_requests, reminders, cancellation_records, reschedule_events,
  appointment_status_history, reviews, review_verification, notifications,
  notification_templates, permissions, role_permissions,
  security_activity_events — and EVERY `carelink_*` RPC.
- Live DB also has tables NOT in this repo (`thread_summaries`, `messages`) →
  it was created from a different prototype schema, not from these migrations.

### Deploy step (owner action — one shot)
```
bash scripts/build-migration-bundle.sh        # -> supabase/DEPLOY_ALL.sql (34 migrations)
# Supabase dashboard -> SQL Editor -> paste supabase/DEPLOY_ALL.sql -> Run
#   OR: psql "$SUPABASE_DB_URL" -f supabase/DEPLOY_ALL.sql
```
Then `npm run verify:live-schema` must print `RESULT: COMPLETE`. The chain is
idempotent (`create table if not exists`, `create or replace`,
`on conflict do nothing`) so it is safe against the existing partial schema.

### New tooling
- `npm run db:bundle` → `scripts/build-migration-bundle.sh` (ordered bundle).
- `npm run verify:live-schema` → `scripts/verify-live-schema.mjs` (anon-only
  readiness probe; exits non-zero when incomplete).

## Step 23 — Auth flow completion + startup config diagnostics (VERIFIED)

### Password recovery was incomplete (found + fixed)
`requestPasswordReset` sent the email but the provider had **no `redirectTo`**
and the app had **no page to consume the recovery link** — so the reset could
never actually be completed. Also no change-password existed for a signed-in user.

- `src/services/auth/authService.ts`:
  - `requestPasswordReset` now passes `redirectTo: ${origin}/reset-password`.
  - NEW `PASSWORD_RECOVERY_PATH` + `isRecoveryRedirect()` (detects
    `type=recovery` in the hash/query; the client's `detectSessionInUrl` turns
    the token into a short-lived session authorizing exactly one change).
  - NEW `updatePassword(newPassword)` → real `client.auth.updateUser({ password })`.
    Mock mode applies it to the browser-only demo store (clearly labelled).
- NEW `src/pages/Auth/ResetPasswordPage.tsx` (route `/reset-password`,
  `ROUTES.resetPassword`, rendered in `AppRoutes`). Honest states: success,
  validation errors, and a **no-recovery-link** state that shows guidance
  instead of faking a password change.
- `AuthContext.updatePassword` added; `ProfilePage` gained a **Security** card
  (change password, confirm field, duplicate-submit guard, disabled while
  suspended).
- Owner action: add the deployment origin to Supabase Auth **Redirect URLs**
  (Authentication → URL Configuration), else the recovery email cannot return
  to `/reset-password`. Documented in `.env.example`.

### Startup configuration diagnostics (NEW)
`src/config/diagnostics.ts` + `main.tsx` validate the browser-safe env once at
boot and log NON-SENSITIVE notices (variable NAMES only, never values):
partial Supabase config (URL xor anon key), leftover `YOUR_…` placeholders,
partial Cloudinary config, and a **service_role key leaked into
`VITE_SUPABASE_ANON_KEY`** (that key bypasses RLS and must never ship). Demo
mode (no credentials) stays silent — it is a supported state.

### Verification (this environment)
- SQL suite: **573 PASS / 0 FAIL** from clean replay (local Postgres 16 in
  Docker; `PGHOST=127.0.0.1 PGPORT=55432`).
- `npm run test:focused` 16/16; `verify:wiring` **54 checks** (6 new auth/config
  checks); `verify:directory` 12/12; `verify:workflow` 37/37; `verify:navigation` 7/7.
- NEW `npm run verify:auth` (`scripts/verify-auth.mjs`, headless Chromium over
  CDP) — **11/11**: register→profile, protected route, sign out, anonymous
  redirect, invalid credentials rejected, valid sign-in, session survives
  reload, profile update, password change, NEW password signs in / old fails,
  bare `/reset-password` shows honest guidance.
- Browser: `verify:e2e` 12/12, `verify:sweep` 15 routes × 5 widths = 0 console
  errors / 0 horizontal overflows.
- `npm run build` green (742 modules); `npm run lint` 0 errors (pre-existing
  warnings only).

### BLOCKED (live credentials) — unchanged from Step 22b
No Supabase anon key, DB password, service_role, Cloudinary, Maps, or xAI key
exist in this environment. The live project `drpbukyjdkzhczabisxx` is reachable
(`/auth/v1/health` → 401 "No API key found"), but with no key the live probe
(`npm run verify:live-schema`) cannot run, the live DB schema cannot be applied
(anon cannot run DDL), and the real Supabase Auth E2E cannot be exercised. All
live paths are verified at repo/adapter/SQL-suite level; runtime stays honest demo.

## Step 24 — Machilipatnam→Vijayawada corridor directory (VERIFIED)

### What was actually broken (found by inspection)
`src/data/hospitals.ts` was **an empty array** (`hospitalsData: Hospital[] = []`)
while `doctors.ts` held 5 doctors — so with no live provider configured the
Hospitals page rendered **zero facilities**, and the doctor cards pointed at
hospital ids that no bundled record resolved. Separately,
`hospitalService.getHospitals()` filtered every record through
`isMachilipatnamRecord()` (a `city+address` substring match for
"machilipatnam"), which **silently excluded Vijayawada and every intermediate
settlement** — the exact opposite of the required corridor coverage.

### Coverage boundary (configurable — `src/data/coverage.ts`)
Two-part test, never a bare city-name search:
1. **Geographic corridor** — within `CORRIDOR_BUFFER_KM` (25 km) of the sampled
   Machilipatnam(16.1875,81.1389)→Vijayawada(16.5062,80.648) path.
2. **Locality allow-list** — `CORRIDOR_LOCALITIES` (~50 towns/mandals/settlements
   on the corridor) for records with no coordinates.
3. **Pincode evidence** — `isCorridorPincode()` accepts only the anchor cities'
   own urban delivery areas (`520xxx`, `521001–521005`). A rural pincode is
   deliberately NOT assumed to be on the corridor.
District alone never grants coverage — it queues the record for manual review.
Evidence precedence: coordinates → pincode → locality → district(review) → outside.

### Ingestion pipeline (repeatable, not a hardcoded list)
- `scripts/directory/ingest.mjs` — collects the official Government of Andhra
  Pradesh district directories (Krishna + NTR) with a 1 req/s polite crawl,
  follows pagination, normalizes category labels (`E UPHC`/`E-UPHC`/`EUPHC`/`phc`
  → one vocabulary), derives locality, classifies coverage, dedupes, merges the
  curated migration-0031 facilities (matched by normalized name + pincode/city so
  "District Hospital" and "District Hospital, Machilipatnam" collapse to ONE row,
  keeping the curated stable id and its verified phone), and writes
  `src/data/hospitals.ts` + `imported-facilities.json` + `last-import-report.json`.
- `scripts/directory/emit-migration.mjs` — generates
  `supabase/migrations/0034_corridor_directory_import.sql` from that same JSON, so
  the app and the database **cannot drift apart**.
- npm: `directory:ingest`, `directory:offline`, `directory:migration`,
  `directory:refresh`.
- Deterministic ids `7f200000-0000-4000-8000-<hash>` (curated seed keeps `7f10…`),
  `on conflict (id) do nothing` → replaying never duplicates.
- A record that vanishes from a source is reported, never silently deleted.

### Achieved coverage (2026-10-22, documented in last-import-report.json)
152 source records discovered → 16 duplicates removed → **76 unique in coverage**
(51 Krishna + 25 NTR) → 71 require manual review (rural PHC villages that are not
provably on the corridor) → 0 outside. Coverage methods: 44 pincode, 33 locality.
Fields present only when a source stated them: 1 coordinate, 9 phones, 5 websites.
**No rating, opening hour, capability or doctor was invented.**

### Frontend wiring
- `hospitalService`: corridor boundary replaces the Machilipatnam-only filter;
  NEW `getBundledHospitals()` so the page is never empty offline; live records win,
  bundled records fill gaps; `getHospitalById` resolves id OR public slug against
  the bundled directory so every card has a working detail page.
- `Hospital` type gained `district`, `pincode`, `category_label`, `ownership`.
- `useHospitals` exposes `filterOptions` derived from the ACTUAL dataset;
  `FilterBar` dropdowns use them. **Removed the hardcoded generic filter lists**
  (`['Hospital','Clinic',…,'Dentist']`, invented department/specialty lists) that
  could never match a real row; locality is now a select of real localities and a
  real Government/Private `ownership` filter was added.

### Tests
- NEW `supabase/tests/260_step24_corridor_directory.sql` (13 assertions): import
  present from both districts, provenance on every row, official source stays
  VERIFIED, no fabricated rating/coordinate/capability, coverage recorded,
  **idempotent replay does not duplicate**, pincodes well-formed, no doctor
  fabricated, curated ids stable. SQL suite: **589 PASS / 0 FAIL**.
- `verify-directory` 12 → **20 checks** (corridor districts, anchor cities,
  ownership/category present, pincode shape, no fabricated coords/capabilities,
  generated-file guard, report totals, boundary configurable).
- `verify:wiring` 54 → **57 checks**.

### Verification
build green (743 modules); lint 0 errors; `verify:directory` 20/20;
`verify:wiring` 57/57; `verify:workflow` 37/37; `verify:navigation` 7/7;
`verify:e2e` 13/13; `verify:sweep` 15 routes × 5 widths = 0 console errors /
0 overflow; `test:focused` 16/16; SQL 589/0.

Browser-verified on the work host: `/hospitals` renders **76 facilities**
(real names, honest "Unlisted" categories), locality select lists real corridor
localities, ownership filter changes the count (76 → 11 Private → 21 Vijayawada),
search filters, and a card opens a detail page showing the real source.

### Gotcha fixed
Real category labels made the filter `<select>` elements size to their widest
option, overflowing the viewport by 74px at 320px. Fixed with `min-w-0`/`w-full`
on the controls and grids in `FilterField`/`FilterBar` (this is the recurring
Tailwind flex-child trap already noted in earlier steps).

### BLOCKED (unchanged)
No Supabase credentials exist here, so migration `0034` is verified only by the
local Postgres replay (which does apply it cleanly). `dme.ap.nic.in` did not
respond within the request timeout and is not used as an automatic source.

## Step 25 — Complete corridor directory: departments, doctors, blood centres, directions (VERIFIED)

### ROOT CAUSE of the "no hospitals" report
`vite.config.ts` `server.allowedHosts` did not list THIS workspace's work host, so the
dev server answered every request with **"Blocked request. This host … is not allowed"**.
The 76-facility directory was already rendering once the host was allowed — the page was
never actually empty. Fixed by adding both `work-{1,2}-kmyesnrrykexvlsg…` entries.
**Always add the current work host before trusting a browser result.**

### Directory expansion 76 → 103 facilities (evidence-based, no invention)
The 71 records stuck in "requires review" were rural PHC/E-UPHC village localities the
allow-list did not name. `scripts/directory/geocode-localities.mjs` now resolves each one
through **OpenStreetMap Nominatim** (public, no key, 1 req/s per the usage policy) and
records the REAL locality centre + its distance from the corridor path into the generated
`src/data/geocodedLocalities.ts`. `classifyCoverage()` gained a 4th evidence level
(`geocoded_locality`) and `coverage.ts` takes an injected `LocalityLookup` so it stays
free of generated-file imports. Result: 27 localities admitted, 23 geocoded OUTSIDE the
corridor (kept as exclusion evidence), review queue 71 → 20. Coverage methods now
43 pincode / 33 locality / 27 geocoded.

### Departments, doctor affiliations, blood centres
- `src/data/directoryEvidence.ts` — reviewed, source-attributed department + doctor
  evidence (GMC Machilipatnam official departments page, Murali Krishna Hospital
  doctors/services pages, SAVE services/team pages, Dr. Madhu Machilipatnam branch page).
  58 departments, 14 doctors with real qualifications + published visiting timings.
- `src/data/doctors.ts` is now GENERATED from that evidence by
  `scripts/directory/emit-doctors.mjs` (keeps the offline integrity test working).
- `src/services/providerDirectoryService.ts` — the single read boundary:
  `getDepartmentsForHospital`, `getDoctorsForHospital`, `getDoctorsForDepartment`,
  `getDepartmentDoctorCount`, `getListedDoctorCount`, `enrichHospital(s)`,
  `getAllAffiliations`. Counts derive from affiliation records — never hardcoded.
- `src/data/bloodCentres.ts` — 3 sourced IRCS centres (Machilipatnam / Vijayawada /
  Gudivada) with published phones. **NO stock column anywhere** — live stock is not
  integrated, so the UI links to e-RaktKosh instead of inventing a figure.
- `src/services/bloodCentreService.ts` + `src/pages/BloodBanks/` (`/blood-banks`, nav +
  footer link) with search, locality/ownership/facility-link filters, contact, website,
  directions and an honest "stock not integrated" banner.
- `supabase/migrations/0035_step25_departments_affiliations_blood_centres.sql` —
  GENERATED by `scripts/directory/emit-step25-migration.mjs` from the same evidence.
  Tables `hospital_departments`, `doctor_department_affiliations`, `blood_centres`
  (public-read RLS, no client writes, `revoke insert/update/delete`).
  **Doctor affiliation is its own table** — a single `doctor.hospital_id` would forbid a
  legitimate multi-hospital doctor. Blood-centre ids are deterministic UUIDs
  (`7f500000-…`); a non-UUID id fails the `uuid` column.

### Google Maps directions (Part 7)
`src/services/maps/directionsService.ts` is now the ONE helper every Directions action
uses (hospital card, hospital detail, doctor profile, department, blood centre, chatbot
cards). Evidence order: **Place ID → coordinates → name+street address → name+locality
+district**; a record with none of those returns `null` and the UI shows an honest
disabled/explained state — it never falls back to a shared default coordinate.
`directionsAvailability()` exposes the method + reason. The legacy
`hospitalDirectionsUrl` re-export was REMOVED from `hospitalPlaceMapping.ts` because a
value re-export breaks Node's `--experimental-strip-types` resolution for that module.

### Chatbot
`AgentIntent` gained `'blood'`; `mockAdapters` keyword map + classification ORDER
(`report` before `blood` before `lab`/`location`, so "blood report"→report,
"blood bank"→blood, "blood test"→lab). `buildBloodCentreResult` reads the real
blood-centre service. AIChatPage renders blood-centre cards with no stock claim.

### Mobile overflow — REAL regression found by the sweep (fixed properly)
Adding the doctor-profile route to `verify-sweep.mjs` surfaced +70px @320 / +16px @375.
Two separate traps:
1. `DoctorHero` flex children needed `min-w-0` / `shrink-0`.
2. **The actual root cause**: grid tracks that default to `auto` size to the item's
   min-content, and a `justify-between` row inside pushes past the viewport. Fix pattern:
   `grid-cols-[minmax(0,1fr)]` on the small-screen track (and `minmax(0,…)` in the xl
   track list) in `DoctorProfilePage`, `DoctorProfessionalProfile`, `DoctorMatchSummary`,
   `DoctorHero`, `DoctorExperience`. **Use this whenever a doctor/hospital section
   overflows at 320px.** Sweep now 18 routes × 5 widths = 0 overflows.

### Test tooling added
`scripts/test-resolve-hooks.mjs` + `scripts/test-register.mjs` — a Node module
`resolve`/`load` hook pair that (a) appends `.ts` / `/index.ts` to extensionless
relative imports and (b) substitutes `(globalThis.__VITE_ENV__ ?? {})` for
`import.meta.env`. Together with `globalThis.window = globalThis` this lets node:test
import the app's real TypeScript sources. `test:focused` now runs through it (43/43).

### Verification
build green (752 modules); lint 0 errors (15 pre-existing warnings);
`test:focused` 43/43; `verify:wiring` 68/68; `verify:directory` 21/21;
`verify:workflow` 37/37; `verify:navigation` 7/7; `verify:e2e` **15/15** (2 new
blood-centre chatbot checks); `verify:sweep` 18 routes × 5 widths = 0 console errors /
0 overflow; `verify:auth` 11/11; SQL **615 PASS / 0 FAIL** (28 suites incl. new
`270_step25_departments_affiliations_blood_centres.sql`, 26 assertions).

Local Postgres replay (no host psql): `sudo docker run -d --name carelink-pg -e
POSTGRES_PASSWORD=postgres -e POSTGRES_USER=openhands -p 55432:5432
-v /workspace/project/CareLink-AI:/repo:ro postgres:16`, then
`sudo docker exec -i carelink-pg bash -s < /tmp/replay.sh` (psql lives in the container,
not on the host). Verified 0035 replays idempotently and anon/authenticated are denied
INSERT/UPDATE/DELETE.

### BLOCKED (unchanged)
No Supabase URL/anon key, DB password, Cloudinary, Maps or xAI key exist here, so
migration 0035 is verified by the local replay only, and live blood stock (e-RaktKosh)
is not integrated — the UI says so instead of guessing.

## Step 26 — Screenshot-warning root causes fixed + corridor coverage corrected (VERIFIED)

Each visible warning was traced to its code path and the UNDERLYING condition fixed —
no warning text was merely softened.

### 1. "12 km straight-line radius centered on Machilipatnam" — REAL query bug
Three separate places still limited the app to one city, so Vijayawada and every
intermediate corridor settlement were silently excluded:
- `hospitalPlaceMapping.ts` used `MACHILIPATNAM_CENTER` + `SEARCH_RADIUS_METERS=12_000`
  and returned `null` for any live Places result beyond 12 km. **Removed**; mapping now
  filters with the shared `classifyCoverage()` corridor boundary.
- `googlePlacesService.ts` asked only `"…in Machilipatnam"` with a 12 km circle bias.
  **Replaced** with corridor-wide queries (Vijayawada, Gudivada, Pedana, Vuyyuru,
  Gannavaram, Tenali) and a `corridorBoundingBox()` rectangle bias. The exported
  `discoverMachilipatnamHospitals()` is renamed `discoverCorridorHospitals()`.
- `HospitalsPage.tsx` + `Hospitals/Hero.tsx` hardcoded the radius text. **Replaced**
  with `getCoverageScopeLabel()` / `coverageScopeLabel()`, generated from the real
  configured boundary, so the page can never advertise a stale scope again.
- Tests: `src/data/coverage.test.mjs` (5) + `hospitalPlaceMapping.test.mjs` assert
  Vijayawada/Gudivada are admitted and an out-of-corridor place is rejected.

### 2. "No appointment backend is configured" — the real gap was WIRING, not just a key
`listMyAppointmentRequests()` existed but was **never called anywhere**, so the
"Pending requests" tab was permanently empty even with Supabase configured.
- `AppointmentContext.refreshFromBackend` now loads owner-scoped appointment REQUESTS
  alongside confirmed appointments (`rowToRequestAppointment`), and
  `cancelAppointment` routes a pending request through the owner-scoped
  `carelink_cancel_appointment_request` RPC instead of the appointments repo.
- The warning is now an actionable setup state naming `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY` and `npm run db:bundle` (it still disappears only when the
  backend is genuinely configured).
- **Fabricated demo appointments removed.** The seed held invented bookings for
  facilities outside the corridor with invented phone numbers, emails and street
  addresses. `seedAppointments` is now `[]`, so a new user sees the honest empty state.
- "Appointment count" previously rendered the number of status TABS (7). It now shows
  the real record count.
- `verify-workflow.mjs` gained 3 checks (pending-request loading, request-cancel RPC,
  actionable setup copy) → 39 checks.

### 3. DEMO DATA / LOW CONFIDENCE / CARELINK DEMO RESPONSE — badges were misleading
`dataSourceFor()` conflated "no provider key" with "the data is fake", so the REAL
source-attributed corridor directory was badged **"Demo data"**.
- New `resultProvenance()` in `agentOrchestrator.ts` returns
  `live | sourced_directory | demo`. Hospital/doctor/blood/report/route/etc. builders
  (which read the real directory) no longer set `isDemoData`; only lab/pharmacy/medicine
  — which still use sample datasets — remain `demo`.
- `AIChatPage` + `HealthCommandCenter` render **"Sourced directory"** (sky) vs
  **"Demo data"** (amber) vs no badge for live.
- `recommendationRanking.ts` no longer contradicts the card: it stops printing
  "0.0 km away" when distance is unknown, prints "no verified ratings yet" instead of
  "rated 0.0/5", and omits open/closed when availability is unlisted.
  Covered by `recommendationRanking.test.mjs` (4).
- "Mock consultation details" heading now renders "Published consultation details" for a
  real directory doctor; empty InfoCells are omitted instead of showing blanks.

### 4. Data-quality report silently truncated whole categories — REAL latent bug
`carelink_admin_data_quality()` had a global `limit 200`. With the corridor directory
the unverified/missing-coordinate categories alone exceed 200 rows, so
`orphaned_review` flags were **silently never returned** (this reproduced on HEAD too).
Fixed by raising the cap to 2000 + documenting it as a safety valve, and a regression
test asserts the cap can never be smaller than the current report size.

### 5. Corridor coverage expanded 103 → 105 facilities (12 left in review)
`geocode-localities.mjs` only tried one query form and cached `null` forever.
- Multi-form queries (district → state → country), a settlement-type guard (a canal like
  "Kesarapalli Minor" can never be a village's location) and an Andhra-Pradesh guard.
- Previously-resolved localities are now **accumulated** instead of being dropped when
  the review queue shrinks. Geocoded in-coverage localities: 27 → 29.
- Live re-ingest: **105 in coverage**, 12 require review, 30 outside. Migration `0034`
  regenerated from the same JSON so app and DB cannot drift.
- Department evidence: SAVE Multi-Speciality gained the published
  "Obstetrics & Gynaecology" department → 59 departments.

### 6. Doctors page honesty (found during the browser audit)
- Hero claimed "Verified specialists" while every card said "Unverified listing".
  Now: "Source-attributed listings" + "a directory listing is not a credential check".
- The specialty filter was hardcoded (Cardiology/OB-GYN/…) and could never match the
  real 14 specialties. `useDoctors` now derives `filterOptions` from the dataset.
- A literal **"Pagination placeholder for doctor results."** was user-visible; the
  component now renders nothing (the directory is a single grid).
- `CardImage` no longer prints a bare "Placeholder" badge — it shows
  "No published photo" with an accessible `role="img"` label.
- `ReviewComposer` / `ProviderDiscoveryPage` no longer claim "showing demo provider
  data" / leak a developer note into user copy.

### 7. Integration readiness diagnostics (status only — never values)
- `getIntegrationReadiness()` in `src/config/diagnostics.ts` + `src/main.tsx` logs a
  per-integration status at boot (Supabase, AI gateway, Places, directions, Cloudinary,
  directory, blood centres), naming only VARIABLE names.
- NEW `npm run verify:readiness` (`scripts/verify-readiness.mjs`) prints the same report
  and, with `--check`, probes the live Supabase Auth endpoint. It never prints a value.
- `.env.example` documents the exact Google Places and xAI setup steps (billing, key
  restrictions, `supabase secrets set`), and states that Maps DIRECTIONS links need no key.

### Verification (this environment)
build green; lint 0 errors (pre-existing warnings only); `test:focused` **53/53**;
`verify:wiring` **68/68**; `verify:directory` 21/21; `verify:workflow` **39/39**;
`verify:navigation` 7/7; `verify:e2e` **15/15**; `verify:auth` **11/11**;
`verify:sweep` 18 routes × 5 widths = **0 console errors / 0 overflow**;
SQL replay **618 PASS / 0 FAIL** (local Postgres 16 in Docker).
`verify:readiness` reports every integration as CONFIGURED or an explicit
not-configured demo state.

### BLOCKED (external credentials — unchanged)
No Supabase URL/anon key, DB password, service_role, Cloudinary, Google Places, Maps or
xAI key exist in this environment. Consequently: the live schema cannot be applied (anon
cannot run DDL), the real owner Auth E2E and live AI/Places calls cannot be exercised,
and live blood stock (e-RaktKosh) is not integrated. All of those paths are verified at
repo/adapter/SQL-suite level only and runtime stays an honest, clearly-labelled demo.

## Step 27 — Global nav overlay + doctors hero + assistant prompts + real pharmacy directory (VERIFIED)

### Global navigation (hamburger overlay)
- NEW `src/components/layout/navigationData.ts` — the single source of truth for
  destinations: `primaryNavItems` (wide-screen rail) + `navGroups` (drawer),
  plus `visibleNavGroups()` (auth/admin filtering) and `isNavItemActive()`.
- NEW `src/components/layout/NavDrawer.tsx` — a real `role="dialog"
  aria-modal="true"` panel (NOT an ARIA `menu`; these are ordinary links). It
  renders at `z-[60]` (above the `z-50` sticky header), dims/blocks the page with
  a backdrop, locks `document.body.style.overflow` while open and restores the
  previous value on close, closes on close-button / backdrop / Escape / link
  selection, moves focus into the panel and returns it to the trigger, and traps
  Tab focus. Panel content scrolls (`agent-scroll`) when taller than the viewport.
- `GlobalLayout.tsx` header rewritten: brand + 8-item rail (xl+) + "Ask CareLink
  AI" (sm+) + account controls (xl only) + hamburger (always). Account controls
  collapse below xl so the bar cannot overlap at 768–1279 px.

### Doctors hero
- `src/pages/Doctors/components/Hero.tsx` — the right-side placeholder search card
  is GONE; the hero is a single centered column. Both CTAs call
  `focusDoctorSearch()` → scrolls to + focuses `#doctor-search-input` in the real
  `FilterBar` (the only search that actually filters). No empty column, no
  duplicate search state.

### Assistant quick-prompt menu
- NEW `QuickPromptMenu` in `AIChatPage.tsx` — the three-dot button near the
  composer (`aria-label="Open quick prompts"`), a `role="menu"` with 14
  `role="menuitem"` prompts, closing on outside click / Escape / selection.
- **BUG FOUND + FIXED:** the menu was gated on the composer's `disabled` (true
  whenever the draft was empty), so prompts could never run. It is now gated on a
  separate `busy` prop (`conv.isThinking`). Prompt selection calls the SAME
  `handlePickPrompt` → `conv.sendMessage(...)` pipeline as Send/Enter — the prompt
  is executed, never merely inserted into the composer.

### Real pharmacy + laboratory directory (corridor-wide)
- SOURCE: OpenStreetMap (ODbL 1.0) via Nominatim/Overpass — the only openly
  licensed source publishing pharmacy POIs across the whole corridor. Snapshots
  committed at `scripts/directory/source-snapshots/osm-{pharmacies,laboratories}.json`.
  Overpass mirrors are frequently at capacity; `overpass.osm.ch`,
  `overpass.openstreetmap.ru` and `maps.mail.ru/osm/tools/overpass` worked when
  `overpass-api.de`/`kumi.systems` returned 502.
- NEW `scripts/directory/import-pharmacies.mjs` (`npm run directory:pharmacies`)
  generates `src/data/pharmacies.ts` (28 records), `src/data/laboratories.ts`
  (14), `last-pharmacy-import-report.json` AND
  `supabase/migrations/0036_step27_pharmacy_lab_directory.sql` — app and DB cannot
  drift. Coverage reuses the shared corridor boundary.
- **Branch-aware dedupe:** a match requires identical name AND an identical address
  or a <30 m coordinate gap. A name+locality match would have merged separate
  Apollo Pharmacy branches (forbidden); an earlier draft did exactly that and was
  corrected.
- NEW `src/services/pharmacyService.ts` — the read boundary: merges live registry
  rows (Supabase) with the bundled directory, dedupes by identity, computes
  distance ONLY when both the record and the patient have real coordinates
  (`distanceKm: null` otherwise), ranks proximity-first (never on a rating), and
  derives filter options from the actual dataset. `pharmacyStockState()` is
  hardcoded `'not_integrated'`.
- NEW `src/pages/Pharmacies/PharmaciesPage.tsx` + `components/PharmacyCard.tsx`;
  `src/pages/Labs/LabsPage.tsx` + `components/LaboratoryCard.tsx`. Both centered,
  location-aware (manual search works when permission is denied), URL-reflected
  filters. Pharmacy/lab cards show "Distance unavailable" / "Opening hours not
  published" / "Medicine stock is not connected" rather than invented values.
- NEW `src/features/health-agent/services/pharmacyRecommendations.ts` — the agent
  now renders the SAME records (the legacy fabricated "Greenline Pharmacy" /
  "$12.40" / "Precision Diagnostics Lab" set is no longer the primary path).
  `agentOrchestrator.buildPharmacyResult` / `buildLabResult` were rewired (and
  `buildLabResult` is now `async` — its call site needed `await`).
- `directoryBridge.ts` now primes `pharmacies` + `labs` too, so the legacy
  `/agent` command center also reads real records; `mockAgentService`'s
  pharmacy/lab builders read the bridge (empty list = honest loading state).

### Migrations
- `0036_step27_pharmacy_lab_directory.sql` is ADDITIVE + IDEMPOTENT: it only
  `add column if not exists` on the existing `pharmacies`/`labs` tables from 0005
  and upserts by stable id (`on conflict (id) do nothing`). No stock-amount column
  exists anywhere. RLS: public read, `revoke insert/update/delete` from
  anon/authenticated.

### Tests / verification
- `verify:e2e` 15 → **32 checks** (hamburger dialog + destinations + scroll lock +
  Escape/restore, doctors hero card absent + search still filters, three-dot menu
  opens + prompt executes + not-just-inserted + no fabricated stock, Enter submit,
  pharmacies sourced + corridor-wide). `verify:navigation` 7 → 10.
  `verify:directory` 12 → 21. `verify:wiring` 57 → 68. `test:focused` 53 → 62
  (NEW `src/services/pharmacyService.test.mjs`, 9 tests).
- SQL suite: NEW `supabase/tests/280_step27_pharmacy_lab_directory.sql`;
  **637 PASS / 0 FAIL** from a clean replay (29 suites). Local Postgres 16 in
  Docker: `sudo dockerd &` then `sudo docker run -d --name carelink-pg -e
  POSTGRES_PASSWORD=postgres -e POSTGRES_USER=openhands -p 55432:5432 -v
  /workspace/project/CareLink-AI:/repo:ro postgres:16`, then
  `sudo docker exec -i carelink-pg bash -s < /tmp/replay.sh`.
- build green; lint 0 errors (15 pre-existing warnings); `verify:sweep` 18 routes
  × 5 widths = 0 console errors / 0 overflow; `verify:auth` 11/11;
  `verify:workflow` 39/39.

### BLOCKED (external credentials — unchanged)
No Supabase URL/anon key, DB password, service_role, Cloudinary, Google Places,
Maps or xAI key exist here. Migration 0036 is verified by the local replay only;
live pharmacy discovery, live medicine stock and live AI remain unconfigured.
Pharmacy/lab coverage reflects what OpenStreetMap has surveyed — dense in
Vijayawada, sparse in corridor villages. Absence in the source is a coverage
limitation, never a claim that no pharmacy exists.

## Step 28 — Global header (brand + hamburger) + Reviews page redesign (VERIFIED)

### ROOT CAUSE of the "old navigation still visible" report
`GlobalLayout.tsx` still rendered a wide-screen `<nav aria-label="Primary
navigation">` that mapped `primaryNavItems` (Home/Hospitals/Doctors/Pharmacies/
Labs/Blood Banks/Reviews/Appointments), PLUS a separate "Ask CareLink AI" pill and
xl-only Profile/Console/Login/Register links. Step 27 had ADDED the hamburger
alongside that rail instead of replacing it. Confirmed in the rendered DOM: every
PublicLayout route rendered one header containing all 12 links.
Second cause: `/ai` (AIChatPage `ChatHeader`) and `/agent` (AgentHeader) render
OUTSIDE `PublicLayout` with bespoke chrome and had no hamburger at all.

### Fix — one shared navigation surface
- NEW `src/components/layout/GlobalNavigation.tsx` — the ONLY hamburger +
  NavDrawer implementation, used by ALL THREE headers (marketing, /ai, /agent).
  The drawer is portalled to `<body>`: every header uses `backdrop-blur`, and a
  backdrop-filtered ancestor becomes the containing block for `position: fixed`,
  which would otherwise pin the drawer to the header. The portal also keeps the
  drawer's links OUT of the header DOM, so `header` genuinely contains only the
  brand + button (asserted by E2E).
- `GlobalLayout.tsx` header is now brand + optional compact account indicator
  (email chip + NotificationBell when signed in) + hamburger. The nav rail, the
  "Ask CareLink AI" pill and the Login/Register/Profile/Console links are GONE.
- `primaryNavItems` was DELETED from `navigationData.ts`; `navGroups` is the only
  nav model and now includes Home, Reviews (moved to "Find care"), Symptoms and
  Recovery Tracker.
- `?prompt=` deep-link executed by AIChatPage through the real conversation
  pipeline (then the param is stripped), so "Symptoms"/"Recovery Tracker" are real
  destinations, not decoration. `?filter=` deep-link now sets the Documents
  library filter (`libraryFilterFromParam` in `documentLibraryFilters.ts`).

### Reviews page — real data, centered layout
- The page previously rendered 100% FABRICATED samples (`reviewDiscoveryData.ts`
  `sampleHospitalReviews`: Aurora/Beacon/Luma hospitals, invented ratings/review
  counts/"verified" reviewers) presented as "premium review highlights", and the
  hero used a `lg:grid-cols-[1.1fr_0.9fr]` two-column split → the big empty left
  column + crowded right sidebar in the screenshot. All of it is DELETED.
- NEW `src/pages/Reviews/hooks/usePublicReviews.ts` + `ReviewsSearchHeader`,
  `ReviewsFilterBar`, `ReviewsResults`, `ReviewsSummary` — one centered
  `max-w-5xl` column: compact heading, full-width search with source-backed
  suggestions, a compact filter/sort row with Clear all beside it, an honest
  published-only rating summary, and real results with loading/empty/error states.
- NEW migration `0037_step28_public_reviews.sql`: `carelink_public_reviews_cursor`
  (anon+authenticated, PUBLISHED-ONLY, provider-name search, rating/kind/verified
  filters, keyset pagination, `p_sort` newest/highest/lowest) and
  `carelink_public_review_facets()` (real published-only counts). The old
  `carelink_reviews_cursor` is EXECUTE-revoked from anon, so before this a guest
  could never load a single real review.
- Honest "Near me": sorts by REAL published coordinates only
  (`data/providerLocationIndex.ts`); providers without coordinates keep their
  order at the end. Location is requested ONLY on activation; a denied prompt
  shows the manual-entry banner. No fabricated distance.
- New real suggestions `data/reviewSearchSuggestions.ts` (hospitals + listed
  doctors from the sourced directory) — no invented rating/review count.

### Verification
build green (752 modules); lint 0 errors (15 pre-existing warnings, none new);
`verify:e2e` **44/44** (16 routes × header-has-no-nav-row + shared hamburger,
drawer destinations/backdrop/scroll-lock/Escape/navigate-and-close, reviews
centered + no fabricated samples + search empty state + Clear all + Near me);
`verify:sweep` **18 routes × 8 widths (320/360/390/430/768/1024/1280/1440) = 0
console errors / 0 overflow**; `verify:wiring` 68 → 74; `verify:navigation` 10/10;
`verify:directory` 21/21; `verify:workflow` 39/39; `test:focused` 62/62;
`verify:auth` 11/11. SQL replay **662 PASS / 0 FAIL** incl. NEW
`supabase/tests/290_step28_public_reviews.sql` (published-only, provider-name
search, filters, sort order, facets, anon read granted + anon write denied).

### Gotchas
- `scripts/build-migration-bundle.sh` was missing 0034–0036; now 0034→0037.
- Under `set role anon` RLS filters `count(*) from public.reviews` to published
  rows — assert raw counts as the harness owner, not as anon.
- Adding a route to `verify-sweep.mjs` / `verify-e2e.mjs` is how a new surface gets
  overflow/console coverage; keep the header-route list in sync.

## Step 29 — Real multimodal medical-document analysis (VERIFIED)

Requirement: upload/capture a medicine photo, prescription, blood/lab report or
other medical document and get a STRUCTURED analysis of the ACTUAL content, with
evidence, confidence and honest limitations — never fabricated findings.

### ROOT CAUSES FIXED (each was a real, user-visible defect)
1. **Fabricated lab values presented as extracted data.**
   `documentAnalysisService.mockLabResult()` hardcoded `Fasting glucose 132`,
   `HbA1c 6.8%`, `Total cholesterol 212`, `LDL 138` and the UI rendered them
   under the heading "Extracted from report". The uploaded file was never read.
   Replaced with a real extraction pipeline (below); the function is deleted.
2. **No extraction at all.** Classification was `filename.includes('report')`.
   There was no OCR and no PDF text reading. Added pdfjs-dist (PDF text layer) +
   tesseract.js (on-device OCR), dynamically imported so they never enter the
   main bundle.
3. **Fabricated medicine confidence.** `medicineRecognitionService` reported
   `confidence: 92` for a filename-derived guess. Now a medicine is either
   VERIFIED against a real database (openFDA label + RxNorm) or explicitly
   UNCERTAIN with a reason; nothing in between is claimed.
4. **US emergency numbers in an India-focused product.** `tel:911` (banner),
   `tel:988` (crisis), and the mock emergency contacts. Centralised in
   `clinical/emergencyConfig.ts` → 112 / 108 / 104 / 14416, with an explicit
   "CareLink cannot place the call or dispatch an ambulance" disclaimer.
5. **`assessSafety()` always returned `isEmergency: false`** with the comment
   "Mock analysis never asserts emergency severity" — so a critical lab value
   could never raise the emergency banner. Now a deterministic triage engine
   drives it.
6. **Newly added files never uploaded.** `useDocumentUpload.addFiles()` queued
   React state, but `DocumentUploadZone` called `startUpload` synchronously; the
   upload looked up STALE state and silently no-op'd. Fixed with a synchronous
   `attachmentsRef` mirror (also used by cancel/remove/clear).
7. **Uploaded documents never appeared in the library** without a manual
   "Refresh library" click. The documents page now reloads on upload completion
   and auto-opens the newest analysis.
8. **A report's own interval was compared against the UNIT-CONVERTED value.**
   The report prints its interval in the REPORTED unit, so a value in `/cumm`
   was compared against a `10^3/µL` interval and misclassified. Now the report
   interval uses the RAW value; only a catalog interval (canonical unit) uses the
   converted value. Covered by a regression test.
9. **Dead conversion-table entries.** `reconcileUnit` built the key
   `${from}|${to}:${family ?? ''}` while family-independent entries were keyed
   `${from}|${to}`, so `/cumm → 10^3/µL` never matched. Fixed the lookup shape
   and added the exact count factors (`/cumm` → ×0.001, `lakh/cumm` → ×100).

### Architecture (new)
`src/features/documents/services/extraction/`
- `types.ts` — `DocumentExtraction` / `ExtractedPage` with an explicit
  `extracted | unreadable | unavailable | failed` status per page.
- `pdfText.ts` — pdfjs text layer (page order + per-page provenance).
- `ocrText.ts` — tesseract.js OCR; canvas downscale + grayscale + contrast
  stretch; per-page engine confidence; low-confidence flag below 55.
- `classify.ts` — weighted content scoring per category; `userCorrection` wins;
  `CLASSIFICATION_CONFIRM_THRESHOLD = 0.35` triggers the "tell us the type" UI.
- `extractDocument.ts` — backend chooser; a scanned PDF falls back to OCR of
  page 1. `env.documents` (server) is still consulted when configured.

`src/features/documents/services/clinical/`
- `analyteCatalog.ts` — 17 analytes with adult intervals, critical bands,
  aliases, units and `about`/`whyOrdered`. **`CATALOG_REVIEWED = false`** is
  surfaced in the UI: the catalog is NOT clinician-signed-off yet.
- `units.ts` — unit reconciliation (family-aware mass↔molar factors, count
  units, u/µ normalisation) + interval parsing (`a-b`, `<x`, `>x`, "up to x").
- `labParser.ts` — test/value/unit/interval/flag parsing with the report's own
  interval taking precedence, the lab's own flag preserved separately, and
  `statusBasis` recording HOW the status was decided.
- `prescriptionParser.ts` — faithful medicine/strength/form/dose/frequency/
  timing/duration extraction; `deriveSchedule` only maps a frequency to
  morning/afternoon/night when the text supports it; `needsConfirmation` per
  field.
- `triage.ts` — deterministic urgency (emergency/urgent/needs-follow-up/
  informational) from critical values, lab panic markers, unreadable units and
  emergency symptoms (incl. Telugu + Romanized Telugu). A normal report never
  overrides reported severe symptoms.
- `medicineSources.ts` — keyless authoritative lookups: RxNorm (generic name +
  RxCUI) and openFDA drug label (uses, side effects, warnings, reference dosage,
  Rx/OTC). Bounded, timed out, no retries, name-only (no patient data).
- `labelParser.ts` — medicine-label parsing (composition incl. next-line wrap,
  strength, form, batch, expiry, manufacturer).
- `emergencyConfig.ts` — the single emergency-number source + the honesty
  disclaimer.
- `trends.ts` — cross-report trends, only across comparable units, with an
  explicit refusal when dates/units make comparison invalid.

`src/features/documents/services/medicineIdentificationService.ts` — orchestrates
label parsing → database verification → VERIFIED or UNCERTAIN result.

`src/services/emergency/nearestEmergencyFacility.ts` — real emergency destination
via the shared directory + `directionsService`; distance only when real coords
exist; no fabricated destination.

### UI (rebuilt `DocumentAnalysisResultCard.tsx` + `components/analysis/`)
Hierarchy: preview/title/provenance → **urgency banner** → summary →
medicine identification / lab findings / medication schedule → evidence +
confidence + limitations → next actions → follow-up input. Document-type
correction chips re-interpret the stored extraction (no re-OCR).
`AnalysisUrgencyBanner` shows the exact triggering finding, whether extraction
was confident, real `tel:` actions and the dispatch disclaimer.
`MedicationSchedule` renders a table on `sm+` and stacked cards below (no
horizontal scroll) and shows "Schedule not stated" rather than inventing one.

### Tests
- `clinicalParsers.test.mjs` (34) — lab/prescription/label parsing, units,
  intervals, triage, trends, classification, the raw-vs-converted interval
  regression, count-unit factors.
- `medicineIdentification.test.mjs` (10) — emergency config (no 911/988, 112
  primary, no dispatch claim) + medicine verification with a STUBBED fetch
  (hermetic; real code path exercised).
- `scripts/make-test-fixtures.mjs` → synthetic, labelled PDF fixtures
  (`npm run fixtures`). `scripts/verify-document-analysis.mjs`
  (`npm run verify:documents`) — **26/26** browser checks: real upload →
  rendered values with units + the report's own range + the lab flag + the
  critical emergency banner naming the exact finding + `tel:112` + no US number
  + no dispatch claim + provenance + limitations + catalog-review disclosure +
  evidence + type correction + follow-up input + 0 overflow at 7 widths.
- `test:focused` 62 → **106**.

### Verification (this environment)
build green; lint **15 pre-existing warnings, 0 new, 0 errors**;
`test:focused` **106/106**; `verify:documents` **26/26**; `verify:e2e` 44/44;
`verify:sweep` 18 routes × 8 widths = 0 console errors / 0 overflow;
`verify:wiring` / `verify:directory` / `verify:workflow` / `verify:navigation`
all PASS; SQL replay **663 PASS / 0 FAIL** (Docker Postgres 16; the container
mounts the repo at `/repo`, so `cd /repo/supabase/tests`).

### BLOCKED (external credentials — unchanged)
No Supabase URL/anon key, Cloudinary, Google Places/Maps or xAI key exist here.
OCR runs on-device and needs no key; openFDA/RxNorm need no key but DO need
network access at runtime (verified reachable here). Live AI, live Places
discovery and live pharmacy stock remain unconfigured and are labelled as such.

### Gotchas
- `scripts/build-migration-bundle.sh` is unrelated to this step; migrations
  unchanged (0037 remains the latest).
- The clinical catalog MUST be reviewed by qualified clinical personnel before
  production use. `CATALOG_REVIEWED`/`CATALOG_VERSION` make that visible in the
  UI rather than hiding it.
- OCR of packaging is unreliable by nature: the UI must keep asking for a
  clearer photo instead of guessing a medicine identity.
