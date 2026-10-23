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

test('place mapper rejects records missing identity/location and those outside the defined radius', () => {
  assert.equal(mapGooglePlaceToHospital(machilipatnamPlace({ id: undefined })), null);
  assert.equal(mapGooglePlaceToHospital(machilipatnamPlace({ location: undefined })), null);
  assert.equal(mapGooglePlaceToHospital(machilipatnamPlace({
    location: { latitude: 16.4, longitude: 81.13 },
  })), null);
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
