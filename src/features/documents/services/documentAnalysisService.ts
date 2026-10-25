/**
 * CareLink-AI — document analysis service (real extraction + deterministic
 * clinical interpretation).
 *
 * Replaces the earlier filename-guessing mock that rendered invented lab values
 * ("Fasting glucose 132 mg/dL") as if they had been extracted from the user's
 * report. Nothing is fabricated here:
 *
 *   file → extract real text (PDF text layer / on-device OCR)
 *        → classify from that text (user correction wins)
 *        → parse structured rows (lab / prescription / medicine label)
 *        → reconcile units + reference intervals
 *        → deterministic triage (critical values, emergency symptoms)
 *        → verify medicine facts against authoritative sources
 *        → schema-validated result with evidence + limitations
 *
 * When nothing could be extracted, the result says so and asks for a clearer
 * upload. It never substitutes demo data for the user's document.
 *
 * The optional server document-analysis boundary is still consulted first when
 * configured; its payload is schema-validated and merged (never trusted raw).
 */

import { env } from '../../../config';
import { analyzeDocumentRemotely } from '../../health-agent/services/adapters/realAdapters';
import { extractDocumentText } from './extraction/extractDocument';
import { classifyFromExtraction, CLASSIFICATION_CONFIRM_THRESHOLD } from './extraction/classify';
import { parseLabReport } from './clinical/labParser';
import { parsePrescription } from './clinical/prescriptionParser';
import { triageDocument, TRIAGE_LABEL } from './clinical/triage';
import { CATALOG_REVIEWED, CATALOG_VERSION } from './clinical/analyteCatalog';
import { identifyMedicine } from './medicineIdentificationService';
import { recognizeMedicine as recognizeFromLocalCatalog } from './medicineRecognitionService';
import type {
  DocumentAnalysisResult,
  DocumentCategory,
  DocumentSafetyAssessment,
  DocumentDataSource,
  EvidenceReference,
  ExtractedMedicalValue,
  LabResult,
  PrescriptionExtraction,
  ScheduleRow,
} from '../types';
import type { DocumentKind } from '../../../services/health-data/types';
import type { DocumentExtraction } from './extraction/types';

export { classifyFromExtraction, CLASSIFICATION_CONFIRM_THRESHOLD };

export interface AnalyzeDocumentInput {
  documentId: string;
  kind: DocumentKind;
  fileName: string;
  file: File;
  /** A user-chosen document type, which overrides content classification. */
  userCategory?: DocumentCategory;
  /** Optional text the user typed alongside the upload (e.g. symptoms). */
  userText?: string;
}

/* ----------------------------------------------------------------------------
 * Public API
 * ------------------------------------------------------------------------- */

/**
 * Analyse one document. Always resolves to a schema-validated result; never
 * throws. The result is explicit about what was extracted and what was not.
 */
export async function analyzeDocument(input: AnalyzeDocumentInput): Promise<DocumentAnalysisResult> {
  const { documentId, kind, fileName, file, userCategory, userText } = input;

  // 1. Real extraction from the file.
  const extraction = await extractDocumentText({ file, kind: toExtractionKind(kind) });

  const result = await analyzeExtraction({ documentId, fileName, extraction, userCategory, userText });

  // 2. Optional server analysis (validated + merged as DATA, never trusted raw).
  if (env.documents.configured) {
    const remote = await analyzeDocumentRemotely(file, documentId).catch(() => null);
    const serverFindings = remote && Array.isArray(remote.keyFindings)
      ? remote.keyFindings.filter((f) => typeof f === 'string' && f.trim().length > 0).slice(0, 6)
      : [];
    if (serverFindings.length > 0) {
      result.importantObservations = [
        ...result.importantObservations,
        ...serverFindings.map((f) => `Server analysis: ${f}`),
      ];
      result.evidence = [
        ...(result.evidence ?? []),
        { label: 'Server document analysis', supports: 'Additional findings returned by the configured server analysis service.', retrievedAt: new Date().toISOString() },
      ];
    }
  }

  return result;
}

