/**
 * Treatment-facility discovery + medicine-care integration tests.
 *
 * These run the REAL orchestrator end-to-end (mock adapters, the same code path
 * the /ai page uses) plus the pure decision modules, so the assertions cover the
 * actual wiring:
 *
 *   report upload → real lab values → abnormal finding → service mapping
 *     → facility that PUBLISHES that department → why-relevant explanation
 *
 *   prescription upload → real extracted schedule → verbatim instruction
 *     → verified medicine reference → pharmacy discovery
 *
 *   typed medicine name → reference verification → verified facts + pharmacies
 *
 * Every input below is synthetic test data, not a real patient.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createAgentOrchestrator } from './agentOrchestrator.ts';
import { emptyContext } from './contextManager.ts';
import { mockAdapters } from './adapters/mockAdapters.ts';
import {
  matchFacilitiesForReport,
  relevantSpecialtiesForReport,
  publishedDepartmentFor,
  collectReportFindings,
} from './treatmentFacilities.ts';
import { extractMedicineCandidates, looksLikeMedicineQuestion } from './medicineLookup.ts';
import { buildMedicineCareInfo, prescriptionMatchesMedicine } from './medicineCareInfo.ts';
import { getHospitalRecommendations } from './directoryRecommendations.ts';

/** @type {import('../types').PatientContext} */
const patient = {
  activeProfileId: 'self',
  profile: { id: 'self', label: 'Self', relation: 'self', contextSummary: '', contextTags: [] },
};

const orchestrator = createAgentOrchestrator(mockAdapters);

const run = (text, overrides = {}) =>
  orchestrator.handle({
    text,
    documents: [],
    patientContext: patient,
    language: 'en',
    conversationContext: emptyContext(),
    ...overrides,
  });

const labValue = (overrides = {}) => ({
  testName: 'HbA1c (glycated haemoglobin)',
  measuredValue: '7.4',
  unit: '%',
  referenceRange: '4.0–5.6',
  status: 'abnormal',
  statusBasis: 'report-range',
  collectionDate: '2026-10-01',
  analyteKey: 'hba1c',
  critical: false,
  ...overrides,
});

const labDoc = (values) => ({
  id: 'doc-lab',
  fileName: 'lab-report.pdf',
  kind: 'pdf',
  status: 'ready',
  progress: 100,
  createdAt: new Date().toISOString(),
  secureAnalysis: {
    documentId: 'doc-lab',
    category: 'lab-report',
    summary: 'One value above range',
    importantObservations: ['HbA1c 7.4% above range'],
    possibleConcerns: ['HbA1c above range'],
    recommendedNextAction: 'Discuss with your doctor',
    isMock: false,
    source: 'real',
    validated: true,
    labResult: {
      reportTitle: 'Lab report',
      collectionDate: '2026-10-01',
      values,
      valuesRequiringAttention: values.filter((v) => v.status !== 'normal'),
      normalValues: values.filter((v) => v.status === 'normal'),
    },
    triage: { level: 'needs-follow-up', label: 'Needs follow-up', triggers: [], isEmergency: false, reason: 'Above range' },
  },
});

const prescriptionDoc = (schedule) => ({
  id: 'doc-rx',
  fileName: 'prescription.pdf',
  kind: 'pdf',
  status: 'ready',
  progress: 100,
  createdAt: new Date().toISOString(),
  secureAnalysis: {
    documentId: 'doc-rx',
    category: 'prescription',
    summary: 'Prescription with one medicine',
    importantObservations: ['Metformin 500 mg twice daily'],
    possibleConcerns: [],
    recommendedNextAction: 'Follow the prescription',
    isMock: false,
    source: 'real',
    validated: true,
    prescription: {
      doctorName: 'Dr Test',
      date: '2026-10-01',
      medicineNames: ['Metformin'],
      frequency: 'twice daily',
      duration: '30 days',
      instructions: 'after food',
      needsVerification: [],
      schedule,
    },
    triage: { level: 'informational', label: 'Informational', triggers: [], isEmergency: false, reason: 'none' },
  },
});

