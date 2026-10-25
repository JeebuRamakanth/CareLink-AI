/**
 * CareLink-AI — Reviews search suggestions (Step 28).
 *
 * Suggestions are built from the SAME sourced directory the rest of the app
 * renders (hospitals + listed doctors), so selecting one always leads to a real
 * facility/doctor. Nothing is invented: no rating, no review count, no
 * "trending" label. When the directory is empty the list is simply empty and the
 * search field stands on its own.
 */

import { hospitalsData } from '../../../data/hospitals';
import { getAllDirectoryDoctors } from '../../../services/providerDirectoryService';

export type SuggestionKind = 'hospital' | 'doctor';

export interface ReviewSearchSuggestion {
  id: string;
  kind: SuggestionKind;
  /** Display name, used as the search term when selected. */
  label: string;
  /** Secondary line, e.g. the locality or specialty. */
  meta: string;
  /** Route to the provider when a slug is known. */
  to?: string;
}

let cache: ReviewSearchSuggestion[] | null = null;

/** The full suggestion index (built once — the directory is static at runtime). */
export function reviewSearchSuggestions(): ReviewSearchSuggestion[] {
  if (cache) return cache;

  const hospitals: ReviewSearchSuggestion[] = hospitalsData.map((h) => ({
    id: `hospital-${h.id}`,
    kind: 'hospital',
    label: h.name,
    meta: [h.city, h.district].filter(Boolean).join(' · ') || h.address,
    to: `/hospitals/${h.slug || h.id}`,
  }));

  const doctors: ReviewSearchSuggestion[] = getAllDirectoryDoctors().map((d) => ({
    id: `doctor-${d.id}`,
    kind: 'doctor',
    label: d.name,
    meta: [d.specialty, d.affiliations[0]?.department_name].filter(Boolean).join(' · '),
    to: `/doctors/${d.id}`,
  }));

  cache = [...hospitals, ...doctors];
  return cache;
}

/**
 * Filter the suggestion index for a query. An empty query returns the first few
 * entries so the field can hint at what is searchable without pretending to be
 * a live service.
 */
export function matchSuggestions(query: string, limit = 6): ReviewSearchSuggestion[] {
  const all = reviewSearchSuggestions();
  const q = query.trim().toLowerCase();
  if (!q) return all.slice(0, limit);
  const starts: ReviewSearchSuggestion[] = [];
  const contains: ReviewSearchSuggestion[] = [];
  for (const s of all) {
    const hay = `${s.label} ${s.meta}`.toLowerCase();
    if (!hay.includes(q)) continue;
    (s.label.toLowerCase().startsWith(q) ? starts : contains).push(s);
  }
  return [...starts, ...contains].slice(0, limit);
}
