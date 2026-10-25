/**
 * CareLink-AI — clinical parser + triage tests.
 *
 * All fixtures are SYNTHETIC test data written for this test file. They are not
 * real patient records. Values and units are chosen to exercise the parser and
 * the deterministic safety rules.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLabReport, parseLabLine } from './clinical/labParser.ts';
import { parsePrescription, parsePrescriptionLine, deriveSchedule } from './clinical/prescriptionParser.ts';
import { triageDocument, triageSymptoms, triageLabValues, combineTriage } from './clinical/triage.ts';
import { parseInterval, reconcileUnit } from './clinical/units.ts';
import { findAnalyte } from './clinical/analyteCatalog.ts';
import { parseMedicineLabel } from './clinical/labelParser.ts';
import { buildTrends } from './clinical/trends.ts';
import { classifyFromExtraction } from './extraction/classify.ts';

const page = (text, pageNumber = 1) => ({ pageNumber, text });

/* ---------------------------------------------------------------------------
 * Lab parsing
 * ------------------------------------------------------------------------- */

test('parses a lab row with value, unit and reference range', () => {
  const v = parseLabLine('Hemoglobin 12.1 g/dL 13.0 - 17.0', 1);
  assert.ok(v, 'row should parse');
  assert.equal(v.testName, 'Hemoglobin');
  assert.equal(v.rawValue, '12.1');
  assert.equal(v.unit, 'g/dL');
  assert.equal(v.referenceText, '13.0 - 17.0');
  assert.equal(v.intervalSource, 'report');
  assert.equal(v.status, 'abnormal');
  assert.equal(v.page, 1);
});

test('parses a row that prints a lab flag instead of a range', () => {
  const v = parseLabLine('Fasting Blood Sugar 132 mg/dL H', 1);
  assert.ok(v);
  assert.equal(v.reportFlag, 'High');
  assert.equal(v.status, 'abnormal');
  assert.equal(v.statusBasis, 'report-flag');
});

test('honours the report flag over the reference range', () => {
  // The lab flagged it normal even though it sits above our catalog interval.
  const v = parseLabLine('Total Cholesterol 210 mg/dL 0 - 200 N', 1);
  assert.ok(v);
  assert.equal(v.status, 'normal');
  assert.equal(v.statusBasis, 'report-flag');
});

test('flags a critical value independently of the reference range', () => {
  const v = parseLabLine('Potassium 6.9 mmol/L 3.5 - 5.1', 1);
  assert.ok(v);
  assert.equal(v.status, 'abnormal');
  assert.equal(v.critical, true);
  assert.match(v.criticalReason ?? '', /critical high limit/);
});

test('does not compare against a catalog interval when the unit is unreconciled', () => {
  const v = parseLabLine('Potassium 4.2 bananas/L', 1);
  assert.ok(v);
  assert.equal(v.unitStatus, 'unit-mismatch');
  assert.equal(v.status, 'unknown');
  assert.equal(v.intervalSource, 'catalog');
  // Not comparable → no critical flag invented.
  assert.equal(v.critical, false);
});

test('never fabricates a value for a header line', () => {
  assert.equal(parseLabLine('Patient Name : Ramesh', 1), null);
  assert.equal(parseLabLine('Reference Range 13.0 - 17.0', 1), null);
  assert.equal(parseLabLine('Report Date 12/03/2025', 1), null);
});

test('parses a full multi-page report and keeps page provenance', () => {
  const result = parseLabReport([
    page('Hemoglobin 11.2 g/dL 13.0 - 17.0 L\nTotal Leucocyte Count 9800 /cumm 4000 - 11000', 1),
    page('HbA1c 7.4 % 4.0 - 5.6 H', 2),
  ]);
  assert.equal(result.parsed, true);
  assert.equal(result.values.length, 3);
  assert.equal(result.values.find((v) => v.testName === 'HbA1c')?.page, 2);
  assert.equal(result.values.find((v) => v.testName === 'Hemoglobin')?.status, 'abnormal');
});

test('deduplicates identical rows repeated in a header/footer', () => {
  const result = parseLabReport([page('Creatinine 1.0 mg/dL 0.7 - 1.3\nCreatinine 1.0 mg/dL 0.7 - 1.3', 1)]);
  assert.equal(result.values.length, 1);
});

test('reports unparsed data-looking lines instead of guessing', () => {
  const result = parseLabReport([page('Some odd measurement column ??? 4.5 ???', 1)]);
  assert.equal(result.parsed, false);
  assert.ok(result.unparsedLines.length >= 1);
});

/* ---------------------------------------------------------------------------
 * Units + intervals
 * ------------------------------------------------------------------------- */

