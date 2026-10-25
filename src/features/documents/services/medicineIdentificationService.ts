/**
 * CareLink-AI — medicine identification service.
 *
 * Turns REAL text (typed by the user, or read from a medicine photo by OCR)
 * into a medicine result that is either VERIFIED against an authoritative
 * database or explicitly UNCERTAIN.
 *
 * SAFETY CONTRACT:
 * - The service never invents a medicine identity. If nothing verifies, it
 *   returns `name: null` with an explicit uncertainty reason and asks for a
 *   clearer image — it does not guess.
 * - Dosage shown is the label's REFERENCE dosage only. It is never converted
 *   into a patient-specific dose, and children's dosing always routes to a
 *   clinician/pharmacist.
 * - Every verified fact carries a citation; everything unverified is listed.
 */

import type { EvidenceReference, MedicineRecognitionResult } from '../types';
import { parseMedicineLabel } from './clinical/labelParser';
import { verifyMedicine, medicineSourcesAvailable, type MedicineLookup } from './clinical/medicineSources';
import { recognizeMedicine as recognizeFromLocalCatalog } from './medicineRecognitionService';

export interface IdentifyMedicineInput {
  /** Free text the user typed (e.g. "Dolo 650"). */
  text?: string;
  /** Text read from a medicine image by the extraction pipeline. */
  labelText?: string;
  documentId?: string;
}

const UNCERTAIN_SAFETY_WARNING =
  'This is not a confirmed identification. Verify the name and strength printed on the strip or with a pharmacist before use. Never change a prescribed dose without consulting your doctor.';

/** The default result when no medicine could be identified at all. */
function uncertainResult(reason: string, evidence: EvidenceReference[] = []): MedicineRecognitionResult {
  return {
    name: null,
    strength: null,
    dosageForm: null,
    manufacturerPlaceholder: null,
    confidence: 0,
    commonPurpose: null,
    safetyWarning: UNCERTAIN_SAFETY_WARNING,
    prescriptionRequired: false,
    isUncertain: true,
    source: 'mock',
    verified: false,
    uncertaintyReason: reason,
    evidence,
    unverified: ['medicine identity', 'strength', 'uses', 'side effects'],
  };
}

/** Map a verified external lookup into the app's medicine result shape. */
function verifiedResult(
  displayName: string,
  strength: string | null,
  form: string | null,
  lookup: MedicineLookup
): MedicineRecognitionResult {
  const uses = lookup.uses.length > 0 ? lookup.uses : [];
  const sideEffects = lookup.sideEffects.length > 0 ? lookup.sideEffects : [];
  const seriousWarnings = lookup.seriousWarnings.length > 0 ? lookup.seriousWarnings : [];

  const unverified: string[] = [...lookup.unverified];
  if (!strength) unverified.push('strength (not read from the source)');
  if (!form) unverified.push('dosage form');

  return {
    name: lookup.genericName ?? displayName,
    strength,
    dosageForm: form,
    manufacturerPlaceholder: lookup.manufacturer,
    // Confidence reflects that the NAME is database-verified, not that the
    // photograph matched. It is deliberately not 100.
    confidence: 80,
    commonPurpose: uses[0] ?? null,
    safetyWarning:
      seriousWarnings.length > 0
        ? `Important warnings: ${seriousWarnings.slice(0, 2).join(' ')}`
        : 'Follow your prescriber\'s instructions. Confirm any change with your doctor or pharmacist.',
    prescriptionRequired: lookup.prescriptionRequired === true,
    isUncertain: false,
    source: 'real',
    verified: true,
    genericName: lookup.genericName,
    uses,
    sideEffects,
    seriousWarnings,
    referenceDosage: lookup.referenceDosage,
    uncertaintyReason: null,
    evidence: lookup.evidence,
    unverified,
  };
}

/**
 * Identify a medicine from typed text and/or label text read by OCR.
 *
 * Order of resolution:
 *   1. Explicit text (the user typed the name) → verify directly.
 *   2. Label text → parse candidates → verify the first that resolves.
 *   3. Nothing verifies → explicit uncertain result (never a guess).
 */
export async function identifyMedicine(input: IdentifyMedicineInput): Promise<MedicineRecognitionResult> {
  const typed = input.text?.trim() ?? '';
  const labelText = input.labelText ?? '';
  const label = labelText ? parseMedicineLabel(labelText) : null;

  const attempts: { name: string; strength: string | null; form: string | null; evidence: EvidenceReference[] }[] = [];

  if (typed.length >= 3) {
    attempts.push({ name: typed, strength: null, form: null, evidence: [] });
  }
  if (label) {
    for (const c of label.candidates.slice(0, 3)) {
      attempts.push({ name: c.name, strength: label.strength, form: label.form, evidence: [] });
    }
  }

  if (attempts.length === 0) {
    return uncertainResult(
      input.labelText !== undefined
        ? 'No readable medicine name was found in the image. Photograph the front AND back of the strip or box in good light.'
        : 'No medicine name was provided.',
      []
    );
  }

  if (!medicineSourcesAvailable()) {
    // Offline/demo: fall back to the local catalog, clearly marked unverified.
    return await localFallback(typed || attempts[0].name, 'Medicine verification requires an internet connection.');
  }

  for (const attempt of attempts) {
    try {
      const lookup = await verifyMedicine(attempt.name);
      if (lookup) {
        return verifiedResult(attempt.name, attempt.strength, attempt.form, lookup);
      }
    } catch {
      // Try the next candidate; a failed lookup is never fatal.
    }
  }

  const reason = label && !label.unreadable
    ? `The name read from the image ("${label.candidates[0]?.name ?? 'unclear'}") could not be verified against a medicine database. Please upload a clearer photo of the label.`
    : label?.uncertaintyReason
      ?? 'This medicine could not be verified against a medicine database.';

  const fallback = await localFallback(typed || attempts[0].name, reason);
  return fallback;
}

/**
 * Demo/offline fallback: consult the small local catalog but NEVER present the
 * result as verified — the safety warning and `isUncertain` flag always stand.
 */
async function localFallback(name: string, reason: string): Promise<MedicineRecognitionResult> {
  try {
    const local = await recognizeFromLocalCatalog({ text: name });
    if (local.name) {
      return {
        ...local,
        confidence: 35,
        verified: false,
        isUncertain: true,
        uncertaintyReason: reason,
        safetyWarning: local.safetyWarning ?? UNCERTAIN_SAFETY_WARNING,
        unverified: ['medicine identity (not verified against a database)', 'strength', 'dosage form'],
      };
    }
  } catch {
    // Ignore — fall through to the fully-uncertain result.
  }
  return uncertainResult(reason);
}
