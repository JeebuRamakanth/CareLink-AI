/**
 * CareLink-AI — document classification from ACTUAL extracted content.
 *
 * Replaces filename-guessing. Classification is scored from the real text the
 * extraction pipeline read, using weighted clinical signals (lab analyte names,
 * prescription vocabulary, discharge/imaging phrasing, tablet-label vocabulary).
 *
 * When nothing was extracted, classification is explicitly `low` confidence and
 * the caller must let the user pick the document type rather than pretending to
 * know. The user's correction always wins (`userCorrection`).
 */

import type { DocumentCategory } from '../../types';
import type { DocumentExtraction } from '../extraction/types';

export interface ClassificationSignal {
  label: string;
  weight: number;
}

export interface DocumentClassification {
  category: DocumentCategory;
  /** 0..1. Below 0.35 the caller should ask the user to confirm the type. */
  confidence: number;
  /** Human-readable reasons, shown as evidence in the UI. */
  signals: ClassificationSignal[];
  /** True when the user chose the type (authoritative over scoring). */
  userSelected: boolean;
}

interface CategoryProfile {
  category: DocumentCategory;
  patterns: RegExp[];
  weight: number;
  label: string;
}

const PROFILES: CategoryProfile[] = [
  {
    category: 'lab-report',
    label: 'laboratory vocabulary',
    weight: 1,
    patterns: [
      /\b(ha?emoglobin|hb)\b/i, /\bhba1c\b/i, /\b(creatinine|urea|egfr)\b/i,
      /\b(cholesterol|triglyceride|hdl|ldl|vldl)\b/i, /\b(platelet|wbc|rbc|mcv|mch|pcv|haematocrit)\b/i,
      /\b(tsh|t3|t4|thyroid)\b/i, /\b(bilirubin|sgot|sgpt|ast|alt|alp)\b/i,
      /\b(sodium|potassium|chloride|calcium)\b/i, /\b(fasting|postprandial|ppbs|fbs)\b/i,
      /\b(reference (range|interval)|normal range|biological ref)\b/i,
      /\b(serum|plasma|specimen|collected on|report date)\b/i,
      /\b(esr|crp|vitamin (b12|d)|ferritin|iron)\b/i,
      /\b(urine|albumin|protein|ketones|pus cells)\b/i,
    ],
  },
  {
    category: 'prescription',
    label: 'prescription vocabulary',
    weight: 1,
    patterns: [
      /\b(rx|prescription|prescribed)\b/i, /\btab\.?\b/i, /\bcap\.?\b/i, /\bsyp\.?\b/i, /\binj\.?\b/i,
      /\b(t\.?d\.?s|b\.?d\.?s|o\.?d\.?s|q\.?i\.?d|s\.?o\.?s|p\.?r\.?n|h\.?s)\b/i,
      /\b(after food|before food|empty stomach|with water)\b/i,
      /\b(once daily|twice daily|thrice daily|once a day|twice a day)\b/i,
      /\b(morning|afternoon|night|bedtime)\b/i,
      /\b(continue for|for \d+ days|for \d+ weeks|x \d+ days)\b/i,
      /\b(doctor|dr\.?|physician|clinic|hospital|reg no|consultant)\b/i,
    ],
  },
  {
    category: 'discharge-summary',
    label: 'discharge-summary vocabulary',
    weight: 1,
    patterns: [
      /\bdischarge summary\b/i, /\badmission (date|no)\b/i, /\bdate of admission\b/i,
      /\b(discharge advice|advice on discharge|follow[- ]up)\b/i, /\b(investigations? advised|review after)\b/i,
      /\b(final diagnosis|provisional diagnosis|course in hospital)\b/i,
    ],
  },
  {
    category: 'imaging',
    label: 'radiology vocabulary',
    weight: 1,
    patterns: [
      /\b(x[- ]?ray|radiograph|ct scan|mri|ultrasound|usg|sonography|doppler)\b/i,
      /\b(impression|findings|radiologist|contrast|scan of)\b/i,
      /\b(chest pa|abdomen|pelvis|skull|spine|knee|brain)\b/i,
    ],
  },
  {
    category: 'medicine-image',
    label: 'medicine-label vocabulary',
    weight: 1,
    patterns: [
      /\b(mfg|manufactured by|marketed by|batch no|b\.?no|exp(iry)? date|mrp)\b/i,
      /\b(tablets?|capsules?|syrup|suspension|injection|ointment|drops)\b/i,
      /\b(each (film[- ]coated )?tablet contains|each capsule contains|composition)\b/i,
      /\b(store (below|in)|keep out of reach|dosage as directed)\b/i,
      /\b(\d+\s?(mg|mcg|ml|iu|g))\b/i,
    ],
  },
  {
    category: 'doctor-note',
    label: 'clinical-note vocabulary',
    weight: 1,
    patterns: [
      /\b(chief complaint|history of present|h\/o|o\/e|on examination|vitals)\b/i,
      /\b(advice|advised|plan|diagnosis|impression)\b/i,
      /\b(follow[- ]?up after|review after \d+)\b/i,
    ],
  },
];

/**
 * Classify a document from its extracted content.
 * Returns `general-document` with low confidence when there is no text.
 */
export function classifyFromExtraction(
  extraction: DocumentExtraction,
  userCorrection?: DocumentCategory
): DocumentClassification {
  if (userCorrection) {
    return { category: userCorrection, confidence: 1, signals: [{ label: 'selected by you', weight: 1 }], userSelected: true };
  }

  const text = extraction.text;
  if (!text || text.replace(/\s/g, '').length < 12) {
    return {
      category: 'general-document',
      confidence: 0,
      signals: [],
      userSelected: false,
    };
  }

  const scores = PROFILES.map((profile) => {
    const matched = profile.patterns.filter((p) => p.test(text));
    return { profile, hits: matched.length };
  });

  scores.sort((a, b) => b.hits - a.hits);
  const best = scores[0];
  const total = scores.reduce((sum, s) => sum + s.hits, 0) || 1;

  if (best.hits === 0) {
    return { category: 'general-document', confidence: 0.2, signals: [], userSelected: false };
  }

  // Confidence = share of all matched signals plus a small depth bonus, capped.
  const share = best.hits / total;
  const depth = Math.min(1, best.hits / 5);
  const confidence = Math.max(0.2, Math.min(0.98, share * 0.6 + depth * 0.4));

  return {
    category: best.profile.category,
    confidence: Number(confidence.toFixed(2)),
    signals: [{ label: `${best.hits} ${best.profile.label} signal(s)`, weight: best.hits }],
    userSelected: false,
  };
}

/** Confidence below this means the UI should ask the user to confirm the type. */
export const CLASSIFICATION_CONFIRM_THRESHOLD = 0.35;