test('parses range, < and > interval forms', () => {
  assert.deepEqual(parseInterval('13.0 - 17.0'), { low: 13, high: 17 });
  assert.deepEqual(parseInterval('< 200'), { low: 0, high: 200 });
  assert.deepEqual(parseInterval('> 40'), { low: 40, high: Number.POSITIVE_INFINITY });
  assert.deepEqual(parseInterval('70 to 99'), { low: 70, high: 99 });
  assert.equal(parseInterval('not a range'), null);
});

test('reconciles identical units and refuses unknown ones', () => {
  assert.equal(reconcileUnit('g/dL', 'g/dL').status, 'match');
  assert.equal(reconcileUnit('mg/dl', 'mg/dL').status, 'match');
  assert.equal(reconcileUnit('furlongs', 'mg/dL').status, 'unit-mismatch');
  assert.equal(reconcileUnit('', 'mg/dL').status, 'unit-absent');
});

test('converts a known molar unit with an explicit factor', () => {
  const r = reconcileUnit('mmol/L', 'mg/dL', 'glucose');
  assert.equal(r.status, 'converted');
  assert.ok(Math.abs(r.factor - 18.0182) < 0.001);
});

test('converts absolute cell counts to thousands/uL with the exact 1/1000 factor', () => {
  // "cells per cubic mm" == cells/µL, so /cumm is 1000x the 10^3/µL value.
  assert.equal(reconcileUnit('/cumm', '10^3/µL').status, 'converted');
  assert.equal(reconcileUnit('/cumm', '10^3/µL').factor, 0.001);
  assert.equal(reconcileUnit('cells/cumm', '10^3/µL').factor, 0.001);
  assert.equal(reconcileUnit('10^3/uL', '10^3/µL').status, 'match');
});

test('a count row in /cumm reconciles and is compared against the catalog interval', () => {
  // 9800 /cumm = 9.8 x 10^3/uL, inside the 4-11 reference interval.
  const v = parseLabLine('Total Leucocyte Count 9800 /cumm 4000 - 11000', 1);
  assert.ok(v);
  assert.equal(v.unitStatus, 'converted');
  assert.equal(v.critical, false);
  // The report's own interval is used, so the row is in range.
  assert.equal(v.status, 'normal');
});

test('analyte lookup does not match a letter inside another word', () => {
  assert.equal(findAnalyte('Creatinine')?.key, 'creatinine');
  assert.equal(findAnalyte('Random Word')?.key, undefined);
});

/* ---------------------------------------------------------------------------
 * Prescription parsing
 * ------------------------------------------------------------------------- */

test('parses a prescription line without inventing a frequency', () => {
  const m = parsePrescriptionLine('Tab Metformin 500 mg', 1);
  assert.ok(m);
  assert.equal(m.name, 'Metformin');
  assert.equal(m.strength, '500 mg');
  assert.equal(m.form, 'Tablet');
  assert.equal(m.frequency, null);
  assert.ok(m.needsConfirmation.includes('frequency'));
});

test('extracts frequency, duration and timing as written', () => {
  const m = parsePrescriptionLine('Tab Amoxicillin 500 mg BD after food x 5 days', 1);
  assert.ok(m);
  assert.equal(m.name, 'Amoxicillin');
  assert.equal(m.frequencyLabel, 'Twice daily');
  assert.equal(m.duration, '5 days');
  assert.match(m.timing ?? '', /after food/i);
  assert.deepEqual(m.schedule, ['morning', 'night']);
});

test('does not derive a schedule for a frequency with no time mapping', () => {
  assert.deepEqual(deriveSchedule('QID', null), []);
  assert.deepEqual(deriveSchedule('SOS', null), []);
  assert.deepEqual(deriveSchedule('thrice daily', null), ['morning', 'afternoon', 'night']);
});

test('captures follow-up advice and doctor name', () => {
  const rx = parsePrescription([page('Dr. Suresh Kumar\nTab Dolo 650 mg TDS after food for 3 days\nReview after 1 week')]);
  assert.equal(rx.parsed, true);
  assert.ok(rx.doctorName?.includes('Suresh'));
  assert.ok(rx.followUp.some((f) => /review after 1 week/i.test(f)));
});

test('does not treat a follow-up line as a medicine', () => {
  const rx = parsePrescription([page('Follow up after 2 weeks')]);
  assert.equal(rx.medicines.length, 0);
});

/* ---------------------------------------------------------------------------
 * Triage
 * ------------------------------------------------------------------------- */

test('escalates a critical lab value to emergency with the exact value', () => {
  const result = parseLabReport([page('Potassium 6.9 mmol/L 3.5 - 5.1')]);
  const triage = triageDocument(result.values, '');
  assert.equal(triage.level, 'emergency');
  assert.ok(triage.triggers.some((t) => t.source === 'lab-critical' && t.detail.includes('6.9')));
});

