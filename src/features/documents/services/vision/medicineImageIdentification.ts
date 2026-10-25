/**
 * CareLink-AI — medicine identification from a photograph.
 *
 * Turns a vision READ of a medicine photo into a medicine result that is
 * either:
 *
 *   - VERIFIED       — the read name resolved in an authoritative reference
 *                      database (RxNorm + openFDA label), so the facts shown
 *                      carry citations; or
 *   - POSSIBLE       — a name was read but nothing corroborated it, or the
 *                      reference database did not recognise it; or
 *   - UNIDENTIFIABLE — nothing legible was read, or the analysis service is
 *                      unavailable. The UI asks for a clearer photo / the
 *                      printed text and shows NO medicine-specific guidance.
 *
 * SAFETY CONTRACT (non-negotiable):
 * - A medicine identity is NEVER invented. The vision read supplies only what is
 *   printed; the reference database supplies only what it can verify.
 * - `verified: true` requires a real database match. Everything else is
 *   `isUncertain: true` and carries an explicit reason.
 * - The strength shown is the one PRINTED on the pack, or the one the label
 *   states. It is never converted into a patient-specific dose.
 * - When the vision service is unavailable, the outcome is an honest
 *   "unavailable" — never a demo/mock medicine.
 */

import type { EvidenceReference, MedicineRecognitionResult } from '../../types';
import { verifyMedicine, medicineSourcesAvailable, type MedicineLookup } from '../clinical/medicineSources';
import {
  isVisionConfigured,
  readMedicineImage,
} from './medicineVisionService';
import type { MedicineVisionOutcome, MedicineVisionRead } from './types';

export type MedicineIdentificationLevel = 'verified' | 'possible' | 'unidentifiable';

export interface MedicineImageIdentification {
  level: MedicineIdentificationLevel;
  /** The structured medicine result for the UI (never a fabricated identity). */
  medicine: MedicineRecognitionResult;
  /** The raw vision read, when one was produced (for transparency/evidence). */
  read?: MedicineVisionRead;
  /** True when the vision backend itself was unavailable (not a bad photo). */
  visionUnavailable?: boolean;
  /** A short, user-facing explanation of the outcome. */
  note: string;
}

const SAFETY_NOTICE =
  'Before using this medicine, consult a qualified doctor or pharmacist to confirm its identity, suitability and correct dosage.';

/** Nothing was read at all — no medicine identity is asserted. */
function unidentifiableResult(reason: string, read?: MedicineVisionRead): MedicineRecognitionResult {
  return {
    name: null,
    strength: read?.strength ?? null,
    dosageForm: read?.dosageForm ?? null,
    manufacturerPlaceholder: read?.manufacturer ?? null,
    confidence: 0,
    commonPurpose: null,
    safetyWarning: `${reason} ${SAFETY_NOTICE}`,
    prescriptionRequired: false,
    isUncertain: true,
    source: 'real',
    verified: false,
    uncertaintyReason: reason,
    evidence: read?.source
      ? [{ label: `Vision read (${read.source.provider})`, supports: 'Text read from the uploaded photograph.', retrievedAt: read.source.fetchedAt }]
      : [],
    unverified: ['medicine identity', 'strength', 'uses', 'side effects'],
  };
}

/** Map a verified reference lookup + the printed read into a medicine result. */
function verifiedFromLookup(read: MedicineVisionRead, lookup: MedicineLookup): MedicineRecognitionResult {
  const unverified = [...lookup.unverified];
  if (!read.strength) unverified.push('strength (not read from the pack)');
  if (!read.dosageForm) unverified.push('dosage form');
  if (!read.manufacturer) unverified.push('manufacturer (not printed on the pack)');

  const displayName = read.brandName ?? read.genericName ?? lookup.genericName ?? lookup.query;

  const evidence: EvidenceReference[] = [
    {
      label: `Vision read (${read.source.provider})`,
      supports: `Read from the photograph: ${[read.brandName, read.strength, read.dosageForm].filter(Boolean).join(' ') || read.readText.slice(0, 120)}`,
      retrievedAt: read.source.fetchedAt,
    },
    ...lookup.evidence,
  ];

  return {
    name: displayName,
    strength: read.strength,
    dosageForm: read.dosageForm,
    manufacturerPlaceholder: read.manufacturer ?? lookup.manufacturer,
    // The NAME is database-verified; the photograph read is not a 100% match.
    confidence: Math.round(Math.min(0.9, 0.5 + read.confidence * 0.4) * 100),
    commonPurpose: lookup.uses[0] ?? null,
    safetyWarning:
      lookup.seriousWarnings.length > 0
        ? `Important warnings: ${lookup.seriousWarnings.slice(0, 2).join(' ')} ${SAFETY_NOTICE}`
        : `Follow your prescriber's instructions. ${SAFETY_NOTICE}`,
    prescriptionRequired: lookup.prescriptionRequired === true,
    isUncertain: false,
    source: 'real',
    verified: true,
    genericName: lookup.genericName ?? read.genericName,
    uses: lookup.uses,
    sideEffects: lookup.sideEffects,
    seriousWarnings: lookup.seriousWarnings,
    referenceDosage: lookup.referenceDosage,
    uncertaintyReason: null,
    evidence,
    unverified,
  };
}

