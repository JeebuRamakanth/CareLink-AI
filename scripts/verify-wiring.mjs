#!/usr/bin/env node
/**
 * CareLink-AI — wiring audit (static, repeatable).
 *
 * Asserts that the Step 15+ integration points are present and internally
 * consistent without needing a running backend:
 *   1. Security-activity event names used by the frontend match the DB CHECK
 *      constraint (login/logout/admin/super_admin/denied).
 *   2. Appointment persistence bridge (dbId) is wired in the context and the
 *      repository returns the created row id.
 *   3. Review composer is mounted on doctor + hospital detail pages and calls
 *      the RLS-backed reviewsRepository.
 *   4. Conversation persistence (create/add/delete) is wired into AgentContext.
 *   5. Registration pending-profile drain is wired into AuthContext.
 *   6. No leftover mock `window.alert('...mocked...')` for directions/reviews.
 *
 * Exits non-zero on any failure. Run: node scripts/verify-wiring.mjs
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const has = (p, needle) => read(p).includes(needle);
/** True when the file exists AND contains the needle (safe for deleted files). */
const hasIfExists = (p, needle) => existsSync(join(root, p)) && has(p, needle);

const failures = [];
const checks = [];

const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

// 1. Auth activity event names (frontend ⇄ DB)
const db25 = read('supabase/migrations/0025_account_suspension_login_activity_admin_permissions.sql');
check(
  'auth: frontend uses DB-approved logout event name',
  has('src/services/auth/authorization.ts', "recordActivity('logout')"),
  'expected recordActivity(\'logout\') in authorization.ts'
);
check(
  'auth: DB accepts logout event',
  db25.includes("'login_success','login_failure','logout','session_refresh'"),
  'logout must be in the DB CHECK constraint'
);
check(
  'auth: admin/super-admin login + denied events wired',
  has('src/services/auth/authorization.ts', 'super_admin_login_success') &&
    has('src/services/auth/authorization.ts', 'admin_login_success') &&
    has('src/services/auth/authorization.ts', 'admin_access_denied'),
  'lane-aware login events + admin_access_denied missing'
);
check(
  'auth: AuthContext passes enriched user to recordLoginActivity',
  has('src/contexts/AuthContext.tsx', 'recordLoginActivity(enriched'),
  'AuthContext must call recordLoginActivity(enriched, ...)'
);
check(
  'auth: AdminRoute records admin_access_denied',
  has('src/components/AdminRoute.tsx', 'recordAdminAccessDenied'),
  'AdminRoute must call recordAdminAccessDenied'
);

// 2. Appointment persistence bridge (dbId)
const apptCtx = read('src/contexts/AppointmentContext.tsx');
const apptRepo = read('src/services/health-data/appointmentsRepository.ts');
check(
  'appointments: context stores dbId from created row',
  apptCtx.includes('dbId: saved.id'),
  'AppointmentContext must store dbId from createAppointment result'
);
check(
  'appointments: context loads real rows from backend',
  apptCtx.includes('listAppointments') && apptCtx.includes('refreshFromBackend'),
  'AppointmentContext must call listAppointments + expose refreshFromBackend'
);
check(
  'appointments: reschedule/cancel target dbId when present',
  apptCtx.includes('target?.dbId ?? appointmentId'),
  'reschedule/cancel must prefer dbId'
);
check(
  'appointments: repository returns created row id',
  apptRepo.includes('return res.data as AppointmentRow') && apptRepo.includes("from('appointments')"),
  'appointmentsRepository must return the created row'
);

// 3. Review composer wired
const docPage = read('src/pages/Doctors/DoctorProfilePage.tsx');
const hospPage = read('src/pages/Hospitals/HospitalDetailsPage.tsx');
const composer = read('src/components/reviews/ReviewComposer.tsx');
check(
  'reviews: composer calls RLS-backed createReview',
  composer.includes('createReview') && composer.includes('listMyReviews'),
  'ReviewComposer must use reviewsRepository'
);
check(
  'reviews: composer mounted on doctor detail page',
  docPage.includes('<ReviewComposer target={{ kind: \'doctor\', id: doctor.id }}'),
  'DoctorProfilePage must render ReviewComposer'
);
check(
  'reviews: composer mounted on hospital detail page',
  hospPage.includes("<ReviewComposer target={{ kind: 'hospital', id: hospital.id }}"),
  'HospitalDetailsPage must render ReviewComposer'
);

// 4. Conversation persistence
const agentCtx = read('src/contexts/AgentContext.tsx');
check(
  'conversations: AgentContext persists conversations/messages',
  agentCtx.includes('persistMessageDb') && agentCtx.includes('createConversation') && agentCtx.includes('addMessage'),
  'AgentContext must call createConversation/addMessage'
);
check(
  'conversations: AgentContext loads real conversations',
  agentCtx.includes('listConversationRows') && agentCtx.includes('listMessages'),
  'AgentContext must load real conversations'
);
check(
  'conversations: delete removes DB row',
  agentCtx.includes('deleteConversationRow'),
  'AgentContext must delete DB conversation row'
);

