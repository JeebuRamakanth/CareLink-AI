/**
 * CareLink-AI — verified medicine information + prescription-aware care.
 *
 * Two jobs, both safety-critical:
 *
 *  A. VERIFIED EDUCATIONAL INFORMATION
 *     A medicine fact (purpose, side effects, warnings, reference dosage) is
 *     surfaced ONLY when it came back from an authoritative reference database.
 *     Nothing is filled in from a model, a filename, or a small local list —
 *     unverified facts are reported as unverified.
 *
 *  B. PRESCRIPTION-AWARE INSTRUCTIONS
 *     When the user attached their OWN prescription, its extracted instruction
 *     for that medicine is shown verbatim ("as written on your prescription"),
 *     clearly separated from general educational information, and never
 *     converted into advice. An instruction the parser could not read is shown
 *     as needing confirmation — never guessed.
 *
 * This module never changes, creates or recommends a dose.
 */

import type { MedicineRecognitionResult, PrescriptionExtraction, ScheduleRow } from '../../documents/types';
import type { HealthDocument } from '../types';

export interface VerifiedMedicineFact {
  /** Short fact label, e.g. "Common uses". */
  label: string;
  /** The verified content, taken verbatim from the source. */
  detail: string;
}

export interface PrescriptionInstruction {
  /** The instruction EXACTLY as written on the user's prescription. */
  asWritten: string;
  strength: string | null;
  form: string | null;
  frequency: string | null;
  timing: string | null;
  duration: string | null;
  schedule: string[];
  /** Fields the parser could not read — must be confirmed by a human. */
  needsConfirmation: string[];
  /** Page of the user's own document the line came from. */
  page: number;
}

export interface MedicineCareInfo {
  /** True only when the medicine was verified against a reference database. */
  verified: boolean;
  /** Why it is not verified (never empty when `verified` is false). */
  uncertaintyReason: string | null;
  /** Verified educational facts, each traceable to a source. */
  facts: VerifiedMedicineFact[];
  /** Source labels for the facts above. */
  sources: string[];
  /** What could NOT be verified — stated, never hidden. */
  unverified: string[];
  /** The user's own prescription instruction for this medicine, when attached. */
  prescriptionInstruction: PrescriptionInstruction | null;
  /** The reference (label) dosage text — never a patient-specific dose. */
  referenceDosage: string | null;
}

const normalize = (v: string): string => v.trim().toLowerCase();

/**
 * Whether a prescription line and a medicine name refer to the same medicine.
 * Deliberately conservative: a match requires the prescription's medicine name
 * to contain the verified generic/display name (or vice versa) as a whole-word
 * fragment. A partial typo never matches.
 */
export function prescriptionMatchesMedicine(row: ScheduleRow, medicineName: string): boolean {
  const rowName = normalize(row.medicine);
  const target = normalize(medicineName);
  if (!rowName || !target) return false;
  if (rowName === target) return true;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(rowName);
}

/** The user's own prescription instruction for a medicine, or null. */
export function prescriptionInstructionFor(
  documents: HealthDocument[],
  medicineName: string | null,
): PrescriptionInstruction | null {
  if (!medicineName) return null;
  for (const doc of documents) {
    const rx: PrescriptionExtraction | undefined = doc.secureAnalysis?.prescription;
    const rows = rx?.schedule ?? [];
    for (const row of rows) {
      if (!prescriptionMatchesMedicine(row, medicineName)) continue;
      return {
        asWritten: row.instruction,
        strength: row.strength,
        form: row.form,
        frequency: row.frequency,
        timing: row.timing,
        duration: row.duration,
        schedule: row.schedule,
        needsConfirmation: row.needsConfirmation,
        page: row.page,
      };
    }
  }
  return null;
}

/**
 * Build the care information for one medicine result.
 *
 * Verified facts come ONLY from `medicine.uses` / `sideEffects` /
 * `seriousWarnings` / `referenceDosage`, which the identification service fills
 * exclusively from an authoritative lookup. An unverified result produces an
 * empty fact list and a stated reason instead.
 */
export function buildMedicineCareInfo(
  medicine: MedicineRecognitionResult,
  documents: HealthDocument[] = [],
): MedicineCareInfo {
  const verified = medicine.verified === true && medicine.source === 'real';
  const facts: VerifiedMedicineFact[] = [];

  if (verified) {
    if (medicine.uses && medicine.uses.length > 0) {
      facts.push({ label: 'Common uses', detail: medicine.uses.slice(0, 3).join(' ') });
    }
    if (medicine.sideEffects && medicine.sideEffects.length > 0) {
      facts.push({ label: 'Common side effects', detail: medicine.sideEffects.slice(0, 3).join(' ') });
    }
    if (medicine.seriousWarnings && medicine.seriousWarnings.length > 0) {
      facts.push({ label: 'Serious warnings', detail: medicine.seriousWarnings.slice(0, 2).join(' ') });
    }
  }

  const sources = (medicine.evidence ?? []).map((e) => e.label);

  return {
    verified,
    uncertaintyReason: verified
      ? null
      : medicine.uncertaintyReason
        ?? 'This medicine was not verified against a reference database, so no medicine facts are shown.',
    facts,
    sources,
    unverified: medicine.unverified ?? [],
    prescriptionInstruction: prescriptionInstructionFor(documents, medicine.name),
    referenceDosage: verified ? medicine.referenceDosage ?? null : null,
  };
}
