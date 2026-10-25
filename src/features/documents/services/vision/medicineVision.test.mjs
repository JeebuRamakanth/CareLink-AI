/**
 * CareLink-AI — medicine-image identification tests.
 *
 * Hermetic: the vision gateway call and the reference-database calls are both
 * stubbed so the REAL code path (image preparation → gateway → validation →
 * reference cross-check → identification level) is exercised without a network.
 *
 * These tests prove the central safety guarantee of the feature: an uploaded
 * medicine photo is NEVER turned into a fabricated medicine identity.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { validateVisionRead, unavailableMessage, prepareImageForVision } from './medicineVisionService.ts';
import { identifyMedicineFromImage, identifyFromVisionRead } from './medicineImageIdentification.ts';
import { deriveIdentificationLevel } from '../../../../../supabase/functions/medicine-vision/logic.ts';

/* ---------------------------------------------------------------------------
 * Gateway payload validation (client side)
 * ------------------------------------------------------------------------- */

const gatewayRead = (over = {}) => ({
  brandName: 'Dolo 650',
  genericName: 'Paracetamol',
  strength: '650 mg',
  dosageForm: 'tablet',
  manufacturer: 'Micro Labs',
  batch: 'B123',
  expiry: '08/2027',
  imprint: 'DOLO',
  readText: 'Dolo 650 Paracetamol Tablets IP 650 mg Micro Labs',
  packagingNotes: ['15 tablets'],
  confidence: 0.9,
  imageQuality: 'clear',
  identificationLevel: 'verified',
  language: 'en',
  summary: 'Read Dolo 650.',
  unreadableFields: [],
  source: { provider: 'test-vision', mode: 'real', fetchedAt: new Date().toISOString() },
  ...over,
});

test('a valid gateway payload becomes a trusted read', () => {
  const read = validateVisionRead(gatewayRead());
  assert.ok(read);
  assert.equal(read.brandName, 'Dolo 650');
  assert.equal(read.identificationLevel, 'verified');
  assert.equal(read.source.provider, 'test-vision');
});

test('a "verified" claim with no name is downgraded to unidentifiable', () => {
  const read = validateVisionRead(gatewayRead({ brandName: null, genericName: null, identificationLevel: 'verified' }));
  assert.equal(read.identificationLevel, 'unidentifiable');
});

test('an unreadable photo is never verified', () => {
  const read = validateVisionRead(gatewayRead({ imageQuality: 'unreadable', identificationLevel: 'verified' }));
  assert.equal(read.identificationLevel, 'unidentifiable');
});

test('literal "null"/"N/A" strings become null fields', () => {
  const read = validateVisionRead(gatewayRead({ genericName: 'N/A', strength: 'null', manufacturer: 'not visible' }));
  assert.equal(read.genericName, null);
  assert.equal(read.strength, null);
  assert.equal(read.manufacturer, null);
});

test('malformed payloads are rejected, never partially trusted', () => {
  assert.equal(validateVisionRead(null), null);
  assert.equal(validateVisionRead('nope'), null);
  assert.equal(validateVisionRead([]), null);
});

test('every unavailable reason has honest user-facing copy', () => {
  for (const reason of ['no-vision-backend', 'not-configured', 'unauthorized', 'rate-limited', 'payload-too-large', 'image-unreadable', 'malformed-response', 'backend-unreachable', 'provider-unavailable', 'image-encode-failed']) {
    const msg = unavailableMessage(reason);
    assert.ok(msg.length > 10, reason);
    assert.doesNotMatch(msg, /dolo|paracetamol|tablet\s\d/i);
  }
});

/* ---------------------------------------------------------------------------
 * Identification levels (shared logic)
 * ------------------------------------------------------------------------- */

test('a clear read with corroboration is verified, a bare name is possible', () => {
  assert.equal(
    deriveIdentificationLevel({ brandName: 'Dolo', genericName: 'Paracetamol', strength: '650 mg', dosageForm: 'tablet', manufacturer: 'Micro Labs', imageQuality: 'clear' }),
    'verified'
  );
  assert.equal(
    deriveIdentificationLevel({ brandName: 'Dolo', genericName: null, strength: null, dosageForm: null, manufacturer: null, imageQuality: 'clear' }),
    'possible'
  );
  assert.equal(
    deriveIdentificationLevel({ brandName: null, genericName: null, strength: null, dosageForm: null, manufacturer: null, imageQuality: 'unreadable' }),
    'unidentifiable'
  );
});