// 5. Registration pending-profile drain
const authCtx = read('src/contexts/AuthContext.tsx');
const regPage = read('src/pages/Auth/RegisterPage.tsx');
check(
  'registration: pending profile save written on email-confirm path',
  regPage.includes('writePendingProfileSave'),
  'RegisterPage must write pending profile save'
);
check(
  'registration: AuthContext drains pending profile save',
  authCtx.includes('drainPendingProfileSave') && authCtx.includes('clearPendingProfileSave'),
  'AuthContext must drain pending profile save'
);

// 6. No leftover mock directions/review alerts
check(
  'ui: doctor page directions no longer mocked',
  !docPage.includes("window.alert('Directions are mocked"),
  'doctor page must use real directionsUrl'
);
check(
  'ui: hospital page write-review no longer mocked',
  !hospPage.includes("window.alert('Write Review will be available soon"),
  'hospital page must scroll to ReviewComposer instead of alert'
);

// 7. Step 16 — admin provider/appointment/data-quality RPC wiring
const adminRepo = read('src/services/health-data/adminRepository.ts');
check(
  'admin: provider status change uses audited RPC',
  has('src/pages/Admin/AdminProvidersPage.tsx', 'adminSetProviderStatus'),
  'AdminProvidersPage must call adminSetProviderStatus (audited RPC)'
);
check(
  'admin: provider status RPC exposed in repository',
  adminRepo.includes('carelink_admin_set_provider_status'),
  'adminRepository must call carelink_admin_set_provider_status'
);
check(
  'admin: appointment ops RPC exposed in repository',
  adminRepo.includes('carelink_admin_set_appointment_status'),
  'adminRepository must call carelink_admin_set_appointment_status'
);
check(
  'admin: data quality RPC exposed in repository',
  adminRepo.includes('carelink_admin_data_quality'),
  'adminRepository must call carelink_admin_data_quality'
);
check(
  'admin: super-admin-only modules gated in routes',
  has('src/routes/AppRoutes.tsx', 'superAdminOnly') && has('src/routes/AppRoutes.tsx', 'AdminRolesPage') && has('src/routes/AppRoutes.tsx', 'AdminDataQualityPage'),
  'Roles + Data Quality must be super-admin-gated routes'
);
check(
  'admin: layout gates modules by permission',
  has('src/pages/Admin/AdminLayout.tsx', 'hasPermission(user, m.permission)'),
  'AdminLayout must gate modules by permission for display'
);

// 8. Step 16 — appointment lifecycle notifications exist in the DB layer.
const mig27 = read('supabase/migrations/0027_step16_operations_and_quality.sql');
check(
  'db: appointment lifecycle notification trigger exists',
  mig27.includes('carelink_notify_appointment_lifecycle') && mig27.includes('appointment_booked'),
  'migration 0027 must define the appointment notification trigger + templates'
);
check(
  'db: provider status RPC exists',
  mig27.includes('carelink_admin_set_provider_status'),
  'migration 0027 must define carelink_admin_set_provider_status'
);
check(
  'db: data quality RPC exists',
  mig27.includes('carelink_admin_data_quality'),
  'migration 0027 must define carelink_admin_data_quality'
);

// 9. Step 16 — review edit/delete-own wired in the composer.
const reviewComposer = read('src/components/reviews/ReviewComposer.tsx');
check(
  'reviews: composer supports edit/delete own review',
  reviewComposer.includes('updateMyReview') && reviewComposer.includes('deleteMyReview'),
  'ReviewComposer must call updateMyReview + deleteMyReview'
);

// 10. Step 16 — notification bell in the header (recipient-scoped).
check(
  'notifications: bell wired into header',
  has('src/components/layout/GlobalLayout.tsx', 'NotificationBell'),
  'GlobalLayout must render NotificationBell'
);
check(
  'notifications: bell reads only own notifications',
  has('src/components/notifications/NotificationBell.tsx', 'listNotifications') && has('src/components/notifications/NotificationBell.tsx', 'markNotificationRead'),
  'NotificationBell must use the recipient-scoped notification repo'
);