test('a normal-looking report never overrides severe symptoms', () => {
  const result = parseLabReport([page('Hemoglobin 14.0 g/dL 13.0 - 17.0 N')]);
  const triage = triageDocument(result.values, '', 'I have severe chest pain');
  assert.equal(triage.level, 'emergency');
  assert.ok(triage.triggers.some((t) => t.source === 'symptom'));
});

test('detects Romanized Telugu emergency symptoms', () => {
  const triggers = triageSymptoms('naaku gunde noppi ga undi');
  assert.equal(triggers[0].level, 'emergency');
});

test('routes abnormal-but-not-critical values to follow-up', () => {
  const result = parseLabReport([page('Hemoglobin 11.2 g/dL 13.0 - 17.0 L')]);
  const triage = triageDocument(result.values, '');
  assert.equal(triage.level, 'needs-follow-up');
});

test('reports uncertainty rather than silence for unreconciled units', () => {
  const result = parseLabReport([page('Potassium 4.2 bananas/L H')]);
  const triage = triageLabValues(result.values, '');
  assert.ok(triage.some((t) => t.source === 'lab-unreadable'));
});

test('a laboratory critical marker in the text escalates even without a parsed row', () => {
  const triggers = triageLabValues([], 'CRITICAL VALUE - call physician immediately');
  assert.equal(triggers[0].level, 'emergency');
});

test('triage levels only escalate when combined', () => {
  const merged = combineTriage([
    { level: 'informational', label: 'a', detail: 'a', confident: true, source: 'symptom' },
    { level: 'urgent', label: 'b', detail: 'b', confident: true, source: 'symptom' },
  ]);
  assert.equal(merged.level, 'urgent');
});

/* ---------------------------------------------------------------------------
 * Medicine labels
 * ------------------------------------------------------------------------- */

test('extracts composition and strength from label text', () => {
  const label = parseMedicineLabel('DOLO 650\nEach film-coated tablet contains:\nParacetamol 650 mg\nMfg by Micro Labs Ltd');
  assert.ok(label.composition.some((c) => /paracetamol/i.test(c)));
  assert.equal(label.strength, '650 mg');
  assert.match(label.manufacturer ?? '', /Micro Labs/i);
});

test('flags an unreadable label rather than guessing', () => {
  const label = parseMedicineLabel('|||');
  assert.equal(label.unreadable, true);
  assert.equal(label.candidates.length, 0);
});

/* ---------------------------------------------------------------------------
 * Classification + trends
 * ------------------------------------------------------------------------- */

test('classifies a lab report from its content, not its filename', () => {
  const extraction = {
    backend: 'pdf-text',
    status: 'extracted',
    pages: [],
    text: 'Hemoglobin 12.1 g/dL 13.0-17.0\nTotal Cholesterol 210 mg/dL\nReference Range',
    partial: false,
  };
  const c = classifyFromExtraction(extraction);
  assert.equal(c.category, 'lab-report');
  assert.ok(c.confidence > 0.35);
});

test('a user-selected type always wins over content scoring', () => {
  const extraction = { backend: 'ocr', status: 'extracted', pages: [], text: 'anything at all here', partial: false };
  const c = classifyFromExtraction(extraction, 'prescription');
  assert.equal(c.category, 'prescription');
  assert.equal(c.userSelected, true);
});

test('classifies nothing with low confidence when there is no text', () => {
  const c = classifyFromExtraction({ backend: 'none', status: 'unreadable', pages: [], text: '', partial: false });
  assert.equal(c.category, 'general-document');
  assert.equal(c.confidence, 0);
});

test('builds a trend only from comparable units', () => {
  const r1 = parseLabReport([page('Hemoglobin 11.0 g/dL 13.0 - 17.0')]);
  const r2 = parseLabReport([page('Hemoglobin 13.5 g/dL 13.0 - 17.0')]);
  const trends = buildTrends([
    { label: 'jan', date: '2025-01-10', values: r1.values },
    { label: 'jun', date: '2025-06-10', values: r2.values },
  ]);
  assert.equal(trends.length, 1);
  assert.equal(trends[0].direction, 'increased');
  assert.ok((trends[0].change ?? 0) > 2);
});

test('refuses a trend across incompatible units', () => {
  const a = parseLabReport([page('Hemoglobin 11.0 g/dL 13.0 - 17.0')]);
  const b = parseLabReport([page('Hemoglobin 4.2 bananas/L 3.0 - 5.0')]);
  const trends = buildTrends([
    { label: 'jan', date: '2025-01-10', values: a.values },
    { label: 'jun', date: '2025-06-10', values: b.values },
  ]);
  assert.equal(trends[0].direction, 'unavailable');
  assert.match(trends[0].note ?? '', /units differ/i);
});
