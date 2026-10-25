/**
 * CareLink-AI — medicine identification + emergency config tests.
 *
 * Uses synthetic label text and a stubbed `fetch` so the tests are hermetic —
 * no live network call is made, and the real code path (parsing → candidate
 * ranking → database verification → result shaping) is exercised.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { identifyMedicine } from './medicineIdentificationService.ts';
import { verifyMedicine } from './clinical/medicineSources.ts';
import {
  INDIA_EMERGENCY_CONTACTS,
  primaryEmergencyContact,
  emergencyContacts,
  EMERGENCY_DISCLAIMER,
} from './clinical/emergencyConfig.ts';

/** Install a fake fetch that answers the RxNorm and openFDA endpoints. */
function withFakeFetch(handler, fn) {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => handler(String(url), init);
  return Promise.resolve(fn()).finally(() => {
    globalThis.fetch = original;
  });
}

const jsonResponse = (body) => ({
  ok: true,
  status: 200,
  json: async () => body,
});

/* ---------------------------------------------------------------------------
 * Emergency configuration
 * ------------------------------------------------------------------------- */

test('the primary emergency number for India is 112', () => {
  const primary = primaryEmergencyContact('in');
  assert.equal(primary.phone, '112');
  assert.equal(primary.href, 'tel:112');
});

test('no US emergency number appears in the India contact set', () => {
  const phones = INDIA_EMERGENCY_CONTACTS.map((c) => c.phone);
  assert.ok(!phones.includes('911'));
  assert.ok(!phones.includes('988'));
});

test('the disclaimer never promises a placed call or a dispatch', () => {
  assert.match(EMERGENCY_DISCLAIMER, /cannot place a call or dispatch/i);
  assert.doesNotMatch(EMERGENCY_DISCLAIMER, /help is on the way|dispatched/i);
});

test('every contact href is a dialable tel: link', () => {
  for (const c of emergencyContacts('in')) {
    assert.match(c.href, /^tel:\+?\d+$/);
  }
});

/* ---------------------------------------------------------------------------
 * Medicine verification
 * ------------------------------------------------------------------------- */

test('returns null when neither database recognises the name', async () => {
  await withFakeFetch(
    () => ({ ok: false, status: 404, json: async () => ({}) }),
    async () => {
      const result = await verifyMedicine('zzzznotamedicine');
      assert.equal(result, null);
    }
  );
});

test('verifies a medicine and maps label facts with citations', async () => {
  await withFakeFetch(
    (url) => {
      if (url.includes('rxcui.json')) return jsonResponse({ idGroup: { rxnormId: ['860975'] } });
      if (url.includes('properties.json')) return jsonResponse({ properties: { name: 'Metformin hydrochloride' } });
      if (url.includes('api.fda.gov')) {
        return jsonResponse({
          results: [{
            indications_and_usage: ['Metformin is indicated as an adjunct to diet to improve glycemic control in adults with type 2 diabetes mellitus.'],
            adverse_reactions: ['The most common adverse reactions are diarrhoea, nausea and abdominal discomfort.'],
            warnings: ['Lactic acidosis is a rare but serious metabolic complication.'],
            dosage_and_administration: ['Take with meals to reduce gastrointestinal side effects.'],
            openfda: { product_type: ['HUMAN PRESCRIPTION DRUG'], manufacturer_name: ['Example Pharma Ltd'] },
          }],
        });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    async () => {
      const result = await verifyMedicine('metformin');
      assert.ok(result);
      assert.equal(result.genericName, 'Metformin hydrochloride');
      assert.equal(result.prescriptionRequired, true);
      assert.ok(result.uses.length > 0);
      assert.ok(result.sideEffects.length > 0);
      assert.ok(result.seriousWarnings.length > 0);
      assert.ok(result.evidence.length >= 2, 'both sources must be cited');
      assert.ok(result.evidence.every((e) => e.label && e.supports));
    }
  );
});

test('identifyMedicine returns an UNCERTAIN result when nothing verifies', async () => {
  await withFakeFetch(
    () => ({ ok: false, status: 404, json: async () => ({}) }),
    async () => {
      const result = await identifyMedicine({ text: 'notarealmedicine' });
      assert.equal(result.isUncertain, true);
      assert.equal(result.verified, false);
      assert.equal(result.confidence, 0);
      assert.ok(result.uncertaintyReason);
      assert.ok(result.safetyWarning, 'a safety warning is always present');
      // Never fabricates a dosage.
      assert.equal(result.referenceDosage, undefined);
    }
  );
});

test('identifyMedicine verifies a typed name against the database', async () => {
  await withFakeFetch(
    (url) => {
      if (url.includes('rxcui.json')) return jsonResponse({ idGroup: { rxnormId: ['6809'] } });
      if (url.includes('properties.json')) return jsonResponse({ properties: { name: 'Paracetamol' } });
      if (url.includes('api.fda.gov')) {
        return jsonResponse({
          results: [{
            indications_and_usage: ['For the temporary relief of mild to moderate pain and fever.'],
            adverse_reactions: ['Rare skin reactions have been reported.'],
            warnings: ['Do not exceed the recommended dose.'],
            openfda: { product_type: ['HUMAN OTC DRUG'], manufacturer_name: ['Example Labs'] },
          }],
        });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    async () => {
      const result = await identifyMedicine({ text: 'paracetamol' });
      assert.equal(result.verified, true);
      assert.equal(result.isUncertain, false);
      assert.equal(result.name, 'Paracetamol');
      assert.equal(result.prescriptionRequired, false);
      // Confidence reflects a database match, never a photographic certainty.
      assert.ok(result.confidence < 100);
      assert.ok(result.evidence.length >= 1);
    }
  );
});

test('identifyMedicine reads a medicine name from label text via the parser', async () => {
  await withFakeFetch(
    (url) => {
      if (url.includes('rxcui.json')) return jsonResponse({ idGroup: { rxnormId: ['310965'] } });
      if (url.includes('properties.json')) return jsonResponse({ properties: { name: 'Amoxicillin' } });
      if (url.includes('api.fda.gov')) {
        return jsonResponse({
          results: [{
            indications_and_usage: ['Amoxicillin is used to treat susceptible bacterial infections.'],
            adverse_reactions: ['Diarrhoea and rash may occur.'],
            warnings: ['Serious allergic reactions are possible.'],
            openfda: { product_type: ['HUMAN PRESCRIPTION DRUG'], manufacturer_name: ['Example Pharma'] },
          }],
        });
      }
      return { ok: false, status: 404, json: async () => ({}) };
    },
    async () => {
      const result = await identifyMedicine({
        labelText: 'AMOXICILLIN 500\nEach capsule contains:\nAmoxicillin 500 mg\nMfg by Example Pharma Ltd',
      });
      assert.equal(result.verified, true);
      assert.match(String(result.name), /amoxicillin/i);
      assert.equal(result.strength, '500 mg');
    }
  );
});

test('a medicine with no readable label text asks for a clearer image', async () => {
  const result = await identifyMedicine({ labelText: '|||' });
  assert.equal(result.isUncertain, true);
  assert.match(String(result.uncertaintyReason), /clearer photo|readable medicine name/i);
});