// 11. Step 19 — centralized role hierarchy + lane-aware auth wiring.
const authz = read('src/services/auth/authorization.ts');
check(
  'auth: centralized role hierarchy helper (ROLE_RANK + hasRoleOrHigher)',
  authz.includes('export const ROLE_RANK') && authz.includes('export function hasRoleOrHigher'),
  'authorization.ts must expose ROLE_RANK + hasRoleOrHigher'
);
check(
  'auth: hasAdminRole/isSuperAdmin derive from hasRoleOrHigher (no scattered exact-role checks)',
  authz.includes("hasRoleOrHigher(user, 'admin')") && authz.includes("hasRoleOrHigher(user, 'super_admin')"),
  'hasAdminRole/isSuperAdmin must delegate to hasRoleOrHigher'
);
check(
  'auth: lane-aware login audit events',
  authz.includes('super_admin_login_success') && authz.includes('admin_login_success') && authz.includes('suspended_login_denied'),
  'recordLoginActivity must be lane-aware'
);
check(
  'auth: AuthContext passes the selected lane to recordLoginActivity',
  has('src/contexts/AuthContext.tsx', 'recordLoginActivity(enriched, lane') &&
    has('src/contexts/AuthContext.tsx', 'lane?: LoginLane'),
  'AuthContext.signIn must accept + forward the lane'
);
check(
  'auth: LoginPage forwards the lane and gates the destination',
  has('src/pages/Auth/LoginPage.tsx', 'signIn(email, password, lane)') &&
    has('src/pages/Auth/LoginPage.tsx', 'isSuspended'),
  'LoginPage must pass the lane and refuse suspended accounts'
);
check(
  'db: hardening migration exists (suspended-super-admin closure)',
  has('supabase/migrations/0030_step19_owner_auth_hardening.sql', 'carelink_admin_has_permission') &&
    has('supabase/migrations/0030_step19_owner_auth_hardening.sql', 'carelink_is_super_admin'),
  'migration 0030 must re-define the status-aware predicates'
);
check(
  'db: lane-aware audit vocabulary includes *_login_denied',
  has('supabase/migrations/0030_step19_owner_auth_hardening.sql', 'admin_login_denied') &&
    has('supabase/migrations/0030_step19_owner_auth_hardening.sql', 'super_admin_login_denied'),
  'DB event vocabulary must accept the lane-denial events'
);
check(
  'ai: real family resolver wired through the backend ownership firewall',
  has('src/features/health-agent/services/ai/aiTools.ts', 'carelink_resolve_family_profile') &&
    has('src/services/health-data/familyRepository.ts', 'resolveAuthorizedFamilyProfile'),
  'AI family context must resolve via carelink_resolve_family_profile'
);
check(
  'ai: chat hook uses real RLS-scoped family profiles (no fake set)',
  has('src/features/health-agent/hooks/useAgentConversation.ts', 'useOptionalAgent'),
  'useAgentConversation must read family profiles from AgentContext'
);

// --- Step 21/24: corridor directory + review eligibility + dev test auth ---
check(
  'directory: bundled records come from the sourced corridor import',
  has('src/data/hospitals.ts', 'GENERATED FILE — DO NOT EDIT BY HAND') &&
    has('src/data/hospitals.ts', 'scripts/directory/ingest.mjs') &&
    has('src/services/hospitalService.ts', 'getBundledHospitals') &&
    has('src/services/hospitalService.ts', 'discoverCorridorHospitals') &&
    has('src/services/hospitalService.ts', 'fetchRealHospitals'),
  'the bundled directory must be generated by the importer, with live sources still preferred'
);
check(
  'directory: coverage uses the configurable corridor boundary',
  has('src/services/hospitalService.ts', 'classifyCoverage') &&
    has('src/data/coverage.ts', 'CORRIDOR_BUFFER_KM') &&
    has('src/data/coverage.ts', 'classifyCoverage'),
  'hospital coverage must use the shared corridor boundary, not a city-name match'
);
check(
  'directory: ingestion pipeline + migration emitter are present',
  has('scripts/directory/ingest.mjs', 'parseDistrictPage') &&
    has('scripts/directory/ingest.mjs', 'classifyCoverage') &&
    has('scripts/directory/emit-migration.mjs', '0034_corridor_directory_import.sql') &&
    has('supabase/migrations/0034_corridor_directory_import.sql', 'on conflict (id) do nothing'),
  'the directory must be repeatable: importer + generated migration'
);
check(
  'directory: hospital filters are driven by real data, not hardcoded lists',
  has('src/pages/Hospitals/hooks/useHospitals.ts', 'filterOptions') &&
    has('src/pages/Hospitals/components/FilterBar.tsx', 'options?.localities') &&
    !has('src/pages/Hospitals/components/FilterBar.tsx', "const facilityTypeOptions = ['Hospital'"),
  'filter dropdowns must be derived from the loaded dataset'
);
check(
  'directory: Machilipatnam doctor data present with provenance',
  has('src/data/doctors.ts', 'Machilipatnam') && has('src/data/doctors.ts', 'provenance'),
  'src/data/doctors.ts must carry sourced Machilipatnam doctors + provenance'
);
check(
  'directory: no fabricated ratings in the directory data',
  !/rating:\s*[1-4]/.test(read('src/data/hospitals.ts')) &&
    !/rating:\s*[1-4]/.test(read('src/data/doctors.ts')),
  'directory ratings must be 0 until real eligible reviews exist'
);
check(
  'directory: hospital card does not fabricate a doctor count',
  !has('src/pages/Hospitals/components/HospitalCard.tsx', 'Math.max(8,') ,
  'HospitalCard must not invent a doctors count'
);
check(
  'db: Machilipatnam directory migration exists',
  has('supabase/migrations/0031_step21_machilipatnam_directory.sql', 'mph-district-hospital-machilipatnam') &&
    has('supabase/migrations/0031_step21_machilipatnam_directory.sql', 'THIRD_PARTY_DIRECTORY'),
  'migration 0031 must seed the sourced directory with honest data_status'
);
check(
  'db: review eligibility enforced by a trigger',
  has('supabase/migrations/0032_step21_review_eligibility.sql', 'carelink_review_eligibility') &&
    has('supabase/migrations/0032_step21_review_eligibility.sql', 'appointment is not completed'),
  'migration 0032 must require a completed appointment on review insert'
);
check(
  'auth: dev test login is double-gated (DEV build + explicit opt-in)',
  has('src/config/env.ts', 'VITE_ENABLE_DEV_TEST_AUTH') &&
    has('src/config/env.ts', 'raw.DEV === true') &&
    has('src/services/auth/devTestAuth.ts', 'isDevTestAuthEnabled'),
  'dev test auth must require import.meta.env.DEV AND an explicit env opt-in'
);
check(
  'auth: dev test identity never inherits roles',
  has('src/services/auth/authorization.ts', "user.source === 'dev-test'") &&
    has('src/services/auth/devTestAuth.ts', 'roles: []'),
  'dev-test user must resolve to empty roles and skip backend role lookup'
);

