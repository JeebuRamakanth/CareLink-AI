/**
 * Pending handoff store — bridges the Home hero to the dedicated /ai chat page.
 *
 * When a user presses SEND in the Home hero, the hero can't run a multi-turn
 * conversation inline (that lives at /ai). Instead it writes the pending prompt
 * + documents here and navigates to /ai, which drains the handoff on mount.
 *
 * Module-level (not React state) so it survives the route transition without
 * serializing File objects through router state. Object URLs persist for the
 * page session, so document previews remain valid after navigation.
 *
 * One-shot: drained exactly once, then cleared.
 */

import type { HealthDocument } from '../types';

export interface PendingHandoff {
  text: string;
  documents: HealthDocument[];
  /** Marks the handoff as already consumed so it isn't replayed on remount. */
  consumed?: boolean;
  /** Monotonic token to detect a fresh handoff across StrictMode double-mounts. */
  token: number;
}

let pending: PendingHandoff | null = null;
let tokenCounter = 0;

/** Write a pending prompt + documents before navigating to /ai. */
export function setPendingHandoff(text: string, documents: HealthDocument[]): void {
  tokenCounter += 1;
  pending = { text, documents, token: tokenCounter };
}

/** True if there's an unconsumed handoff waiting for the /ai page. */
export function hasPendingHandoff(): boolean {
  return Boolean(pending && !pending.consumed && pending.text.trim());
}

/**
 * Read and consume the pending handoff. Returns null if none/empty/already
 * consumed. The /ai page calls this once on mount to seed its first turn.
 */
export function drainPendingHandoff(): PendingHandoff | null {
  if (!pending || pending.consumed || !pending.text.trim()) return null;
  const handoff = pending;
  pending = { ...pending, consumed: true };
  return handoff;
}

/** Clear any pending handoff (e.g. on explicit "new conversation"). */
export function clearPendingHandoff(): void {
  pending = null;
}
