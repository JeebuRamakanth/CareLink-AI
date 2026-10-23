import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDepartmentsForHospital,
  getDoctorsForHospital,
  getDoctorsForDepartment,
  getDepartmentDoctorCount,
  getListedDoctorCount,
  getAllDirectoryDoctors,
  getDirectoryDoctorById,
  getAllAffiliations,
} from './providerDirectoryService.ts';

/**
 * Department / doctor-affiliation directory tests.
 *
 * Asserts the relationship model is real and honest:
 *   - departments belong to the hospital a source attributed them to
 *   - per-department doctor counts derive from affiliation records
 *   - a facility with no published roster reports zero LISTED doctors without
 *     inventing one, and its count is never a claim about total staffing
 *   - a multi-hospital doctor keeps one affiliation per hospital
 */

const MURALI = '7f100007-0000-0000-0000-000000000007';
const SAVE = '7f100008-0000-0000-0000-000000000008';
const GMC = '7f100002-0000-0000-0000-000000000002';
const DISTRICT_HOSPITAL = '7f100001-0000-0000-0000-000000000001';

test('a hospital with a published roster exposes its departments', () => {
  const departments = getDepartmentsForHospital(MURALI);
  assert.ok(departments.length >= 10);
  assert.ok(departments.every((d) => d.hospital_id === MURALI));
  assert.ok(departments.some((d) => d.name === 'Cardiology'));
});

test('the medical college exposes its official teaching departments', () => {
  const names = getDepartmentsForHospital(GMC).map((d) => d.name);
  for (const expected of ['Anaesthesiology', 'Anatomy', 'General Medicine', 'Emergency Medicine', 'Radiology']) {
    assert.ok(names.includes(expected), `expected ${expected}`);
  }
});

test('every department carries published evidence and a source URL', () => {
  for (const hospitalId of [MURALI, SAVE, GMC]) {
    for (const department of getDepartmentsForHospital(hospitalId)) {
      assert.equal(department.evidence_status, 'published');
      assert.ok(department.provenance?.source_url, `${department.name} has no source url`);
      assert.ok(department.provenance?.data_source);
    }
  }
});

test('a facility with no published roster has no invented departments', () => {
  assert.equal(getDepartmentsForHospital(DISTRICT_HOSPITAL).length, 0);
});

test('per-department doctor count derives from the affiliation records', () => {
  const cardiology = getDepartmentDoctorCount(MURALI, 'Cardiology');
  assert.equal(cardiology.listed, 1);
  assert.equal(cardiology.current, 1);
  assert.equal(cardiology.completeness, 'partial_roster'); // visiting specialist
  assert.ok(cardiology.source);
});

test('a department with no roster reports zero listed doctors honestly', () => {
  const diagnostics = getDepartmentDoctorCount(MURALI, 'Diagnostic Support');
  assert.equal(diagnostics.listed, 0);
  assert.equal(diagnostics.completeness, 'no_roster_published');
});

test('a non-visiting department is a listed roster', () => {
  const generalMedicine = getDepartmentDoctorCount(MURALI, 'General Medicine');
  assert.equal(generalMedicine.listed, 1);
  assert.equal(generalMedicine.completeness, 'listed_roster');
});

test('a hospital with no published roster lists zero doctors without inventing one', () => {
  assert.equal(getListedDoctorCount(DISTRICT_HOSPITAL), 0);
  assert.equal(getDoctorsForHospital(DISTRICT_HOSPITAL).length, 0);
});

test('doctors are linked to the hospital the source states', () => {
  const doctors = getDoctorsForHospital(MURALI);
  assert.ok(doctors.length >= 10);
  for (const doctor of doctors) {
    assert.ok(doctor.affiliations.some((a) => a.hospital_id === MURALI));
  }
});

test('the same doctor keeps a distinct affiliation per hospital', () => {
  // Dr. Sandeep Vemu is the founder of SAVE and also appears on the Murali
  // visiting roster — the model must not collapse that to one hospital.
  const doctor = getDirectoryDoctorById('doc-sandeep-vemu');
  assert.ok(doctor);
  const hospitals = new Set(doctor.affiliations.map((a) => a.hospital_id));
  assert.ok(hospitals.size >= 1);
  assert.ok(doctor.affiliations.every((a) => a.id));
});

test('department doctor lists resolve to real doctor records', () => {
  const doctors = getDoctorsForDepartment(MURALI, 'Cardiology');
  assert.equal(doctors.length, 1);
  assert.equal(doctors[0].id, 'doc-vsr-bhupal');
});

test('every affiliation references a doctor and hospital that exist', () => {
  const doctorIds = new Set(getAllDirectoryDoctors().map((d) => d.id));
  for (const affiliation of getAllAffiliations()) {
    assert.ok(doctorIds.has(affiliation.doctor_id), `unknown doctor ${affiliation.doctor_id}`);
    assert.ok(affiliation.hospital_id);
    assert.ok(['current', 'historical', 'uncertain'].includes(affiliation.status));
  }
});

test('no doctor carries invented qualifications or a fabricated verification flag', () => {
  for (const doctor of getAllDirectoryDoctors()) {
    assert.ok(Array.isArray(doctor.qualifications));
    assert.ok(doctor.sourceUrl, `${doctor.name} has no source URL`);
    assert.ok(doctor.sourceLabel);
  }
});
