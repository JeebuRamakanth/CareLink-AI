/**
 * Structured AI output validation (Step 13 §2).
 *
 * Raw AI/gateway responses are NEVER trusted. Every payload passes through
 * `validateAIChatResponse` before the orchestrator may use it. Malformed or
 * partial payloads are rejected (return null) so the caller falls back to the
 * safe heuristic/mock path — the UI never renders unvalidated AI data.
 *
 * Validation is strict on shape and enums, tolerant on optional arrays
 * (missing arrays default to empty, over-long strings are truncated).
 */

import type {
  AgentIntent,
  AgentLanguage,
  ConfidenceLevel,
  DocumentAnalysis,
  DocumentAnalysisCategory,
  MedicineResult,
  SafetyLevel,
  UrgencyLevel,
} from '../../types';
import type { AIChatResponse } from './aiTypes';

const INTENTS: readonly AgentIntent[] = [
  'symptom', 'disease', 'hospital', 'doctor', 'pharmacy', 'medicine', 'lab',
  'report', 'appointment', 'emergency', 'route', 'recovery', 'vaccination',
  'child-care', 'elder-care', 'mental-health', 'family', 'location', 'general',
];
const CONFIDENCE: readonly ConfidenceLevel[] = ['low', 'medium', 'high'];
const URGENCY: readonly UrgencyLevel[] = ['routine', 'attention', 'urgent', 'emergency'];
const SAFETY: readonly SafetyLevel[] = ['educational', 'possible-concern', 'urgent', 'emergency', 'professional-care'];
const LANGUAGES: readonly AgentLanguage[] = ['en', 'te', 'hi'];

const MAX_TEXT = 2000;
const MAX_LIST = 8;
const MAX_LIST_ITEM = 320;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const asEnum = <T extends string>(value: unknown, allowed: readonly T[]): T | null =>
  typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : null;

const asText = (value: unknown, max = MAX_TEXT): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
};

const asTextList = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0)
    .slice(0, MAX_LIST)
    .map((v) => v.trim().slice(0, MAX_LIST_ITEM));
};

/**
 * Validate a raw gateway payload into a trusted AIChatResponse.
 * Returns null when the payload is malformed — callers must fall back safely.
 */
export function validateAIChatResponse(raw: unknown): AIChatResponse | null {
  if (!isRecord(raw)) return null;

  const summary = asText(raw.summary, 400);
  const explanation = asText(raw.explanation);
  const intent = asEnum(raw.intent, INTENTS);
  const confidence = asEnum(raw.confidence, CONFIDENCE);
  const urgency = asEnum(raw.urgency, URGENCY);
  const safetyLevel = asEnum(raw.safetyLevel, SAFETY);
  if (!summary || !explanation || !intent || !confidence || !urgency || !safetyLevel) return null;

  const language = asEnum(raw.language, LANGUAGES) ?? 'en';

  const sourceRaw = isRecord(raw.source) ? raw.source : null;
  const provider = sourceRaw && typeof sourceRaw.provider === 'string' && sourceRaw.provider.trim()
    ? sourceRaw.provider.trim().slice(0, 80)
    : 'unknown';
  const mode = sourceRaw && sourceRaw.mode === 'real' ? 'real' : 'mock';
  const fetchedAt = sourceRaw && typeof sourceRaw.fetchedAt === 'string' && !Number.isNaN(Date.parse(sourceRaw.fetchedAt))
    ? sourceRaw.fetchedAt
    : new Date().toISOString();

  return {
    summary,
    intent,
    confidence,
    urgency,
    safetyLevel,
    explanation,
    nextActions: asTextList(raw.nextActions),
    followUpQuestions: asTextList(raw.followUpQuestions),
    warnings: asTextList(raw.warnings),
    entities: asTextList(raw.entities),
    language,
    source: { provider, mode, fetchedAt },
  };
}

/* ----------------------------------------------------------------------------
 * Document analysis payload validation (§7, §8)
 * ------------------------------------------------------------------------- */

const DOC_CATEGORIES: readonly DocumentAnalysisCategory[] = [
  'lab-report', 'prescription', 'medicine-image', 'discharge-summary', 'imaging', 'general-document',
];

const asConfidence01 = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1 ? value : undefined;

/**
 * Validate a raw document-analysis provider payload. Rejects malformed
 * payloads (null) so the caller falls back to the mock analyser. Extracted
 * values keep provenance; missing values are never invented.
 */
export function validateDocumentAnalysisPayload(raw: unknown, sourceDocumentId: string): DocumentAnalysis | null {
  if (!isRecord(raw)) return null;
  const category = asEnum(raw.category, DOC_CATEGORIES) ?? 'general-document';
  const extracted = typeof raw.extractedText === 'string' ? raw.extractedText.slice(0, 4000) : '';
  const keyFindings = asTextList(raw.keyFindings);
  if (!extracted && keyFindings.length === 0) return null;

  const prov = isRecord(raw.provenance) ? raw.provenance : {};
  return {
    category,
    extractedTextPlaceholder: extracted || 'Extraction returned key findings only.',
    keyFindings,
    isMock: false,
    provenance: {
      sourceDocumentId,
      locator: typeof prov.locator === 'string' ? prov.locator.slice(0, 120) : undefined,
      confidence: asConfidence01(prov.confidence),
      processedAt: typeof prov.processedAt === 'string' && !Number.isNaN(Date.parse(prov.processedAt))
        ? prov.processedAt
        : new Date().toISOString(),
      provider: typeof prov.provider === 'string' && prov.provider.trim() ? prov.provider.trim().slice(0, 80) : 'document-analysis',
    },
  };
}

/* ----------------------------------------------------------------------------
 * Medicine recognition payload validation (§9)
 * ------------------------------------------------------------------------- */

/**
 * Validate a raw medicine-recognition payload. Strength/dosage form pass
 * through ONLY when present in the payload — they are never invented. Low
 * confidence marks the result uncertain so the UI forces verification.
 */
export function validateMedicinePayload(raw: unknown): MedicineResult | null {
  if (!isRecord(raw)) return null;
  const name = asText(raw.name, 120);
  if (!name) return null;

  const confidence = asConfidence01(raw.confidence);
  const uncertain = raw.uncertain === true || (confidence != null && confidence < 0.6);

  return {
    id: asText(raw.id, 60) ?? `med-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`,
    name,
    commonPurpose: asText(raw.commonPurpose, 400) ?? 'Purpose not confirmed — verify with a pharmacist.',
    importantSafetyInfo: asText(raw.importantSafetyInfo, 400)
      ?? 'Confirm this medicine with a pharmacist before use.',
    prescriptionRequired: raw.prescriptionRequired === true,
    interactionWarningPlaceholder: 'Interaction checking requires your full medication list — confirm with a pharmacist.',
    strength: asText(raw.strength, 60) ?? undefined,
    dosageForm: asText(raw.dosageForm, 60) ?? undefined,
    manufacturer: asText(raw.manufacturer, 120) ?? undefined,
    recognitionConfidence: confidence,
    uncertain,
    source: 'real',
  };
}
