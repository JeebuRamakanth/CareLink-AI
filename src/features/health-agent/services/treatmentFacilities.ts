/**
 * CareLink-AI — evidence-grounded treatment-facility discovery.
 *
 * Turns the REAL findings of an analysed report into relevant facilities, each
 * with an explicit, checkable reason.
 *
 * HARD RULES (these are the whole point of this module):
 *   1. A facility is recommended ONLY when it INDEPENDENTLY publishes the
 *      matching department/specialty in the sourced directory. A capability is
 *      never inferred from the report, from a facility name, or from a model.
 *   2. The reason names the facility's OWN published department verbatim, so the
 *      user can verify it on the hospital page.
 *   3. The reason never says a facility "treats" a condition and never suggests
 *      a treatment or a medicine. It names the clinical service that usually
 *      manages that measurement, and states that a clinician decides.
 *   4. When nothing in the directory publishes a matching service, the caller
 *      shows an honest "no published match" state — never a padded list.
 */

import { getDepartmentsForHospital, getDoctorsForHospital } from '../../../services/providerDirectoryService';
import { isSameSpecialty, resolveSpecialty } from '../data/specialtyTaxonomy';
import { ANALYTE_SPECIALTY, specialtiesForAnalyteKeys } from '../data/analyteSpecialty';
import type { DoctorRecommendation, HealthDocument, HospitalRecommendation } from '../types';

/** The finding that made a specialty relevant. */
export interface ReportFindingBasis {
  /** The test name exactly as the report printed it. */
  testName: string;
  /** The value as measured, with its unit. */
  measuredValue: string;
  /** The reference interval, as printed on the report or from the catalog. */
  referenceRange: string;
  /** Why this value is the trigger. */
  basis: 'critical-value' | 'outside-reference-range' | 'unit-not-reconciled';
}

export interface RelevantSpecialty {
  /** Canonical specialty name. */
  specialty: string;
  /** Plain-language clinical area, e.g. "long-term blood-sugar control". */
  area: string;
  /** Why this service usually manages this measurement. */
  rationale: string;
  /** The report findings that made this specialty relevant. */
  findings: ReportFindingBasis[];
}

export interface RelevantFacility {
  facility: HospitalRecommendation;
  /** The department name the FACILITY itself publishes (verbatim). */
  matchedDepartment: string;
  /** Canonical specialty that department satisfies. */
  specialty: string;
  /** The report findings that made this facility relevant. */
  findings: ReportFindingBasis[];
  /** Listed doctors at this facility for the specialty (affiliation records). */
  doctors: DoctorRecommendation[];
  /** Full, evidence-grounded explanation rendered next to the card. */
  whyRelevant: string;
}

export interface ReportFacilityDiscovery {
  /** Specialties indicated by the report's abnormal findings (never a diagnosis). */
  specialties: RelevantSpecialty[];
  /** Facilities that publish a matching service, most relevant first. */
  facilities: RelevantFacility[];
  /** True when no facility in the directory publishes a matching service. */
  noPublishedMatch: boolean;
  /** True when the report had no abnormal/critical finding to act on. */
  nothingToActOn: boolean;
}

const BASIS_RANK: Record<ReportFindingBasis['basis'], number> = {
  'critical-value': 0,
  'outside-reference-range': 1,
  'unit-not-reconciled': 2,
};

/** Which findings in a report warrant a service recommendation. */
function findingBasisFor(value: {
  critical?: boolean;
  status: string;
  unitStatus?: string;
}): ReportFindingBasis['basis'] | null {
  if (value.critical === true) return 'critical-value';
  if (value.status === 'abnormal' || value.status === 'attention') return 'outside-reference-range';
  if (value.unitStatus === 'unit-mismatch' || value.unitStatus === 'unrecognized') return 'unit-not-reconciled';
  return null;
}

/** Abnormal findings across the attached reports, most severe first. */
export function collectReportFindings(documents: HealthDocument[]): { analyteKey: string | null; finding: ReportFindingBasis }[] {
  const out: { analyteKey: string | null; finding: ReportFindingBasis }[] = [];
  for (const doc of documents) {
    const lab = doc.secureAnalysis?.labResult;
    if (!lab) continue;
    for (const v of lab.values) {
      const basis = findingBasisFor(v);
      if (!basis) continue;
      out.push({
        analyteKey: v.analyteKey ?? null,
        finding: {
          testName: v.testName,
          measuredValue: `${v.measuredValue}${v.unit ? ` ${v.unit}` : ''}`.trim(),
          referenceRange: v.referenceRange || '',
          basis,
        },
      });
    }
  }
  return out.sort((a, b) => BASIS_RANK[a.finding.basis] - BASIS_RANK[b.finding.basis]);
}

