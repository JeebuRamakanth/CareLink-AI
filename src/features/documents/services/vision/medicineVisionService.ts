/**
 * CareLink-AI — medicine-image vision client.
 *
 * The ONLY browser path that sends medicine-photo PIXELS to a vision model. It
 * calls the authenticated `medicine-vision` Supabase Edge Function, which holds
 * the provider key server-side. Nothing here ever fabricates a medicine.
 *
 * PIPELINE
 *   File → downscale/re-encode (bounded) → base64 → gateway → schema validation
 *        → MedicineVisionRead (or an honest `unavailable` outcome)
 *
 * PRIVACY: only the image bytes and an optional user-typed hint leave the
 * browser. No filename, no patient id, no document metadata.
 *
 * FAILURE CONTRACT: a network/provider/schema failure returns
 * `{ kind: 'unavailable' }`. The caller must show the limitation and safe next
 * steps — a demo/mock medicine identity is NEVER substituted for a real read.
 */

import { env } from '../../../../config';
import { getSupabaseClient } from '../../../../services/supabase/client';
import { optimizeImageForUpload } from '../../../../services/media/imageOptimizer';
import type {
  IdentificationLevel,
  ImageQuality,
  MedicineVisionOutcome,
  MedicineVisionRead,
  VisionUnavailableReason,
} from './types';

const GATEWAY_TIMEOUT_MS = 40000;
/** Vision calls are expensive — a tighter bucket than the chat gateway. */
const RATE_CAPACITY = 6;
const RATE_REFILL_PER_MIN = 6;

const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BASE64_CHARS = 6 * 1024 * 1024;

/* ----------------------------------------------------------------------------
 * Rate limiter (per browser session)
 * ------------------------------------------------------------------------- */

const bucket = { tokens: RATE_CAPACITY, lastRefill: Date.now() };

function refill(): void {
  const now = Date.now();
  const elapsedMin = (now - bucket.lastRefill) / 60000;
  if (elapsedMin > 0) {
    bucket.tokens = Math.min(RATE_CAPACITY, bucket.tokens + elapsedMin * RATE_REFILL_PER_MIN);
    bucket.lastRefill = now;
  }
}