export interface AnalyzeExtractionInput {
  documentId: string;
  fileName: string;
  extraction: DocumentExtraction;
  userCategory?: DocumentCategory;
  userText?: string;
}

/**
 * Interpret an already-extracted document. Separated from `analyzeDocument` so a
 * re-analysis with a corrected document type can reuse the text read the first
 * time — the browser no longer holds the original file, and re-running OCR would
 * risk a different result.
 */
export async function analyzeExtraction(input: AnalyzeExtractionInput): Promise<DocumentAnalysisResult> {
  const { documentId, fileName, extraction, userCategory, userText } = input;

  // 2. Classification from the ACTUAL content (user correction wins).
  const classification = classifyFromExtraction(extraction, userCategory);
  const category = classification.category;

  // 3. Structured parsing of the extracted text.
  const lab = category === 'lab-report' ? parseLabReport(extraction.pages) : null;
  const rx = category === 'prescription' ? parsePrescription(extraction.pages) : null;

  const labResult = lab ? buildLabResult(fileName, lab, extraction) : undefined;
  const prescription = rx ? buildPrescriptionExtraction(rx) : undefined;

  let medicine = undefined;
  if (category === 'medicine-image') {
    medicine = await identifyMedicine({
      text: userText?.trim() || undefined,
      labelText: extraction.text || undefined,
      documentId,
    });
  }

  // 4. Deterministic triage — critical lab values + any emergency symptom text.
  const triage = triageDocument(lab?.values ?? [], extraction.text, userText ?? '');

  // 5. Compose the validated result.
  const limitations = collectLimitations(extraction, category, labResult, prescription);
  const evidence = collectEvidence(category, medicine, labResult);

  const summary = buildSummary({ category, extraction, labResult, prescription, medicine, triage, fileName });
  const importantObservations = buildObservations({ category, labResult, prescription, medicine, extraction });
  const possibleConcerns = buildConcerns({ labResult, triage });
  const recommendedNextAction = buildNextAction(category, triage, labResult);

  const noText = extraction.status !== 'extracted' || extraction.text.trim().length === 0;

  return {
    documentId,
    category,
    summary,
    importantObservations,
    possibleConcerns,
    recommendedNextAction,
    labResult,
    prescription,
    medicine,
    // Real only when the text came from an actual extraction backend — never
    // because a mock dataset was consulted.
    isMock: false,
    source: resolveSource(extraction),
    validated: true,
    extraction,
    classification,
    triage,
    evidence,
    limitations: noText
      ? ['No text could be read from this document, so no findings were interpreted.', ...limitations]
      : limitations,
  };
}

/* ----------------------------------------------------------------------------
 * Mapping helpers
 * ------------------------------------------------------------------------- */

function toExtractionKind(kind: DocumentKind): 'image' | 'pdf' | 'document' | 'other' {
  switch (kind) {
    case 'image':
    case 'medicine_image':
      return 'image';
    case 'pdf':
    case 'lab_report':
    case 'prescription':
      return kind === 'lab_report' || kind === 'prescription' ? 'image' : 'pdf';
    case 'document':
      return 'document';
    default:
      return 'other';
  }
}

function resolveSource(extraction: DocumentExtraction): DocumentDataSource {
  if (extraction.status === 'extracted') return extraction.backend === 'server-ocr' ? 'real' : 'real';
  return 'unavailable';
}

