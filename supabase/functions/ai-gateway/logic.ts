export const MAX_BODY_BYTES = 48 * 1024;
export const MAX_INPUT_CHARS = 2000;
export const MAX_MESSAGES = 6;
export const MAX_MESSAGE_CHARS = 280;
export const MAX_ATTACHMENTS = 4;

/**
 * Languages the gateway accepts. Kept in sync with the client's
 * `SUPPORTED_LANGUAGES` (src/features/health-agent/services/ai/languageDetector.ts);
 * a language must be listed here before the model may answer in it.
 */
export const SUPPORTED_GATEWAY_LANGUAGES = [
  'en', 'te', 'hi', 'kn', 'ta', 'ml', 'bn', 'gu', 'mr', 'ur',
] as const;

export type GatewayLanguage = (typeof SUPPORTED_GATEWAY_LANGUAGES)[number];

export interface GatewayPayload {
  version: 1;
  input: string;
  messages: { role: 'user' | 'assistant'; content: string }[];
  language: GatewayLanguage;
  context: Record<string, unknown>;
  attachments: { kind: string; extraction?: { keyFindings: string[] } }[];
  allowedActions: string[];
  requestId?: string;
}

export interface ParsedAIResponse {
  summary: string;
  intent: string;
  confidence: string;
  urgency: string;
  safetyLevel: string;
  explanation: string;
  nextActions: string[];
  followUpQuestions: string[];
  warnings: string[];
  entities: string[];
  language: GatewayLanguage;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function boundedStrings(value: unknown, maxItems: number, maxChars: number): string[] | null {
  if (!Array.isArray(value)) return null;
  if (value.length > maxItems || value.some((item) => typeof item !== 'string')) return null;
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().slice(0, maxChars))
    .filter(Boolean);
}

export function readBoundedBody(request: Request, maxBytes = MAX_BODY_BYTES): Promise<string | null> {
  return (async () => {
    if (!request.body) return '';
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxBytes) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder().decode(body);
  })();
}

export function parseGatewayPayload(value: unknown): GatewayPayload | null {
  if (!isRecord(value) || value.version !== 1) return null;
  if (typeof value.input !== 'string' || !value.input.trim() || value.input.length > MAX_INPUT_CHARS) return null;
  if (!Array.isArray(value.messages) || value.messages.length > MAX_MESSAGES) return null;

  const messages: GatewayPayload['messages'] = [];
  for (const message of value.messages) {
    if (!isRecord(message) || (message.role !== 'user' && message.role !== 'assistant')) return null;
    if (typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role: message.role, content: message.content.trim() });
  }

  const language = value.language;
  if (typeof language !== 'string' || !(SUPPORTED_GATEWAY_LANGUAGES as readonly string[]).includes(language)) return null;

  const context = value.context === undefined ? {} : value.context;
  if (!isRecord(context)) return null;

  const rawAttachments = value.attachments ?? [];
  if (!Array.isArray(rawAttachments) || rawAttachments.length > MAX_ATTACHMENTS) return null;
  const attachments: GatewayPayload['attachments'] = [];
  for (const attachment of rawAttachments) {
    if (!isRecord(attachment)) return null;
    const kind = typeof attachment.kind === 'string' ? attachment.kind.slice(0, 40) : 'document';
    if (attachment.extraction === undefined) {
      attachments.push({ kind });
      continue;
    }
    if (!isRecord(attachment.extraction)) return null;
    const keyFindings = boundedStrings(attachment.extraction.keyFindings ?? [], 6, 120);
    if (!keyFindings) return null;
    attachments.push({ kind, extraction: { keyFindings } });
  }

  const rawActions = value.allowedActions ?? [];
  const allowedActions = boundedStrings(rawActions, 20, 80);
  if (!allowedActions) return null;

  return {
    version: 1,
    input: value.input.trim(),
    messages,
    language,
    context,
    attachments,
    allowedActions,
    requestId: typeof value.requestId === 'string' && /^[\w-]{1,64}$/.test(value.requestId)
      ? value.requestId
      : undefined,
  };
}

const INTENTS = new Set([
  'symptom', 'disease', 'hospital', 'doctor', 'pharmacy', 'medicine', 'lab',
  'report', 'appointment', 'emergency', 'route', 'recovery', 'vaccination',
  'child-care', 'elder-care', 'mental-health', 'family', 'location', 'general',
]);
const CONFIDENCE = new Set(['low', 'medium', 'high']);
const URGENCY = new Set(['routine', 'attention', 'urgent', 'emergency']);
const SAFETY = new Set(['educational', 'possible-concern', 'urgent', 'emergency', 'professional-care']);

