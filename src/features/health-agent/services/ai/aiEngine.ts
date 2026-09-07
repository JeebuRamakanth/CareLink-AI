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
import { screenForInjection, detectPrivilegeRequest, privilegeRefusalResponse } from './promptGuards';
import { enforceResponseSafety } from './safetyLayer';
import { mockAIRespond } from './mockAIResponder';

export type AIEngineMode = 'real' | 'mock' | 'unavailable' | 'refused';

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

/** A safe, honest "temporarily unavailable" response for real-mode failures. */
function unavailableResponse(): AIChatResponse {
  return {
    summary: 'CareLink AI is temporarily unavailable.',
    intent: 'general',
    confidence: 'low',
    urgency: 'routine',
    safetyLevel: 'educational',
    explanation:
      'The AI service could not be reached right now. You can still use the search, appointments, and emergency guidance below — no response was fabricated.',
    nextActions: ['Search for a hospital or doctor.', 'View your appointments.', 'Call your local emergency number if you need urgent help.'],
    followUpQuestions: [],
    warnings: ['CareLink AI is temporarily unavailable.'],
    entities: [],
    language: 'en',
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
    };
  }

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

  const gatewayReal = aiGatewayMode() === 'real';

  let raw: AIChatResponse;
  let mode: AIEngineMode;
  if (outcome.kind === 'validated') {
    raw = outcome.response;
    mode = 'real';
  } else if (gatewayReal) {
    // A real gateway exists but is unavailable right now — never fake it.
    raw = unavailableResponse();
    mode = 'unavailable';
  } else {
    raw = mockAIRespond(input, outcome.kind === 'unavailable' ? outcome.reason : undefined);
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
  };
}