/** Convert the parser output into the UI-facing LabResult shape. */
function buildLabResult(
  fileName: string,
  lab: ReturnType<typeof parseLabReport>,
  extraction: DocumentExtraction
): LabResult {
  const values: ExtractedMedicalValue[] = lab.values.map((v) => ({
    testName: v.testName,
    measuredValue: v.rawValue,
    unit: v.unit,
    referenceRange: v.referenceText ?? (v.interval ? `${v.interval.low}–${v.interval.high}` : ''),
    status: v.status,
    statusBasis: v.statusBasis,
    collectionDate: lab.collectionDate,
    page: v.page,
    reportFlag: v.reportFlag,
    unitStatus: v.unitStatus,
    analyteKey: v.analyteKey,
    about: v.about,
    whyOrdered: v.whyOrdered,
    critical: v.critical,
    criticalReason: v.criticalReason,
    rawLine: v.rawLine,
  }));

  return {
    reportTitle: `Lab report — ${fileName}`,
    collectionDate: lab.collectionDate,
    values,
    valuesRequiringAttention: values.filter((v) => v.status === 'abnormal' || v.status === 'attention' || v.critical),
    normalValues: values.filter((v) => v.status === 'normal'),
    unknownValues: values.filter((v) => v.status === 'unknown'),
    unparsedLines: lab.unparsedLines,
    pageCount: extraction.pageCount,
  };
}

function buildPrescriptionExtraction(rx: ReturnType<typeof parsePrescription>): PrescriptionExtraction {
  const schedule: ScheduleRow[] = rx.medicines.map((m) => ({
    medicine: m.name,
    strength: m.strength,
    form: m.form,
    dose: m.dose,
    instruction: m.rawLine,
    frequency: m.frequencyLabel ?? m.frequency,
    timing: m.timing,
    duration: m.duration,
    schedule: m.schedule,
    needsConfirmation: m.needsConfirmation,
    rawLine: m.rawLine,
    page: m.page,
  }));

  const needsVerification = [...new Set(rx.medicines.flatMap((m) => m.needsConfirmation))];
  const firstWithFreq = rx.medicines.find((m) => m.frequencyLabel);

  return {
    doctorName: rx.doctorName,
    date: rx.date,
    medicineNames: rx.medicines.map((m) => m.name),
    frequency: firstWithFreq?.frequencyLabel ?? null,
    duration: rx.medicines.find((m) => m.duration)?.duration ?? null,
    instructions: rx.followUp[0] ?? null,
    needsVerification,
    medicines: rx.medicines,
    schedule,
    followUp: rx.followUp,
    unparsedLines: rx.unparsedLines,
  };
}

/* ----------------------------------------------------------------------------
 * Narrative builders — grounded strictly in the parsed structure
 * ------------------------------------------------------------------------- */

interface SummaryInput {
  category: DocumentCategory;
  extraction: DocumentExtraction;
  labResult?: LabResult;
  prescription?: PrescriptionExtraction;
  medicine?: DocumentAnalysisResult['medicine'];
  triage: ReturnType<typeof triageDocument>;
  fileName: string;
}

function buildSummary({ category, extraction, labResult, prescription, medicine, triage }: SummaryInput): string {
  if (extraction.status !== 'extracted' || !extraction.text.trim()) {
    return extraction.note
      ? `${extraction.note} No findings were interpreted from this document.`
      : 'No text could be read from this document, so no findings were interpreted. Please upload a clearer copy.';
  }

  switch (category) {
    case 'lab-report': {
      if (!labResult || labResult.values.length === 0) {
        return 'Text was read from this document, but no laboratory value rows could be recognised. Please check that the value table is visible and legible.';
      }
      const abnormal = labResult.valuesRequiringAttention.length;
      const total = labResult.values.length;
      const critical = labResult.values.filter((v) => v.critical).length;
      if (critical > 0) return `${critical} value(s) in this report are in a critical range and need prompt professional review. ${total} values were read in total.`;
      if (abnormal > 0) return `${abnormal} of ${total} read values fall outside the reference range printed on the report. ${triage.level === 'needs-follow-up' ? 'A clinician follow-up is advisable.' : ''}`.trim();
      return `${total} laboratory values were read from this report and all fall within the ranges printed on the report. This is not a clean bill of health — interpretation needs clinical context.`;
    }
    case 'prescription': {
      if (!prescription || prescription.medicineNames.length === 0) {
        return 'Text was read from this document, but no clear medicine lines could be recognised. Please confirm the prescription with your doctor or pharmacist.';
      }
      return `${prescription.medicineNames.length} medicine line(s) were read from this prescription. Instructions are shown exactly as written; anything unclear is marked for confirmation.`;
    }
    case 'medicine-image': {
      if (medicine?.verified && medicine.name) {
        return `The medicine "${medicine.name}"${medicine.strength ? ` ${medicine.strength}` : ''} was matched against a medicine database. Details below come from the official label.`;
      }
      return 'A medicine image was received, but it could not be identified with confidence. Upload a clearer photo of the front and back of the packaging, or type the medicine name.';
    }
    case 'discharge-summary':
      return 'A discharge summary was read. Review the medication and follow-up sections below with your care team.';
    case 'imaging':
      return 'An imaging report was read. Imaging needs a radiologist\'s review — the text below is not an interpretation of the image itself.';
    case 'doctor-note':
      return 'A clinical note was read. Confirm any instructions with the treating clinician.';
    default:
      return 'Text was read from this document, but it does not match a known medical-document type. Confirm the document type so it can be interpreted correctly.';
  }
}

