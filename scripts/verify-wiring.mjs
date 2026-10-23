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
    has('src/services/hospitalService.ts', 'discoverMachilipatnamHospitals') &&
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
