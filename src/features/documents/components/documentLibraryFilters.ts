/**
 * CareLink-AI — document library filter helpers.
 *
 * Kept out of the component file so the component module exports only
 * components (React Fast Refresh) and the URL-mapping rule is testable on its
 * own.
 */

export type LibraryFilter = 'all' | 'reports' | 'lab-results' | 'prescriptions' | 'medicines' | 'other';

export const LIBRARY_FILTERS: LibraryFilter[] = ['all', 'reports', 'lab-results', 'prescriptions', 'medicines', 'other'];

/** Map a URL `?filter=` value to a library filter (unknown → 'all'). */
export function libraryFilterFromParam(value: string | null | undefined): LibraryFilter {
  return LIBRARY_FILTERS.includes((value ?? '') as LibraryFilter) ? (value as LibraryFilter) : 'all';
}
