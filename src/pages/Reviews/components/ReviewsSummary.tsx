/**
 * CareLink-AI — Reviews rating summary (Step 28).
 *
 * Shows ONLY real published-review aggregates from
 * `carelink_public_review_facets()`. When there are no published reviews the
 * panel states that plainly instead of showing a placeholder score.
 */

import type { PublicReviewFacets } from '../../../services/health-data';

interface ReviewsSummaryProps {
  facets: PublicReviewFacets | null;
  /** True while the backend is not configured (demo mode). */
  unconfigured: boolean;
}

export function ReviewsSummary({ facets, unconfigured }: ReviewsSummaryProps) {
  if (unconfigured) return null;

  const total = facets?.total ?? 0;
  const ratings = facets?.ratings ?? [];
  const average = (() => {
    if (total === 0) return null;
    const sum = ratings.reduce((acc, r) => acc + r.rating * r.count, 0);
    return sum / total;
  })();

  return (
    <aside className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-5 backdrop-blur-xl">
      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-brand-200">Published so far</p>
      {total === 0 ? (
        <p className="mt-3 text-sm leading-6 text-ink-300">
          No published reviews yet. This summary fills in from real reviews only — no placeholder scores.
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-2">
            <span className="text-3xl font-semibold text-white">{average!.toFixed(1)}</span>
            <span className="pb-1 text-sm text-ink-400">/ 5.0</span>
          </div>
          <p className="mt-1 text-xs text-ink-400">
            {total} published review{total === 1 ? '' : 's'}
            {facets && facets.verified > 0 ? ` · ${facets.verified} verified` : ''}
          </p>
          <div className="mt-4 space-y-2">
            {[5, 4, 3, 2, 1].map((stars) => {
              const count = ratings.find((r) => r.rating === stars)?.count ?? 0;
              const pct = total > 0 ? Math.round((count / total) * 100) : 0;
              return (
                <div key={stars} className="flex items-center gap-3 text-xs text-ink-300">
                  <span className="w-8 font-semibold text-white">{stars}★</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <span className="block h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-10 text-right tabular-nums">{count}</span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </aside>
  );
}