// 11. Password recovery + change-password flows (real Supabase Auth paths)
check(
  'auth: password reset passes a redirectTo recovery URL',
  has('src/services/auth/authService.ts', 'resetPasswordForEmail') &&
    has('src/services/auth/authService.ts', 'redirectTo: recoveryRedirectUrl()'),
  'resetPasswordForEmail must send the browser back to the recovery page'
);
check(
  'auth: updatePassword calls the provider updateUser',
  has('src/services/auth/authService.ts', 'client.auth.updateUser({ password: newPassword })'),
  'real password change must go through Supabase auth.updateUser'
);
check(
  'auth: recovery route is registered and rendered',
  has('src/routes/routeConstants.ts', "resetPassword: '/reset-password'") &&
    has('src/routes/AppRoutes.tsx', '<ResetPasswordPage />') &&
    has('src/pages/Auth/ResetPasswordPage.tsx', 'isRecoveryRedirect'),
  'the emailed recovery link needs a real route + page'
);
check(
  'auth: AuthContext exposes updatePassword to the UI',
  has('src/contexts/AuthContext.tsx', 'updatePassword: (newPassword: string)') &&
    has('src/pages/Auth/ProfilePage.tsx', 'await updatePassword(newPassword)'),
  'the change-password UI must call the context method'
);
check(
  'auth: recovery page never fakes success without a recovery link',
  has('src/pages/Auth/ResetPasswordPage.tsx', '!recoveryLink'),
  'a bare /reset-password visit must show honest guidance'
);

// 12. Startup configuration diagnostics (never print secret values)
check(
  'config: startup validates the browser-safe environment',
  has('src/main.tsx', 'getConfigNotices()') &&
    has('src/config/diagnostics.ts', 'service_role'),
  'misconfiguration must be surfaced with variable NAMES only'
);

