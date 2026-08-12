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
