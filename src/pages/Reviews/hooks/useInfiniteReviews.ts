/**
 * CareLink-AI — TRUE infinite scroll for the public reviews stream (Step 17).
 *
 * Uses the server-side keyset/cursor RPC (`carelink_reviews_cursor`) so each
 * page is fetched after the last visible row by (created_at, id) — no
 * duplicates, no skipped records, no full-table download. An IntersectionObserver
 * on a sentinel triggers the next page; a server-side limit cap prevents
 * unbounded requests.
 *
 * Falls back to honest empty/loading/error states when the backend is not
 * configured (the Reviews page shows its existing demo discovery in that case).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { listReviewsCursor } from '../../../services/health-data/reviewsRepository';
import type { ReviewCursorRow } from '../../../services/health-data/reviewsRepository';
import { isSupabaseConfigured } from '../../../services/supabase/client';

export interface InfiniteReviewsOptions {
  pageSize?: number;
  query?: string;
  rating?: number | null;
  kind?: string | null;
}

export function useInfiniteReviews(options: InfiniteReviewsOptions = {}) {
  const pageSize = options.pageSize ?? 12;
  const [rows, setRows] = useState<ReviewCursorRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [ready, setReady] = useState(isSupabaseConfigured());
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const last = useRef<{ created: string | null; id: string | null }>({ created: null, id: null });
  const busyRef = useRef(false);
  const keyRef = useRef('');

  const configureBackend = useCallback(() => setReady(isSupabaseConfigured()), []);

  const loadPage = useCallback(
    async (reset: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      if (reset) setLoading(true);
      else setLoading(true);

      const nextCursor = reset ? null : last.current;
      const { rows: res, error: err } = await listReviewsCursor({
        query: options.query?.trim() || undefined,
        rating: options.rating ?? null,
        kind: options.kind ?? null,
        beforeCreated: nextCursor?.created ?? null,
        beforeId: nextCursor?.id ?? null,
        limit: pageSize,
      });

      busyRef.current = false;
      setInitialLoading(false);
      setLoading(false);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      if (reset) {
        setRows(res);
      } else {
        setRows((prev) => {
          const known = new Set(prev.map((r) => r.id));
          const fresh = res.filter((r) => !known.has(r.id));
          return [...prev, ...fresh];
        });
      }
      if (res.length > 0) {
        const lastRow = res[res.length - 1];
        last.current = { created: lastRow.created_at, id: lastRow.id };
      }
      setHasMore(res.length >= pageSize);
    },
    [options.query, options.rating, options.kind, pageSize]
  );

  const key = `${options.query?.trim() ?? ''}|${options.rating ?? ''}|${options.kind ?? ''}`;

  useEffect(() => {
    if (keyRef.current !== key) {
      keyRef.current = key;
      last.current = { created: null, id: null };
      setRows([]);
      setInitialLoading(true);
      void loadPage(true);
    }
  }, [key, loadPage]);

  // Reset the backend-readiness whenever the config changes.
  useEffect(() => {
    configureBackend();
  }, [configureBackend]);

  // IntersectionObserver: load the next page when the sentinel becomes visible.
  useEffect(() => {
    if (!ready || !hasMore) return;
    const el = sentinelRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !busyRef.current) {
          void loadPage(false);
        }
      },
      { rootMargin: '200px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [ready, hasMore, loadPage]);

  return { rows, loading, initialLoading, error, hasMore, sentinelRef, ready };
}