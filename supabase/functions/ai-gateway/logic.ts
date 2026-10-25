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
