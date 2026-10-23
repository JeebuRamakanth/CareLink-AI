import test from 'node:test';
import assert from 'node:assert/strict';
import { explainRecommendation, rankHospitals } from './recommendationRanking.ts';

const hospital = (overrides = {}) => ({
  id: 'h1',
  detailSlug: 'h1',
  name: 'Corridor Hospital',
  rating: 0,
  reviewCount: 0,
  specialties: [],
  distanceKm: 0,
  estimatedTravelTimeMin: 0,
  isOpen: false,
  hasEmergency: false,
  address: '',
  city: '',
  ...overrides,
});

const input = { urgency: 'routine', context: { specialties: [], conditions: [] } };

test('an unknown distance is never rendered as a fabricated "0.0 km away"', () => {
  const [ranked] = rankHospitals([hospital({ distanceAvailable: false })], input);
  const text = explainRecommendation(1, ranked);
  assert.doesNotMatch(text, /km away/, `must not claim a distance: ${text}`);
  assert.match(text, /no verified ratings yet/);
});

test('a real distance is still reported when it was actually computed', () => {
  const [ranked] = rankHospitals([hospital({ distanceAvailable: true, distanceKm: 4.25, rating: 4.5 })], input);
  const text = explainRecommendation(1, ranked);
  assert.match(text, /4\.3 km away/);
  assert.match(text, /rated 4\.5\/5/);
});

test('a zero rating reads as "no verified ratings yet", never "rated 0.0/5"', () => {
  const [ranked] = rankHospitals([hospital({ rating: 0, distanceAvailable: true, distanceKm: 1 })], input);
  const text = explainRecommendation(1, ranked);
  assert.doesNotMatch(text, /rated 0\.0\/5/);
  assert.match(text, /no verified ratings yet/);
});

test('an unlisted availability is never described as open or closed', () => {
  const [ranked] = rankHospitals([hospital({ availabilityLabel: 'Availability unlisted', distanceAvailable: true, distanceKm: 2 })], input);
  const text = explainRecommendation(1, ranked);
  assert.doesNotMatch(text, /currently (open|closed)/);
});
