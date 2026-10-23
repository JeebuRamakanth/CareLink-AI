import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyCoverage,
  corridorBoundingBox,
  coverageScopeLabel,
  describeCoverage,
  CORRIDOR_ANCHORS,
  CORRIDOR_BUFFER_KM,
} from './coverage.ts';
import { mapGooglePlaceToHospital } from '../services/maps/hospitalPlaceMapping.ts';

const place = (lat, lng, overrides = {}) => ({
  id: `ChIJ-${lat}-${lng}`,
  displayName: { text: 'Corridor Facility' },
  formattedAddress: 'Andhra Pradesh, India',
  location: { latitude: lat, longitude: lng },
  ...overrides,
});

test('corridor scope label is generated from the configured boundary, not hardcoded', () => {
  const label = coverageScopeLabel();
  assert.match(label, /Machilipatnam → Vijayawada corridor/);
  assert.ok(label.includes(`${CORRIDOR_BUFFER_KM} km`));
  // The stale single-city scope must not be advertised anywhere.
  assert.doesNotMatch(label, /12 km/);
  assert.doesNotMatch(label, /radius centered on Machilipatnam/i);
});

test('describeCoverage reports both anchors and the configured buffer', () => {
  const description = describeCoverage();
  assert.ok(description.includes(String(CORRIDOR_ANCHORS.machilipatnam.latitude)));
  assert.ok(description.includes(String(CORRIDOR_ANCHORS.vijayawada.latitude)));
  assert.ok(description.includes(`${CORRIDOR_BUFFER_KM} km`));
});

test('the discovery bounding box contains both anchor cities plus the buffer', () => {
  const box = corridorBoundingBox();
  for (const anchor of Object.values(CORRIDOR_ANCHORS)) {
    assert.ok(anchor.latitude >= box.low.latitude && anchor.latitude <= box.high.latitude);
    assert.ok(anchor.longitude >= box.low.longitude && anchor.longitude <= box.high.longitude);
  }
  // A rectangle is required so the whole corridor (not one city) is biased.
  assert.ok(box.high.latitude - box.low.latitude > 0.3);
  assert.ok(box.high.longitude - box.low.longitude > 0.4);
});

test('corridor classification admits intermediate settlements and the second anchor city', () => {
  for (const [lat, lng, name] of [
    [16.1875, 81.1389, 'Machilipatnam'],
    [16.5062, 80.648, 'Vijayawada'],
    [16.4302, 80.9956, 'Gudivada'],
    [16.5408, 80.8042, 'Gannavaram'],
  ]) {
    assert.equal(
      classifyCoverage({ latitude: lat, longitude: lng, locality: name }).inCoverage,
      true,
      `${name} must be inside the corridor`,
    );
  }
});

test('live Places results are filtered by the corridor, not a single-city radius', () => {
  // Both anchor cities survive; a genuinely distant facility is rejected.
  assert.ok(mapGooglePlaceToHospital(place(16.1875, 81.1389)));
  assert.ok(mapGooglePlaceToHospital(place(16.5062, 80.648)), 'Vijayawada must be discoverable');
  assert.equal(mapGooglePlaceToHospital(place(17.7, 83.3)), null, 'Visakhapatnam is outside the corridor');
});
