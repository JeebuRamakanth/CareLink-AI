/**
 * CareLink-AI — Reviews filter + sort bar (Step 28).
 *
 * A single aligned row of real controls:
 *   - provider-kind chips (All / Hospitals / Doctors / Pharmacies / Labs),
 *   - minimum-rating select,
 *   - "verified only" toggle,
 *   - sort select,
 *   - Near me toggle,
 *   - Clear all — positioned WITH the filters, not floating.
 *
 * Every option is either a fixed enum of the review schema or a real value from
 * the published-review facets. Nothing is fabricated, and nothing claims a
 * capability the product does not have.
 */

import { cn } from '../../../components/common/cn';
import type { ReviewKindFilter, ReviewSortOption } from '../hooks/usePublicReviews';
import { REVIEW_KIND_CHOICES, REVIEW_SORT_CHOICES } from '../hooks/usePublicReviews';
import type { LocationPermissionState } from '../../../contexts/LocationContext';

const RATING_CHOICES: Array<{ value: number | null; label: string }> = [
  { value: null, label: 'Any rating' },
  { value: 5, label: '5 stars' },
  { value: 4, label: '4 stars' },
  { value: 3, label: '3 stars' },
  { value: 2, label: '2 stars' },
  { value: 1, label: '1 star' },
];

export interface ReviewsFilterBarProps {
  kind: ReviewKindFilter;
  onKindChange: (kind: ReviewKindFilter) => void;
  rating: number | null;
  onRatingChange: (rating: number | null) => void;
  verifiedOnly: boolean;
  onVerifiedOnlyChange: (value: boolean) => void;
  sort: ReviewSortOption;
  onSortChange: (sort: ReviewSortOption) => void;
  nearMe: boolean;
  onNearMeToggle: () => void;
  nearMeBusy: boolean;
  permission: LocationPermissionState;
  /** True when a location (GPS or manual) is active. */
  hasLocation: boolean;
  locationLabel: string;
  /** True when no directory provider has a published coordinate. */
  noPublishedCoordinates: boolean;
  /** Any filter (kind/rating/verified/near-me) is active. */
  hasActiveFilters: boolean;
  /** A search term is present — Clear all must reset that too. */
  hasQuery: boolean;
  onClearAll: () => void;
  disabled?: boolean;
}

export function ReviewsFilterBar({
  kind,
  onKindChange,
  rating,
  onRatingChange,
  verifiedOnly,
  onVerifiedOnlyChange,
  sort,
  onSortChange,
  nearMe,
  onNearMeToggle,
  nearMeBusy,
  permission,
  hasLocation,
  locationLabel,
  noPublishedCoordinates,
  hasActiveFilters,
  hasQuery,
  onClearAll,
  disabled = false,
}: ReviewsFilterBarProps) {
  return (
    <section aria-label="Filter reviews" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {REVIEW_KIND_CHOICES.map((choice) => {
          const active = kind === choice.value;
          return (
            <button
              key={choice.value}
              type="button"
              onClick={() => onKindChange(choice.value)}
              aria-pressed={active}
              disabled={disabled}
              className={cn(
                'rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-50',
                active
                  ? 'border-brand-400/40 bg-brand-500/20 text-white'
                  : 'border-white/12 bg-white/5 text-ink-200 hover:border-brand-400/30 hover:bg-white/10 hover:text-white',
              )}
            >
              {choice.label}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-3 backdrop-blur-xl">
        <label className="flex items-center gap-2 text-[0.78rem] text-ink-300">
          <span className="sr-only">Minimum rating</span>
          <select
            value={rating ?? ''}
            onChange={(e) => onRatingChange(e.target.value === '' ? null : Number(e.target.value))}
            disabled={disabled}
            className="min-w-0 rounded-full border border-white/12 bg-slate-950/70 px-3 py-2 text-[0.82rem] font-medium text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20 disabled:opacity-50"
            aria-label="Minimum rating"
          >
            {RATING_CHOICES.map((choice) => (
              <option key={choice.label} value={choice.value ?? ''}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-[0.78rem] text-ink-300">
          <span className="sr-only">Sort reviews</span>
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as ReviewSortOption)}
            disabled={disabled}
            className="min-w-0 rounded-full border border-white/12 bg-slate-950/70 px-3 py-2 text-[0.82rem] font-medium text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20 disabled:opacity-50"
            aria-label="Sort reviews"
          >
            {REVIEW_SORT_CHOICES.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.label}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => onVerifiedOnlyChange(!verifiedOnly)}
          aria-pressed={verifiedOnly}
          disabled={disabled}
          className={cn(
            'rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-50',
            verifiedOnly
              ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-100'
              : 'border-white/12 bg-white/5 text-ink-200 hover:bg-white/10 hover:text-white',
          )}
        >
          Verified appointments only
        </button>

        <button
          type="button"
          onClick={onNearMeToggle}
          aria-pressed={nearMe}
          disabled={disabled || nearMeBusy}
          title={noPublishedCoordinates ? 'No provider in the directory has a published location yet' : undefined}
          className={cn(
            'rounded-full border px-3.5 py-2 text-[0.82rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-50',
            nearMe
              ? 'border-accent-400/40 bg-accent-500/15 text-white'
              : 'border-white/12 bg-white/5 text-ink-200 hover:bg-white/10 hover:text-white',
          )}
        >
          {nearMeBusy ? 'Locating…' : 'Near me'}
        </button>

        <button
          type="button"
          onClick={onClearAll}
          disabled={disabled || !(hasActiveFilters || hasQuery)}
          className="ml-auto rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-[0.82rem] font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-40"
        >
          Clear all
        </button>
      </div>

      {/* Honest location state — Near me never silently does nothing. */}
      {nearMe ? (
        <p className="text-xs text-ink-400">
          {permission === 'denied'
            ? 'Location permission denied — enter your location manually to sort by distance.'
            : noPublishedCoordinates
              ? 'No directory provider has a published location yet, so this order is unchanged. Providers without a published location stay at the end.'
              : hasLocation
                ? `Sorting by distance from ${locationLabel}. Providers without a published location stay at the end.`
                : 'Waiting for a location. Allow the browser prompt or enter your location manually.'}
        </p>
      ) : null}
    </section>
  );
}