/** A name was read but not verified against a reference database. */
function possibleResult(read: MedicineVisionRead, reason: string): MedicineRecognitionResult {
  const name = read.brandName ?? read.genericName;
  return {
    name,
    strength: read.strength,
    dosageForm: read.dosageForm,
    manufacturerPlaceholder: read.manufacturer,
    confidence: Math.round(read.confidence * 100),
    commonPurpose: null,
    safetyWarning: `${reason} ${SAFETY_NOTICE}`,
    prescriptionRequired: false,
    isUncertain: true,
    source: 'real',
    verified: false,
    genericName: read.genericName,
    uncertaintyReason: reason,
    evidence: [
      {
        label: `Vision read (${read.source.provider})`,
        supports: `Text read from the photograph: ${read.readText.slice(0, 200) || name || ''}`,
        retrievedAt: read.source.fetchedAt,
      },
    ],
    unverified: ['medicine identity (not verified against a reference database)', 'uses', 'side effects'],
  };
}

/** Candidate names to try against the reference database, best evidence first. */
function candidateNames(read: MedicineVisionRead): string[] {
  const names = new Set<string>();
  // The generic ingredient is the most reliable key for a reference lookup, then
  // the printed brand line, then a brand line with the strength stripped.
  if (read.genericName) names.add(read.genericName);
  if (read.brandName) {
    names.add(read.brandName);
    const withoutStrength = read.brandName.replace(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|µg|g|ml|iu|units?|%)\b/i, '').trim();
    if (withoutStrength.length >= 3) names.add(withoutStrength);
  }
  return [...names].filter((n) => n.length >= 3).slice(0, 4);
}

/**
 * Cross-check an already-obtained vision READ against authoritative references.
 *
 * Exported so the verification path can be tested directly (without a configured
 * vision backend) and reused by the re-analysis path. It never invents a
 * medicine: a read with no database match stays a "possible" match.
 */
export async function identifyFromVisionRead(read: MedicineVisionRead): Promise<MedicineImageIdentification> {
  if (read.identificationLevel === 'unidentifiable' || (!read.brandName && !read.genericName)) {
    const reason = read.imageQuality === 'unreadable'
      ? 'The photograph could not be read clearly enough to identify a medicine.'
      : 'No readable medicine name was found in the photograph. Photograph the front AND back of the strip or box in good light.';
    return {
      level: 'unidentifiable',
      medicine: unidentifiableResult(reason, read),
      read,
      note: `${reason} ${SAFETY_NOTICE}`,
    };
  }

  if (!medicineSourcesAvailable()) {
    return {
      level: 'possible',
      medicine: possibleResult(read, 'The name was read from the photograph but could not be verified against a medicine reference database (no connection).'),
      read,
      note: `A possible match was read as "${read.brandName ?? read.genericName}", but it could not be verified. ${SAFETY_NOTICE}`,
    };
  }

  for (const name of candidateNames(read)) {
    try {
      const lookup = await verifyMedicine(name);
      if (lookup) {
        return {
          level: 'verified',
          medicine: verifiedFromLookup(read, lookup),
          read,
          note: `Matched "${read.brandName ?? name}" to a medicine reference database. ${SAFETY_NOTICE}`,
        };
      }
    } catch {
      // A failed lookup is never fatal — try the next candidate.
    }
  }

  const readName = read.brandName ?? read.genericName ?? 'the printed name';
  return {
    level: 'possible',
    medicine: possibleResult(read, `The name read from the photograph ("${readName}") could not be verified against a medicine reference database.`),
    read,
    note: `A possible match was read as "${readName}", but it could not be verified. ${SAFETY_NOTICE}`,
  };
}

/**
 * Identify a medicine from a photograph.
 *
 * Order of resolution:
 *   1. Vision read of the photo (real backend only — never a mock).
 *   2. Cross-check the read names against RxNorm/openFDA.
 *   3. Any match → verified; a read with no match → possible; nothing read → unidentifiable.
 */
export async function identifyMedicineFromImage(input: {
  file: File;
  language?: string;
  hint?: string;
  signal?: AbortSignal;
}): Promise<MedicineImageIdentification> {
  if (!isVisionConfigured()) {
    return {
      level: 'unidentifiable',
      medicine: unidentifiableResult(
        'Image analysis is not configured, so the photograph could not be read. No medicine was identified.'
      ),
      visionUnavailable: true,
      note: 'Image analysis is not configured. No medicine was identified — verify the medicine on the strip or with a pharmacist.',
    };
  }

  const outcome: MedicineVisionOutcome = await readMedicineImage(input.file, input.language ?? 'en', input.hint, input.signal);

  if (outcome.kind === 'unavailable') {
    return {
      level: 'unidentifiable',
      medicine: unidentifiableResult(outcome.message),
      visionUnavailable: true,
      note: `${outcome.message} Verify the medicine on the strip or with a pharmacist.`,
    };
  }

  const identified = await identifyFromVisionRead(outcome.read);
  return identified;
}
