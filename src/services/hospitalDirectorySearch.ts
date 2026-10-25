/**
 * CareLink-AI — hospital directory search (Phase 3).
 *
 * One free-text search that works on ANY of the fields a user might type, and
 * one structured filter set that composes correctly with it. A user must be able
 * to enter a single value ("Machilipatnam", "Vijayawada", "Cardiology",
 * "Government hospital", a real hospital name, or a PIN code) without filling
 * every other field.
 *
 * HONESTY RULES:
 *   - A blank query matches everything (the page then shows the whole eligible
 *     directory, paginated) — never a silent tiny sample.
 *   - A query that matches nothing returns nothing. Results are NEVER fabricated
 *     to make the page look full.
 *   - Only fields the record actually carries are searched, so a facility whose
 *     source published no specialty can never be "matched" on one.
 *
 * Pure functions only — no I/O, fully unit-testable.
 */

import type { Hospital } from '../types';

const normalize = (value: string): string => value.trim().toLocaleLowerCase();

/** Collapse repeated whitespace so "  district   hospital " matches. */
const collapse = (value: string): string => value.replace(/\s+/g, ' ').trim();

/**
 * Fields a free-text query is matched against, each only when present.
 *
 * Two fields are deliberately EXCLUDED:
 *   - `source_label` — every record sourced from the Government of Andhra
 *     Pradesh district directories carries it, so searching "Government" would
 *     otherwise return private facilities. Ownership is matched through the
 *     record's own `ownership` field instead.
 *   - `description` — the importer generates it for every record and it names
 *     BOTH anchor cities ("… for the Machilipatnam–Vijayawada corridor"), so a
 *     "Vijayawada" search would otherwise match the entire directory. The real
 *     location fields (city/address/district/pincode) are searched instead.
 */
function searchableFields(hospital: Hospital): string[] {
  return [
    hospital.name,
    hospital.slug,
    hospital.city,
    hospital.district ?? '',
    hospital.pincode ?? '',
    hospital.address,
    hospital.state,
    hospital.facility_type ?? '',
    hospital.category_label ?? '',
    hospital.ownership ?? '',
    hospital.specialties.join(' '),
    hospital.departments.join(' '),
    hospital.tags?.join(' ') ?? '',
  ];
}

/** True when the record carries the given PIN code (exact, 6 digits). */
export function matchesPincode(hospital: Hospital, pincode: string): boolean {
  const value = pincode.trim();
  if (!/^\d{6}$/.test(value)) return false;
  return (hospital.pincode ?? '').trim() === value;
}

/**
 * Free-text match. `query` may be a name, locality, district, PIN code,
 * facility type, category, ownership ("government"/"private"), specialty or
 * department — a single value is enough.
 */
export function matchesHospitalSearch(hospital: Hospital, query: string): boolean {
  const term = normalize(collapse(query));
  if (!term) return true;

  const haystack = normalize(collapse(searchableFields(hospital).join(' ')));
  if (haystack.includes(term)) return true;

  // A PIN-code query must match the record's own PIN code, not a substring of
  // an address, so "520001" never matches a facility in another pincode.
  if (/^\d{6}$/.test(term)) return matchesPincode(hospital, term);

  // Multi-word queries must all be present (AND), so "government vijayawada"
  // narrows rather than widening.
  const words = term.split(' ').filter(Boolean);
  if (words.length > 1 && words.every((word) => haystack.includes(word))) return true;

  return false;
}

export interface DirectoryFilters {
  locality?: string;
  facilityType?: string;
  specialty?: string;
  district?: string;
  pincode?: string;
  ownership?: string;
}

/**
 * Structured filters. Each is applied ONLY when set, and all set filters must
 * pass (AND), so "Vijayawada + Cardiology" returns Vijayawada cardiology
 * facilities rather than everything in either.
 */
export function matchesHospitalDirectoryFilters(hospital: Hospital, filters: DirectoryFilters): boolean {
  const matchesLocality = !filters.locality
    || normalize(`${hospital.city} ${hospital.address}`).includes(normalize(filters.locality));
  const matchesType = !filters.facilityType
    || normalize(hospital.facility_type ?? '').includes(normalize(filters.facilityType))
    || normalize(hospital.category_label ?? '').includes(normalize(filters.facilityType));
  const matchesSpecialty = !filters.specialty
    || hospital.specialties.some((specialty) => normalize(specialty).includes(normalize(filters.specialty ?? '')));
  const matchesDistrict = !filters.district
    || normalize(hospital.district ?? '') === normalize(filters.district);
  const matchesPincodeFilter = !filters.pincode || matchesPincode(hospital, filters.pincode);
  const matchesOwnership = !filters.ownership
    || normalize(hospital.ownership ?? '') === normalize(filters.ownership);
  return matchesLocality && matchesType && matchesSpecialty && matchesDistrict
    && matchesPincodeFilter && matchesOwnership;
}

/**
 * Whether a record is eligible for the public directory at all (Phase 3.1).
 * Deleted/inactive records are never shown; a record whose source is explicitly
 * closed is excluded. Missing verification is NOT a reason to hide a real
 * government-listed facility — it is labelled instead.
 */
export function isEligibleForDirectory(hospital: Hospital): boolean {
  if (hospital.status && hospital.status !== 'active') return false;
  if (hospital.business_status === 'CLOSED_PERMANENTLY') return false;
  return true;
}

