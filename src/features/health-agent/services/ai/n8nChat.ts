/**
 * n8n chat webhook adapter.
 *
 * The operator runs the CareLink assistant workflow on n8n (an AI Agent node
 * with the model, Supabase tools and calculator behind it). This module is the
 * ONLY place the browser talks to that workflow.
 *
 * Contract:
 *   POST <webhook>  { message, user_id, conversation_id, language, history }
 *   → 200 with one of the shapes in `parseN8nReply` (n8n AI Agent returns
 *     `{ output: "..." }`; a structured workflow may return the AIChatResponse
 *     fields directly).
 *
 * Safety/robustness rules enforced here:
 * - Only a genuine `https://` webhook is used. The webhook URL is a bearer
 *   credential, so it lives in `VITE_N8N_WEBHOOK_URL` and is never logged.
 * - Bounded request (history capped, message truncated), 25 s timeout, caller
 *   cancellation, and NO automatic retry (a retry would double-bill the model).
 * - The response is parsed defensively. Anything that cannot be turned into
 *   usable text yields `unavailable` — the caller then falls back honestly
 *   instead of showing a fabricated answer.
 * - `user_id` is the authenticated Supabase user id when available; otherwise a
 *   stable local demo id. No email, name, or medical history is sent.
 */

import { env } from '../../../../config';
import { tryConsumeRateToken } from './aiGateway';
import type { AIChatResponse, AIContextSnapshot } from './aiTypes';
import type { AgentLanguage } from '../../types';

const N8N_TIMEOUT_MS = 25_000;
const MAX_MESSAGE_CHARS = 2000;
const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_CHARS = 280;

export type N8nMode = 'real' | 'unavailable';

/** n8n is used only when an operator supplied a real https webhook URL. */
export function n8nMode(): N8nMode {
  return env.n8n.configured ? 'real' : 'unavailable';
}

export interface N8nChatRequest {
  message: string;
  userId: string;
  conversationId: string;
  language: AgentLanguage;
  history?: { role: 'user' | 'assistant'; content: string }[];
  /** Redacted, minimum-necessary context. Omitted when empty. */
  context?: AIContextSnapshot;
  signal?: AbortSignal;
}

/**
 * The text an n8n workflow contributed, plus any enums it explicitly stated.
 * `intent`/`urgency`/`safetyLevel` stay undefined unless the workflow returned
 * a value that passed strict enum validation — the caller supplies its own
 * safe baseline, so a plain-text workflow can never de-escalate a case.
 */
export interface N8nReply {
  summary: string;
  explanation: string;
  nextActions: string[];
  followUpQuestions: string[];
  warnings: string[];
  language?: AgentLanguage;
  intent?: string;
  urgency?: string;
  safetyLevel?: string;
  confidence?: string;
}

const INTENTS = new Set([
  'symptom', 'disease', 'hospital', 'doctor', 'pharmacy', 'medicine', 'lab',
  'report', 'appointment', 'emergency', 'route', 'recovery', 'vaccination',
  'child-care', 'elder-care', 'mental-health', 'family', 'location', 'general',
]);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const URGENCY = new Set(['routine', 'attention', 'urgent', 'emergency']);
const SAFETY = new Set(['educational', 'possible-concern', 'urgent', 'emergency', 'professional-care']);
const LANGUAGES = new Set(['en', 'te', 'hi', 'kn', 'ta', 'ml', 'bn', 'gu', 'mr', 'ur']);

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** First non-empty string among the candidate keys n8n workflows commonly use. */
function firstText(source: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = str(source[key]);
    if (value) return value;
  }
  return '';
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, 8)
    .map((item) => item.trim().slice(0, 320));
}

/**
 * Normalize whatever the workflow returned into an `N8nReply`.
 *
 * Accepted shapes (checked in order):
 *   1. `[{ output: "..." }]` — n8n often wraps the item in an array
 *   2. `{ output | text | response | answer | message | reply: "..." }`
 *   3. `{ output: { summary, explanation, ... } }` — nested structured item
 *   4. `{ summary, explanation, ... }` — the AIChatResponse fields directly
 *   5. a bare JSON string containing any of the above
 *
 * Returns null when no usable text can be found, so the caller degrades to the
 * honest fallback rather than rendering an empty or invented answer.
 */
