/**
 * CareLink-AI — Step 11 document analysis service.
 *
 * Wraps the Step 9 DocumentAnalysisAdapter (mock) + the real document-analysis
 * boundary (analyzeDocumentRemotely) and returns schema-validated analysis
 * results. The UI only ever renders validated output.
 *
 * SAFETY:
 * - Output is schema-validated before rendering; unvalidated/malformed remote
 *   output is rejected (never shown as if it were a real analysis).
 * - Every result carries `isMock` + `source` so mock output is never presented
 *   as a real clinical analysis.
 * - Summaries are navigational ("a value is outside the reference range; speak
 *   to a clinician"), never a diagnosis ("you have X disease").
 * - Lab values clearly separate "EXTRACTED FROM REPORT" from "AI EXPLANATION".
 */

import { env } from '../../../config';
import { log } from '../../../lib/security';
import { analyzeDocumentRemotely } from '../../health-agent/services/adapters/realAdapters';
import { adapters as resolvedAdapters, isAnyProviderReal } from '../../health-agent/services/adapters/registry';
import { recognizeMedicine } from './medicineRecognitionService';
import type { DocumentAnalysis } from '../../health-agent/types';
import type { DocumentCategory, DocumentAnalysisResult, DocumentSafetyAssessment, ExtractedMedicalValue, LabResult, MedicineRecognitionResult, PrescriptionExtraction } from '../types';
import type { DocumentKind } from '../../../services/health-data/types';
import type { DocumentDataSource } from '../types';

/** Classify a document into a broad analysis category from its kind + name. */
export function classifyDocumentCategory(kind: DocumentKind, fileName: string): DocumentCategory {
  const name = fileName.toLowerCase();
  if (name.includes('prescription') || name.includes('rx')) return 'prescription';
  if (name.includes('discharge')) return 'discharge-summary';
  if (name.includes('note') || name.includes('doctor')) return 'doctor-note';
  if (kind === 'image' && isMedicineFileName(name)) return 'medicine-image';
  if (kind === 'image') return 'imaging';
  if (kind === 'pdf' || name.includes('report') || name.includes('lab')) return 'lab-report';
  return 'general-document';
}

/** Filename tokens that signal a medicine/tablet photo (vs. an imaging study). */
const MEDICINE_NAME_TOKENS = ['med', 'medicine', 'tablet', 'pill', 'capsule', 'strip', 'syrup', 'injection', 'drug'];
function isMedicineFileName(name: string): boolean {
  return MEDICINE_NAME_TOKENS.some((t) => name.includes(t));
}

/**
 * Derive a best-effort medicine-name hint from the filename so the mock
 * recognition service can look it up in the dataset. Returns the filename base
 * (minus extension) — never a dosage. Only used as a recognition *seed*; the
 * result stays uncertain unless a real backend confirms it.
 */
function medicineHintFromName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
}

/** Mock structured lab extraction (clearly tagged). Real OCR/NLP replaces this. */
function mockLabResult(fileName: string): LabResult {
  const values: ExtractedMedicalValue[] = [
    { testName: 'Hemoglobin', measuredValue: '12.1', unit: 'g/dL', referenceRange: '13.0–17.0', status: 'attention', collectionDate: null },
    { testName: 'Fasting glucose', measuredValue: '132', unit: 'mg/dL', referenceRange: '70–99', status: 'abnormal', collectionDate: null },
    { testName: 'Total cholesterol', measuredValue: '190', unit: 'mg/dL', referenceRange: '< 200', status: 'normal', collectionDate: null },
    { testName: 'HbA1c', measuredValue: '6.8', unit: '%', referenceRange: '< 5.7', status: 'attention', collectionDate: null },
  ];
  return {
    reportTitle: fileName ? `Lab report — ${fileName}` : 'Lab report summary',
    collectionDate: null,
    values,
    valuesRequiringAttention: values.filter((v) => v.status !== 'normal'),
    normalValues: values.filter((v) => v.status === 'normal'),
  };
}

function mockPrescription(): PrescriptionExtraction {
  return {
    doctorName: null,
    date: null,
    medicineNames: ['Prescribed medication (see document)'],
    frequency: null,
    duration: null,
    instructions: null,
    needsVerification: ['Doctor name', 'Date', 'Dosage/frequency', 'Duration'],
  };
}

function mockMedicineRecognition(): MedicineRecognitionResult {
  return {
    name: null,
    strength: null,
    dosageForm: null,
    manufacturerPlaceholder: null,
    confidence: 0,
    commonPurpose: null,
    // §8: a safety warning is ALWAYS present, even when recognition is uncertain.
    safetyWarning: 'Medicine identification from an image is uncertain. Verify the name and strength printed on the strip or with a pharmacist before use. Never change a prescribed dosage without consulting your doctor.',
    prescriptionRequired: false,
    isUncertain: true,
    source: 'mock',
  };
}

/**
 * Build a schema-validated analysis result. When a real analysis backend is
 * configured AND responds with a valid shape, `isMock=false`; otherwise the
 * mock interpretation is used and clearly tagged.
 */