function dedupeFindings(findings: ReportFindingBasis[]): ReportFindingBasis[] {
  const seen = new Set<string>();
  const out: ReportFindingBasis[] = [];
  for (const f of findings) {
    const sig = `${f.testName}|${f.measuredValue}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(f);
  }
  return out;
}

/**
 * Specialties indicated by the abnormal findings of the attached reports,
 * de-duplicated with critical findings first. A SERVICE mapping, never a
 * diagnosis.
 */
export function relevantSpecialtiesForReport(documents: HealthDocument[]): RelevantSpecialty[] {
  const findings = collectReportFindings(documents);
  const links = specialtiesForAnalyteKeys(findings.map((f) => f.analyteKey));
  return links.map((link) => ({
    specialty: link.specialty,
    area: link.area,
    rationale: link.rationale,
    findings: dedupeFindings(
      findings
        .filter((f) => ANALYTE_SPECIALTY.find((l) => l.analyteKey === f.analyteKey)?.specialty === link.specialty)
        .map((f) => f.finding),
    ),
  }));
}

/**
 * A facility is relevant ONLY when its own published department list satisfies
 * the specialty. Returns the verbatim published department name, or null.
 */
export function publishedDepartmentFor(hospitalId: string, specialty: string): string | null {
  const canonical = resolveSpecialty(specialty);
  if (!canonical) return null;
  for (const department of getDepartmentsForHospital(hospitalId)) {
    if (department.evidence_status !== 'published') continue;
    if (isSameSpecialty(department.name, canonical.name)) return department.name;
  }
  return null;
}

/** Doctors at a facility whose stated specialty matches (affiliation records). */
export function doctorsAtFacilityFor(hospitalId: string, specialty: string, hospitalName: string): DoctorRecommendation[] {
  const canonical = resolveSpecialty(specialty);
  if (!canonical) return [];
  return getDoctorsForHospital(hospitalId)
    .filter((doctor) => isSameSpecialty(doctor.specialty, canonical.name))
    .map((doctor) => ({
      id: doctor.id,
      detailSlug: doctor.id,
      fullName: doctor.name,
      specialty: doctor.specialty,
      hospitalName,
      hospitalDetailSlug: hospitalId,
      rating: 0,
      reviewCount: 0,
      yearsOfExperience: 0,
      languages: [],
      availabilityStatus: 'offline' as const,
      nextAvailableSlot: '',
      acceptsNewPatients: true,
      availabilityLabel: 'Availability unlisted',
      hospitalIds: [hospitalId],
    }));
}

/** A sentence naming the exact measurement and why it triggered the match. */
export function findingsSentence(findings: ReportFindingBasis[]): string {
  const first = findings[0];
  if (!first) return '';
  const basis =
    first.basis === 'critical-value'
      ? 'is in a laboratory critical range'
      : first.basis === 'outside-reference-range'
        ? 'is outside the reference range on your report'
        : 'could not be unit-reconciled';
  const range = first.referenceRange ? ` (reference ${first.referenceRange})` : '';
  const extra = findings.length > 1 ? ` and ${findings.length - 1} other value(s)` : '';
  return `Your report shows ${first.testName} ${first.measuredValue}${range} ${basis}${extra}.`;
}

/**
 * Facilities that publish a matching service for the report's abnormal findings.
 *
 * `hospitals` is supplied by the caller (already read from the sourced
 * directory) so this stays a pure decision layer that is trivial to test.
 */
export function matchFacilitiesForReport(
  documents: HealthDocument[],
  hospitals: HospitalRecommendation[],
): ReportFacilityDiscovery {
  const specialties = relevantSpecialtiesForReport(documents);
  if (specialties.length === 0) {
    return { specialties: [], facilities: [], noPublishedMatch: false, nothingToActOn: true };
  }

  const facilities: RelevantFacility[] = [];
  for (const specialty of specialties) {
    for (const hospital of hospitals) {
      const department = publishedDepartmentFor(hospital.id, specialty.specialty);
      if (!department) continue;
      const findingLine = findingsSentence(specialty.findings);
      facilities.push({
        facility: hospital,
        matchedDepartment: department,
        specialty: specialty.specialty,
        findings: specialty.findings,
        doctors: doctorsAtFacilityFor(hospital.id, specialty.specialty, hospital.name),
        whyRelevant: `${findingLine} ${hospital.name} publishes a ${department} department, which is the service that usually manages ${specialty.area}. A clinician decides what, if anything, is needed.`.trim(),
      });
    }
  }

  return {
    specialties,
    facilities,
    noPublishedMatch: facilities.length === 0,
    nothingToActOn: false,
  };
}
