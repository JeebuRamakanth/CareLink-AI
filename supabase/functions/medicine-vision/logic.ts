/**
 * CareLink-AI — medicine-image vision gateway logic (pure, no I/O).
 *
 * Kept separate from the HTTP handler so every validation rule is unit-testable
 * without a runtime, a provider key, or a network call.
 *
 * CONTRACT
 * - The client sends a BOUNDED base64 image (already downscaled in the browser)
 *   plus the user's language. No patient identifiers, no filenames, no metadata.
 * - The model must answer with a strict JSON object. Anything that does not
 *   validate is REJECTED (the client then shows an honest unavailable state) —
 *   a malformed provider payload is never turned into a medicine identity.
 * - The model is explicitly forbidden from inventing a medicine, a strength, a
 *   dose, a price or a manufacturer, and from identifying a medicine from
 *   colour/shape alone. When the photo is not readable it must say so.
 */

export const MAX_BODY_BYTES = 8 * 1024 * 1024;
export const MAX_BASE64_CHARS = 6 * 1024 * 1024;
export const MAX_HINT_CHARS = 200;

/** Only raster formats a vision model accepts. No SVG, no PDF, no HEIC. */
export const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type VisionMime = (typeof ALLOWED_IMAGE_MIMES)[number];

export const SUPPORTED_GATEWAY_LANGUAGES = [
  'en', 'te', 'hi', 'kn', 'ta', 'ml', 'bn', 'gu', 'mr', 'ur',
] as const;
export type GatewayLanguage = (typeof SUPPORTED_GATEWAY_LANGUAGES)[number];

/** How well the medicine could be identified. Never "verified" without evidence. */
export const IDENTIFICATION_LEVELS = ['verified', 'possible', 'unidentifiable'] as const;
export type IdentificationLevel = (typeof IDENTIFICATION_LEVELS)[number];

/** What the model thought of the photograph itself. */
export const IMAGE_QUALITIES = ['clear', 'blurry', 'partial', 'unreadable'] as const;
export type ImageQuality = (typeof IMAGE_QUALITIES)[number];

export interface VisionPayload {
  version: 1;
  mime: VisionMime;
  /** Base64 (no data: prefix) image bytes. */
  imageBase64: string;
  language: GatewayLanguage;
  /** Optional text the user typed alongside the photo (bounded, data-only). */
  hint?: string;
}

