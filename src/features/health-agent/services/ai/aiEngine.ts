/**
 * AI engine (Step 13) — the single entry point the orchestrator uses for
 * real-AI structured understanding.
 *
 * Pipeline per turn:
 *   user text + attachments
 *   → injection screening (untrusted-data handling)
 *   → bounded/redacted context snapshot (minimum necessary)
 *   → secure gateway (server holds the key) OR mock responder (demo mode)
 *   → schema validation (reject malformed)
 *   → medical safety layer (no diagnosis, escalate-only, leak scrub)
 *   → typed AIChatResponse with mock/live provenance
 *
 * MODES (§26): REAL when a gateway is configured, MOCK otherwise (clearly
 * labelled "CareLink demo response"), UNAVAILABLE surfaced as a safe reason.
 */

import type {
  AgentMessage,
  ConversationContext,
  HealthDocument,
  IntentClassification,
  PatientContext,
  AgentLanguage,
} from '../../types';
import type { AIChatRequest, AIChatResponse, AIEngineOutcome } from './aiTypes';
import { sendToAIGateway, aiGatewayMode } from './aiGateway';
import { sendToN8n, n8nMode, composeN8nResponse } from './n8nChat';
import { buildContextSnapshot, boundHistory } from './contextSnapshot';
import { screenForInjection, detectPrivilegeRequest, privilegeRefusalResponse } from './promptGuards';
import { enforceResponseSafety } from './safetyLayer';
import { mockAIRespond } from './mockAIResponder';
import { detectLanguage, resolveResponseLanguage, type LanguageDetection } from './languageDetector';
import { localized, AI_UNAVAILABLE_NOTICE } from './messages';

export type AIEngineMode = 'real' | 'mock' | 'unavailable' | 'refused';

export interface AIEngineInput {
  text: string;
  documents: HealthDocument[];
  patientContext: PatientContext;
  conversationContext: ConversationContext;
  history?: AgentMessage[];
  /** Language the caller selected; the detector may override it (Phase 2). */
  language: AgentLanguage;
  allowedActions: string[];
  /** Pre-classified intent from the orchestrator's classifier; the mock
   *  responder reuses it so both paths never disagree. */
  classification?: IntentClassification;
  /** Authenticated user id for the n8n workflow (never an email or name). */
  userId?: string;
  /** Stable conversation thread id for the n8n workflow's memory. */
  conversationId?: string;
  signal?: AbortSignal;
}

export interface AIEngineResult {
  mode: AIEngineMode;
  response: AIChatResponse;
  /** True when the safety layer modified the AI output. */
  safetyIntervened: boolean;
  /** True when prompt-injection patterns were detected in the input. */
  injectionFlagged: boolean;
  /** The language detection for this turn (Phase 2). */
  detection: LanguageDetection;
  /** The language the response was produced in (may differ from the input). */
  responseLanguage: AgentLanguage;
}

export function aiEngineMode(): AIEngineMode {
  return aiGatewayMode() === 'real' || n8nMode() === 'real' ? 'real' : 'mock';
}

/** A safe, honest "temporarily unavailable" response for real-mode failures. */
function unavailableResponse(reason: string, language: AgentLanguage = 'en'): AIChatResponse {
  const needsSetup = reason === 'ai-not-configured';
  const needsSignIn = reason === 'unauthorized';
  const rateLimited = reason === 'rate-limit' || reason === 'provider-rate-limit';
  const notice = localized(AI_UNAVAILABLE_NOTICE, language);
  return {
    summary: needsSetup
      ? 'CareLink AI setup is incomplete.'
      : needsSignIn
        ? 'Please sign in to use CareLink AI.'
        : rateLimited
          ? 'Please wait before trying again.'
          : notice,
    intent: 'general',
    confidence: 'low',
    urgency: 'routine',
    safetyLevel: 'educational',
    explanation: needsSetup
      ? 'An administrator must configure the xAI API key and a supported model in the Supabase Edge Function settings. Do not share the key in chat.'
      : needsSignIn
        ? 'Sign in with your Supabase account, then retry. Demo sign-in does not authorize the AI service.'
        : rateLimited
          ? 'The AI service is rate-limiting requests. Wait briefly and retry; no response was fabricated.'
          : notice,
    nextActions: ['Search for a hospital or doctor.', 'View your appointments.', 'Call your local emergency number if you need urgent help.'],
    followUpQuestions: [],
    warnings: [needsSetup ? 'Server-side xAI configuration is required.' : 'CareLink AI is temporarily unavailable.'],
    entities: [],
    language,
    source: { provider: 'CareLink AI', mode: 'unavailable', fetchedAt: new Date().toISOString() },
  };
}

const createRequestId = () => `req-${Math.random().toString(36).slice(2, 10)}`;

