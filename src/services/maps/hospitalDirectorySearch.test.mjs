import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesHospitalDirectoryFilters, matchesHospitalSearch } from '../hospitalDirectorySearch.ts';

const hospital = {
  id: 'provider-1',
  name: 'Sample Name From Test Fixture',
  city: '',
  address: 'Main Road, Machilipatnam, Andhra Pradesh',
  description: '',
  facility_type: 'Medical Clinic',
  specialties: ['Cardiology'],
  departments: [],
  tags: ['medical_clinic'],
};

test('directory search matches name, locality, specialty, and facility type', () => {
  assert.equal(matchesHospitalSearch(hospital, 'sample name'), true);
  assert.equal(matchesHospitalSearch(hospital, 'machilipatnam'), true);
  assert.equal(matchesHospitalSearch(hospital, 'cardiology'), true);
  assert.equal(matchesHospitalSearch(hospital, 'medical clinic'), true);
  assert.equal(matchesHospitalSearch(hospital, 'not found'), false);
});

test('locality, specialty, and facility type filters compose without accepting unrelated records', () => {
  assert.equal(matchesHospitalDirectoryFilters(hospital, {
    locality: 'Machilipatnam',
    facilityType: 'clinic',
    specialty: 'cardio',
  }), true);
  assert.equal(matchesHospitalDirectoryFilters(hospital, { facilityType: 'hospital' }), false);
  assert.equal(matchesHospitalDirectoryFilters(hospital, { locality: 'Vijayawada' }), false);
});