export interface ParsedVisionExtraction {
  /** Brand/product name printed on the packaging, or null when not readable. */
  brandName: string | null;
  /** Generic/active ingredient printed on the packaging, or null. */
  genericName: string | null;
  /** Strength exactly as printed (e.g. "650 mg"), or null. */
  strength: string | null;
  /** Dosage form as printed (tablet/capsule/syrup/…), or null. */
  dosageForm: string | null;
  /** Manufacturer exactly as printed, or null. */
  manufacturer: string | null;
  /** Batch/lot number as printed, or null. */
  batch: string | null;
  /** Expiry as printed, or null. */
  expiry: string | null;
  /** Any imprint/code visible on the tablet or strip, or null. */
  imprint: string | null;
  /** The legible text the model actually read (bounded), for transparency. */
  readText: string;
  /** Free-form packaging observations (bounded). Kept as data, never advice. */
  packagingNotes: string[];
  /** The model's own confidence that the READ is correct, 0..1. */
  confidence: number;
  /** The model's assessment of the photo. */
  imageQuality: ImageQuality;
  /** The model's proposed level; the server re-derives it. */
  identificationLevel: IdentificationLevel;
  /** Language the extraction summary was written in. */
  language: GatewayLanguage;
  /** One-line summary in the user's language. */
  summary: string;
  /** What the model could NOT read/confirm (bounded). */
  unreadableFields: string[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // A model that answers "null"/"N/A"/"unknown" as a literal string means "not read".
  if (/^(null|n\/?a|unknown|none|not (?:visible|readable|present))$/i.test(trimmed)) return null;
  return trimmed.slice(0, max);
};

function boundedStrings(value: unknown, maxItems: number, maxChars: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .slice(0, maxItems)
    .map((item) => item.trim().slice(0, maxChars));
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

/** Validate the inbound image request. Returns null for anything malformed. */
export function parseVisionPayload(value: unknown): VisionPayload | null {
  if (!isRecord(value) || value.version !== 1) return null;

  const mime = value.mime;
  if (typeof mime !== 'string' || !(ALLOWED_IMAGE_MIMES as readonly string[]).includes(mime)) return null;

  const imageBase64 = value.imageBase64;
  if (typeof imageBase64 !== 'string') return null;
  // Base64 alphabet only — rejects a data: prefix, whitespace or any other payload.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) return null;
  if (imageBase64.length < 64 || imageBase64.length > MAX_BASE64_CHARS) return null;

  const language = value.language;
  if (typeof language !== 'string' || !(SUPPORTED_GATEWAY_LANGUAGES as readonly string[]).includes(language)) return null;

  const hint = typeof value.hint === 'string' ? value.hint.trim().slice(0, MAX_HINT_CHARS) : '';

  return {
    version: 1,
    mime: mime as VisionMime,
    imageBase64,
    language: language as GatewayLanguage,
    hint: hint || undefined,
  };
}

/**
 * Derive the identification level from the READ evidence, never from the
 * model's opinion alone:
 *   - unidentifiable: no usable name was read, or the photo was unreadable.
 *   - possible:       a name was read but nothing corroborates it.
 *   - verified:       a name was read AND corroborating printed evidence exists
 *                     (generic ingredient, or strength + form/manufacturer).
 * The caller may still downgrade `verified` when the external database does not
 * recognise the name.
 */
export function deriveIdentificationLevel(input: {
  brandName: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  imageQuality: ImageQuality;
}): IdentificationLevel {
  const { brandName, genericName, strength, dosageForm, manufacturer, imageQuality } = input;
  if (imageQuality === 'unreadable') return 'unidentifiable';
  if (!brandName && !genericName) return 'unidentifiable';
  const corroboration = (genericName ? 1 : 0) + (strength ? 1 : 0) + (dosageForm ? 1 : 0) + (manufacturer ? 1 : 0);
  if (imageQuality === 'clear' && corroboration >= 2) return 'verified';
  return 'possible';
}

/** Parse and validate the provider's structured extraction. */
export function parseVisionCompletion(value: unknown, fallbackLanguage: GatewayLanguage): ParsedVisionExtraction | null {
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

  const brandName = str(parsed.brandName, 80);
  const genericName = str(parsed.genericName, 80);
  const strength = str(parsed.strength, 40);
  const dosageForm = str(parsed.dosageForm, 40);
  const manufacturer = str(parsed.manufacturer, 80);
  const batch = str(parsed.batch, 40);
  const expiry = str(parsed.expiry, 40);
  const imprint = str(parsed.imprint, 60);
  const readText = typeof parsed.readText === 'string' ? parsed.readText.trim().slice(0, 1200) : '';

  const rawQuality = typeof parsed.imageQuality === 'string' ? parsed.imageQuality.toLowerCase() : '';
  const imageQuality: ImageQuality = (IMAGE_QUALITIES as readonly string[]).includes(rawQuality)
    ? (rawQuality as ImageQuality)
    : 'unreadable';

  // A response with no readable content at all is not a usable extraction —
  // unless the model explicitly reports the photo as blurry/unreadable, which
  // IS a valid (and required) answer.
  const hasContent = Boolean(brandName || genericName || readText);
  if (!hasContent && imageQuality !== 'unreadable' && imageQuality !== 'blurry') return null;
  if (imageQuality === 'unreadable' && !brandName && !genericName) {
    // Keep the honest "could not read" answer but never fabricate a name.
    return {
      brandName: null,
      genericName: null,
      strength: null,
      dosageForm: null,
      manufacturer: null,
      batch: null,
      expiry: null,
      imprint: null,
      readText,
      packagingNotes: boundedStrings(parsed.packagingNotes, 6, 200),
      confidence: 0,
      imageQuality,
      identificationLevel: 'unidentifiable',
      language: resolveLanguage(parsed.language, fallbackLanguage),
      summary: typeof parsed.summary === 'string' && parsed.summary.trim()
        ? parsed.summary.trim().slice(0, 400)
        : 'The photograph could not be read clearly enough to identify a medicine.',
      unreadableFields: boundedStrings(parsed.unreadableFields, 10, 60),
    };
  }

  const confidenceRaw = typeof parsed.confidence === 'number' && Number.isFinite(parsed.confidence)
    ? parsed.confidence
    : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw));

  const identificationLevel = deriveIdentificationLevel({
    brandName, genericName, strength, dosageForm, manufacturer, imageQuality,
  });

  return {
    brandName,
    genericName,
    strength,
    dosageForm,
    manufacturer,
    batch,
    expiry,
    imprint,
    readText,
    packagingNotes: boundedStrings(parsed.packagingNotes, 6, 200),
    confidence,
    imageQuality,
    identificationLevel,
    language: resolveLanguage(parsed.language, fallbackLanguage),
    summary: typeof parsed.summary === 'string' && parsed.summary.trim()
      ? parsed.summary.trim().slice(0, 400)
      : 'Medicine label read from the uploaded photograph.',
    unreadableFields: boundedStrings(parsed.unreadableFields, 10, 60),
  };
}

function resolveLanguage(value: unknown, fallback: GatewayLanguage): GatewayLanguage {
  return typeof value === 'string' && (SUPPORTED_GATEWAY_LANGUAGES as readonly string[]).includes(value)
    ? (value as GatewayLanguage)
    : fallback;
}

export function missingConfiguration(apiKey: string, visionModel: string): 'api-key-missing' | 'vision-model-missing' | null {
  if (!apiKey.trim()) return 'api-key-missing';
  if (!visionModel.trim()) return 'vision-model-missing';
  return null;
}

/**
 * Server-side script detection. A native-script hint is unambiguous evidence of
 * the user's language, so the model must answer in that language even when the
 * client sent something else.
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
    return { status: 503, error: 'provider-unavailable', category: 'vision-model-unavailable' };
  }
  if (status === 400 || status === 422) {
    return { status: 502, error: 'provider-unavailable', category: 'provider-rejected' };
  }
  if (status === 429) {
    return { status: 429, error: 'provider-rate-limit', category: 'provider-rate-limit' };
  }
  return { status: 502, error: 'provider-unavailable', category: status >= 500 ? 'provider-server-error' : 'provider-rejected' };
}