export function parseN8nReply(raw: unknown): N8nReply | null {
  let candidate: unknown = raw;

  // A workflow may return the JSON body as a string.
  if (typeof candidate === 'string') {
    const text = candidate.trim();
    if (!text) return null;
    try {
      candidate = JSON.parse(text);
    } catch {
      return { summary: text.slice(0, 400), explanation: text.slice(0, 2000), nextActions: [], followUpQuestions: [], warnings: [] };
    }
  }

  // n8n wraps single-item results in an array.
  if (Array.isArray(candidate)) {
    for (const item of candidate) {
      const parsed = parseN8nReply(item);
      if (parsed) return parsed;
    }
    return null;
  }

  if (!isRecord(candidate)) return null;

  // Unwrap common envelopes: { data: {...} }, { json: {...} }, { body: {...} }
  for (const key of ['data', 'json', 'body', 'result']) {
    const nested = candidate[key];
    if (isRecord(nested) && (str(nested.summary) || str(nested.explanation) || str(nested.output))) {
      return parseN8nReply(nested);
    }
  }

  // Structured payload returned directly on the item.
  const directSummary = str(candidate.summary);
  const directExplanation = str(candidate.explanation);
  const nestedOutput = isRecord(candidate.output) ? candidate.output : null;
  const structured = directSummary || directExplanation ? candidate : nestedOutput;

  if (structured) {
    const summary = str(structured.summary);
    const explanation = str(structured.explanation);
    if (!summary && !explanation) return null;
    const intent = str(structured.intent);
    const urgency = str(structured.urgency);
    const safetyLevel = str(structured.safetyLevel);
    const confidence = str(structured.confidence);
    const language = str(structured.language);
    return {
      summary: (summary || explanation).slice(0, 400),
      explanation: (explanation || summary).slice(0, 2000),
      nextActions: stringList(structured.nextActions ?? structured.next_actions),
      followUpQuestions: stringList(structured.followUpQuestions ?? structured.follow_up_questions),
      warnings: stringList(structured.warnings),
      intent: INTENTS.has(intent) ? intent : undefined,
      urgency: URGENCY.has(urgency) ? urgency : undefined,
      safetyLevel: SAFETY.has(safetyLevel) ? safetyLevel : undefined,
      confidence: CONFIDENCE.has(confidence) ? confidence : undefined,
      language: LANGUAGES.has(language) ? (language as AgentLanguage) : undefined,
    };
  }

  // Plain chat-completion style text (the common AI Agent node output).
  const text = firstText(candidate, ['output', 'text', 'response', 'answer', 'message', 'reply', 'content']);
  if (!text) return null;
  const plain = text.slice(0, 2000);
  return {
    summary: plain.slice(0, 400),
    explanation: plain,
    nextActions: [],
    followUpQuestions: [],
    warnings: [],
  };
}

export type N8nOutcome =
  | { kind: 'validated'; reply: N8nReply }
  | { kind: 'unavailable'; reason: string };

/** Bound the conversation history sent to the workflow. */
function boundHistory(history: N8nChatRequest['history']): { role: string; content: string }[] {
  if (!history?.length) return [];
  return history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim().length > 0)
    .slice(-MAX_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_HISTORY_CHARS) }));
}

/**
 * Call the n8n webhook. Never throws: every failure becomes `unavailable` with
 * a stable reason so the caller can render an honest state.
 */
export async function sendToN8n(request: N8nChatRequest, signal?: AbortSignal): Promise<N8nOutcome> {
  if (!env.n8n.configured) return { kind: 'unavailable', reason: 'no-n8n-configured' };
  // Shared cost-control bucket with the AI gateway — one budget per session.
  if (!tryConsumeRateToken()) return { kind: 'unavailable', reason: 'rate-limit' };

  const payload: Record<string, unknown> = {
    message: request.message.slice(0, MAX_MESSAGE_CHARS),
    user_id: request.userId,
    conversation_id: request.conversationId,
    language: request.language,
    history: boundHistory(request.history),
  };
  if (request.context) payload.context = request.context;

  const controller = new AbortController();
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, N8N_TIMEOUT_MS);

  try {
    const res = await fetch(env.n8n.webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      return { kind: 'unavailable', reason: res.status === 429 ? 'rate-limit' : 'provider-unavailable' };
    }
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { kind: 'unavailable', reason: 'malformed-response' };
    }
    const reply = parseN8nReply(body);
    if (!reply) return { kind: 'unavailable', reason: 'malformed-response' };
    return { kind: 'validated', reply };
  } catch {
    return { kind: 'unavailable', reason: timedOut ? 'timeout' : 'gateway-unreachable' };
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abortFromCaller);
  }
}

/**
 * Compose a schema-valid `AIChatResponse` from an n8n reply.
 *
 * `baseline` is CareLink's own deterministic scaffold for the classified
 * intent (the same one the demo responder uses). The workflow supplies the
 * language; it may only *raise* urgency/safety, never lower it, and its enum
 * values are dropped unless they passed validation in `parseN8nReply`.
 */
export function composeN8nResponse(reply: N8nReply, baseline: AIChatResponse): AIChatResponse {
  const rank: Record<string, number> = {
    educational: 0, 'possible-concern': 1, 'professional-care': 2, urgent: 3, emergency: 4,
  };
  const safetyLevel =
    reply.safetyLevel && rank[reply.safetyLevel] > rank[baseline.safetyLevel]
      ? (reply.safetyLevel as AIChatResponse['safetyLevel'])
      : baseline.safetyLevel;

  const urgencyRank: Record<string, number> = { routine: 0, attention: 1, urgent: 2, emergency: 3 };
  const urgency =
    reply.urgency && urgencyRank[reply.urgency] > urgencyRank[baseline.urgency]
      ? (reply.urgency as AIChatResponse['urgency'])
      : baseline.urgency;

  return {
    ...baseline,
    summary: reply.summary || baseline.summary,
    explanation: reply.explanation || baseline.explanation,
    nextActions: reply.nextActions.length > 0 ? reply.nextActions : baseline.nextActions,
    followUpQuestions: reply.followUpQuestions.length > 0 ? reply.followUpQuestions : baseline.followUpQuestions,
    warnings: [...baseline.warnings, ...reply.warnings],
    intent: (reply.intent as AIChatResponse['intent']) ?? baseline.intent,
    confidence: (reply.confidence as AIChatResponse['confidence']) ?? baseline.confidence,
    urgency,
    safetyLevel,
    language: reply.language ?? baseline.language,
    source: { provider: 'n8n', mode: 'real', fetchedAt: new Date().toISOString() },
  };
}
