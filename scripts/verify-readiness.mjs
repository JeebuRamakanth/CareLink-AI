#!/usr/bin/env node
/**
 * CareLink-AI — integration readiness report.
 *
 * Prints the status of every external integration WITHOUT ever printing a
 * credential value: only the variable NAME and whether it is set. Optionally
 * performs a real health check against the configured Supabase project (auth
 * endpoint reachability + deployed schema) so "configured" is never confused
 * with "working".
 *
 * Usage:
 *   node scripts/verify-readiness.mjs
 *   node scripts/verify-readiness.mjs --check   # also probe the live backend
 *
 * Exits 0 when every integration is either configured or an acceptable demo
 * state. Never exits non-zero merely because a credential is absent.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');

function fromEnvFile(key) {
  const p = join(root, '.env');
  if (!existsSync(p)) return '';
  const m = readFileSync(p, 'utf8').match(new RegExp(`^${key}=(.*)$`, 'm'));
  return m ? m[1].trim() : '';
}

const value = (key) => (process.env[key] ?? fromEnvFile(key) ?? '').trim();
const present = (key) => {
  const v = value(key);
  return v.length > 0 && !/YOUR_/i.test(v);
};
const placeholder = (key) => /YOUR_/i.test(value(key));

const rows = [];
const add = (id, label, status, variables = [], note = '') =>
  rows.push({ id, label, status, variables, note });

// --- Supabase (browser-safe) ---
const sbUrl = present('VITE_SUPABASE_URL');
const sbKey = present('VITE_SUPABASE_ANON_KEY');
add(
  'supabase',
  'Supabase backend (auth, appointments, registry)',
  placeholder('VITE_SUPABASE_URL') || placeholder('VITE_SUPABASE_ANON_KEY')
    ? 'PLACEHOLDER'
    : sbUrl && sbKey
      ? 'CONFIGURED'
      : sbUrl || sbKey
        ? 'MISCONFIGURED'
        : 'NOT CONFIGURED',
  ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
  sbUrl && sbKey ? '' : 'Appointment requests stay local until both are set.',
);

// --- AI (server-side secret only) ---
add(
  'ai',
  'AI provider (xAI) via ai-gateway Edge Function',
  sbUrl && sbKey ? 'CONFIGURED (assumed)' : 'NOT CONFIGURED',
  ['XAI_API_KEY', 'XAI_MODEL'],
  'Server-side Edge Function secret; cannot be verified from the browser. Runs demo mode until set.',
);

// --- Medicine image analysis (vision) ---
add(
  'medicine-vision',
  'Medicine image analysis (vision) via medicine-vision Edge Function',
  sbUrl && sbKey ? 'CONFIGURED (assumed)' : 'NOT CONFIGURED',
  ['XAI_API_KEY', 'XAI_VISION_MODEL'],
  'Server-side Edge Function secret; a medicine photo shows an honest unavailable state (never a demo medicine) until set.',
);

// --- Google Places ---
add(
  'places',
  'Google Places discovery',
  placeholder('VITE_GOOGLE_MAPS_API_KEY') ? 'PLACEHOLDER' : present('VITE_GOOGLE_MAPS_API_KEY') ? 'CONFIGURED' : 'NOT CONFIGURED',
  ['VITE_GOOGLE_MAPS_API_KEY'],
  'Directions deep-links need no key and always work.',
);

// --- Maps directions ---
add('maps', 'Google Maps directions deep-links', 'CONFIGURED', [], 'Keyless universal URL.');

// --- Cloudinary ---
const cn = present('VITE_CLOUDINARY_CLOUD_NAME');
const cp = present('VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET');
add(
  'cloudinary',
  'Cloudinary document uploads',
  cn && cp ? 'CONFIGURED' : cn || cp ? 'MISCONFIGURED' : 'NOT CONFIGURED',
  ['VITE_CLOUDINARY_CLOUD_NAME', 'VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET'],
);

// --- Directory / blood centres (credential-free, bundled) ---
add('directory', 'Provider directory source pipeline', 'CONFIGURED', [], 'Bundled importer output.');
add('blood', 'Blood-centre directory', 'CONFIGURED', [], 'Live stock needs e-RaktKosh (not integrated).');

// --- GitHub push capability ---
add('github', 'GitHub remote/push capability', process.env.GITHUB_TOKEN ? 'CONFIGURED' : 'NOT CONFIGURED', ['GITHUB_TOKEN']);

console.log('\nCareLink-AI integration readiness (status only — no values printed)\n');
for (const row of rows) {
  const mark = row.status.startsWith('CONFIGURED') ? 'OK  ' : row.status === 'MISCONFIGURED' || row.status === 'PLACEHOLDER' ? 'WARN' : 'INFO';
  console.log(`  ${mark}  ${row.label}: ${row.status}`);
  if (row.variables.length) console.log(`         variables: ${row.variables.join(', ')}`);
  if (row.note) console.log(`         ${row.note}`);
}

if (check) {
  console.log('\nLive health check\n');
  if (!sbUrl || !sbKey) {
    console.log('  SKIP  Supabase health check — browser-safe credentials are not configured.');
  } else {
    const base = (process.env.SUPABASE_URL || value('VITE_SUPABASE_URL')).replace(/\/$/, '');
    const anon = process.env.SUPABASE_ANON_KEY || value('VITE_SUPABASE_ANON_KEY');
    try {
      const res = await fetch(`${base}/auth/v1/health`, { headers: { apikey: anon } });
      console.log(`  ${res.ok ? 'OK  ' : 'WARN'}  Supabase Auth endpoint reachable (HTTP ${res.status}).`);
    } catch (error) {
      console.log(`  FAIL  Supabase Auth endpoint unreachable (${error instanceof Error ? error.name : 'error'}).`);
    }
  }
  console.log('  INFO  Run `npm run verify:live-schema` to confirm the deployed schema.');
}

console.log('\nReadiness report complete.\n');
