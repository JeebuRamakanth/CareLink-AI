/**
 * Bounded, redacted context snapshots (Step 13 §5, §6, §21).
 *
 * The AI receives only the MINIMUM necessary authorized context — never the
 * complete medical history, never raw profile ids, never document contents,
 * never another family member's data.
 *
 * - Profile identity is reduced to its RELATION (self/parent/child/…) plus an
 *   age band; names and ids stay client-side.
 * - Conversation history is capped (last N turns, truncated content); older
 *   turns collapse into the rolling ContextManager summary.
 * - Conditions/specialties/medicines come only from the CURRENT profile's
 *   conversation context (family isolation is preserved by construction —
 *   the snapshot is built from the active profile's context only).
 */

import type {
  AgentMessage,
  ConversationContext,
  PatientContext,
} from '../../types';
import type { AIContextSnapshot } from './aiTypes';

const MAX_TURNS = 6;
const MAX_TURN_CHARS = 280;
const MAX_TAGS = 6;

const ageBandFor = (relation: string): 'child' | 'adult' | 'elder' => {
  if (relation === 'child') return 'child';
  if (relation === 'parent') return 'elder';
  return 'adult';
};

/** Build the redacted snapshot for one AI turn. */
export function buildContextSnapshot(
  conversation: ConversationContext,
  patient: PatientContext,
  language: AIContextSnapshot['language']
): AIContextSnapshot {
  return {
    profileRelation: patient.profile.relation,
    ageBand: ageBandFor(patient.profile.relation),
    conditions: conversation.conditions.slice(0, MAX_TAGS),
    specialties: conversation.specialties.slice(0, MAX_TAGS),
    medicines: conversation.medicines.slice(0, MAX_TAGS),
    recentIntents: conversation.recentIntents.slice(0, 5),
    summary: conversation.summary.slice(0, 240),
    language,
  };
}

export interface BoundedTurn {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Bound the conversation history for the gateway: last N turns, truncated,
 * text only (documents are sent as metadata refs, never inline content).
 */
export function boundHistory(history: AgentMessage[] | undefined): BoundedTurn[] {
  if (!history || history.length === 0) return [];
  return history
    .filter((m) => m.id !== 'welcome' && typeof m.content === 'string' && m.content.trim().length > 0)
    .slice(-MAX_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_TURN_CHARS) }));
}
