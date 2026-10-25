/**
 * CareLink-AI — medicine-vision gateway logic tests.
 *
 * These are hermetic: no provider, no key, no network. They prove the
 * validation contract that keeps a fabricated medicine identity out of the app.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLOWED_IMAGE_MIMES,
  MAX_BODY_BYTES,
  detectScriptLanguage,
  deriveIdentificationLevel,
  missingConfiguration,
  parseVisionCompletion,
  parseVisionPayload,
  readBoundedBody,
  safeProviderFailure,
} from './logic.ts';

const B64 = 'A'.repeat(200);

const validPayload = {
  version: 1,
  mime: 'image/jpeg',
  imageBase64: B64,
  language: 'en',
};

const completion = (obj) => ({
  choices: [{ message: { content: JSON.stringify(obj) } }],
});

/* --- request validation -------------------------------------------------- */

test('accepts a well-formed bounded image request', () => {
  const parsed = parseVisionPayload(validPayload);
  assert.ok(parsed);
  assert.equal(parsed.mime, 'image/jpeg');
  assert.equal(parsed.language, 'en');
  assert.equal(parsed.hint, undefined);
});

test('rejects malformed, wrong-version and non-image requests', () => {
  assert.equal(parseVisionPayload(null), null);
  assert.equal(parseVisionPayload({ ...validPayload, version: 2 }), null);
  assert.equal(parseVisionPayload({ ...validPayload, mime: 'application/pdf' }), null);
  assert.equal(parseVisionPayload({ ...validPayload, mime: 'image/svg+xml' }), null);
  assert.equal(parseVisionPayload({ ...validPayload, mime: 'image/heic' }), null);
});

test('rejects a data: URL, whitespace, or a too-short image payload', () => {
  assert.equal(parseVisionPayload({ ...validPayload, imageBase64: 'data:image/jpeg;base64,AAAA' }), null);
  assert.equal(parseVisionPayload({ ...validPayload, imageBase64: 'AAAA BBBB' }), null);
  assert.equal(parseVisionPayload({ ...validPayload, imageBase64: 'AAAA' }), null);
});

test('rejects an unsupported language and clamps an over-long hint', () => {
  assert.equal(parseVisionPayload({ ...validPayload, language: 'fr' }), null);
  const parsed = parseVisionPayload({ ...validPayload, hint: 'x'.repeat(500) });
  assert.equal(parsed.hint.length, 200);
});

test('rejects an oversized streamed body', async () => {
  const request = new Request('https://local.test/vision', {
    method: 'POST',
    body: 'x'.repeat(MAX_BODY_BYTES + 1),
  });
  assert.equal(await readBoundedBody(request), null);
});

test('requires an explicit vision model in addition to the API key', () => {
  assert.equal(missingConfiguration('', 'model'), 'api-key-missing');
  assert.equal(missingConfiguration('key', ''), 'vision-model-missing');
  assert.equal(missingConfiguration('key', 'model'), null);
});

test('every allowed MIME is a real raster image type', () => {
  for (const mime of ALLOWED_IMAGE_MIMES) assert.match(mime, /^image\/(jpeg|png|webp)$/);
});

/* --- identification level derivation ------------------------------------- */

test('a clear read with corroborating evidence is verified', () => {
  assert.equal(
    deriveIdentificationLevel({
      brandName: 'Dolo', genericName: 'Paracetamol', strength: '650 mg',
      dosageForm: 'tablet', manufacturer: 'Micro Labs', imageQuality: 'clear',
    }),
    'verified'
  );
});

test('a name with no corroboration is only a possible match', () => {
  assert.equal(
    deriveIdentificationLevel({
      brandName: 'Dolo', genericName: null, strength: null,
      dosageForm: null, manufacturer: null, imageQuality: 'clear',
    }),
    'possible'
  );
  assert.equal(
    deriveIdentificationLevel({
      brandName: 'Dolo', genericName: null, strength: '650 mg',
      dosageForm: null, manufacturer: null, imageQuality: 'blurry',
    }),
    'possible'
  );
});

test('no name or an unreadable photo is unidentifiable — never a guess', () => {
  assert.equal(
    deriveIdentificationLevel({
      brandName: null, genericName: null, strength: '650 mg',
      dosageForm: 'tablet', manufacturer: 'Micro Labs', imageQuality: 'clear',
    }),
    'unidentifiable'
  );
  assert.equal(
    deriveIdentificationLevel({
      brandName: 'Dolo', genericName: 'Paracetamol', strength: '650 mg',
      dosageForm: 'tablet', manufacturer: 'Micro Labs', imageQuality: 'unreadable',
    }),
    'unidentifiable'
  );
});

/* --- provider completion parsing ----------------------------------------- */