export function parseProviderCompletion(value: unknown, fallbackLanguage: GatewayPayload['language']): ParsedAIResponse | null {
  if (!isRecord(value) || !Array.isArray(value.choices)) return null;
  const first = value.choices[0];
  if (!isRecord(first) || !isRecord(first.message) || typeof first.message.content !== 'string') return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(first.message.content);
  } catch {
    return null;
  }
  if (!isRecord(parsed)) return null;

  const { summary, intent, confidence, urgency, safetyLevel, explanation } = parsed;
  if (
    typeof summary !== 'string' || !summary.trim() ||
    typeof explanation !== 'string' || !explanation.trim() ||
    typeof intent !== 'string' || !INTENTS.has(intent) ||
    typeof confidence !== 'string' || !CONFIDENCE.has(confidence) ||
    typeof urgency !== 'string' || !URGENCY.has(urgency) ||
    typeof safetyLevel !== 'string' || !SAFETY.has(safetyLevel)
  ) return null;

  const list = (field: unknown): string[] =>
    Array.isArray(field)
      ? field.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 8).map((item) => item.trim().slice(0, 320))
      : [];

  const language = typeof parsed.language === 'string'
    && (SUPPORTED_GATEWAY_LANGUAGES as readonly string[]).includes(parsed.language)
    ? (parsed.language as GatewayLanguage)
    : fallbackLanguage;
  return {
    summary: summary.trim().slice(0, 400),
    intent,
    confidence,
    urgency,
    safetyLevel,
    explanation: explanation.trim().slice(0, 2000),
    nextActions: list(parsed.nextActions),
    followUpQuestions: list(parsed.followUpQuestions),
    warnings: list(parsed.warnings),
    entities: list(parsed.entities),
    language,
  };
}

export function missingConfiguration(apiKey: string, model: string): 'api-key-missing' | 'model-missing' | null {
  if (!apiKey.trim()) return 'api-key-missing';
  if (!model.trim()) return 'model-missing';
  return null;
}

/* ----------------------------------------------------------------------------
 * n8n provider (optional, preferred when configured)
 * ------------------------------------------------------------------------- */