export async function analyzeDocument(input: {
  documentId: string;
  kind: DocumentKind;
  fileName: string;
  file: File;
}): Promise<DocumentAnalysisResult> {
  const { documentId, kind, fileName, file } = input;
  const category = classifyDocumentCategory(kind, fileName);

  // Try the real remote analysis boundary first.
  const remote = env.documents.configured ? await analyzeDocumentRemotely(file, documentId).catch(() => null) : null;
  if (remote) {
    const validated = validateRemoteAnalysis(remote, documentId, category);
    if (validated) return validated;
    log.warn('documents-analysis', 'remote analysis failed schema validation; falling back to mock');
  }

  // Mock adapter (clearly tagged). Runs through the same adapter interface so a
  // real backend can be swapped in without UI changes.
  const mockAnalysis: DocumentAnalysis = await resolvedAdapters.documents.analyze({
    id: documentId,
    fileName,
    fileSize: file.size,
    mime: file.type || 'application/octet-stream',
    kind: toAdapterKind(kind),
    status: 'ready',
    progress: 100,
  });

  const labResult = category === 'lab-report' ? mockLabResult(fileName) : undefined;
  const prescription = category === 'prescription' ? mockPrescription() : undefined;
  // For medicine images, attempt recognition via the dedicated service (which
  // reads the mock dataset + safety info). Image-only recognition is uncertain
  // in the mock layer, so we seed it from the filename and always keep a safety
  // warning. The UI never presents this as a confirmed identification.
  const medicine = category === 'medicine-image'
    ? await recognizeMedicine({ text: medicineHintFromName(fileName), documentId }).then((r) => r.safetyWarning ? r : { ...r, safetyWarning: mockMedicineRecognition().safetyWarning })
    : undefined;

  const safety = assessSafety(labResult);

  return {
    documentId,
    category,
    summary: mockSummary(category),
    importantObservations: mockAnalysis.keyFindings,
    possibleConcerns: labResult ? labResult.valuesRequiringAttention.map((v) => `${v.testName} (${v.measuredValue} ${v.unit}) is outside the listed reference range.`) : [],
    recommendedNextAction: recommendedAction(category, safety),
    labResult,
    prescription,
    medicine,
    isMock: true,
    source: isAnyProviderReal() ? 'mock' : 'mock',
    validated: true,
  };
}

/** Schema-validate a remote analysis payload before rendering it. */
function validateRemoteAnalysis(
  remote: { category: string; extractedTextPlaceholder: string; keyFindings: string[]; isMock: false },
  documentId: string,
  fallbackCategory: DocumentCategory
): DocumentAnalysisResult | null {
  try {
    if (typeof remote.category !== 'string') return null;
    if (!Array.isArray(remote.keyFindings)) return null;
    const validCategories: DocumentCategory[] = ['lab-report', 'prescription', 'medicine-image', 'discharge-summary', 'imaging', 'doctor-note', 'general-document'];
    const category = (validCategories as string[]).includes(remote.category) ? (remote.category as DocumentCategory) : fallbackCategory;
    const findings = remote.keyFindings.filter((f) => typeof f === 'string' && f.length > 0).slice(0, 12);
    return {
      documentId,
      category,
      summary: typeof remote.extractedTextPlaceholder === 'string' ? remote.extractedTextPlaceholder.slice(0, 280) : 'Analysis complete.',
      importantObservations: findings,
      possibleConcerns: [],
      recommendedNextAction: 'Discuss these findings with a qualified clinician.',
      isMock: false,
      source: 'real',
      validated: true,
    };
  } catch {
    return null;
  }
}

/** Assess whether a lab result contains emergency-grade or attention values. */
export function assessSafety(labResult?: LabResult): DocumentSafetyAssessment {
  if (!labResult) return { isEmergency: false, hasAttentionValues: false, reason: 'No structured lab values extracted.' };
  const attention = labResult.valuesRequiringAttention;
  const hasAbnormal = attention.some((v) => v.status === 'abnormal');
  return {
    isEmergency: false, // Mock analysis never asserts emergency severity.
    hasAttentionValues: attention.length > 0,
    reason: hasAbnormal ? 'One or more values are outside the reference range.' : 'Values are within the listed reference ranges.',
  };
}

function mockSummary(category: DocumentCategory): string {
  switch (category) {
    case 'lab-report':
      return 'This report contains values outside the listed reference range. Multiple causes are possible — consider discussing it with a qualified clinician.';
    case 'prescription':
      return 'A prescription was detected. Some fields could not be read clearly and are marked "Needs verification".';
    case 'medicine-image':
      return 'A medicine/tablet image was detected. Medicine identification is uncertain — please verify the name and strength on the strip or with a pharmacist.';
    case 'discharge-summary':
      return 'A discharge summary was detected. Review the listed medications and follow-up advice with your care team.';
    case 'imaging':
      return 'An imaging study was detected. A radiologist review is recommended; compare with prior studies if available.';
    case 'doctor-note':
      return 'A doctor note was detected. Confirm any instructions with the prescribing clinician.';
    default:
      return 'A document was received. Structured extraction is pending a real analysis backend.';
  }
}

function recommendedAction(category: DocumentCategory, safety: DocumentSafetyAssessment): string {
  if (safety.hasAttentionValues) return 'Discuss the values outside the reference range with a qualified clinician before changing any treatment.';
  switch (category) {
    case 'prescription':
      return 'Verify unclear fields with your doctor or pharmacist before following any instructions.';
    case 'medicine-image':
      return 'Confirm the medicine name and strength with a pharmacist.';
    case 'imaging':
      return 'Have the imaging reviewed by a radiologist and discuss with your doctor.';
    default:
      return 'Review the extracted information with a qualified clinician.';
  }
}

function toAdapterKind(kind: DocumentKind): 'image' | 'pdf' | 'document' | 'camera' | 'unknown' {
  switch (kind) {
    case 'image': return 'image';
    case 'pdf': return 'pdf';
    case 'document': return 'document';
    default: return 'unknown';
  }
}

/** Re-export so callers can read the active data source flag. */
export function documentAnalysisSource(): DocumentDataSource {
  return env.documents.configured ? 'real' : 'mock';
}
