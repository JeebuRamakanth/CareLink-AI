import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildDirectionsUrl,
  buildPlaceSearchUrl,
  directionsAvailability,
  hospitalDirectionsUrl,
} from './directionsService.ts';

/**
 * Directions acceptance tests (Part 7). Each test asserts that the URL contains
 * the CORRECT selected destination — a facility is never silently routed to a
 * shared default, and a record without location evidence is refused.
 */

test('a Place ID destination is passed as destination_place_id', () => {
  const url = buildDirectionsUrl({ name: 'SAVE Multi-Speciality Hospital', placeId: 'ChIJ-save-001' });
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('api'), '1');
  assert.equal(parsed.searchParams.get('destination_place_id'), 'ChIJ-save-001');
  assert.equal(parsed.searchParams.get('travelmode'), 'driving');
});

test('coordinates are the destination when published', () => {
  const url = buildDirectionsUrl({ name: 'E-UPHC Chilakalapudi', latitude: 16.19912, longitude: 81.15567 });
  assert.ok(url);
  assert.equal(new URL(url).searchParams.get('destination'), '16.19912,81.15567');
});

test('a street address is used when there are no coordinates', () => {
  const url = buildDirectionsUrl({
    name: 'Murali Krishna Hospital',
    address: 'Dimmala centre, Lakshmana rao puram',
    locality: 'Machilipatnam',
    district: 'Krishna',
    state: 'Andhra Pradesh',
  });
  assert.ok(url);
  const destination = new URL(url).searchParams.get('destination');
  assert.match(destination, /^Murali Krishna Hospital, Dimmala centre/);
});

test('locality plus district is used when no street address exists', () => {
  const url = buildDirectionsUrl({
    name: 'PHC Gudlavalleru',
    locality: 'Gudlavalleru',
    district: 'Krishna',
    state: 'Andhra Pradesh',
  });
  assert.ok(url);
  assert.equal(new URL(url).searchParams.get('destination'), 'PHC Gudlavalleru, Gudlavalleru, Krishna, Andhra Pradesh');
});

test('an address identical to the name is not treated as destination detail', () => {
  const availability = directionsAvailability({ name: 'PHC Pedana', address: 'phc pedana' });
  assert.equal(availability.available, false);
  assert.equal(availability.method, 'unavailable');
});

test('a record with no location evidence returns null (no default destination)', () => {
  assert.equal(buildDirectionsUrl({ name: 'Unmapped Facility' }), null);
  const availability = directionsAvailability({ name: 'Unmapped Facility' });
  assert.equal(availability.available, false);
  assert.match(availability.reason, /cannot be determined/);
});

test('a nameless record is refused', () => {
  assert.equal(buildDirectionsUrl({ name: '   ' }), null);
});

test('the origin is included only when the user has a real location', () => {
  const withOrigin = buildDirectionsUrl(
    { name: 'District Hospital, Machilipatnam', locality: 'Machilipatnam', district: 'Krishna' },
    { origin: { latitude: 16.5, longitude: 80.6 } },
  );
  assert.ok(withOrigin);
  assert.equal(new URL(withOrigin).searchParams.get('origin'), '16.5,80.6');

  const withoutOrigin = buildDirectionsUrl({ name: 'District Hospital, Machilipatnam', locality: 'Machilipatnam', district: 'Krishna' });
  assert.ok(withoutOrigin);
  assert.equal(new URL(withoutOrigin).searchParams.get('origin'), null);
});

test('travel mode is honoured', () => {
  const url = buildDirectionsUrl({ name: 'PHC Nidumolu', locality: 'Nidumolu', district: 'Krishna' }, { mode: 'transit' });
  assert.ok(url);
  assert.equal(new URL(url).searchParams.get('travelmode'), 'transit');
});

test('query values are URL-encoded (no malformed parameters)', () => {
  const url = buildDirectionsUrl({
    name: "Dr. Venkat Basu's Bone & Joint Clinic",
    address: 'Opposite Vivekananda Mandiram, Buttaipet',
    locality: 'Machilipatnam',
  });
  assert.ok(url);
  assert.ok(url.includes('%26') || url.includes('&Joint') === false);
  const parsed = new URL(url);
  assert.match(parsed.searchParams.get('destination'), /Bone & Joint Clinic/);
});

test('two different facilities never resolve to the same destination', () => {
  const a = buildDirectionsUrl({ name: 'Hospital A', locality: 'Machilipatnam', district: 'Krishna' });
  const b = buildDirectionsUrl({ name: 'Hospital B', locality: 'Gudivada', district: 'Krishna' });
  assert.ok(a && b);
  assert.notEqual(new URL(a).searchParams.get('destination'), new URL(b).searchParams.get('destination'));
});

test('the hospital adapter forwards the google- place id', () => {
  const url = hospitalDirectionsUrl({
    id: 'google-ChIJ-machi-001',
    name: 'Public Hospital Listing',
    address: 'Machilipatnam, Andhra Pradesh, India',
    city: 'Machilipatnam',
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('destination_place_id'), 'ChIJ-machi-001');
});

test('the hospital adapter keeps real name and address for a directory record', () => {
  const url = hospitalDirectionsUrl({
    id: '7f100001-0000-0000-0000-000000000001',
    name: 'District Hospital, Machilipatnam',
    address: 'Near Noble High School',
    city: 'Machilipatnam',
    pincode: '521001',
  });
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get('destination'), 'District Hospital, Machilipatnam, Near Noble High School, Machilipatnam, 521001');
  assert.equal(parsed.searchParams.get('destination_place_id'), null);
});

test('place search is distinct from a directions request', () => {
  const search = buildPlaceSearchUrl({ name: 'PHC Movva', locality: 'Movva', district: 'Krishna' });
  assert.ok(search);
  assert.ok(search.startsWith('https://www.google.com/maps/search/?'));
  assert.ok(!search.includes('/dir/'));
});
