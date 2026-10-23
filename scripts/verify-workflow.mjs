#!/usr/bin/env node
/**
 * CareLink-AI — connected healthcare workflow integrity test (Step 22).
 *
 * Static assertions that the hospital → doctor → appointment → My Appointments
 * journey and the chatbot retrieval are wired to REAL data paths and never
 * fabricate a confirmation. Run: node scripts/verify-workflow.mjs
 *
 * Exits non-zero on any failure.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const exists = (rel) => existsSync(join(root, rel));

const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : ` — ${detail}`}`);
};

const MIGRATION = 'supabase/migrations/0033_step22_appointment_request_workflow.sql';
const REQUESTS_REPO = 'src/services/health-data/appointmentRequestsRepository.ts';
const ORCH = 'src/features/health-agent/services/agentOrchestrator.ts';
const BRIDGE = 'src/features/health-agent/services/directoryRecommendations.ts';
const TAXONOMY = 'src/features/health-agent/data/specialtyTaxonomy.ts';
const MODAL = 'src/pages/Doctors/components/DoctorBookingModal.tsx';
const DOCTOR_PAGE = 'src/pages/Doctors/DoctorProfilePage.tsx';
const APPT_CONTEXT = 'src/contexts/AppointmentContext.tsx';
const APPT_PAGE = 'src/pages/Appointments/AppointmentsPage.tsx';

// 1. Migration exists with the request table + guarded RPCs.
if (!exists(MIGRATION)) {
  check('db: appointment-request migration exists', false, MIGRATION);
} else {
  const sql = read(MIGRATION);
  check('db: appointment-request migration exists', true);
  check('db: appointment_requests table defined', /create table if not exists public\.appointment_requests/.test(sql));
  check('db: requests carry a pending status vocabulary', /status in \('pending','confirmed','rejected','cancelled','completed'\)/.test(sql));
  check('db: idempotency unique (owner_id, request_key)', /unique \(owner_id, request_key\)/.test(sql));
  check('db: request RPC validates doctor-hospital affiliation', /doctor_hospitals/.test(sql) && /not affiliated/.test(sql));
  check('db: request RPC rejects past dates', /must be in the future/.test(sql));
  check('db: request RPC is SECURITY DEFINER with pinned search_path', /security definer[\s\S]{0,80}set search_path = ''/.test(sql));
  check('db: confirmation is permission-gated', /carelink_admin_has_permission\('appointments\.manage'\)/.test(sql));
  check('db: RLS enabled on appointment_requests', /alter table public\.appointment_requests enable row level security/.test(sql));
  check('db: owner-scoped select policy present', /appointment_requests_owner_select/.test(sql));
  check('db: provider/staff scoped read policy present', /appointment_requests_provider_select/.test(sql));
  check('db: RPCs revoked from anon/public', /revoke execute on function public\.%s from anon/.test(sql));
  check('db: no automatic confirmation (always inserts pending)', /'pending', key/.test(sql));
}

// 2. Frontend repository uses the RPC, never a direct table write.
const repo = read(REQUESTS_REPO);
check('repo: calls carelink_request_appointment RPC', /rpc\('carelink_request_appointment'/.test(repo));
check('repo: never inserts directly into appointments', !/from\('appointments'\)\s*\.insert/.test(repo));
check('repo: returns unavailable (no throw) without a backend', /status: 'unavailable'/.test(repo));

// 3. Chatbot retrieval uses the real directory bridge.
const orch = read(ORCH);
const bridge = read(BRIDGE);
check('agent: orchestrator uses directory bridge', /directoryHospitals|directoryDoctors/.test(orch));
check('agent: orchestrator no longer slices private mock recommendations', !/hospitalRecommendations\.slice/.test(orch) && !/doctorRecommendations\.slice/.test(orch));
check('agent: bridge reads the real directory services', /getHospitals/.test(bridge) && /getDoctors/.test(bridge));
check('agent: doctor-hospital link uses explicit ids', /hospitalIds/.test(bridge) && /includes\(hospital\.id\)/.test(bridge));
check('agent: distance only when coordinates exist', /distanceAvailable/.test(bridge));
check('agent: specialty taxonomy exists', exists(TAXONOMY));
check('agent: taxonomy equates locale spellings only', /orthopaedics/.test(read(TAXONOMY)) && /pediatrics/.test(read(TAXONOMY)));

// 3b. The legacy /agent command center is also bridged to the real directory.
const legacyBridge = 'src/services/agent/directoryBridge.ts';
const legacyService = 'src/services/agent/mockAgentService.ts';
check('agent: legacy command center bridge exists', exists(legacyBridge));
check('agent: legacy service reads the directory bridge', /getDirectoryHospitals|findDirectoryHospitalsBySpecialty/.test(read(legacyService)));
check('agent: legacy service no longer uses fabricated US hospitals', !/agentHospitalRecommendations|agentDoctorRecommendations/.test(read(legacyService)));

// 4. Booking UI is honest about request vs confirmation.
const modal = read(MODAL);
const doctorPage = read(DOCTOR_PAGE);
check('ui: booking modal distinguishes real slots from a request', /hasRealSlots/.test(modal) && /requestTimeOptions/.test(modal));
check('ui: booking modal disables duplicate submission', /submitting/.test(modal));
check('ui: doctor page submits a real request', /requestAppointment\(/.test(doctorPage));
check('ui: doctor page marks requests isRequest', /isRequest: !confirmed/.test(doctorPage));
check('ui: doctor page never fabricates contact details', !/\+1 \(800\) 555-0199/.test(doctorPage));

// 5. Pending requests are never written into the appointments table.
const apptCtx = read(APPT_CONTEXT);
check('state: pending request is not persisted as an appointment', /if \(appointment\.isRequest\) return;/.test(apptCtx));

// 6. My Appointments reflects backend truth + discloses demo mode.
const apptPage = read(APPT_PAGE);
const apptFilters = read('src/pages/Appointments/components/AppointmentsFilters.tsx');
check('ui: My Appointments has a Pending requests tab', /Pending requests/.test(apptFilters));
check(
  'ui: My Appointments discloses unconfigured backend with setup steps',
  /Appointment requests are not being sent to a facility/.test(apptPage) && /VITE_SUPABASE_URL/.test(apptPage)
);
check(
  'state: persisted pending requests are loaded into the dashboard',
  /listMyAppointmentRequests\(\)/.test(apptCtx) && /rowToRequestAppointment/.test(apptCtx)
);
check(
  'state: cancelling a pending request uses the owner-scoped request RPC',
  /cancelAppointmentRequest\(/.test(apptCtx)
);

// 7. SQL test suite covers the workflow.
check('tests: SQL suite 250 exists', exists('supabase/tests/250_step22_appointment_request.sql'));
const suite = exists('supabase/tests/250_step22_appointment_request.sql') ? read('supabase/tests/250_step22_appointment_request.sql') : '';
check('tests: suite asserts no overbooking on confirmation', /no overbooking/.test(suite));
check('tests: suite asserts IDOR is blocked', /IDOR blocked/.test(suite));

const failed = checks.filter((c) => !c.ok);
console.log('');
if (failed.length > 0) {
  console.log(`CareLink workflow integrity — ${checks.length} checks, ${failed.length} failed`);
  process.exit(1);
}
console.log(`CareLink workflow integrity — ${checks.length} checks, 0 failed.`);
console.log('All workflow integrity checks passed.');
