/**
 * CareLink-AI — TRUE infinite-scroll published reviews (Step 17).
 *
 * Renders the server-side keyset/cursor stream with an IntersectionObserver
 * sentinel. Honest loading / empty / error / end states — no fabricated review
 * content. Each row shows rating, review text, provider (with deep-link),
 * timestamp, verification badge and provider response where supported.
 */

import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import type { ReviewCursorRow } from '../../../services/health-data/reviewsRepository';
import { cn } from '../../../components/common/cn';

interface Props {
  rows: ReviewCursorRow[];
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  searchQuery: string;
  onViewProvider: (kind: ReviewCursorRow['provider_kind'], slug: string) => void;
  onClearSearch: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function ReviewInfiniteSection({
  rows,
  loading,
  initialLoading,
  error,
  hasMore,
  sentinelRef,
  searchQuery,
  onViewProvider,
  onClearSearch,
}: Props) {
  if (initialLoading) {
    return (
      <div className="grid gap-5 sm:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="animate-pulse rounded-[1.75rem] border border-white/10 bg-slate-950/60 p-6" aria-hidden />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 p-6 text-center">
        <p className="text-sm text-rose-100">{error}</p>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-10 text-center">
        <p className="text-sm text-ink-300">
          {searchQuery ? `No published reviews for “${searchQuery}”.` : 'No published reviews yet.'}
        </p>
        {searchQuery ? (
          <button type="button" onClick={onClearSearch} className="mt-3 text-sm text-brand-300 hover:text-brand-200">
            Clear search
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <section className="space-y-4" aria-label="Published reviews">
      <div className="grid gap-5 lg:grid-cols-2">
        {rows.map((row, i) => (
          <motion.article
            key={row.id}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i % 6, 4) * 0.04 }}
            className="flex min-w-0 flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{row.title || 'Review'}</p>
                <p className="mt-0.5 text-xs text-ink-400">
                  {row.author_display} · {formatDate(row.created_at)}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-1 text-amber-300" aria-label={`${row.rating ?? 0} out of 5 stars`}>
                <span aria-hidden>★</span>
                <span className="text-sm font-semibold text-white">{row.rating ?? '—'}</span>
              </span>
            </div>

            {row.body ? <p className="text-sm leading-6 text-ink-200">{row.body}</p> : null}

            {row.provider_name ? (
              <button
                type="button"
                onClick={() => onViewProvider(row.provider_kind, row.provider_slug)}
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                <span className="text-ink-400">{row.provider_kind}</span> {row.provider_name}
              </button>
            ) : null}

            <div className="mt-auto flex flex-wrap gap-2">
              {row.is_verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                  ✓ Verified appointment
                </span>
              ) : null}
              {row.provider_response ? (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.62rem] text-ink-300">
                  Provider responded
                </span>
              ) : null}
            </div>

            {row.provider_response ? (
              <div className="rounded-[1rem] border border-brand-400/20 bg-brand-500/8 p-3">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-brand-200">Provider response</p>
                <p className="mt-1 text-[0.8rem] leading-5 text-ink-200">{row.provider_response}</p>
              </div>
            ) : null}
          </motion.article>
        ))}
      </div>

      {/* Sentinel — the hook's IntersectionObserver loads the next page. */}
      <div ref={sentinelRef} className="flex items-center justify-center py-4" aria-hidden>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-sm text-ink-300">
            <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
            Loading more reviews…
          </span>
        ) : hasMore ? (
          <span className="text-xs text-ink-500">Scroll for more</span>
        ) : (
          <span className={cn('text-xs text-ink-500')}>You’ve reached the end of published reviews.</span>
        )}
      </div>
    </section>
  );
}