/**
 * CareLink-AI — Reviews results list (Step 28).
 *
 * Renders REAL published review rows with their verification status, provider
 * deep-link and provider response. Loading, empty and error states are explicit
 * and never shift layout (skeleton heights match the card grid).
 */

import type { RefObject } from 'react';
import { motion } from 'framer-motion';
import type { ReviewCursorRow } from '../../../services/health-data';
import { cn } from '../../../components/common/cn';

interface ReviewsResultsProps {
  rows: ReviewCursorRow[];
  loading: boolean;
  initialLoading: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  searchQuery: string;
  hasActiveFilters: boolean;
  configured: boolean;
  onViewProvider: (row: ReviewCursorRow) => void;
  onClearSearch: () => void;
  onClearAll: () => void;
  onRetry: () => void;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

function providerLabel(kind: ReviewCursorRow['provider_kind']): string {
  return kind === 'hospital' ? 'Hospital' : kind === 'doctor' ? 'Doctor' : kind === 'pharmacy' ? 'Pharmacy' : kind === 'lab' ? 'Laboratory' : 'Provider';
}

export function ReviewsResults({
  rows,
  loading,
  initialLoading,
  error,
  hasMore,
  sentinelRef,
  searchQuery,
  hasActiveFilters,
  configured,
  onViewProvider,
  onClearSearch,
  onClearAll,
  onRetry,
}: ReviewsResultsProps) {
  if (!configured) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-10 text-center">
        <p className="text-sm font-semibold text-white">No sourced reviews are available yet</p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-300">
          CareLink shows only reviews written by patients after a completed appointment, and no review backend is
          connected in this environment. Nothing is shown rather than invented feedback.
        </p>
      </div>
    );
  }

  if (initialLoading) {
    return (
      <div className="grid gap-5 lg:grid-cols-2" aria-busy="true" aria-live="polite">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-44 animate-pulse rounded-[1.5rem] border border-white/10 bg-slate-950/60" aria-hidden />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" className="rounded-[1.5rem] border border-rose-400/30 bg-rose-500/10 p-6 text-center">
        <p className="text-sm text-rose-100">{error}</p>
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          Try again
        </button>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-10 text-center">
        <p className="text-sm font-semibold text-white">
          {searchQuery ? `No reviews match “${searchQuery}”` : hasActiveFilters ? 'No reviews match these filters' : 'No published reviews yet'}
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-300">
          {searchQuery || hasActiveFilters
            ? 'Try a different term, or clear the filters to see every published review.'
            : 'Reviews appear here once a patient completes an appointment and publishes a review.'}
        </p>
        {searchQuery || hasActiveFilters ? (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            {searchQuery ? (
              <button
                type="button"
                onClick={onClearSearch}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                Clear search
              </button>
            ) : null}
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={onClearAll}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                Clear all filters
              </button>
            ) : null}
          </div>
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
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: Math.min(i % 6, 4) * 0.03 }}
            className="flex min-w-0 flex-col gap-3 rounded-[1.5rem] border border-white/10 bg-slate-950/55 p-5 backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">{row.title || 'Patient review'}</p>
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
                onClick={() => onViewProvider(row)}
                className="inline-flex w-fit items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                <span className="text-ink-400">{providerLabel(row.provider_kind)}</span>
                <span className="truncate">{row.provider_name}</span>
              </button>
            ) : null}

            <div className="mt-auto flex flex-wrap gap-2">
              {row.is_verified ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.14em] text-emerald-100">
                  ✓ Verified appointment
                </span>
              ) : (
                <span className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.62rem] font-medium uppercase tracking-[0.14em] text-ink-400">
                  Unverified visit
                </span>
              )}
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

      <div ref={sentinelRef} className="flex items-center justify-center py-4" aria-hidden>
        {loading ? (
          <span className="inline-flex items-center gap-2 text-sm text-ink-300">
            <span className="size-5 animate-spin rounded-full border-2 border-white/20 border-t-brand-400" />
            Loading more reviews…
          </span>
        ) : hasMore ? (
          <span className={cn('text-xs text-ink-500')}>Scroll for more</span>
        ) : (
          <span className="text-xs text-ink-500">You’ve reached the end of published reviews.</span>
        )}
      </div>
    </section>
  );
}
