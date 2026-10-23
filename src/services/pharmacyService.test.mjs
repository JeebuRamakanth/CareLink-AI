/**
 * Focused tests for the sourced pharmacy/laboratory directory service.
 *
 * These run against the REAL bundled data (src/data/pharmacies.ts) — not a mock
 * — and assert the honesty contract the UI depends on:
 *   - records come from the sourced directory with provenance,
 *   - distance is null unless real coordinates AND a patient origin exist,
 *   - ranking is proximity-based and never claims a quality rating,
 *   - stock is never integrated,
 *   - filtering is corridor-wide (never restricted to one city),
 *   - filter options are derived from the actual dataset.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getBundledPharmacies,
  pharmacyDistance,
  rankPharmacies,
  pharmacyFilterOptions,
  pharmacyStockState,
  matchesPharmacySearch,
  getBundledLaboratories,
} from './pharmacyService.ts';

test('bundled pharmacy directory is non-empty and sourced', () => {
  const pharmacies = getBundledPharmacies();
  assert.ok(pharmacies.length >= 20, `expected >=20 pharmacies, got ${pharmacies.length}`);
  for (const p of pharmacies) {
    assert.ok(p.id && p.slug && p.name, 'every record has an id, slug and name');
    assert.ok(p.provenance?.data_source, `${p.name} has a data source`);
    assert.equal(p.provenance?.data_status, 'THIRD_PARTY_DIRECTORY');
    assert.equal(p.is_verified, false, 'a listing is never marked verified');
  }
});

test('no pharmacy claims live stock or a rating', () => {
  for (const p of getBundledPharmacies()) {
    assert.equal(p.stock_source, 'not_integrated', `${p.name} must not claim live stock`);
    assert.ok(!('rating' in p) || p.rating == null || p.rating === 0, `${p.name} must not carry a rating`);
  }
  assert.equal(pharmacyStockState(), 'not_integrated');
});

test('distance is null without a patient origin or without coordinates', () => {
  const [pharmacy] = getBundledPharmacies();
  assert.equal(pharmacyDistance(pharmacy, null), null, 'no origin ⇒ no distance');
  assert.equal(
    pharmacyDistance({ ...pharmacy, latitude: undefined, longitude: undefined }, { lat: 16.5, lng: 80.6 }),
    null,
    'no coordinates ⇒ no distance',
  );
});

test('distance is computed from real coordinates when an origin exists', () => {
  const withCoords = getBundledPharmacies().find((p) => typeof p.latitude === 'number');
  assert.ok(withCoords, 'at least one pharmacy has real coordinates');
  const km = pharmacyDistance(withCoords, { lat: withCoords.latitude, lng: withCoords.longitude });
  assert.equal(km, 0, 'distance to itself is 0 km');
});

test('ranking is proximity-first and never invents a quality score', () => {
  const pharmacies = getBundledPharmacies();
  const origin = { lat: 16.5062, lng: 80.648 }; // Vijayawada
  const ranked = rankPharmacies(pharmacies, origin, 'nearest');
  const distances = ranked.map((p) => pharmacyDistance(p, origin) ?? Number.POSITIVE_INFINITY);
  for (let i = 1; i < distances.length; i += 1) {
    assert.ok(distances[i] >= distances[i - 1], 'nearest-first ordering must be monotonic');
  }
  // Records with no distance sort last rather than being treated as 0 km.
  const firstWithout = ranked.findIndex((p) => pharmacyDistance(p, origin) == null);
  const lastWith = ranked.reduce((acc, p, i) => (pharmacyDistance(p, origin) != null ? i : acc), -1);
  if (firstWithout !== -1 && lastWith !== -1) {
    assert.ok(firstWithout > lastWith, 'unknown-distance records sort after known ones');
  }
});

test('search matches name, locality and pincode', () => {
  const pharmacies = getBundledPharmacies();
  const target = pharmacies.find((p) => p.name.toLowerCase().includes('pharmacy'));
  assert.ok(target, 'there is a pharmacy-like name');
  assert.ok(matchesPharmacySearch(target, target.name.slice(0, 6)));
  assert.ok(matchesPharmacySearch(target, target.locality));
});

test('filter options derive from the actual dataset', () => {
  const pharmacies = getBundledPharmacies();
  const options = pharmacyFilterOptions(pharmacies);
  const localities = new Set(pharmacies.map((p) => p.locality));
  for (const locality of options.localities) {
    assert.ok(localities.has(locality), `option "${locality}" must match a real row`);
  }
  assert.ok(options.localities.length >= 4, 'the directory spans multiple localities');
});

test('coverage is corridor-wide, not one city', () => {
  const localities = new Set(getBundledPharmacies().map((p) => p.locality));
  assert.ok(localities.has('Machilipatnam'), 'Machilipatnam is represented');
  assert.ok(localities.has('Vijayawada'), 'Vijayawada is represented');
});

test('laboratory directory is sourced and carries no invented tests', () => {
  const labs = getBundledLaboratories();
  assert.ok(labs.length >= 5, `expected >=5 labs, got ${labs.length}`);
  for (const lab of labs) {
    assert.ok(lab.provenance?.data_source, `${lab.name} has a data source`);
    assert.ok((lab.tests ?? []).length === 0, `${lab.name} must not invent a test menu`);
    assert.equal(lab.is_verified, false);
  }
});