/** True when the operator pointed the gateway at an n8n webhook. */
export function n8nConfigured(webhookUrl: string): boolean {
  const value = webhookUrl.trim();
  if (!/^https:\/\//i.test(value)) return false;
  return !/YOUR_|example\.com/i.test(value);
}

/**
 * Build the n8n request body.
 *
 * The workflow receives the user's message plus the ALREADY channel-separated
 * provider messages, so the same prompt-injection contract applies: document
 * extractions stay inside `<untrusted_document>` tags and the user text inside
 * `<user_message>`. `user_id` is the authenticated id, never an email.
 */
export function buildN8nPayload(
  payload: GatewayPayload,
  userId: string,
  messages: { role: string; content: string }[],
): Record<string, unknown> {
  return {
    message: payload.input,
    user_id: userId,
    conversation_id: payload.requestId ?? 'anonymous',
    language: payload.language,
    messages,
    context: payload.context,
    attachments: payload.attachments,
    allowed_actions: payload.allowedActions,
  };
}

/**
 * Parse an n8n workflow reply into the gateway's structured response.
 *
 * The workflow may return the AIChatResponse JSON directly, an n8n item list
 * (`[{ output: "…" }]`), or a plain text answer. A plain text answer is wrapped
 * into the schema with a safe, non-diagnostic scaffold — the client's safety
 * layer and enum clamping still run on top. Returns null when there is no
 * usable content, so the caller answers 502 instead of inventing a reply.
 */
export function parseN8nCompletion(
  value: unknown,
  fallbackLanguage: GatewayPayload['language'],
): ParsedAIResponse | null {
  const unwrap = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.length > 0 ? unwrap(input[0]) : null;
    if (typeof input === 'string') {
      const text = input.trim();
      if (!text) return null;
      try {
        return unwrap(JSON.parse(text));
      } catch {
        return text;
      }
    }
    if (!isRecord(input)) return input;
    for (const key of ['data', 'json', 'body']) {
      const nested = input[key];
      if (isRecord(nested) && (nested.summary !== undefined || nested.output !== undefined)) return unwrap(nested);
    }
    return input;
  };

  const candidate = unwrap(value);
  if (typeof candidate === 'string') {
    const text = candidate.slice(0, 2000);
    return {
      summary: text.slice(0, 400),
      intent: 'general',
      confidence: 'medium',
      urgency: 'routine',
      safetyLevel: 'educational',
      explanation: text,
      nextActions: [],
      followUpQuestions: [],
      warnings: [],
      entities: [],
      language: fallbackLanguage,
    };
  }
  if (!isRecord(candidate)) return null;

  // Structured payload: reuse the strict validator's enums but never trust a
  // free-form value. `output` may itself be the structured object.
  const structured = isRecord(candidate.output) ? candidate.output : candidate;
  const summary = typeof structured.summary === 'string' ? structured.summary.trim() : '';
  const explanation = typeof structured.explanation === 'string' ? structured.explanation.trim() : '';
  const plainOutput = typeof structured.output === 'string' ? structured.output.trim() : '';
  const text = summary || explanation || plainOutput;
  if (!text) return null;

  const pick = (field: unknown, allowed: Set<string>, fallback: string): string =>
    typeof field === 'string' && allowed.has(field) ? field : fallback;

  const list = (field: unknown): string[] =>
    Array.isArray(field)
      ? field.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .slice(0, 8).map((item) => item.trim().slice(0, 320))
      : [];

  const language = typeof structured.language === 'string'
    && (SUPPORTED_GATEWAY_LANGUAGES as readonly string[]).includes(structured.language)
    ? (structured.language as GatewayLanguage)
    : fallbackLanguage;

  return {
    summary: (summary || text).slice(0, 400),
    intent: pick(structured.intent, new Set([
      'symptom', 'disease', 'hospital', 'doctor', 'pharmacy', 'medicine', 'lab',
      'report', 'appointment', 'emergency', 'route', 'recovery', 'vaccination',
      'child-care', 'elder-care', 'mental-health', 'family', 'location', 'general',
    ]), 'general'),
    confidence: pick(structured.confidence, new Set(['low', 'medium', 'high']), 'medium'),
    urgency: pick(structured.urgency, new Set(['routine', 'attention', 'urgent', 'emergency']), 'routine'),
    safetyLevel: pick(structured.safetyLevel, new Set(['educational', 'possible-concern', 'urgent', 'emergency', 'professional-care']), 'educational'),
    explanation: (explanation || text).slice(0, 2000),
    nextActions: list(structured.nextActions ?? structured.next_actions),
    followUpQuestions: list(structured.followUpQuestions ?? structured.follow_up_questions),
    warnings: list(structured.warnings),
    entities: list(structured.entities),
    language,
  };
}

/**
 * Server-side script detection (defense in depth).
 *
 * The client sends a detected language, but a native-script input is
 * unambiguous evidence the model MUST answer in that script — so the gateway
 * re-derives it from the raw text rather than trusting the client's value.
 * Returns null when the input is Latin-script (the client's detection, which
 * understands transliteration, is the better signal there).
 */
export function detectScriptLanguage(input: string): GatewayLanguage | null {
  if (/[\u0C00-\u0C7F]/.test(input)) return 'te';
  if (/[\u0C80-\u0CFF]/.test(input)) return 'kn';
  if (/[\u0D00-\u0D7F]/.test(input)) return 'ml';
  if (/[\u0B80-\u0BFF]/.test(input)) return 'ta';
  if (/[\u0900-\u097F]/.test(input)) return 'hi';
  if (/[\u0980-\u09FF]/.test(input)) return 'bn';
  if (/[\u0A80-\u0AFF]/.test(input)) return 'gu';
  if (/[\u0600-\u06FF]/.test(input)) return 'ur';
  return null;
}

export function safeProviderFailure(status: number): { status: number; error: string; category: string } {
  if (status === 401 || status === 403) {
    return { status: 502, error: 'provider-unavailable', category: 'provider-authentication' };
  }
  if (status === 402) {
    return { status: 503, error: 'provider-unavailable', category: 'provider-quota' };
  }
  if (status === 404) {
    return { status: 503, error: 'provider-unavailable', category: 'model-unavailable' };
  }
  if (status === 429) {
    return { status: 429, error: 'provider-rate-limit', category: 'provider-rate-limit' };
  }
  return { status: 502, error: 'provider-unavailable', category: status >= 500 ? 'provider-server-error' : 'provider-rejected' };
}
