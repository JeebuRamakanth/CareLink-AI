/**
 * AI engine types (Step 13).
 *
 * The canonical request/response contract between the React client and the
 * secure AI gateway (Supabase Edge Function / API gateway). The gateway — never
 * the browser — holds the provider API key.
 *
 * CHANNEL SEPARATION (prompt-injection defense, §18): every payload field is
 * explicitly channelled. Document text and user text are DATA channels; they
 * can never be interpreted as system/developer instructions by the gateway.
 */

import type {
  AgentIntent,
  AgentLanguage,
  ConfidenceLevel,
  SafetyLevel,
  UrgencyLevel,
} from '../../types';

/** Instruction vs data channels — enforced by the gateway, mirrored here. */
export type AIChannel = 'system' | 'developer' | 'user' | 'document' | 'tool-result';

export interface AIChannelMessage {
  channel: AIChannel;
  content: string;
}

/** Bounded, redacted patient/conversation context (see contextSnapshot.ts). */
export interface AIContextSnapshot {
  /** Family relation only (self/parent/child/…) — never a name or raw id. */
  profileRelation: string;
  /** Age-band hint for pediatric/elder phrasing, when known. */
  ageBand?: 'child' | 'adult' | 'elder';
  conditions: string[];
  specialties: string[];
  medicines: string[];
  recentIntents: AgentIntent[];
  /** One-line rolling summary of older turns (bounded). */
  summary: string;
  language: AgentLanguage;
}

/** Metadata-only attachment descriptor — file bytes never inline in chat. */
export interface AIAttachmentRef {
  documentId: string;
  kind: string;
  fileName: string;
  mime: string;
  /** Structured extraction already produced by the document pipeline. */
  extraction?: {
    category: string;
    keyFindings: string[];
    isMock: boolean;
  };
}

export interface AIChatRequest {
  /** Protocol version so the gateway can evolve safely. */
  version: 1;
  /** Bounded recent turns (roles + truncated content, oldest-first). */
  messages: { role: 'user' | 'assistant'; content: string }[];
  /** Current user message. */
  input: string;
  language: AgentLanguage;
  context: AIContextSnapshot;
  attachments: AIAttachmentRef[];
  /** Allowlisted action types the AI may suggest (never execute). */
  allowedActions: string[];
  /** Client-generated id for tracing (no PII). */
  requestId: string;
}

/** The structured output the gateway must return (schema-validated, §2). */
export interface AIChatResponse {
  summary: string;
  intent: AgentIntent;
  confidence: ConfidenceLevel;
  urgency: UrgencyLevel;
  safetyLevel: SafetyLevel;
  explanation: string;
  nextActions: string[];
  followUpQuestions: string[];
  warnings: string[];
  entities: string[];
  language: AgentLanguage;
  /** Provenance: provider name + mock/live + timestamp. */
  source: { provider: string; mode: 'real' | 'mock'; fetchedAt: string };
}

/** Discriminated result so callers can distinguish validated vs fallback. */
export type AIEngineOutcome =
  | { kind: 'validated'; response: AIChatResponse }
  | { kind: 'unavailable'; reason: string };
