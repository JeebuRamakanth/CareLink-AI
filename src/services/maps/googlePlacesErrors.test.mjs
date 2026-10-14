import test from 'node:test';
import assert from 'node:assert/strict';
import { googlePlacesRequestError } from './googlePlacesErrors.ts';

test('Google Places quota and permission errors surface actionable messages', () => {
  assert.match(googlePlacesRequestError(429).message, /RESOURCE_EXHAUSTED/);
  assert.match(googlePlacesRequestError(403).message, /PERMISSION_DENIED/);
  assert.match(googlePlacesRequestError(500).message, /HTTP_500/);
  assert.match(googlePlacesRequestError(429).message, /billing, and quota/);
});