// 13. Step 25 — departments, doctor affiliations, blood centres, directions.
check(
  'step25: departments/affiliations/blood centres migration exists',
  existsSync(join(root, 'supabase/migrations/0035_step25_departments_affiliations_blood_centres.sql')),
  'the DB must carry the department/affiliation/blood-centre tables'
);
{
  // Extract the blood_centres DDL and assert it declares NO stock-amount column.
  // `stock_source` (a state flag) is expected; a `stock`/`units` column is not.
  const sql = readFileSync(join(root, 'supabase/migrations/0035_step25_departments_affiliations_blood_centres.sql'), 'utf8');
  const ddl = sql.match(/create table if not exists public\.blood_centres[\s\S]*?\n\);/i)?.[0] ?? '';
  const hasStockAmountColumn = ddl
    .split('\n')
    .some((line) => /^\s*(stock|units|available_units|blood_stock)\s+(text|integer|int|bigint|numeric|jsonb|smallint)/i.test(line));
  check(
    'step25: blood_centres has no stock-amount column (stock is never invented)',
    ddl.length > 0 && !hasStockAmountColumn,
    'a stock-amount column would let a fabricated stock level be stored'
  );
}
check(
  'step25: doctor affiliation is its own table (not a doctor.hospital_id)',
  has('supabase/migrations/0035_step25_departments_affiliations_blood_centres.sql', 'create table if not exists public.doctor_department_affiliations') &&
    has('src/services/providerDirectoryService.ts', 'getAllAffiliations'),
  'one doctor may work at several hospitals'
);
check(
  'step25: department UI is wired into the hospital detail page',
  has('src/pages/Hospitals/HospitalDetailsPage.tsx', '<HospitalDepartments') &&
    has('src/pages/Hospitals/components/HospitalDepartments.tsx', 'Department information is not available in the current sources'),
  'a facility with no published roster must say so, not invent departments'
);
check(
  'step25: per-department doctor counts derive from affiliation records',
  has('src/services/providerDirectoryService.ts', 'getDepartmentDoctorCount') &&
    has('src/services/providerDirectoryService.ts', 'no_roster_published'),
  'counts must never be hardcoded in the frontend'
);
check(
  'step25: blood banks page, route and nav link exist',
  has('src/pages/BloodBanks/BloodBanksPage.tsx', 'BloodBanksPage') &&
    has('src/routes/routeConstants.ts', "bloodBanks: '/blood-banks'") &&
    has('src/components/layout/GlobalLayout.tsx', 'ROUTES.bloodBanks'),
  'the blood centre directory must be reachable'
);
check(
  'step25: live stock is never fabricated',
  has('src/services/bloodCentreService.ts', 'isBloodStockLive') &&
    has('src/pages/BloodBanks/BloodBanksPage.tsx', 'e-RaktKosh'),
  'the UI must point at the official stock service instead of inventing stock'
);
check(
  'step25: every directions action uses the single tested helper',
  has('src/pages/Hospitals/components/HospitalCard.tsx', 'buildDirectionsUrl') &&
    has('src/pages/Hospitals/HospitalDetailsPage.tsx', 'buildDirectionsUrl') &&
    has('src/pages/Doctors/DoctorProfilePage.tsx', 'buildDirectionsUrl') &&
    has('src/pages/BloodBanks/components/BloodCentreCard.tsx', 'buildDirectionsUrl'),
  'a card must never route to an unrelated destination'
);
check(
  'step25: directions helper refuses a record with no location evidence',
  has('src/services/maps/directionsService.ts', 'directionsAvailability') &&
    has('src/services/maps/directionsService.ts', 'destination_place_id'),
  'Place ID > coordinates > address > locality, else unavailable'
);
check(
  'step25: geocoded corridor localities are used as coverage evidence',
  has('src/data/geocodedLocalities.ts', 'geocodedLocalities') &&
    has('src/data/coverage.ts', 'geocoded_locality') &&
    has('scripts/directory/geocode-localities.mjs', 'Nominatim'),
  'an unresolved village locality must be placed from real geocoded evidence'
);
check(
  'step25: chatbot can answer blood-centre questions from real records',
  has('src/features/health-agent/services/agentOrchestrator.ts', 'buildBloodCentreResult') &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'getBloodCentres'),
  'the chatbot must use the same directory data as the app'
);

/* ---------------------------------------------------------------------------
 * Step 27 — global navigation, doctors hero, assistant prompts, pharmacy.
 * ------------------------------------------------------------------------- */
