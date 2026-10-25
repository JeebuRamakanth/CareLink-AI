/**
 * CareLink-AI — Reviews page data hook (Step 28).
 *
 * Reads the REAL published-review stream from the backend through the public
 * keyset RPC and exposes honest loading / empty / error / results states.
 *
 * It deliberately renders NO fabricated reviews: when the backend is not
 * configured, or when there genuinely are no published reviews, the caller
 * shows a polished empty state. Counts and filter options come from
 * `carelink_public_review_facets()` — real published-only aggregates — never a
 * hardcoded list.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import {
  getPublicReviewFacets,
  listPublicReviewsCursor,
  type PublicReviewFacets,
  type ReviewCursorRow,
} from '../../../services/health-data';
import { isSupabaseConfigured } from '../../../services/supabase/client';

export type ReviewSortOption = 'newest' | 'highest' | 'lowest';
export type ReviewKindFilter = 'all' | 'hospital' | 'doctor' | 'pharmacy' | 'lab';

export interface ReviewSortChoice {
  value: ReviewSortOption;
  label: string;
}

export const REVIEW_SORT_CHOICES: ReviewSortChoice[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest', label: 'Lowest rated' },
];

export const REVIEW_KIND_CHOICES: Array<{ value: ReviewKindFilter; label: string }> = [
  { value: 'all', label: 'All providers' },
  { value: 'hospital', label: 'Hospitals' },
  { value: 'doctor', label: 'Doctors' },
  { value: 'pharmacy', label: 'Pharmacies' },
  { value: 'lab', label: 'Laboratories' },
];

const PAGE_SIZE = 12;

export interface UsePublicReviews {
  rows: ReviewCursorRow[];
  facets: PublicReviewFacets | null;
  /** True once a page request has resolved (success or failure). */
  loaded: boolean;
  initialLoading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  configured: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  loadMore: () => void;
  retry: () => void;
}

export interface UsePublicReviewsOptions {
  query: string;
  sort: ReviewSortOption;
  kind: ReviewKindFilter;
  rating: number | null;
  verifiedOnly: boolean;
}

export function usePublicReviews(options: UsePublicReviewsOptions): UsePublicReviews {
  const { query, sort, kind, rating, verifiedOnly } = options;
  const configured = isSupabaseConfigured();

  const [rows, setRows] = useState<ReviewCursorRow[]>([]);
  const [facets, setFacets] = useState<PublicReviewFacets | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [initialLoading, setInitialLoading] = useState(configured);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);

  const cursor = useRef<{ created: string | null; id: string | null; rating: number | null }>({
    created: null,
    id: null,
    rating: null,
  });
  const busy = useRef(false);
  const requestKey = useRef('');
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const key = useMemo(
    () => [query.trim().toLowerCase(), sort, kind, rating ?? '', verifiedOnly ? '1' : '0'].join('|'),
    [query, sort, kind, rating, verifiedOnly],
  );

  const fetchPage = useCallback(
    async (reset: boolean) => {
      if (!configured) {
        setLoaded(true);
        setInitialLoading(false);
        return;
      }
      if (busy.current) return;
      busy.current = true;
      if (reset) setInitialLoading(true);
      else setLoadingMore(true);

      const next = reset ? { created: null, id: null, rating: null } : cursor.current;
      const { rows: page, error: pageError } = await listPublicReviewsCursor({
        query: query.trim() || undefined,
        rating,
        kind: kind === 'all' ? null : kind,
        verifiedOnly,
        sort,
        beforeCreated: next.created,
        beforeId: next.id,
        beforeRating: next.rating,
        limit: PAGE_SIZE,
      });

      busy.current = false;
      setInitialLoading(false);
      setLoadingMore(false);
      setLoaded(true);

      if (pageError) {
        setError(pageError);
        return;
      }
      setError(null);
      if (reset) {
        setRows(page);
      } else {
        setRows((prev) => {
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...page.filter((r) => !seen.has(r.id))];
        });
      }
      if (page.length > 0) {
        const last = page[page.length - 1];
        cursor.current = { created: last.created_at, id: last.id, rating: last.rating ?? null };
      }
      setHasMore(page.length >= PAGE_SIZE);
    },
    [configured, query, rating, kind, verifiedOnly, sort],
  );

  // Reload from the first page whenever the query / filter / sort key changes.
  useEffect(() => {
    if (requestKey.current === key) return;
    requestKey.current = key;
    cursor.current = { created: null, id: null, rating: null };
    setRows([]);
    setHasMore(false);
    setError(null);
    void fetchPage(true);
  }, [key, fetchPage]);

  // Facets drive the honest filter options + summary. Fetched once per session.
  useEffect(() => {
    if (!configured) return;
    let cancelled = false;
    void (async () => {
      const result = await getPublicReviewFacets();
      if (!cancelled) setFacets(result);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const loadMore = useCallback(() => {
    if (busy.current || !hasMore) return;
    void fetchPage(false);
  }, [fetchPage, hasMore]);

  // Infinite scroll: load the next page when the sentinel becomes visible.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !busy.current) void fetchPage(false);
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, fetchPage]);

  const retry = useCallback(() => {
    cursor.current = { created: null, id: null, rating: null };
    setRows([]);
    setError(null);
    void fetchPage(true);
  }, [fetchPage]);

  return { rows, facets, loaded, initialLoading, loadingMore, error, hasMore, configured, sentinelRef, loadMore, retry };
}
