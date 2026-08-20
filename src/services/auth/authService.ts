/**
 * CareLink-AI — authentication service (Step 10).
 *
 * Boundary between the UI and the auth provider. Uses real Supabase Auth when
 * configured; falls back to a deterministic LOCAL mock auth when Supabase is not
 * configured so the auth UX, protected routes, and profile flows can be
 * exercised in development without credentials.
 *
 * SECURITY:
 * - Never trusts a client-provided user id. The authenticated user id always
 *   comes from the provider's verified session (Supabase) or, in mock mode,
 *   from a locally-generated id that the same user controlled.
 * - Never logs passwords, tokens, or session secrets. Uses `safeLog`.
 * - Safe, generic error messages surfaced to the UI.
 */

import { env } from '../../config';
import { log } from '../../lib/security';
import { getSupabaseClient, isSupabaseConfigured } from '../supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface CareLinkUser {
  id: string;
  email: string;
  /** Display name from profile if available. */
  displayName?: string;
  /** Whether this session came from a real provider or local mock mode. */
  source: 'supabase' | 'mock';
}

export interface AuthSession {
  user: CareLinkUser | null;
  source: 'supabase' | 'mock' | 'none';
}

export interface AuthResult {
  user: CareLinkUser;
}

export interface AuthError {
  message: string;
  /** Stable code so the UI can map to a friendly state. */
  code: 'invalid-credentials' | 'email-in-use' | 'rate-limit' | 'network' | 'weak-password' | 'unknown';
}

const MOCK_USER_KEY = 'carelink_ai_mock_auth_user';
const MOCK_PASSWORDS_KEY = 'carelink_ai_mock_auth_passwords';

const safeError = (message: string, code: AuthError['code'] = 'unknown'): AuthError => ({ message, code });

/**
 * Sign up a new user. In mock mode, registers the email locally.
 */
export async function signUp(email: string, password: string): Promise<{ result?: AuthResult; error?: AuthError }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return { error: safeError('Please enter a valid email address.', 'invalid-credentials') };
  if (!isStrongPassword(password)) return { error: safeError('Password should be at least 8 characters.', 'weak-password') };

  if (!isSupabaseConfigured()) {
    const existing = readMockUsers();
    if (existing[cleanEmail]) return { error: safeError('An account with this email already exists.', 'email-in-use') };
    const user: CareLinkUser = { id: createMockId(), email: cleanEmail, source: 'mock' };
    existing[cleanEmail] = { password: await hashMockPassword(password), user };
    writeMockUsers(existing);
    persistMockSession(user);
    log.info( 'auth', 'mock signup', { email: cleanEmail });
    return { result: { user } };
  }

  const client = await getSupabaseClient();
  if (!client) return { error: safeError('Service is temporarily unavailable. Please try again.', 'network') };
  const { data, error } = await client.auth.signUp({ email: cleanEmail, password });
  if (error) return { error: mapSupabaseError(error) };
  const user = toCareLinkUser(data.user, 'supabase');
  if (user) return { result: { user } };
  return { result: { user: { id: '', email: cleanEmail, source: 'supabase' } } };
}

/**
 * Sign in an existing user.
 */
export async function signIn(email: string, password: string): Promise<{ result?: AuthResult; error?: AuthError }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidEmail(cleanEmail) || !password) {
    return { error: safeError('Please check your email and password.', 'invalid-credentials') };
  }

  if (!isSupabaseConfigured()) {
    const users = readMockUsers();
    const record = users[cleanEmail];
    if (!record) {
      return { error: safeError('Invalid email or password.', 'invalid-credentials') };
    }
    const passwordOk = await verifyMockPassword(record, password);
    if (!passwordOk) {
      return { error: safeError('Invalid email or password.', 'invalid-credentials') };
    }
    persistMockSession(record.user);
    log.info( 'auth', 'mock signin', { email: cleanEmail });
    return { result: { user: record.user } };
  }

  const client = await getSupabaseClient();
  if (!client) return { error: safeError('Service is temporarily unavailable. Please try again.', 'network') };
  const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password });
  if (error) return { error: mapSupabaseError(error) };
  const user = toCareLinkUser(data.user, 'supabase');
  if (!user) return { error: safeError('Sign-in failed. Please try again.', 'unknown') };
  return { result: { user } };
}

/** Sign out the current user (real + mock). */
export async function signOut(): Promise<void> {
  if (isSupabaseConfigured()) {
    const client = await getSupabaseClient();
    if (client) {
      try {
        await client.auth.signOut();
      } catch (err) {
        log.warn( 'auth', 'signout error', err);
      }
    }
  }
  clearMockSession();
}

/**
 * Restore an existing session. Returns the current user or null. In mock mode,
 * reads the locally persisted session. In Supabase mode, refreshes the session
 * from the provider.
 */
export async function restoreSession(): Promise<AuthSession> {
  if (!isSupabaseConfigured()) {
    const user = readMockSession();
    return { user, source: user ? 'mock' : 'none' };
  }

  const client = await getSupabaseClient();
  if (!client) return { user: null, source: 'none' };
  try {
    const { data } = await client.auth.getSession();
    const user = toCareLinkUser(data.session?.user ?? null, 'supabase');
    return { user, source: user ? 'supabase' : 'none' };
  } catch (err) {
    log.warn( 'auth', 'session restore error', err);
    return { user: null, source: 'none' };
  }
}

