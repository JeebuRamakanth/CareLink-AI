#!/usr/bin/env node
/**
 * CareLink-AI — LIVE Supabase schema readiness probe.
 *
 * Uses ONLY the browser-safe anon key (never the service_role) to check which
 * CareLink tables + guarded RPCs exist in the live project, so a partial or
 * divergent deployment is reported honestly instead of assumed to work.
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_ANON_KEY=eyJ... \
 *     node scripts/verify-live-schema.mjs
 *
 * Or it reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from .env.
 * Exits non-zero when the schema is not fully deployed.
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function fromEnvFile(key) {
  const p = join(root, '.env');
  if (!existsSync(p)) return '';
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const URL_BASE = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || fromEnvFile('VITE_SUPABASE_URL')).replace(/\/$/, '');
const ANON = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || fromEnvFile('VITE_SUPABASE_ANON_KEY');

if (!URL_BASE || !ANON) {
  console.error('Missing SUPABASE_URL / SUPABASE_ANON_KEY (env or .env).');
  process.exit(2);
}

const headers = { apikey: ANON, Authorization: `Bearer ${ANON}` };

async function tableExists(name) {
  const res = await fetch(`${URL_BASE}/rest/v1/${name}?select=id&limit=1`, { headers });
  if (res.status === 200) return true;
  const body = await res.text();
  // PGRST205 = "table not found in schema cache"
  return !/PGRST205|Could not find the table/i.test(body);
}

async function rpcExists(name, args) {
  const res = await fetch(`${URL_BASE}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(args ?? {}),
  });
  const body = await res.text();
  // PGRST202 = function not found. Anything else (auth error, validation
  // error, 200) means the function EXISTS.
  return !/PGRST202|Could not find the function/i.test(body);
}

// Tables the app's repositories read/write.
const REQUIRED_TABLES = [
  'profiles', 'family_profiles', 'appointments', 'appointment_events',
  'appointment_requests', 'appointment_slots', 'appointment_types',
  'conversations', 'conversation_messages', 'medical_documents',
  'medical_reports', 'medicines', 'health_context', 'notifications',
  'notification_templates', 'reviews', 'review_verification',
  'hospitals', 'doctors', 'pharmacies', 'labs', 'specialties',
  'hospital_specialties', 'doctor_specialties', 'doctor_hospitals',
  'hospital_verification', 'doctor_verification', 'hospital_services',
  'hospital_hours', 'hospital_locations', 'emergency_capabilities',
  'doctor_profiles', 'qualifications', 'consultation_fees',
  'doctor_availability', 'provider_memberships', 'provider_media',
  'roles', 'user_roles', 'permissions', 'role_permissions',
  'audit_events', 'security_activity_events', 'reminders',
  'cancellation_records', 'reschedule_events', 'appointment_status_history',
  'saved_hospitals', 'saved_doctors', 'saved_pharmacies', 'saved_labs',
];

// Guarded RPCs the app calls.
const REQUIRED_RPCS = [
  ['carelink_request_appointment', {
    p_doctor_id: '00000000-0000-0000-0000-000000000000',
    p_hospital_id: '00000000-0000-0000-0000-000000000000',
    p_scheduled_date: '2000-01-01', p_scheduled_time: '00:00',
    p_appointment_type: 'Consultation', p_reason: null,
    p_family_profile_id: null, p_slot_id: null, p_request_key: 'probe',
  }],
  ['carelink_list_my_appointment_requests', {}],
  ['carelink_cancel_appointment_request', { p_request_id: '00000000-0000-0000-0000-000000000000', p_note: null }],
  ['carelink_decide_appointment_request', { p_request_id: '00000000-0000-0000-0000-000000000000', p_decision: 'confirmed', p_note: null }],
  ['carelink_current_user_roles', {}],
  ['carelink_admin_has_permission', { permission_code: 'appointments.manage' }],
];

const results = [];
for (const t of REQUIRED_TABLES) results.push([`table:${t}`, await tableExists(t)]);
for (const [fn, args] of REQUIRED_RPCS) results.push([`rpc:${fn}`, await rpcExists(fn, args)]);

const missing = results.filter(([, ok]) => !ok).map(([n]) => n);
const present = results.filter(([, ok]) => ok).map(([n]) => n);

console.log(`\nCareLink live schema probe — ${URL_BASE}`);
console.log(`  present: ${present.length}/${results.length}`);
for (const n of present) console.log(`  OK      ${n}`);
console.log(`  missing: ${missing.length}`);
for (const n of missing) console.log(`  MISSING ${n}`);

if (missing.length > 0) {
  console.log(`
RESULT: INCOMPLETE — the live schema does not match supabase/migrations.

To deploy, apply the bundle (needs a privileged DB connection, NOT the anon key):
    bash scripts/build-migration-bundle.sh
    # paste supabase/DEPLOY_ALL.sql into Supabase SQL Editor, or:
    psql "$SUPABASE_DB_URL" -f supabase/DEPLOY_ALL.sql
`);
  process.exit(1);
}
console.log('\nRESULT: COMPLETE — every required table and RPC is deployed.\n');
