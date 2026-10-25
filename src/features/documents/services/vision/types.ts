/**
 * CareLink-AI — medicine-image vision types (client side).
 *
 * Mirrors the gateway's validated payload shape. These types describe what was
 * actually READ from a photograph — never a medicine identity the app invented.
 */

/** How well the medicine could be identified from the photograph. */
export type IdentificationLevel = 'verified' | 'possible' | 'unidentifiable';

/** The vision model's assessment of the photograph itself. */
export type ImageQuality = 'clear' | 'blurry' | 'partial' | 'unreadable';

/** A field the model could not read, with the honest reason. */
export interface VisionUnreadableField {
  field: string;
  reason: string;
}

/**
 * The validated result of reading a medicine photograph.
 *
 * Every nullable field means "not legible / not printed" — the UI must render
 * "Unable to verify" rather than a blank or an invented value.
 */
export interface MedicineVisionRead {
  brandName: string | null;
  genericName: string | null;
  strength: string | null;
  dosageForm: string | null;
  manufacturer: string | null;
  batch: string | null;
  expiry: string | null;
  imprint: string | null;
  /** The legible text the model actually read, verbatim. */
  readText: string;
  packagingNotes: string[];
  /** 0..1 confidence in the READ (not a clinical judgement). */
  confidence: number;
  imageQuality: ImageQuality;
  /** Level derived server-side from the read evidence. */
  identificationLevel: IdentificationLevel;
  /** Language the summary was written in. */
  language: string;
  summary: string;
  unreadableFields: VisionUnreadableField[];
  /** Provenance: the vision model + when it ran. */
  source: { provider: string; mode: 'real'; fetchedAt: string };
}

/** Why a vision read could not be produced. */
export type VisionUnavailableReason =
  | 'no-vision-backend'
  | 'not-configured'
  | 'unauthorized'
  | 'rate-limited'
  | 'payload-too-large'
  | 'image-unreadable'
  | 'malformed-response'
  | 'backend-unreachable'
  | 'provider-unavailable'
  | 'image-encode-failed';

/**
 * Discriminated outcome. `unavailable` is an HONEST state — the caller shows a
 * limitation and safe next steps; it never substitutes a demo identity.
 */
export type MedicineVisionOutcome =
  | { kind: 'read'; read: MedicineVisionRead }
  | { kind: 'unavailable'; reason: VisionUnavailableReason; message: string };
