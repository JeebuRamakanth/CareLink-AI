/**
 * CareLink-AI Agent — public service interface (Step 17).
 *
 * The thin wrapper the UI calls. It simulates latency so the UI can exercise its
 * thinking/processing states, then delegates to the mock intelligence layer.
 * A future real backend replaces `buildResponseForIntent` with a network call
 * behind the same signature.
 */

import type { AgentAttachment, AgentResponse, IntentClassification } from './agentTypes';
import { buildResponseForIntent } from './mockAgentService';
import { classifyIntent } from './agentIntentRouter';

const SIMULATED_LATENCY_MS = 650;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

export interface AgentServiceRequest {
  text: string;
  attachments: AgentAttachment[];
  patientProfileId: string;
}

export interface AgentServiceResult {
  response: AgentResponse;
  classification: IntentClassification;
}

/**
 * Mock send: classifies intent, simulates a short delay, returns a structured
 * response. Components should toggle a "thinking" state while awaiting.
 */
export async function sendAgentMessage(request: AgentServiceRequest): Promise<AgentServiceResult> {
  const classification = classifyIntent(request.text);
  // Slightly longer delay when attachments are present to exercise processing states.
  const delay = request.attachments.length > 0 ? SIMULATED_LATENCY_MS + 400 : SIMULATED_LATENCY_MS;
  await wait(delay);
  const response = buildResponseForIntent(classification, request.attachments);
  return { response, classification };
}

export { classifyIntent } from './agentIntentRouter';
export { buildResponseForIntent, buildResponseForQuickAction } from './mockAgentService';
export type * from './agentTypes';
