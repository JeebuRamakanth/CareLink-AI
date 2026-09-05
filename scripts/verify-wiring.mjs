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

import { readFileSync } from 'node:fs';
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
  has('src/services/auth/authorization.ts', "adminLoginEventFor") &&
    has('src/services/auth/authorization.ts', "recordActivity('admin_access_denied'"),
  'adminLoginEventFor + admin_access_denied missing'
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
  hospPage.includes('<ReviewComposer target={{ kind: \'hospital\', id: hospital.id }}'),
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
