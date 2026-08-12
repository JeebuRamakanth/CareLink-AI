/**
 * Safety foundation (Step 9 §8).
 *
 * Ensures the integration layer never creates unsafe medical certainty.
 * - Information tiers distinguish educational / triage / next-action /
 *   emergency / professional advice.
 * - Disclaimers are mandatory and templated so they stay consistent.
 * - Emergency intent always takes priority over ordinary discovery.
 */

import type { InformationTier, IntentClassification, UrgencyLevel } from '../types';

export const DISCLOSURES = {
  medical:
    'CareLink provides navigational guidance, not a medical diagnosis. For diagnosis or treatment, consult a licensed healthcare professional.',
  emergency:
    'If this is a life-threatening emergency, call your local emergency number immediately. This guidance does not replace emergency services.',
  report:
    'Mock interpretation only. CareLink has not performed real medical analysis. Treat all findings as illustrative and confirm with a licensed professional.',
  medicine:
    'Never change your dosage or stop a prescribed medicine without consulting your doctor. Confirm interactions with a pharmacist using your full medication list.',
} as const;

/** Choose the information tier for a given intent. */
export function tierForIntent(intent: IntentClassification['intent']): InformationTier {
  switch (intent) {
    case 'emergency':
      return 'emergency';
    case 'symptom':
      return 'triage';
    case 'mental-health':
      return 'triage';
    case 'report':
      return 'professional';
    case 'recovery':
    case 'disease':
    case 'medicine':
      return 'educational';
    default:
      return 'next-action';
  }
}

/** Map intent to a default urgency. */
export function urgencyForIntent(intent: IntentClassification['intent']): UrgencyLevel {
  switch (intent) {
    case 'emergency':
      return 'emergency';
    case 'symptom':
    case 'mental-health':
    case 'vaccination':
      return 'attention';
    default:
      return 'routine';
  }
}

/** True for any intent that must short-circuit before discovery. */
export function isEmergencyIntent(intent: IntentClassification['intent']): boolean {
  return intent === 'emergency';
}

/** Human label for an information tier (used by UI badges). */
export function tierLabel(tier: InformationTier): string {
  switch (tier) {
    case 'educational':
      return 'Educational information';
    case 'triage':
      return 'Possible concern';
    case 'next-action':
      return 'Next step';
    case 'emergency':
      return 'Emergency guidance';
    case 'professional':
      return 'Professional medical advice';
  }
}

/**
 * Document safety assessment (Step 11 §safety).
 *
 * Given abnormal/critical flags detected in an uploaded document, returns a
 * NON-DIAGNOSTIC concern tier + safe recommended actions. Never produces "you
 * have X disease" — only "a value is outside the reference range, discuss with
 * a clinician". Emergency indicators escalate so urgent-care guidance is shown
 * immediately, without waiting for full document processing.
 */

export interface DocumentSafetyInput {
  /** Whether any critical abnormal value was detected. */
  hasCritical?: boolean;
  /** Whether any value is outside its reference range. */
  hasAbnormal?: boolean;
  /** Free-text concern notes (e.g. per-value "outside range" messages). */
  concerns?: string[];
  /** Whether the document is an unverified medicine image. */
  isUnverifiedMedicine?: boolean;
}

export interface DocumentSafetyOutput {
  tier: InformationTier;
  summary: string;
  recommendedActions: string[];
  hasEmergencyIndicator: boolean;
  disclaimer: string;
}

export function assessDocumentSafety(input: DocumentSafetyInput): DocumentSafetyOutput {
  const hasCritical = !!input.hasCritical;
  const hasAbnormal = !!input.hasAbnormal;
  const hasEmergencyIndicator = hasCritical;
  const summary = hasCritical
    ? 'One or more values are marked critical. This can have multiple causes — seek prompt professional evaluation.'
    : hasAbnormal
      ? 'Your report contains a value outside the listed reference range. This can have multiple causes. Consider discussing it with a qualified clinician.'
      : input.isUnverifiedMedicine
        ? 'The uploaded image could not be reliably identified. Do not act on an unverified identification.'
        : 'No values requiring attention were flagged.';
  const recommendedActions = hasCritical
    ? ['Seek urgent medical attention or contact emergency services if you feel unwell.', 'Share this report with a clinician immediately.']
    : hasAbnormal
      ? ['Share these results with your doctor to build a management plan.', 'Do not start, stop, or change medication without professional advice.']
      : input.isUnverifiedMedicine
        ? ['Confirm the medicine with a pharmacist using the physical packaging.', 'Do not ingest based on an unverified identification.']
        : ['Keep this document for your records and review with your care team as needed.'];
  return {
    tier: hasCritical ? 'emergency' : hasAbnormal ? 'triage' : input.isUnverifiedMedicine ? 'triage' : 'educational',
    summary,
    recommendedActions,
    hasEmergencyIndicator,
    disclaimer:
      'This is a non-diagnostic assessment. CareLink has not performed real medical analysis. Treat all findings as illustrative and confirm with a licensed professional.',
  };
}