function buildObservations(input: {
  category: DocumentCategory;
  labResult?: LabResult;
  prescription?: PrescriptionExtraction;
  medicine?: DocumentAnalysisResult['medicine'];
  extraction: DocumentExtraction;
}): string[] {
  const { labResult, prescription, medicine } = input;
  const observations: string[] = [];

  if (labResult) {
    for (const v of labResult.values.slice(0, 12)) {
      const ref = v.referenceRange ? ` (reference ${v.referenceRange})` : '';
      observations.push(`${v.testName}: ${v.measuredValue}${v.unit ? ` ${v.unit}` : ''}${ref} — ${v.status}${v.critical ? ' — CRITICAL' : ''}`);
    }
  }
  if (prescription) {
    for (const row of prescription.schedule ?? []) {
      observations.push(`${row.medicine}${row.strength ? ` ${row.strength}` : ''} — ${row.instruction}`);
    }
    for (const f of prescription.followUp ?? []) observations.push(f);
  }
  if (medicine?.uses?.length) {
    observations.push(`Common uses (verified): ${medicine.uses.slice(0, 3).join(' ')}`);
  }
  return observations.slice(0, 16);
}

function buildConcerns(input: { labResult?: LabResult; triage: ReturnType<typeof triageDocument> }): string[] {
  const concerns: string[] = [];
  for (const t of input.triage.triggers) {
    if (t.level === 'emergency' || t.level === 'urgent') concerns.push(t.detail);
  }
  if (input.labResult) {
    for (const v of input.labResult.valuesRequiringAttention.filter((x) => !x.critical).slice(0, 6)) {
      concerns.push(`${v.testName} (${v.measuredValue}${v.unit ? ` ${v.unit}` : ''}) is outside the range printed on the report. Multiple causes are possible.`);
    }
  }
  return concerns.slice(0, 10);
}

function buildNextAction(category: DocumentCategory, triage: ReturnType<typeof triageDocument>, labResult?: LabResult): string {
  if (triage.isEmergency) {
    return 'Some findings need immediate attention. If you feel unwell now, contact emergency services or go to the nearest emergency department. Otherwise, contact your doctor today with this report.';
  }
  if (triage.level === 'urgent') return 'Show this document to a clinician promptly — within a day or two.';
  if (labResult && labResult.valuesRequiringAttention.length > 0) {
    return 'Discuss the values outside the reference range with a qualified clinician. Do not change any treatment based on this analysis alone.';
  }
  switch (category) {
    case 'prescription':
      return 'Verify any unclear fields with your doctor or pharmacist before following the instructions.';
    case 'medicine-image':
      return 'Confirm the medicine name and strength with a pharmacist, or upload a clearer photo of the packaging.';
    case 'imaging':
      return 'Have the imaging reviewed by the radiologist and discuss it with your doctor.';
    default:
      return 'Review the extracted information with a qualified clinician.';
  }
}

