import test from 'node:test';
import assert from 'node:assert/strict';
import { HOSPITAL_IMAGE_FALLBACK, hospitalImageSource } from './hospitalPresentation.ts';

test('image source uses a local, explicitly generic fallback when no image is available', () => {
  assert.equal(hospitalImageSource(), HOSPITAL_IMAGE_FALLBACK);
  assert.equal(hospitalImageSource('https://example.test/verified-facility.jpg'), 'https://example.test/verified-facility.jpg');
  assert.match(HOSPITAL_IMAGE_FALLBACK, /hospital-image-fallback\.svg$/);
});