check(
  'step28: the header renders a hamburger that opens a real navigation dialog',
  has('src/components/layout/GlobalNavigation.tsx', 'NavDrawer') &&
    has('src/components/layout/GlobalNavigation.tsx', 'Open navigation menu') &&
    has('src/components/layout/NavDrawer.tsx', 'aria-modal'),
  'the hamburger must drive an accessible dialog, not a decorative icon'
);
check(
  'step28: every header uses the SAME shared navigation component',
  has('src/components/layout/GlobalLayout.tsx', 'GlobalNavigation') &&
    has('src/features/health-agent/components/AIChatPage.tsx', 'GlobalNavigation') &&
    has('src/components/agent/AgentHeader.tsx', 'GlobalNavigation'),
  'the marketing, /ai and /agent headers must share one drawer implementation'
);
check(
  'step28: the global header renders no horizontal navigation rail',
  !has('src/components/layout/GlobalLayout.tsx', 'primaryNavItems') &&
    !has('src/components/layout/GlobalLayout.tsx', 'Primary navigation') &&
    !has('src/components/layout/navigationData.ts', 'primaryNavItems'),
  'the header must be brand + hamburger; destinations live in the drawer'
);
check(
  'step28: the drawer exposes the full destination list including Home',
  has('src/components/layout/navigationData.ts', 'ROUTES.home') &&
    has('src/components/layout/navigationData.ts', 'Symptoms') &&
    has('src/components/layout/navigationData.ts', 'Recovery Tracker'),
  'the drawer is the only navigation surface, so it must be complete'
);
check(
  'step28: reviews page reads real published reviews (public RPC), not mock data',
  has('src/pages/Reviews/hooks/usePublicReviews.ts', 'listPublicReviewsCursor') &&
    has('src/pages/Reviews/hooks/usePublicReviews.ts', 'getPublicReviewFacets') &&
    !hasIfExists('src/pages/Reviews/data/reviewDiscoveryData.ts', 'sampleHospitalReviews') &&
    !hasIfExists('src/pages/Reviews/data/reviewData.ts', 'sampleReviews'),
  'the reviews page must never render fabricated testimonials'
);
check(
  'step28: the public reviews RPC is published-only and anon-readable',
  has('supabase/migrations/0037_step28_public_reviews.sql', 'carelink_public_reviews_cursor') &&
    has('supabase/migrations/0037_step28_public_reviews.sql', "r.status = 'published'") &&
    has('supabase/migrations/0037_step28_public_reviews.sql', 'carelink_public_review_facets'),
  'a guest must be able to read published reviews, and nothing else'
);
check(
  'step27: the navigation overlay locks scrolling and restores it',
  has('src/components/layout/NavDrawer.tsx', "document.body.style.overflow = 'hidden'") &&
    has('src/components/layout/NavDrawer.tsx', "document.body.style.overflow = previousOverflow"),
  'background scroll must be locked while open and restored on close'
);
check(
  'step27: the navigation overlay closes on Escape, backdrop and selection',
  has('src/components/layout/NavDrawer.tsx', "event.key === 'Escape'") &&
    has('src/components/layout/NavDrawer.tsx', 'onClick={onClose}') &&
    has('src/components/layout/NavDrawer.tsx', 'onClick={onClose}'),
  'all three dismissal paths are required'
);
check(
  'step27: navigation destinations are centralized and guarded',
  has('src/components/layout/navigationData.ts', 'requiresAuth') &&
    has('src/components/layout/navigationData.ts', 'requiresAdmin') &&
    has('src/components/layout/navigationData.ts', 'ROUTES.pharmacies'),
  'a link must never dangle or expose an account-only page to a guest'
);
check(
  'step27: the doctors hero no longer renders a right-side search card',
  !has('src/pages/Doctors/components/Hero.tsx', 'Doctor Name') &&
    has('src/pages/Doctors/components/Hero.tsx', 'doctor-search-input'),
  'the hero focuses the real filter input instead of duplicating search'
);
check(
  'step27: the assistant exposes a three-dot quick-prompt menu',
  has('src/features/health-agent/components/AIChatPage.tsx', 'QuickPromptMenu') &&
    has('src/features/health-agent/components/AIChatPage.tsx', 'aria-label="Open quick prompts"') &&
    has('src/features/health-agent/components/AIChatPage.tsx', 'role="menuitem"'),
  'the prompt menu is separate from the global hamburger'
);
check(
  'step27: quick prompts run the SAME submit pipeline as Send/Enter',
  has('src/features/health-agent/components/AIChatPage.tsx', 'onPickPrompt={handlePickPrompt}') &&
    has('src/features/health-agent/components/AIChatPage.tsx', 'void conv.sendMessage(prompt)'),
  'a prompt must be executed, never merely inserted into the composer'
);
check(
  'step27: the prompt menu is gated on in-flight state, not the empty draft',
  has('src/features/health-agent/components/AIChatPage.tsx', '<QuickPromptMenu onPick={onPickPrompt} disabled={busy} />'),
  'an empty composer must not disable the quick prompts'
);
check(
  'step27: pharmacy + lab results come from the sourced directory service',
  has('src/features/health-agent/services/pharmacyRecommendations.ts', 'getPharmacies') &&
    has('src/features/health-agent/services/pharmacyRecommendations.ts', 'getLaboratories') &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'getPharmacyRecommendations') &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'getLaboratoryRecommendations'),
  'the chatbot must show the same records as the directory pages'
);
check(
  'step27: the legacy workspace reads the same pharmacy/lab directory',
  has('src/services/agent/directoryBridge.ts', 'getDirectoryPharmacies') &&
    has('src/services/agent/directoryBridge.ts', 'getDirectoryLabs') &&
    has('src/services/agent/mockAgentService.ts', 'getDirectoryPharmacies'),
  'the /agent command center must not fall back to fabricated US demo data'
);
check(
  'step27: medicine stock is never integrated or fabricated',
  has('src/services/pharmacyService.ts', "return 'not_integrated'") &&
    has('src/pages/Pharmacies/PharmaciesPage.tsx', 'Live medicine stock is not connected'),
  'no stock level may ever be displayed'
);
check(
  'step27: pharmacy distance requires real coordinates',
  has('src/services/pharmacyService.ts', 'pharmacyDistance') &&
    has('src/services/pharmacyService.ts', 'typeof pharmacy.latitude !== \'number\''),
  'a missing coordinate must yield null distance, not a fabricated number'
);

/* ---------------------------------------------------------------------------
 * Step 30 — multilingual assistant, hospital discovery and emergency safety.
 * ------------------------------------------------------------------------- */

