import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deduplicateGooglePlaces,
  hospitalDetailsPath,
  mapGooglePlaceToHospital,
} from './hospitalPlaceMapping.ts';
import { hospitalDirectionsUrl } from './directionsService.ts';

const machilipatnamPlace = (overrides = {}) => ({
  id: 'ChIJ-machi-001',
  displayName: { text: 'Public Hospital Listing' },
  formattedAddress: 'Machilipatnam, Andhra Pradesh, India',
  location: { latitude: 16.18, longitude: 81.13 },
  primaryType: 'hospital',
  ...overrides,
});

test('place mapping uses a stable place ID and labels listings as unverified', () => {
  const hospital = mapGooglePlaceToHospital(machilipatnamPlace(), '2026-10-09T00:00:00.000Z');
  assert.ok(hospital);
  assert.equal(hospital.id, 'google-ChIJ-machi-001');
  assert.equal(hospital.verification_status, 'GOOGLE_PLACES');
  assert.equal(hospital.is_verified, false);
  assert.equal(hospital.specialties.length, 0);
  assert.equal(hospital.phone, '');
  assert.equal(hospital.image_url, undefined);
  assert.equal(hospital.last_checked_at, '2026-10-09T00:00:00.000Z');
});

test('place mapper rejects records missing identity/location and those outside the corridor', () => {
  assert.equal(mapGooglePlaceToHospital(machilipatnamPlace({ id: undefined })), null);
  assert.equal(mapGooglePlaceToHospital(machilipatnamPlace({ location: undefined })), null);
  // ~36 km from the corridor path — genuinely out of coverage.
  assert.equal(mapGooglePlaceToHospital(machilipatnamPlace({
    location: { latitude: 16.4, longitude: 81.4 },
  })), null);
});

test('place mapper keeps corridor facilities the old 12 km Machilipatnam radius discarded', () => {
  // Vijayawada (the corridor's second anchor city) and an intermediate corridor
  // settlement must both be admitted.
  const vijayawada = mapGooglePlaceToHospital(machilipatnamPlace({
    id: 'ChIJ-vijayawada-001',
    displayName: { text: 'Corridor Teaching Hospital' },
    formattedAddress: 'Vijayawada, Andhra Pradesh, India',
    location: { latitude: 16.5062, longitude: 80.648 },
  }));
  assert.ok(vijayawada, 'Vijayawada must be inside the corridor');
  assert.equal(vijayawada.verification_status, 'GOOGLE_PLACES');

  const gudivada = mapGooglePlaceToHospital(machilipatnamPlace({
    id: 'ChIJ-gudivada-001',
    formattedAddress: 'Gudivada, Andhra Pradesh, India',
    location: { latitude: 16.4302, longitude: 80.9956 },
  }));
  assert.ok(gudivada, 'Gudivada (intermediate corridor town) must be inside the corridor');
});

test('deduplication uses only exact provider IDs and keeps similarly named distinct places', () => {
  const input = [
    machilipatnamPlace(),
    machilipatnamPlace({ formattedAddress: 'Different entrance, Machilipatnam' }),
    machilipatnamPlace({ id: 'ChIJ-machi-002' }),
  ];
  const unique = deduplicateGooglePlaces(input);
  assert.equal(unique.length, 2);
  assert.equal(unique[0].formattedAddress, 'Machilipatnam, Andhra Pradesh, India');
});

test('directions use the selected Google Place ID, not a name-only lookup', () => {
  const hospital = mapGooglePlaceToHospital(machilipatnamPlace());
  assert.ok(hospital);
  const url = new URL(hospitalDirectionsUrl(hospital));
  assert.equal(url.searchParams.get('destination_place_id'), 'ChIJ-machi-001');
});

test('hospital details route retains the stable selected ID', () => {
  assert.equal(hospitalDetailsPath('google-ChIJ-machi-001'), '/hospitals/google-ChIJ-machi-001');
  assert.equal(hospitalDetailsPath('id/with space'), '/hospitals/id%2Fwith%20space');
});