/* ----------------------------------------------------------------------------
 * Report → treatment-facility discovery
 * ------------------------------------------------------------------------- */

test('an abnormal report maps to the clinical SERVICE, never a diagnosis', () => {
  const specialties = relevantSpecialtiesForReport([labDoc([labValue()])]);
  assert.equal(specialties.length, 1);
  assert.equal(specialties[0].specialty, 'Endocrinology');
  assert.match(specialties[0].rationale, /blood.sugar|endocrinology/i);
  // The rationale must not diagnose.
  assert.doesNotMatch(specialties[0].rationale, /\byou have\b/i);
});

test('only findings outside range / critical / unit-problem produce a service link', () => {
  const findings = collectReportFindings([
    labDoc([
      labValue({ status: 'normal', measuredValue: '5.2' }),
      labValue({ testName: 'Serum creatinine', analyteKey: 'creatinine', measuredValue: '1.1', status: 'normal' }),
    ]),
  ]);
  assert.equal(findings.length, 0);
});

test('a facility is relevant ONLY when it publishes the matching department', async () => {
  const hospitals = await getHospitalRecommendations(null);
  // Find a facility with NO published departments — it must never be matched.
  const withoutDepartments = hospitals.find((h) => publishedDepartmentFor(h.id, 'Endocrinology') === null);
  assert.ok(withoutDepartments, 'expected a facility with no published Endocrinology department');

  const discovery = matchFacilitiesForReport([labDoc([labValue()])], hospitals);
  assert.ok(discovery.facilities.length > 0, 'expected at least one facility publishing Endocrinology');
  for (const f of discovery.facilities) {
    assert.ok(publishedDepartmentFor(f.facility.id, 'Endocrinology'), `${f.facility.name} must publish the department`);
    // The published department name is carried verbatim.
    assert.ok(f.matchedDepartment.length > 0);
    // The reason names the facility's own department and does not prescribe.
    assert.match(f.whyRelevant, new RegExp(f.matchedDepartment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(f.whyRelevant, /\b(take|prescribe|prescription|dosage|mg)\b/i);
  }
  // No facility without the department leaked in.
  assert.ok(!discovery.facilities.some((f) => f.facility.id === withoutDepartments.id));
});

test('the reason quotes the exact abnormal value and its reference range', async () => {
  const hospitals = await getHospitalRecommendations(null);
  const discovery = matchFacilitiesForReport([labDoc([labValue()])], hospitals);
  const first = discovery.facilities[0];
  assert.match(first.whyRelevant, /HbA1c/);
  assert.match(first.whyRelevant, /7\.4/);
  assert.match(first.whyRelevant, /4\.0–5\.6/);
});

test('a report with nothing outside range reports nothing to act on', async () => {
  const hospitals = await getHospitalRecommendations(null);
  const discovery = matchFacilitiesForReport([labDoc([labValue({ status: 'normal' })])], hospitals);
  assert.equal(discovery.nothingToActOn, true);
  assert.equal(discovery.facilities.length, 0);
});

test('ORCHESTRATOR: an abnormal report surfaces real facilities + a specialty action', async () => {
  const { result } = await run('explain this blood report', { documents: [labDoc([labValue()])] });
  assert.equal(result.intent, 'report');
  assert.ok(result.reportFacilities.length > 0, 'expected report facilities');
  assert.ok(result.hospitals.length > 0, 'expected hospital cards');
  // Every recommended facility publishes the department that made it relevant.
  for (const rf of result.reportFacilities) {
    assert.ok(publishedDepartmentFor(rf.facility.id, rf.specialty), `${rf.facility.name} must publish ${rf.specialty}`);
    assert.ok(rf.whyRelevant.length > 20);
  }
  const action = result.actions.find((a) => a.type === 'find-doctor');
  assert.ok(action, 'expected a find-doctor action');
  assert.match(action.href, /Endocrinology/);
  // The explanation must not diagnose or prescribe.
  const text = `${result.summary} ${result.explanation}`.toLowerCase();
  assert.doesNotMatch(text, /\byou (have|are diagnosed)\b/);
});

test('ORCHESTRATOR: a critical report escalates urgency and still recommends evidence-based facilities', async () => {
  const critical = labValue({
    testName: 'Potassium',
    analyteKey: 'potassium',
    measuredValue: '6.9',
    unit: 'mmol/L',
    referenceRange: '3.5–5.1',
    status: 'abnormal',
    critical: true,
    criticalReason: 'Above critical band',
  });
  const { result } = await run('explain this blood report', { documents: [labDoc([critical])] });
  assert.equal(result.urgency, 'urgent');
  for (const rf of result.reportFacilities) {
    assert.ok(publishedDepartmentFor(rf.facility.id, rf.specialty));
  }
});

test('ORCHESTRATOR: a report with no abnormal value gets an honest "nothing to act on" notice', async () => {
  const { result } = await run('explain this blood report', {
    documents: [labDoc([labValue({ status: 'normal', measuredValue: '5.1' })])],
  });
  assert.equal(result.hospitals.length, 0);
  assert.ok(result.reportFacilityNotice);
  assert.match(result.reportFacilityNotice, /no clinical service is indicated/i);
});

/* ----------------------------------------------------------------------------
 * Prescription → verbatim instruction + pharmacy discovery
 * ------------------------------------------------------------------------- */

test('ORCHESTRATOR: an uploaded prescription reproduces the schedule as written', async () => {
  const schedule = [{
    medicine: 'Metformin',
    strength: '500 mg',
    form: 'Tablet',
    dose: '1',
    instruction: '1 tablet twice daily after food for 30 days',
    frequency: 'twice daily',
    timing: 'after food',
    duration: '30 days',
    schedule: ['morning', 'night'],
    needsConfirmation: [],
    rawLine: 'Metformin 500 mg 1-0-1 after food x 30 days',
    page: 1,
  }];
  const { result } = await run('uploaded document', { documents: [prescriptionDoc(schedule)] });
  assert.ok(result.prescriptionSchedule, 'the prescription schedule must reach the user');
  assert.equal(result.prescriptionSchedule.length, 1);
  assert.equal(result.prescriptionSchedule[0].instruction, '1 tablet twice daily after food for 30 days');
  // The instruction is reproduced, never converted into advice.
  assert.match(result.explanation, /reproduced|exactly as written/i);
  assert.match(result.explanation, /does not create, change or remind/i);
  // Pharmacy discovery is real.
  assert.ok(result.pharmacies.length > 0);
  assert.ok(result.actions.some((a) => a.type === 'find-pharmacy'));
});

test('ORCHESTRATOR: a prescription whose fields could not be read is flagged for confirmation', async () => {
  const schedule = [{
    medicine: 'Amoxicillin',
    strength: null,
    form: 'Capsule',
    dose: null,
    instruction: 'Amoxicillin capsule — dose unclear',
    frequency: null,
    timing: null,
    duration: null,
    schedule: [],
    needsConfirmation: ['strength', 'frequency'],
    rawLine: 'Amoxicillin cap ??',
    page: 2,
  }];
  const { result } = await run('uploaded document', { documents: [prescriptionDoc(schedule)] });
  assert.ok(result.warnings.some((w) => /could not be read|confirm/i.test(w)));
  assert.deepEqual(result.prescriptionSchedule[0].needsConfirmation, ['strength', 'frequency']);
});

test('prescription matching is conservative — no partial typo matches', () => {
  const row = { medicine: 'Metformin', strength: '500 mg', form: 'Tablet', dose: null, instruction: 'x', frequency: null, timing: null, duration: null, schedule: [], needsConfirmation: [], rawLine: 'x', page: 1 };
  assert.equal(prescriptionMatchesMedicine(row, 'Metformin'), true);
  assert.equal(prescriptionMatchesMedicine(row, 'Metform'), false);
  assert.equal(prescriptionMatchesMedicine(row, 'Amlodipine'), false);
});

/* ----------------------------------------------------------------------------
 * Medicine → verified facts + pharmacy discovery
 * ------------------------------------------------------------------------- */

test('a verified medicine exposes its verified facts and pharmacy discovery', async () => {
  const { result } = await run('tell me about metformin');
  assert.equal(result.medicines.length, 1);
  assert.equal(result.medicines[0].verified, true);
  assert.ok(result.medicines[0].uses.length > 0, 'verified uses must be present');
  assert.ok(result.medicineCareInfo.verified);
  assert.ok(result.medicineCareInfo.facts.length > 0);
  assert.ok(result.medicineCareInfo.sources.some((s) => /RxNorm|openFDA/i.test(s)));
  assert.ok(result.pharmacies.length > 0, 'every medicine must offer real pharmacy discovery');
});

test('an unverified medicine shows NO fabricated facts', () => {
  const care = buildMedicineCareInfo({
    name: 'Unknowndrug',
    strength: null,
    dosageForm: null,
    manufacturerPlaceholder: null,
    confidence: 0,
    commonPurpose: null,
    safetyWarning: null,
    prescriptionRequired: false,
    isUncertain: true,
    source: 'mock',
    verified: false,
    uncertaintyReason: 'Could not verify against a reference database.',
  }, []);
  assert.equal(care.verified, false);
  assert.equal(care.facts.length, 0);
  assert.match(care.uncertaintyReason, /could not verify/i);
  assert.equal(care.referenceDosage, null);
});

test('the care info attaches the user own prescription instruction for that medicine', () => {
  const schedule = [{
    medicine: 'Metformin', strength: '500 mg', form: 'Tablet', dose: '1',
    instruction: '1 tablet twice daily after food', frequency: 'twice daily', timing: 'after food',
    duration: '30 days', schedule: ['morning', 'night'], needsConfirmation: [], rawLine: 'x', page: 1,
  }];
  const care = buildMedicineCareInfo({
    name: 'metformin', strength: null, dosageForm: null, manufacturerPlaceholder: null, confidence: 80,
    commonPurpose: null, safetyWarning: null, prescriptionRequired: true, isUncertain: false,
    source: 'real', verified: true, uses: ['Type 2 diabetes'], evidence: [{ label: 'RxNorm', supports: 'name' }],
  }, [prescriptionDoc(schedule)]);
  assert.ok(care.prescriptionInstruction);
  assert.equal(care.prescriptionInstruction.asWritten, '1 tablet twice daily after food');
  assert.deepEqual(care.prescriptionInstruction.schedule, ['morning', 'night']);
});

/* ----------------------------------------------------------------------------
 * Typed medicine names beyond the demo catalog
 * ------------------------------------------------------------------------- */

test('medicine candidate extraction keeps a brand+strength together and also tries the base name', () => {
  const c = extractMedicineCandidates('tell me about atorvastatin 10 mg');
  assert.ok(c.some((x) => /atorvastatin/i.test(x)));
  assert.ok(!c.some((x) => /^tell$/i.test(x)));
});

test('medicine question detection is a trigger only, never an answer', () => {
  assert.equal(looksLikeMedicineQuestion('tell me about atorvastatin'), true);
  assert.equal(looksLikeMedicineQuestion('find a hospital near me'), false);
});

test('ORCHESTRATOR: a typed medicine outside the demo catalog is verified and answered', async () => {
  const { result } = await run('tell me about atorvastatin');
  assert.equal(result.medicines.length, 1);
  assert.match(result.medicines[0].name, /atorvastatin/i);
  assert.equal(result.medicines[0].verified, true);
  assert.ok(result.pharmacies.length > 0);
  assert.equal(result.isDemoData, false);
});

test('ORCHESTRATOR: a non-medicine general query is not hijacked by the medicine path', async () => {
  const { result } = await run('hello there');
  assert.equal(result.intent, 'general');
  assert.equal(result.medicines.length, 0);
});