check(
  'step30: one shared language detector is used by every entry point',
  has('src/features/health-agent/services/ai/languageDetector.ts', 'SUPPORTED_LANGUAGES') &&
    has('src/features/health-agent/services/ai/aiEngine.ts', 'resolveResponseLanguage') &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'resolveResponseLanguage') &&
    has('src/features/health-agent/services/adapters/mockAdapters.ts', 'detectInputLanguage') &&
    has('src/features/health-agent/services/contextManager.ts', 'detectInputLanguage') &&
    has('src/services/agent/agentIntentRouter.ts', 'detectInputLanguage'),
  'the assistant must not keep divergent language heuristics'
);
check(
  'step30: the assistant auto-detects the user language (no manual selection required)',
  has('src/features/health-agent/hooks/useAgentConversation.ts', 'response.language') &&
    has('src/features/health-agent/services/ai/aiEngine.ts', 'detectLanguage(input.text)'),
  'the detected language must be adopted by the conversation'
);
check(
  'step30: emergency red flags are multilingual and context-aware',
  has('src/features/health-agent/services/ai/redFlags.ts', 'EMERGENCY_GROUPS') &&
    has('src/features/health-agent/services/ai/redFlags.ts', 'NEGATION_AFTER') &&
    has('src/features/health-agent/services/ai/redFlags.ts', 'EDUCATIONAL_MARKERS') &&
    has('src/features/health-agent/services/ai/safetyLayer.ts', 'assessRedFlags'),
  'a bare keyword match would miss localised reports and over-trigger on questions'
);
check(
  'step30: the emergency intent cannot bypass the context-aware assessor',
  has('src/features/health-agent/services/adapters/mockAdapters.ts', 'assessRedFlags(input)') &&
    has('src/features/health-agent/services/adapters/mockAdapters.ts', 'const EMERGENCY_PATTERNS: string[] = []'),
  'a keyword shortcut would misroute educational questions to the emergency path'
);
check(
  'step30: safety-critical copy is localized and available without the AI provider',
  has('src/features/health-agent/services/ai/messages.ts', 'EMERGENCY_GO_NOW') &&
    has('src/features/health-agent/services/ai/messages.ts', 'MEDICATION_CONSULT_NOTICE') &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'localized(EMERGENCY_GO_NOW') &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'localized(MEDICATION_CONSULT_NOTICE'),
  'emergency guidance must not depend on a model being reachable'
);
check(
  'step30: the AI gateway accepts every supported language and re-derives script server-side',
  has('supabase/functions/ai-gateway/logic.ts', 'SUPPORTED_GATEWAY_LANGUAGES') &&
    has('supabase/functions/ai-gateway/logic.ts', 'detectScriptLanguage') &&
    has('supabase/functions/ai-gateway/index.ts', 'detectScriptLanguage(payload.input)'),
  'the client language value must not be trusted over the typed script'
);
check(
  'step30: the AI gateway system prompt is language-aware',
  has('supabase/functions/ai-gateway/index.ts', 'TARGET LANGUAGE') &&
    has('supabase/functions/ai-gateway/index.ts', 'code-switching'),
  'the model must be told to answer in the user language and style'
);
check(
  'step30: hospital search covers name, city, district, PIN code, type and ownership',
  has('src/services/hospitalDirectorySearch.ts', 'hospital.district') &&
    has('src/services/hospitalDirectorySearch.ts', 'hospital.pincode') &&
    has('src/services/hospitalDirectorySearch.ts', 'hospital.category_label') &&
    has('src/services/hospitalDirectorySearch.ts', 'hospital.ownership') &&
    has('src/services/hospitalDirectorySearch.ts', 'matchesPincode'),
  'a single search value must be enough'
);
check(
  'step30: search does not match generated description/source noise',
  has('src/services/hospitalDirectorySearch.ts', 'source_label` is deliberately EXCLUDED') ||
    has('src/services/hospitalDirectorySearch.ts', 'deliberately EXCLUDED'),
  'a generated description names both anchor cities and would match everything'
);
check(
  'step30: an empty hospital search returns the whole eligible directory',
  has('src/services/hospitalService.ts', 'isEligibleForDirectory') &&
    has('src/services/hospitalDirectorySearch.ts', 'isEligibleForDirectory'),
  'a blank search must not be silently limited to a small sample'
);
check(
  'step30: the hospital filter UI exposes district and PIN code',
  has('src/pages/Hospitals/components/FilterBar.tsx', 'PIN code') &&
    has('src/pages/Hospitals/components/FilterBar.tsx', "updateFilter('district'") &&
    has('src/pages/Hospitals/hooks/useHospitals.ts', 'district: filters.district'),
  'the new search fields must be reachable from the UI'
);
check(
  'step30: government ownership is derived from name/type evidence, not the source domain',
  has('scripts/directory/ingest.mjs', 'PUBLIC_NAME_MARKER') &&
    !has('scripts/directory/ingest.mjs', 'source = \'\'') ,
  'a district directory also lists private institutions, so a domain match would mislabel them'
);
check(
  'step30: the importer refuses to silently shrink the directory',
  has('scripts/directory/ingest.mjs', 'REFUSING TO WRITE') &&
    has('scripts/directory/ingest.mjs', '--allow-shrink'),
  'an offline run must never erase real sourced facilities'
);
check(
  'step30: the language vocabulary is enforced at the database boundary',
  has('supabase/migrations/0038_step30_supported_languages.sql', 'conversations_language_check') &&
    has('supabase/migrations/0038_step30_supported_languages.sql', "'en','te','hi','kn','ta','ml','bn','gu','mr','ur'"),
  'a client must not be able to persist an unsupported language code'
);

