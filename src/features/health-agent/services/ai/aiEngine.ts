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
import { buildContextSnapshot, boundHistory } from './contextSnapshot';
import { screenForInjection } from './promptGuards';
import { enforceResponseSafety } from './safetyLayer';
import { mockAIRespond } from './mockAIResponder';

export type AIEngineMode = 'real' | 'mock' | 'unavailable';

export interface AIEngineInput {
  text: string;
  documents: HealthDocument[];
  patientContext: PatientContext;
  conversationContext: ConversationContext;
  history?: AgentMessage[];
  language: AgentLanguage;
  allowedActions: string[];
  /** Pre-classified intent from the orchestrator's classifier; the mock
   *  responder reuses it so both paths never disagree. */
  classification?: IntentClassification;
  signal?: AbortSignal;
}

export interface AIEngineResult {
  mode: AIEngineMode;
  response: AIChatResponse;
  /** True when the safety layer modified the AI output. */
  safetyIntervened: boolean;
  /** True when prompt-injection patterns were detected in the input. */
  injectionFlagged: boolean;
}

export function aiEngineMode(): AIEngineMode {
  return aiGatewayMode() === 'real' ? 'real' : 'mock';
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
 * Run one AI turn. Never throws for provider failures — falls back to the
 * mock responder so the conversation always continues safely (labelled demo).
 */
export async function runAITurn(input: AIEngineInput): Promise<AIEngineResult> {
  const screen = screenForInjection(input.text);
  const snapshot = buildContextSnapshot(input.conversationContext, input.patientContext, input.language);

  const request: AIChatRequest = {
    version: 1,
    messages: boundHistory(input.history),
    input: input.text.slice(0, 2000),
    language: input.language,
    context: snapshot,
    attachments: attachmentsFor(input.documents),
    allowedActions: input.allowedActions,
    requestId: createRequestId(),
  };

  const outcome: AIEngineOutcome = await sendToAIGateway(request, input.signal);

  const raw: AIChatResponse = outcome.kind === 'validated'
    ? outcome.response
    : mockAIRespond(input, outcome.kind === 'unavailable' ? outcome.reason : undefined);

  const { response, intervened } = enforceResponseSafety(raw, input.text);

  return {
    mode: outcome.kind === 'validated' ? 'real' : 'mock',
    response,
    safetyIntervened: intervened,
    injectionFlagged: screen.flagged,
  };
}