test('parses a valid extraction and re-derives the level server-side', () => {
  const parsed = parseVisionCompletion(
    completion({
      brandName: 'Dolo 650', genericName: 'Paracetamol', strength: '650 mg',
      dosageForm: 'tablet', manufacturer: 'Micro Labs', batch: 'B12345', expiry: '08/2027',
      imprint: 'DOLO', readText: 'Dolo 650 Paracetamol Tablets IP 650 mg Micro Labs',
      packagingNotes: ['15 tablets per strip'], confidence: 0.9, imageQuality: 'clear',
      language: 'en', summary: 'Read Dolo 650 (Paracetamol 650 mg) tablet.',
      unreadableFields: [],
    }),
    'en'
  );
  assert.ok(parsed);
  assert.equal(parsed.brandName, 'Dolo 650');
  assert.equal(parsed.genericName, 'Paracetamol');
  assert.equal(parsed.strength, '650 mg');
  assert.equal(parsed.identificationLevel, 'verified');
  assert.equal(parsed.confidence, 0.9);
});

test('literal "null"/"N/A"/"unknown" strings become null, not a name', () => {
  const parsed = parseVisionCompletion(
    completion({
      brandName: 'Dolo', genericName: 'null', strength: 'N/A', dosageForm: 'unknown',
      manufacturer: 'not visible', readText: 'Dolo tablets', confidence: 0.5,
      imageQuality: 'clear', language: 'en', summary: 'Read Dolo.',
    }),
    'en'
  );
  assert.ok(parsed);
  assert.equal(parsed.genericName, null);
  assert.equal(parsed.strength, null);
  assert.equal(parsed.dosageForm, null);
  assert.equal(parsed.manufacturer, null);
  // Only the brand line was read → possible, never verified.
  assert.equal(parsed.identificationLevel, 'possible');
});

test('a blurry photo with no readable name is an honest unidentifiable answer', () => {
  const parsed = parseVisionCompletion(
    completion({
      brandName: null, genericName: null, strength: null, dosageForm: null,
      manufacturer: null, readText: '', packagingNotes: [], confidence: 0,
      imageQuality: 'unreadable', language: 'en',
      summary: 'The photo is too blurry to read any medicine name.',
      unreadableFields: ['brandName', 'strength'],
    }),
    'en'
  );
  assert.ok(parsed);
  assert.equal(parsed.identificationLevel, 'unidentifiable');
  assert.equal(parsed.brandName, null);
  assert.equal(parsed.confidence, 0);
});

test('rejects malformed provider output instead of fabricating a medicine', () => {
  assert.equal(parseVisionCompletion(null, 'en'), null);
  assert.equal(parseVisionCompletion({}, 'en'), null);
  assert.equal(parseVisionCompletion({ choices: [] }, 'en'), null);
  assert.equal(parseVisionCompletion({ choices: [{ message: { content: 'not json' } }] }, 'en'), null);
  // Empty content with no quality signal → rejected, not turned into a null medicine.
  assert.equal(
    parseVisionCompletion(completion({ brandName: null, genericName: null, readText: '', imageQuality: 'clear' }), 'en'),
    null
  );
});

test('a missing quality value is treated as unreadable, never as clear', () => {
  const parsed = parseVisionCompletion(
    completion({ brandName: 'Dolo', readText: 'Dolo', confidence: 0.8, language: 'en', summary: 'Dolo' }),
    'en'
  );
  assert.ok(parsed);
  assert.equal(parsed.imageQuality, 'unreadable');
  assert.equal(parsed.identificationLevel, 'unidentifiable');
});

test('confidence is clamped and percent values are normalised', () => {
  const high = parseVisionCompletion(
    completion({ brandName: 'X', readText: 'X', confidence: 250, imageQuality: 'clear', language: 'en', summary: 'X' }),
    'en'
  );
  assert.equal(high.confidence, 1);
  const pct = parseVisionCompletion(
    completion({ brandName: 'X', readText: 'X', confidence: 80, imageQuality: 'clear', language: 'en', summary: 'X' }),
    'en'
  );
  assert.equal(pct.confidence, 0.8);
});

test('the language falls back to the requested language when invalid', () => {
  const parsed = parseVisionCompletion(
    completion({ brandName: 'X', readText: 'X', confidence: 0.5, imageQuality: 'clear', language: 'zz', summary: 'X' }),
    'te'
  );
  assert.equal(parsed.language, 'te');
});

/* --- server-side script detection --------------------------------------- */

test('native-script hints are re-derived server-side', () => {
  assert.equal(detectScriptLanguage('ఇది మందు'), 'te');
  assert.equal(detectScriptLanguage('ಇದು ಔಷಧಿ'), 'kn');
  assert.equal(detectScriptLanguage('இது மருந்து'), 'ta');
  assert.equal(detectScriptLanguage('यह दवा'), 'hi');
  assert.equal(detectScriptLanguage('Dolo 650 tablet'), null);
});

/* --- provider failures --------------------------------------------------- */

test('provider failures map to safe client-visible errors', () => {
  assert.equal(safeProviderFailure(401).error, 'provider-unavailable');
  assert.equal(safeProviderFailure(429).status, 429);
  assert.equal(safeProviderFailure(429).error, 'provider-rate-limit');
  assert.equal(safeProviderFailure(404).category, 'vision-model-unavailable');
  assert.equal(safeProviderFailure(500).category, 'provider-server-error');
});