function tryConsume(): boolean {
  refill();
  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

/** Test hook: reset the bucket. */
export function resetVisionRateLimiter(): void {
  bucket.tokens = RATE_CAPACITY;
  bucket.lastRefill = Date.now();
}

/**
 * Whether a real vision backend can be attempted at all. This is the ONLY
 * gate the caller needs: when false, the UI must show the honest
 * "image analysis not configured" state instead of any medicine identity.
 */
export function isVisionConfigured(): boolean {
  return env.supabase.configured;
}

/* ----------------------------------------------------------------------------
 * Image preparation
 * ------------------------------------------------------------------------- */

interface PreparedImage {
  mime: string;
  base64: string;
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/**
 * Downscale and re-encode the image so the payload stays bounded. Medical
 * documents keep legibility (1600 px, JPEG q0.85); the original bytes are used
 * when re-encoding does not help. Always returns a supported MIME or null.
 */
export async function prepareImageForVision(file: File): Promise<PreparedImage | null> {
  try {
    let candidate = file;
    if (file.type.startsWith('image/')) {
      const optimized = await optimizeImageForUpload(file, { targetKind: 'document' });
      candidate = optimized.file;
    }
    const mime = candidate.type || file.type;
    if (!ALLOWED_MIMES.has(mime)) return null;
    const bytes = new Uint8Array(await candidate.arrayBuffer());
    if (bytes.byteLength === 0) return null;
    const base64 = toBase64(bytes);
    if (base64.length < 64 || base64.length > MAX_BASE64_CHARS) return null;
    return { mime, base64 };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * Gateway call
 * ------------------------------------------------------------------------- */

const UNAVAILABLE_MESSAGES: Record<VisionUnavailableReason, string> = {
  'no-vision-backend': 'Image analysis is not configured, so the photograph could not be read. No medicine was identified.',
  'not-configured': 'The image-analysis service is not configured. No medicine was identified.',
  unauthorized: 'Sign in to analyse a medicine photograph. No medicine was identified.',
  'rate-limited': 'Too many image-analysis requests. Wait a moment and try again.',
  'payload-too-large': 'The photograph is too large to analyse. Try a smaller or more closely cropped photo.',
  'image-unreadable': 'The photograph could not be read. Try a sharper, well-lit photo that fills the frame.',
  'malformed-response': 'The image-analysis service returned an unusable result, so no medicine was identified.',
  'backend-unreachable': 'The image-analysis service could not be reached. No medicine was identified.',
  'provider-unavailable': 'The image-analysis service is temporarily unavailable. No medicine was identified.',
  'image-encode-failed': 'This image format could not be prepared for analysis. Upload a JPEG, PNG or WebP photo.',
};

export function unavailableMessage(reason: VisionUnavailableReason): string {
  return UNAVAILABLE_MESSAGES[reason] ?? 'The photograph could not be analysed. No medicine was identified.';
}

const unavailable = (reason: VisionUnavailableReason): MedicineVisionOutcome => ({
  kind: 'unavailable',
  reason,
  message: unavailableMessage(reason),
});

/* --- response validation -------------------------------------------------- */

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asStr = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  if (/^(null|n\/?a|unknown|none|not (?:visible|readable|present))$/i.test(t)) return null;
  return t.slice(0, max);
};

const asStrArray = (v: unknown, maxItems: number, maxChars: number): string[] =>
  Array.isArray(v)
    ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).slice(0, maxItems).map((x) => x.trim().slice(0, maxChars))
    : [];

const LEVELS: readonly IdentificationLevel[] = ['verified', 'possible', 'unidentifiable'];
const QUALITIES: readonly ImageQuality[] = ['clear', 'blurry', 'partial', 'unreadable'];

/**
 * Validate a gateway payload into a trusted read. Returns null when malformed —
 * callers then show the honest unavailable state.
 */
export function validateVisionRead(raw: unknown): MedicineVisionRead | null {
  if (!isRecord(raw)) return null;

  const brandName = asStr(raw.brandName, 80);
  const genericName = asStr(raw.genericName, 80);
  const readText = typeof raw.readText === 'string' ? raw.readText.trim().slice(0, 1200) : '';

  const rawQuality = typeof raw.imageQuality === 'string' ? raw.imageQuality.toLowerCase() : '';
  const imageQuality: ImageQuality = (QUALITIES as readonly string[]).includes(rawQuality)
    ? (rawQuality as ImageQuality)
    : 'unreadable';

  const rawLevel = typeof raw.identificationLevel === 'string' ? raw.identificationLevel.toLowerCase() : '';
  // Never trust a "verified" claim when nothing was actually read.
  let identificationLevel: IdentificationLevel = (LEVELS as readonly string[]).includes(rawLevel)
    ? (rawLevel as IdentificationLevel)
    : 'unidentifiable';
  if (!brandName && !genericName) identificationLevel = 'unidentifiable';
  if (imageQuality === 'unreadable') identificationLevel = 'unidentifiable';

  const confidenceRaw = typeof raw.confidence === 'number' && Number.isFinite(raw.confidence) ? raw.confidence : 0;
  const confidence = Math.max(0, Math.min(1, confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw));

  const sourceRaw = isRecord(raw.source) ? raw.source : null;
  const provider = sourceRaw && typeof sourceRaw.provider === 'string' && sourceRaw.provider.trim()
    ? sourceRaw.provider.trim().slice(0, 80)
    : 'medicine-vision';
  const fetchedAt = sourceRaw && typeof sourceRaw.fetchedAt === 'string' && !Number.isNaN(Date.parse(sourceRaw.fetchedAt))
    ? sourceRaw.fetchedAt
    : new Date().toISOString();

  const unreadableFields = Array.isArray(raw.unreadableFields)
    ? raw.unreadableFields
      .filter(isRecord)
      .slice(0, 12)
      .map((f) => ({
        field: typeof f.field === 'string' ? f.field.slice(0, 60) : 'unknown',
        reason: typeof f.reason === 'string' ? f.reason.slice(0, 200) : '',
      }))
      .filter((f) => f.reason.length > 0)
    : [];

  return {
    brandName,
    genericName,
    strength: asStr(raw.strength, 40),
    dosageForm: asStr(raw.dosageForm, 40),
    manufacturer: asStr(raw.manufacturer, 80),
    batch: asStr(raw.batch, 40),
    expiry: asStr(raw.expiry, 40),
    imprint: asStr(raw.imprint, 60),
    readText,
    packagingNotes: asStrArray(raw.packagingNotes, 6, 200),
    confidence,
    imageQuality,
    identificationLevel,
    language: typeof raw.language === 'string' ? raw.language.slice(0, 5) : 'en',
    summary: typeof raw.summary === 'string' && raw.summary.trim()
      ? raw.summary.trim().slice(0, 400)
      : 'Medicine label read from the uploaded photograph.',
    unreadableFields,
    source: { provider, mode: 'real', fetchedAt },
  };
}

function safeGatewayReason(error: unknown): VisionUnavailableReason {
  if (typeof error !== 'object' || error === null || !('context' in error)) return 'backend-unreachable';
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return 'backend-unreachable';
  const status = context.status;
  if (status === 401 || status === 403) return 'unauthorized';
  if (status === 413) return 'payload-too-large';
  if (status === 429) return 'rate-limited';
  if (status === 503) return 'provider-unavailable';
  if (status >= 500) return 'provider-unavailable';
  return 'backend-unreachable';
}

/**
 * Read a medicine photograph through the secure vision gateway.
 * Always resolves — never throws.
 */
export async function readMedicineImage(
  file: File,
  language: string,
  hint?: string,
  signal?: AbortSignal
): Promise<MedicineVisionOutcome> {
  if (!isVisionConfigured()) return unavailable('no-vision-backend');
  if (!tryConsume()) return unavailable('rate-limited');

  const prepared = await prepareImageForVision(file);
  if (!prepared) return unavailable('image-encode-failed');

  const client = await getSupabaseClient();
  if (!client) return unavailable('no-vision-backend');

  try {
    const { data, error } = await client.functions.invoke<unknown>('medicine-vision', {
      body: {
        version: 1,
        mime: prepared.mime,
        imageBase64: prepared.base64,
        language,
        hint: hint?.slice(0, 200),
      },
      signal,
      timeout: GATEWAY_TIMEOUT_MS,
    });
    if (error) return unavailable(safeGatewayReason(error));
    const read = validateVisionRead(data);
    if (!read) return unavailable('malformed-response');
    return { kind: 'read', read };
  } catch {
    return unavailable('backend-unreachable');
  }
}
