/**
 * CareLink-AI — development-only authentication test mode (Phase 9).
 *
 * Lets a developer sign in with simple, well-known credentials (e.g. abcd / 1234)
 * WITHOUT weakening production security. It is deliberately hard to enable:
 *
 *   1. `env.devTestAuth.enabled` is TRUE only when BOTH hold:
 *        - the bundle was built in DEV mode (`import.meta.env.DEV === true`), and
 *        - the operator opted in with `VITE_ENABLE_DEV_TEST_AUTH=true`.
 *      A production build sets DEV === false, so this is dead code in prod.
 *   2. It is a BUILD-TIME flag — a browser-supplied flag/URL param cannot turn
 *      it on.
 *
 * The test identities are SYNTHETIC: they map to no real patient, doctor, or
 * administrator account, carry NO roles/permissions (so they can never inherit
 * admin or super-admin), and are filtered by id in the authorization layer.
 * Real logins continue to ride the Supabase Auth flow untouched.
 */

import { env } from '../../config';
import type { CareLinkUser } from './authService';

interface DevTestAccount {
  /** Accepted login identifiers (lower-cased). */
  aliases: string[];
  password: string;
  user: CareLinkUser;
}

/**
 * Dedicated, non-production test identities. Role/permission arrays are empty
 * on purpose: a test login must never be able to reach admin surfaces.
 */
const DEV_TEST_ACCOUNTS: DevTestAccount[] = [
  {
    aliases: ['abcd', 'devtest.user@carelink.local'],
    password: '1234',
    user: {
      id: '00000000-0000-4000-8000-00000000abcd',
      email: 'devtest.user@carelink.local',
      displayName: 'Dev Test User (local)',
      source: 'dev-test',
      accountStatus: 'active',
      roles: [],
      permissions: [],
    },
  },
];

/** True only when a DEV build plus the explicit opt-in are both present. */
export function isDevTestAuthEnabled(): boolean {
  return env.devTestAuth.enabled;
}

/**
 * Authenticate against the isolated dev-test identities. Returns a synthetic
 * user (no real privileges) or null. Never throws.
 */
export function authenticateDevTestUser(identifier: string, password: string): CareLinkUser | null {
  if (!isDevTestAuthEnabled()) return null;
  const id = identifier.trim().toLowerCase();
  const account = DEV_TEST_ACCOUNTS.find((a) => a.aliases.includes(id));
  if (!account || account.password !== password) return null;
  return { ...account.user };
}
