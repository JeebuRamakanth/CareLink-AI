/**
 * CareLink-AI — pending profile save (email-confirmation aware registration).
 *
 * When a real Supabase project requires email confirmation, the auth session
 * only becomes active after the user confirms. We never claim the profile was
 * saved while the session is unavailable; instead Registration stores the
 * user-entered profile fields here (sessionStorage, cleared on successful
 * drain or explicit cancel) and AuthContext drains them as soon as the session
 * appears — so no submitted field is silently discarded.
 *
 * No secrets are stored: only non-sensitive profile fields the user entered.
 */

const PENDING_KEY = 'carelink_ai_pending_profile_save';

export interface PendingProfileSave {
  updatedAt: string;
  profile?: {
    display_name?: string | null;
    emergency_contact_phone?: string | null;
    location_preference?: string | null;
  };
  family?: {
    relation: 'self' | 'parent' | 'child' | 'spouse' | 'other';
    label: string;
  } | null;
}

export function readPendingProfileSave(): PendingProfileSave | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    return raw ? (JSON.parse(raw) as PendingProfileSave) : null;
  } catch {
    return null;
  }
}

export function writePendingProfileSave(save: PendingProfileSave): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(PENDING_KEY, JSON.stringify(save));
  } catch {
    // sessionStorage unavailable — the user sees an honest "could not save yet"
  }
}

export function clearPendingProfileSave(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // ignore
  }
}