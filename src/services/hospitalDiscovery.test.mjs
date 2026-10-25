/**
 * Hospital discovery search tests (Phase 3, Phase 14 B).
 *
 * These run against the REAL bundled corridor directory (src/data/hospitals.ts)
 * — the same 105 source-attributed facilities the Hospitals page renders — so
 * the assertions prove the actual user-facing search behaviour, not a fixture.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  matchesHospitalSearch,
  matchesHospitalDirectoryFilters,
  matchesPincode,
  isEligibleForDirectory,
} from './hospitalDirectorySearch.ts';
import { getBundledHospitals } from './hospitalService.ts';
import { getCoverageScopeLabel } from './hospitalService.ts';

const all = getBundledHospitals();

test('the bundled corridor directory is populated and eligible', () => {
  assert.ok(all.length >= 100, `expected the full corridor directory, got ${all.length}`);
  const eligible = all.filter(isEligibleForDirectory);
  assert.equal(eligible.length, all.length, 'every bundled facility must be directory-eligible');
});

test('an EMPTY search returns the whole eligible directory (never a tiny sample)', () => {
  const matched = all.filter((h) => matchesHospitalSearch(h, ''));
  assert.equal(matched.length, all.length);
  assert.ok(matched.length > 12, 'an empty search must not be limited to one page');
});

test('a city search returns real matching records', () => {
  const vijayawada = all.filter((h) => matchesHospitalSearch(h, 'Vijayawada'));
  assert.ok(vijayawada.length > 5, `expected Vijayawada facilities, got ${vijayawada.length}`);
  for (const h of vijayawada) {
    assert.ok(
      `${h.name} ${h.city} ${h.address} ${h.district}`.toLowerCase().includes('vijayawada'),
      `${h.name} must actually be in Vijayawada`,
    );
  }

  const machilipatnam = all.filter((h) => matchesHospitalSearch(h, 'Machilipatnam'));
  assert.ok(machilipatnam.length > 3, 'Machilipatnam must return real facilities');
});

test('a hospital-NAME search works', () => {
  const sample = all[0];
  const matched = all.filter((h) => matchesHospitalSearch(h, sample.name));
  assert.ok(matched.some((h) => h.id === sample.id), `searching "${sample.name}" must find it`);
});

test('a DISTRICT search works (Krishna and NTR are the corridor districts)', () => {
  const krishna = all.filter((h) => matchesHospitalSearch(h, 'Krishna'));
  const ntr = all.filter((h) => matchesHospitalSearch(h, 'NTR'));
  assert.ok(krishna.length > 10, `expected Krishna district facilities, got ${krishna.length}`);
  assert.ok(ntr.length > 5, `expected NTR district facilities, got ${ntr.length}`);
});

test('a PIN-CODE search matches only the record carrying that PIN code', () => {
  const withPincode = all.find((h) => /^\d{6}$/.test(h.pincode ?? ''));
  assert.ok(withPincode, 'the directory must carry at least one published pincode');
  const matched = all.filter((h) => matchesHospitalSearch(h, withPincode.pincode));
  assert.ok(matched.some((h) => h.id === withPincode.id));
  for (const h of matched) assert.equal(h.pincode, withPincode.pincode);
  // A PIN code must never match a different facility's address substring.
  assert.equal(matchesPincode({ pincode: '521002' }, '521001'), false);
});

test('an OWNERSHIP search works ("Government hospital", "Private hospital")', () => {
  const government = all.filter((h) => matchesHospitalSearch(h, 'Government'));
  const privateFacilities = all.filter((h) => matchesHospitalSearch(h, 'Private'));
  assert.ok(government.length > 10, `expected government facilities, got ${government.length}`);
  assert.ok(privateFacilities.length > 0, 'expected private facilities');
  for (const h of government) assert.equal(h.ownership, 'Government');
});

test('a FACILITY-TYPE search works without any other field', () => {
  const phc = all.filter((h) => matchesHospitalSearch(h, 'Primary Health Centre'));
  assert.ok(phc.length > 0, 'PHC facilities must be findable by type');
  for (const h of phc) {
    assert.ok(
      `${h.facility_type} ${h.category_label}`.toLowerCase().includes('primary health centre'),
      `${h.name} must actually be a PHC`,
    );
  }
});

test('extra spaces and capitalization do not break the search', () => {
  const plain = all.filter((h) => matchesHospitalSearch(h, 'district hospital'));
  const messy = all.filter((h) => matchesHospitalSearch(h, '  DISTRICT   Hospital  '));
  assert.deepEqual(messy.map((h) => h.id), plain.map((h) => h.id));
});

test('a no-result search returns NOTHING rather than fabricated matches', () => {
  const matched = all.filter((h) => matchesHospitalSearch(h, 'zzz-nonexistent-facility-zzz'));
  assert.equal(matched.length, 0);
});

test('a multi-word query narrows (AND) instead of widening (OR)', () => {
  const vijayawada = all.filter((h) => matchesHospitalSearch(h, 'Vijayawada'));
  const narrowed = all.filter((h) => matchesHospitalSearch(h, 'Vijayawada government'));
  assert.ok(narrowed.length <= vijayawada.length);
  for (const h of narrowed) {
    assert.equal(h.ownership, 'Government');
    assert.ok(`${h.city} ${h.address}`.toLowerCase().includes('vijayawada'));
  }
});

test('multiple structured filters combine correctly', () => {
  const combined = all.filter((h) => matchesHospitalDirectoryFilters(h, {
    locality: 'Vijayawada',
    ownership: 'Government',
  }));
  assert.ok(combined.length > 0);
  for (const h of combined) {
    assert.equal(h.ownership, 'Government');
    assert.ok(`${h.city} ${h.address}`.toLowerCase().includes('vijayawada'));
  }
  // An impossible combination returns nothing — never an invented record.
  assert.equal(all.filter((h) => matchesHospitalDirectoryFilters(h, {
    locality: 'Vijayawada',
    district: 'Nonexistent District',
  })).length, 0);
});

test('clearing the filters restores the unfiltered directory', () => {
  const filtered = all.filter((h) => matchesHospitalDirectoryFilters(h, { locality: 'Vijayawada' }));
  const cleared = all.filter((h) => matchesHospitalDirectoryFilters(h, {}));
  assert.ok(filtered.length < cleared.length, 'a filter must narrow the result set');
  assert.equal(cleared.length, all.length, 'clearing filters restores every record');
});

test('every record carries provenance and no record claims verification', () => {
  for (const h of all) {
    assert.ok(h.provenance?.data_source, `${h.name} must carry a data source`);
    assert.equal(h.is_verified, false, `${h.name} must not claim verification`);
    assert.equal(h.rating, 0, `${h.name} must not carry a fabricated rating`);
    assert.equal(h.review_count, 0, `${h.name} must not carry fabricated reviews`);
  }
});

test('the page advertises the real configured coverage scope, not a stale radius', () => {
  const label = getCoverageScopeLabel();
  assert.match(label, /Machilipatnam → Vijayawada corridor/);
  assert.doesNotMatch(label, /12 km/);
});
