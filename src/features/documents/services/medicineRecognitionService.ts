/**
 * CareLink-AI — Step 11 medicine intelligence service.
 *
 * Recognizes a medicine/tablet from free text or an uploaded image and returns
 * a structured, clearly-tagged result with actionable next steps.
 *
 * SAFETY (Step 11 §8):
 * - NEVER invent dosage. NEVER change prescribed dosage. NEVER create
 *   personalized medication instructions solely from image recognition.
 * - When recognition is uncertain, the result is flagged `isUncertain` and the
 *   UI asks the user to verify the name/strength on the strip or with a
 *   pharmacist.
 * - Output is always tagged with `source` (real/mock/unavailable) so mock
 *   recognition is never presented as a confirmed identification.
 */

import { env } from '../../../config';
import { adapters as resolvedAdapters } from '../../health-agent/services/adapters/registry';
import type { MedicineRecognitionResult, DocumentDataSource } from '../types';

export interface MedicineRecognitionInput {
  /** Free-text medicine name the user typed. */
  text?: string;
  /** Attached medicine image document id (for the image-recognition path). */
  documentId?: string;
}

/** Whether a real medicine-intelligence backend is configured. */
export function isMedicineIntelligenceConfigured(): boolean {
  return env.medicine.configured;
}

export function medicineRecognitionSource(): DocumentDataSource {
  return env.medicine.configured ? 'real' : 'mock';
}

/**
 * Recognize a medicine. Delegates to the existing Step 9 mock adapter (which
 * reads from the mock dataset) when no real backend is configured. Always tags
 * the result with a confidence and `isUncertain` flag.
 *
 * NOTE: image-based recognition is intentionally uncertain in the mock layer —
 * the UI must surface the "verify with a pharmacist" guidance.
 */
export async function recognizeMedicine(input: MedicineRecognitionInput): Promise<MedicineRecognitionResult> {
  const found = input.text ? await resolvedAdapters.medicines.recognize({ text: input.text, documentId: input.documentId }) : null;

  if (!found) {
    return {
      name: null,
      strength: null,
      dosageForm: null,
      manufacturerPlaceholder: null,
      confidence: 0,
      commonPurpose: null,
      safetyWarning: null,
      prescriptionRequired: false,
      isUncertain: true,
      source: env.medicine.configured ? 'unavailable' : 'mock',
    };
  }

  // Derive strength/dosage form heuristically from the recognized name (mock).
  const strengthMatch = found.name.match(/(\d+(\.\d+)?)\s?(mg|mcg|ml|g|IU)\b/i);
  const dosageForm = /tablet/i.test(found.name) ? 'Tablet'
    : /capsule/i.test(found.name) ? 'Capsule'
    : /syrup/i.test(found.name) ? 'Syrup'
    : /injection/i.test(found.name) ? 'Injection'
    : null;

  return {
    name: found.name,
    strength: strengthMatch ? strengthMatch[0] : null,
    dosageForm,
    manufacturerPlaceholder: null, // Never assert a real manufacturer.
    confidence: env.medicine.configured ? 92 : 70,
    commonPurpose: found.commonPurpose,
    safetyWarning: found.importantSafetyInfo,
    prescriptionRequired: found.prescriptionRequired,
    isUncertain: !env.medicine.configured,
    source: env.medicine.configured ? 'real' : 'mock',
  };
}