const attachmentsFor = (documents: HealthDocument[]): AIChatRequest['attachments'] =>
  documents.slice(0, 4).map((d) => ({
    documentId: d.id,
    kind: d.kind,
    fileName: d.fileName.slice(0, 120),
    mime: d.mime,
    extraction: d.analysis
      ? { category: d.analysis.category, keyFindings: d.analysis.keyFindings.slice(0, 6), isMock: d.analysis.isMock }
      : undefined,
  }));

/**
 * Run one AI turn.
 *
 * Mode contracts (Step 17, no fake success):
 * - REAL: gateway configured AND returned a schema-validated response.
 * - MOCK: no gateway configured at all → the clearly-labelled "CareLink demo
 *         response" powers the demo/evaluation experience.
 * - UNAVAILABLE: a real gateway IS configured but timed out / rate-limited /
 *         malformed → the user sees an honest "temporarily unavailable"
 *         response, NEVER a fabricated AI answer.
 * - REFUSED: the input is a privilege/secret-elevation request → refused
 *         deterministically without spending a single token.
 */
export async function runAITurn(input: AIEngineInput): Promise<AIEngineResult> {
  const screen = screenForInjection(input.text);

  // Phase 2 — detect the language/style the user actually wrote in and resolve
  // the response language. Pure + synchronous, so it can never delay emergency
  // handling and works even when the model is unreachable.
  const detection = detectLanguage(input.text);
  const hasPriorTurns = (input.history?.length ?? 0) > 1;
  const responseLanguage = resolveResponseLanguage(detection, input.language, hasPriorTurns);

  // Privilege / secret-elevation requests never reach the model at all.
  const privilege = detectPrivilegeRequest(input.text);
  if (privilege.flagged) {
    const { response, intervened } = enforceResponseSafety(
      privilegeRefusalResponse() as unknown as AIChatResponse,
      input.text
    );
    return {
      mode: 'refused',
      response: { ...response, source: { provider: 'CareLink security policy', mode: 'refused', fetchedAt: new Date().toISOString() } },
      safetyIntervened: intervened,
      injectionFlagged: screen.flagged,
      detection,
      responseLanguage,
    };
  }

  const snapshot = buildContextSnapshot(input.conversationContext, input.patientContext, responseLanguage);

  const request: AIChatRequest = {
    version: 1,
    messages: boundHistory(input.history),
    input: input.text.slice(0, 2000),
    language: responseLanguage,
    context: snapshot,
    attachments: attachmentsFor(input.documents),
    allowedActions: input.allowedActions,
    requestId: createRequestId(),
  };

  const outcome: AIEngineOutcome = await sendToAIGateway(request, input.signal);

  const gatewayReal = aiGatewayMode() === 'real';
  // n8n is the fallback provider when the Supabase gateway is not configured but
  // the operator supplied a webhook. A validated n8n reply is REAL content.
  const n8nReal = n8nMode() === 'real';

  let raw: AIChatResponse;
  let mode: AIEngineMode;
  if (outcome.kind === 'validated') {
    raw = outcome.response;
    mode = 'real';
  } else if (gatewayReal) {
    // A real gateway exists but is unavailable right now — never fake it.
    raw = unavailableResponse(outcome.kind === 'unavailable' ? outcome.reason : 'gateway-error', responseLanguage);
    mode = 'unavailable';
  } else if (n8nReal) {
    // No Supabase gateway, but an n8n workflow is configured. The workflow
    // supplies the language; CareLink's deterministic scaffold supplies the
    // safe baseline that its answer is merged into.
    const baseline = mockAIRespond({ ...input, language: responseLanguage });
    const n8n = await sendToN8n(
      {
        message: input.text.slice(0, 2000),
        userId: input.userId ?? 'anonymous',
        conversationId: input.conversationId ?? 'local-conversation',
        language: responseLanguage,
        history: request.messages,
        context: snapshot,
        signal: input.signal,
      },
      input.signal
    );
    if (n8n.kind === 'validated') {
      raw = composeN8nResponse(n8n.reply, baseline);
      mode = 'real';
    } else {
      // An n8n workflow IS configured but failed. Never fabricate an answer.
      raw = unavailableResponse(n8n.reason, responseLanguage);
      mode = 'unavailable';
    }
  } else {
    raw = mockAIRespond({ ...input, language: responseLanguage }, outcome.kind === 'unavailable' ? outcome.reason : undefined);
    mode = 'mock';
  }

  const { response, intervened } = enforceResponseSafety(
    { ...raw, source: { ...raw.source, mode: mode as AIChatResponse['source']['mode'] } },
    input.text
  );

  return {
    mode,
    response,
    safetyIntervened: intervened,
    injectionFlagged: screen.flagged,
    detection,
    responseLanguage,
  };
}
