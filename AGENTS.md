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
