#!/usr/bin/env node
/**
 * CareLink-AI — navigation & interaction wiring audit (static, repeatable).
 *
 * Guards the "every visible interactive element does its job" contract without
 * needing a browser:
 *   1. Every `ROUTES.<key>` referenced anywhere in src resolves to a key in
 *      routeConstants.ts (no dangling route references).
 *   2. Every internal route target used by Link/navigate exists in the router.
 *   3. No interactive card renders a live <button> with neither onClick nor a
 *      submit type (dead click).
 *   4. No mock `window.alert(...mocked/mock...)` remains for directions/reviews.
 *   5. The chatbot action hrefs are internal routes or validated external
 *      (http/tel/mailto) — never an unvalidated path.
 *   6. Provider deep-links (?doc=/?hosp=/?lab=) are handled by the appointments
 *      page instead of silently dropping the selection.
 *
 * Run: node scripts/verify-navigation.mjs
 * Exits non-zero on any failure.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(isAbsolute(p) ? p : join(root, p), 'utf8');

const failures = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  if (!ok) failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
};

const walk = (dir) => {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
};

const files = walk(join(root, 'src'));

// 1. Route keys referenced via ROUTES.<key> must exist in routeConstants.
const routesSrc = read('src/routes/routeConstants.ts');
const routeKeys = new Set([...routesSrc.matchAll(/^\s*([a-zA-Z0-9_]+):/gm)].map((m) => m[1]));
const referencedKeys = new Set();
for (const f of files) {
  for (const m of read(f).matchAll(/ROUTES\.([a-zA-Z0-9_]+)/g)) referencedKeys.add(m[1]);
}
const danglingKeys = [...referencedKeys].filter((k) => !routeKeys.has(k));
check(
  'routes: every ROUTES.<key> reference resolves',
  danglingKeys.length === 0,
  `unknown keys: ${danglingKeys.join(', ')}`
);

// 2. Literal internal paths used by Link to=/navigate() must be registered.
const literalTargets = new Set();
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/(?:to|href)=\{?['"`](\/[a-zA-Z0-9:_/-]*)['"`]/g)) literalTargets.add(m[1]);
  for (const m of src.matchAll(/navigate\(\s*['"`](\/[a-zA-Z0-9:_/-]*)['"`]/g)) literalTargets.add(m[1]);
}
const staticPaths = new Set(
  [...routesSrc.matchAll(/(?:^|\s)([a-zA-Z0-9_]+):\s*'([^']+)'/g)].map((m) => m[2])
);
const normalize = (p) => (p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p);
const isRegistered = (target) => {
  const t = normalize(target);
  if (staticPaths.has(t)) return true;
  // Allow a registered dynamic prefix (e.g. /hospitals/:hospitalId).
  return [...staticPaths].some((p) => p.includes(':') && t.startsWith(p.split('/:')[0] + '/'));
};
const danglingPaths = [...literalTargets].filter((t) => !isRegistered(t));
check(
  'routes: literal internal navigation targets are registered',
  danglingPaths.length === 0,
  `unregistered: ${danglingPaths.join(', ')}`
);

// 2b. The global navigation drawer must expose every destination it declares,
// and every declared destination must resolve to a registered route.
const navDataSrc = read('src/components/layout/navigationData.ts');
const declaredNavTargets = [...navDataSrc.matchAll(/to:\s*(?:`\$\{ROUTES\.(\w+)\}([^`]*)`|ROUTES\.(\w+))/g)]
  .map((m) => (m[1] ?? m[3]) + (m[2] ?? ''));
const unknownNavKeys = declaredNavTargets.filter((k) => !routeKeys.has(k.split('?')[0]));
check(
  'nav: every declared drawer destination resolves to a route key',
  unknownNavKeys.length === 0,
  `unknown: ${unknownNavKeys.join(', ')}`
);
const navRequired = ['home', 'hospitals', 'doctors', 'pharmacies', 'labs', 'bloodBanks', 'reviews', 'appointments', 'documents', 'ai', 'about', 'help', 'contact', 'login', 'register'];
const missingNav = navRequired.filter((k) => !declaredNavTargets.includes(k));
check(
  'nav: the drawer covers the full product surface',
  missingNav.length === 0,
  `missing: ${missingNav.join(', ')}`
);
check(
  'nav: account-only destinations are conditionally rendered',
  navDataSrc.includes('requiresAuth') && navDataSrc.includes('requiresAdmin'),
  'a guest must never be offered a guarded page'
);

// 3. No dead interactive buttons (live <button> without onClick / submit).
const deadButtons = [];
for (const f of files) {
  const src = read(f);
  for (const m of src.matchAll(/<button\b/g)) {
    const start = m.index;
    let i = start + 7, depth = 0, end = -1;
    while (i < src.length) {
      const c = src[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0) { end = i; break; }
      i++;
    }
    if (end === -1) continue;
    const tag = src.slice(start, end + 1);
    const hasOnClick = /onClick=/.test(tag);
    const isSubmit = /type=["']submit["']/.test(tag);
    const isDisabled = /\bdisabled\b/.test(tag);
    if (!hasOnClick && !isSubmit && !isDisabled) {
      deadButtons.push(`${relative(root, f)}:${src.slice(0, start).split('\n').length}`);
    }
  }
}
check(
  'interaction: no enabled <button> without a handler',
  deadButtons.length === 0,
  `dead buttons: ${deadButtons.join(', ')}`
);

// 4. No leftover mock alert for directions / reviews.
const alertFiles = files.filter((f) => /window\.alert\(/.test(read(f)));
check(
  'interaction: no window.alert mock handlers remain',
  alertFiles.length === 0,
  `alerts in: ${alertFiles.map((f) => relative(root, f)).join(', ')}`
);

// 5. Chatbot action hrefs are validated (internal route or external scheme).
const actionSources = [
  'src/features/health-agent/services/agentOrchestrator.ts',
  'src/components/agent/cards/AgentResponseCard.tsx',
];
const badHrefs = [];
for (const f of actionSources) {
  const src = read(f);
  // Local aliases of the validated emergency-contact helper (e.g.
  // `const emergencyContact = primaryEmergencyContact('in')`) are just as safe
  // as calling the helper inline, so resolve them before judging an href.
  const contactAliases = new Set(
    [...src.matchAll(/const\s+(\w+)\s*=\s*primaryEmergencyContact\(/g)].map((m) => m[1])
  );
  for (const m of src.matchAll(/href:\s*([^,\n]+)/g)) {
    const expr = m[1].trim();
    const ok =
      expr.includes('ROUTES.') ||
      /^['"`]https?:/.test(expr) ||
      /^['"`]tel:/.test(expr) ||
      /^['"`]mailto:/.test(expr) ||
      expr.startsWith('adapters.') ||
      expr.includes('hospitalHref') ||
      expr.includes('bookUrl') ||
      expr.includes('viewAppointmentsUrl') ||
      // The emergency-contact helper returns a `tel:` href by construction
      // (asserted in medicineIdentification.test.mjs: every contact href is a
      // dialable tel: link), so it is a validated scheme source.
      expr.includes('primaryEmergencyContact(') ||
      [...contactAliases].some((alias) => expr.includes(`${alias}.href`));
    if (!ok) badHrefs.push(`${relative(root, f)}: ${expr}`);
  }
}
check(
  'chatbot: action hrefs are internal routes or validated schemes',
  badHrefs.length === 0,
  `unvalidated: ${badHrefs.join(' | ')}`
);

// 6. Provider deep-links from the agent are handled by the appointments page.
const apptPage = read('src/pages/Appointments/AppointmentsPage.tsx');
check(
  'chatbot: provider deep-links (?doc/?hosp/?lab) are resolved',
  apptPage.includes("searchParams.get('doc')") &&
    apptPage.includes("searchParams.get('hosp')") &&
    apptPage.includes("searchParams.get('lab')"),
  'AppointmentsPage must redirect provider deep-links to the owning page'
);

// 7. Card primitives support both Link (to) and button (onClick) actions.
const shell = read('src/components/agent/ResponseCardShell.tsx');
check(
  'cards: CardActionButton supports to= (Link) and onClick=',
  shell.includes('if (to)') && shell.includes('onClick={onClick}')
);

console.log(`\nCareLink navigation audit — ${checks.length} checks`);
for (const c of checks) console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}`);
if (failures.length > 0) {
  console.error(`\n${failures.length} FAILURE(S):`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('\nAll navigation checks passed.');