/* ----------------------------------------------------------------------------
 * Evidence + limitations
 * ------------------------------------------------------------------------- */

function collectEvidence(
  category: DocumentCategory,
  medicine: DocumentAnalysisResult['medicine'],
  labResult?: LabResult
): EvidenceReference[] {
  const evidence: EvidenceReference[] = [];
  if (medicine?.evidence?.length) evidence.push(...medicine.evidence);
  if (labResult && labResult.values.some((v) => v.analyteKey)) {
    evidence.push({
      label: `CareLink clinical reference catalog v${CATALOG_VERSION}`,
      retrievedAt: new Date().toISOString(),
      supports: 'Plain-language test explanations and fallback reference intervals (the report\'s own interval always takes precedence).',
    });
  }
  if (evidence.length === 0 && (category === 'lab-report' || category === 'prescription')) {
    evidence.push({
      label: 'Values read directly from your uploaded document',
      supports: 'All extracted values and instructions shown come from the uploaded file.',
    });
  }
  return evidence;
}

function collectLimitations(
  extraction: DocumentExtraction,
  category: DocumentCategory,
  labResult?: LabResult,
  prescription?: PrescriptionExtraction
): string[] {
  const limitations: string[] = [];
  if (extraction.partial) limitations.push('Some pages of this document could not be read.');
  if (extraction.backend === 'ocr') {
    limitations.push('Text was read with on-device OCR, which can misread digits and units. Check the values against the original document.');
  }
  if (labResult?.unparsedLines?.length) {
    limitations.push(`${labResult.unparsedLines.length} line(s) in this report could not be parsed and were not interpreted.`);
  }
  if (labResult?.values.some((v) => v.unitStatus === 'unit-mismatch')) {
    limitations.push('One or more values use a unit that could not be reconciled, so they were shown as printed without a range comparison.');
  }
  if (prescription?.needsVerification?.length) {
    limitations.push(`Some prescription fields were unclear: ${prescription.needsVerification.join(', ')}.`);
  }
  if (category === 'lab-report' && !CATALOG_REVIEWED) {
    limitations.push('The clinical reference catalog has not yet been reviewed by a clinician; fallback reference intervals are indicative only.');
  }
  return limitations;
}

/* ----------------------------------------------------------------------------
 * Safety assessment (consumed by the agent + UI banner)
 * ------------------------------------------------------------------------- */

/** Assess a document's urgency from its deterministic triage result. */
export function assessSafety(labResult?: LabResult, triage?: ReturnType<typeof triageDocument>): DocumentSafetyAssessment {
  if (triage) {
    return {
      isEmergency: triage.isEmergency,
      hasAttentionValues: triage.triggers.some((t) => t.level === 'urgent' || t.level === 'emergency' || t.level === 'needs-follow-up'),
      reason: triage.reason,
      triage,
    };
  }
  if (!labResult) return { isEmergency: false, hasAttentionValues: false, reason: 'No structured lab values were extracted.' };
  const attention = labResult.valuesRequiringAttention;
  const critical = labResult.values.some((v) => v.critical);
  return {
    isEmergency: critical,
    hasAttentionValues: attention.length > 0,
    reason: critical
      ? 'One or more values are in a critical range and need prompt professional review.'
      : attention.length > 0
        ? 'One or more values are outside the reference range printed on the report.'
        : 'Values are within the ranges printed on the report.',
  };
}

/** Whether a real analysis backend (server) is configured. */
export function documentAnalysisSource(): DocumentDataSource {
  return env.documents.configured ? 'real' : 'mock';
}

/** Exposed for the UI so a "not reviewed" catalog is visible. */
export function clinicalCatalogStatus(): { version: string; reviewed: boolean } {
  return { version: CATALOG_VERSION, reviewed: CATALOG_REVIEWED };
}

export { TRIAGE_LABEL };
export type { DocumentExtraction };

/** Re-exported for the local fallback path used elsewhere. */
export { recognizeFromLocalCatalog };