// --- Step 31: medicine image analysis is a REAL vision path ---
check(
  'medicine-vision: a dedicated vision Edge Function exists',
  existsSync(join(root, 'supabase/functions/medicine-vision/index.ts')) &&
    existsSync(join(root, 'supabase/functions/medicine-vision/logic.ts')),
  'medicine photos must reach a vision-capable model, not the text-only chat gateway'
);
check(
  'medicine-vision: the client calls the vision function with bounded image bytes',
  has('src/features/documents/services/vision/medicineVisionService.ts', "functions.invoke<unknown>('medicine-vision'") &&
    has('src/features/documents/services/vision/medicineVisionService.ts', 'optimizeImageForUpload'),
  'the image must be downscaled before it leaves the browser'
);
check(
  'medicine-vision: the vision payload is schema-validated before use',
  has('src/features/documents/services/vision/medicineVisionService.ts', 'validateVisionRead') &&
    has('supabase/functions/medicine-vision/logic.ts', 'parseVisionCompletion'),
  'an unvalidated provider payload must never become a medicine identity'
);
check(
  'medicine-vision: an unavailable backend yields an honest state, never a demo medicine',
  has('src/features/documents/services/vision/medicineImageIdentification.ts', 'visionUnavailable') &&
    has('src/features/documents/services/vision/medicineImageIdentification.ts', 'isVisionConfigured'),
  'no vision backend must NOT be silently replaced with mock recognition'
);
check(
  'medicine-vision: the vision model id is a server-only secret',
  !has('.env.example', 'VITE_XAI') &&
    has('.env.example', 'XAI_VISION_MODEL'),
  'the vision model/key must never be exposed as a VITE_* variable'
);

// --- Step 31: the composer pipeline is REAL, not an animation ---
check(
  'pipeline: the /ai composer runs the real document pipeline',
  has('src/features/health-agent/hooks/useAgentConversation.ts', 'uploadAndAnalyzeDocument') &&
    !has('src/features/health-agent/hooks/useAgentConversation.ts', 'documentPipelineSteps'),
  'a fake progress animation must never stand in for real analysis'
);
check(
  'pipeline: sendMessage awaits the real analysis before the orchestrator runs',
  has('src/features/health-agent/hooks/useAgentConversation.ts', 'await Promise.all(pending.map'),
  'the orchestrator must not read an un-analysed attachment'
);

// --- Step 31: no fabricated report/medicine content remains ---
check(
  'honesty: the report builder no longer hardcodes lab values',
  !has('src/features/health-agent/services/agentOrchestrator.ts', 'Fasting Blood Sugar') &&
    !has('src/features/health-agent/services/agentOrchestrator.ts', "id: 'report-mock-1'") &&
    has('src/features/health-agent/services/agentOrchestrator.ts', 'secureAnalysis?.labResult'),
  'hardcoded FBS/HbA1c values must not be presented as the user\'s report'
);
check(
  'honesty: the mock medicine source label is gone',
  !has('src/features/health-agent/services/agentOrchestrator.ts', 'medicine knowledge (mock)'),
  'the (mock) source label must be replaced by honest provenance'
);
check(
  'honesty: demo medicine recognition is low-confidence and uncertain',
  has('src/features/health-agent/services/adapters/mockAdapters.ts', 'recognitionConfidence: 0.35') &&
    has('src/features/health-agent/services/adapters/mockAdapters.ts', 'uncertain: true'),
  'a tiny exact-match catalog must never report high-confidence recognition'
);
check(
  'honesty: the legacy /agent report builder no longer hardcodes lab values',
  !has('src/services/agent/mockAgentService.ts', 'REPORT_ATTENTION') &&
    !has('src/services/agent/mockAgentService.ts', 'report-mock-1') &&
    !has('src/services/agent/mockAgentService.ts', 'Mock interpretation of your uploaded report'),
  'the legacy command center must not present fabricated report values'
);
check(
  'honesty: the legacy /agent medicine builder never substitutes an unnamed medicine',
  has('src/services/agent/mockAgentService.ts', 'Medicine not confidently identified') &&
    !has('src/services/agent/mockAgentService.ts', "rawInput: 'paracetamol'"),
  'a medicine the user never named must not be invented'
);

console.log(`\nCareLink wiring audit — ${checks.length} checks`);
for (const c of checks) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
}
if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll wiring checks passed.');