/* ---------------------------------------------------------------------------
 * identifyMedicineFromImage — the full orchestration
 * ------------------------------------------------------------------------- */

/** Stub the vision gateway + reference lookups on globalThis.fetch. */
function withStubbedBackend(handler, fn) {
  const original = globalThis.fetch;
  const originalWindow = globalThis.window;
  globalThis.window = globalThis;
  globalThis.fetch = async (url, init) => handler(String(url), init);
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  });
}

const json = (body) => ({ ok: true, status: 200, json: async () => body });

test('no vision backend configured → honest unidentifiable, never a demo medicine', async () => {
  const file = new File([new Uint8Array(100)], 'pill.jpg', { type: 'image/jpeg' });
  const result = await identifyMedicineFromImage({ file });
  // In this environment Supabase is not configured, so no vision backend exists.
  assert.equal(result.level, 'unidentifiable');
  assert.equal(result.visionUnavailable, true);
  assert.equal(result.medicine.name, null);
  assert.equal(result.medicine.verified, false);
  assert.match(result.note, /No medicine was identified/);
});

test('a non-image file cannot be prepared for vision', async () => {
  const file = new File(['plain text'], 'notes.txt', { type: 'text/plain' });
  assert.equal(await prepareImageForVision(file), null);
});

test('an empty image file cannot be prepared for vision', async () => {
  const file = new File([new Uint8Array(0)], 'empty.jpg', { type: 'image/jpeg' });
  assert.equal(await prepareImageForVision(file), null);
});

/* ---------------------------------------------------------------------------
 * Cross-check against reference databases (stubbed)
 * ------------------------------------------------------------------------- */

const readOf = (over = {}) => validateVisionRead(gatewayRead(over));

test('a read that matches a reference database becomes verified with cited facts', async () => {
  const read = readOf();
  const result = await withStubbedBackend((url) => {
    if (url.includes('rxnav') && url.includes('rxcui.json')) return json({ idGroup: { rxnormId: ['161'] } });
    if (url.includes('/properties.json')) return json({ properties: { name: 'Paracetamol' } });
    if (url.includes('api.fda.gov')) {
      return json({
        results: [{
          openfda: { manufacturer_name: ['Micro Labs'], product_type: ['HUMAN PRESCRIPTION DRUG'] },
          indications_and_usage: ['Used for the relief of mild to moderate pain and fever.'],
          adverse_reactions: ['Nausea and rash have been reported in some patients.'],
          warnings: ['Do not exceed the recommended dose.'],
          dosage_and_administration: ['As directed by the physician.'],
        }],
      });
    }
    return { ok: false, status: 404, json: async () => ({}) };
  }, () => identifyFromVisionRead(read));

  assert.equal(result.level, 'verified');
  assert.equal(result.medicine.verified, true);
  assert.ok(result.medicine.evidence && result.medicine.evidence.length >= 1);
  assert.match(result.note, /Matched/);
});

test('a read that no reference database recognises stays a possible match', async () => {
  const read = readOf({ brandName: 'Zzznotamedicine', genericName: null });
  const result = await withStubbedBackend(() => json({}), () => identifyFromVisionRead(read));

  assert.equal(result.level, 'possible');
  assert.equal(result.medicine.verified, false);
  assert.equal(result.medicine.isUncertain, true);
  assert.match(result.medicine.uncertaintyReason ?? '', /could not be verified/);
});

test('an unidentifiable read never reaches the reference database', async () => {
  const read = readOf({ brandName: null, genericName: null, imageQuality: 'unreadable' });
  let called = false;
  const result = await withStubbedBackend(() => { called = true; return json({}); }, () => identifyFromVisionRead(read));
  assert.equal(result.level, 'unidentifiable');
  assert.equal(result.medicine.name, null);
  assert.equal(called, false);
});

test('the safety notice is attached to every outcome', async () => {
  const possible = await withStubbedBackend(() => json({}), () => identifyFromVisionRead(readOf({ genericName: null })));
  assert.match(possible.note, /consult a qualified doctor or pharmacist/i);
});