/** Listen to auth state changes (Supabase only; mock uses storage events). */
export function onAuthStateChange(
  callback: (user: CareLinkUser | null) => void
): () => void {
  if (!isSupabaseConfigured()) {
    if (typeof window === 'undefined') return () => {};
    const handler = (e: StorageEvent) => {
      if (e.key === MOCK_USER_KEY) callback(readMockSession());
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }

  let unsubscribe: (() => void) | undefined;
  getSupabaseClient()
    .then((client: SupabaseClient | null) => {
      if (!client) return;
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        callback(toCareLinkUser(session?.user ?? null, 'supabase'));
      });
      unsubscribe = data.subscription.unsubscribe;
    })
    .catch(() => undefined);
  return () => unsubscribe?.();
}

/** Send a password-reset email (Supabase) or no-op stub (mock). */
export async function requestPasswordReset(email: string): Promise<{ error?: AuthError }> {
  const cleanEmail = email.trim().toLowerCase();
  if (!isValidEmail(cleanEmail)) return { error: safeError('Please enter a valid email address.', 'invalid-credentials') };
  if (!isSupabaseConfigured()) {
    // Mock: pretend success so the UX is exercisable without a backend.
    return {};
  }
  const client = await getSupabaseClient();
  if (!client) return { error: safeError('Service is temporarily unavailable.', 'network') };
  const { error } = await client.auth.resetPasswordForEmail(cleanEmail);
  if (error) return { error: mapSupabaseError(error) };
  return {};
}

function toCareLinkUser(user: { id?: string; email?: string } | null, source: 'supabase' | 'mock'): CareLinkUser | null {
  if (!user || !user.id || !user.email) return null;
  return { id: user.id, email: user.email, source };
}

function mapSupabaseError(error: { message?: string; status?: number }): AuthError {
  const msg = (error.message ?? '').toLowerCase();
  if (msg.includes('rate') || error.status === 429) {
    return safeError('Too many attempts. Please wait a moment and try again.', 'rate-limit');
  }
  if (msg.includes('already') || msg.includes('registered') || msg.includes('exists')) {
    return safeError('An account with this email already exists.', 'email-in-use');
  }
  if (msg.includes('network') || msg.includes('failed to fetch')) {
    return safeError('Network error. Please check your connection.', 'network');
  }
  if (msg.includes('password')) {
    return safeError('Please choose a stronger password.', 'weak-password');
  }
  if (msg.includes('invalid') || msg.includes('credentials')) {
    return safeError('Invalid email or password.', 'invalid-credentials');
  }
  return safeError('Something went wrong. Please try again.', 'unknown');
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isStrongPassword(password: string): boolean {
  return password.length >= 8;
}

// --- Mock (local-development) storage helpers ------------------------------
// These only run when Supabase is NOT configured. Passwords are stored as
// salted SHA-256 hashes — never plaintext — so a localStorage dump does not
// reveal what the user typed (users often reuse real passwords even in demos).

interface MockUserRecord {
  /** Salted hash ("<salt>:<sha256hex>") or legacy plaintext (upgraded on next sign-in). */
  password: string;
  user: CareLinkUser;
}

const MOCK_HASH_PATTERN = /^[a-f0-9]{16}:[a-f0-9]{64}$/;

async function sha256Hex(text: string): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // Non-secure-context fallback (HTTP localhost): FNV-1a style mixing. Weaker
  // than SHA-256 but still avoids plaintext at rest; mock mode only.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < text.length; i += 1) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ text.charCodeAt(text.length - 1 - i), 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`.repeat(4).slice(0, 64);
}

async function hashMockPassword(password: string): Promise<string> {
  const salt = createMockId().replace(/[^a-f0-9]/gi, '').slice(0, 16).padEnd(16, '0');
  return `${salt}:${await sha256Hex(`${salt}:${password}`)}`;
}

async function verifyMockPassword(record: MockUserRecord, password: string): Promise<boolean> {
  if (MOCK_HASH_PATTERN.test(record.password)) {
    const [salt] = record.password.split(':');
    return record.password === `${salt}:${await sha256Hex(`${salt}:${password}`)}`;
  }
  // Legacy plaintext record (pre-Step-14): verify directly, then upgrade to a
  // hash so plaintext does not remain at rest.
  if (record.password === password) {
    record.password = await hashMockPassword(password);
    const users = readMockUsers();
    users[record.user.email] = record;
    writeMockUsers(users);
    return true;
  }
  return false;
}

function readMockUsers(): Record<string, MockUserRecord> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(MOCK_PASSWORDS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, MockUserRecord>) : {};
  } catch {
    return {};
  }
}

function writeMockUsers(users: Record<string, MockUserRecord>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOCK_PASSWORDS_KEY, JSON.stringify(users));
  } catch {
    // ignore
  }
}

function persistMockSession(user: CareLinkUser): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOCK_USER_KEY, JSON.stringify(user));
  } catch {
    // ignore
  }
}

function readMockSession(): CareLinkUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(MOCK_USER_KEY);
    return raw ? (JSON.parse(raw) as CareLinkUser) : null;
  } catch {
    return null;
  }
}

function clearMockSession(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(MOCK_USER_KEY);
  } catch {
    // ignore
  }
}

function createMockId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `mock-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

export const authDebug = { isMockMode: () => env.supabase.configured === false };
