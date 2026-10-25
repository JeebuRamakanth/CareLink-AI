/**
 * CareLink-AI — ReviewsPage (Step 28, redesigned).
 *
 * Layout: a single centered content column (max-w-5xl) — no empty left column and
 * no crowded right sidebar. Order:
 *   1. compact heading + concise introduction,
 *   2. one full-width search field (with source-backed suggestions),
 *   3. a compact filter + sort row with "Clear all" beside it,
 *   4. an honest rating summary beside the results on wide screens,
 *   5. the real published-review results with loading/empty/error states.
 *
 * Data: REAL published reviews only, via the public keyset RPC. The page never
 * shows fabricated testimonials, star ratings or review counts.
 */

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { LocationBanner } from '../../components/location/LocationBanner';
import { useOptionalLocationContext } from '../../contexts/LocationContext';
import { ROUTES } from '../../routes/routeConstants';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { usePublicReviews, type ReviewKindFilter, type ReviewSortOption } from './hooks/usePublicReviews';
import { ReviewsSearchHeader } from './components/ReviewsSearchHeader';
import { ReviewsFilterBar } from './components/ReviewsFilterBar';
import { ReviewsResults } from './components/ReviewsResults';
import { ReviewsSummary } from './components/ReviewsSummary';
import { locatedProviderCount, providerDistanceKm } from './data/providerLocationIndex';

export function ReviewsPage() {
  useDocumentTitle(
    'Reviews',
    'Read published patient reviews of hospitals, doctors, pharmacies and laboratories on the Machilipatnam–Vijayawada corridor.',
  );
  const navigate = useNavigate();
  const locationCtx = useOptionalLocationContext();

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<ReviewKindFilter>('all');
  const [rating, setRating] = useState<number | null>(null);
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [sort, setSort] = useState<ReviewSortOption>('newest');
  const [nearMe, setNearMe] = useState(false);

  // Near me overrides the rating/date sort with a real proximity order, so the
  // server fetch always uses the "newest" keyset (client sorts the loaded page).
  const reviews = usePublicReviews({ query, sort: nearMe ? 'newest' : sort, kind, rating, verifiedOnly });

  const noPublishedCoordinates = locatedProviderCount() === 0;
  const lat = locationCtx?.location?.lat;
  const lng = locationCtx?.location?.lng;
  const origin = useMemo(
    () => (typeof lat === 'number' && typeof lng === 'number' ? { lat, lng } : null),
    [lat, lng],
  );

  const orderedRows = useMemo(() => {
    if (!nearMe || !origin) return reviews.rows;
    return reviews.rows
      .map((row) => ({
        row,
        distance: providerDistanceKm({ kind: row.provider_kind, slug: row.provider_slug, name: row.provider_name }, origin),
      }))
      .sort((a, b) => {
        if (a.distance === null && b.distance === null) return 0;
        if (a.distance === null) return 1;
        if (b.distance === null) return -1;
        return a.distance - b.distance;
      })
      .map((entry) => entry.row);
  }, [nearMe, origin, reviews.rows]);

  const hasActiveFilters = kind !== 'all' || rating !== null || verifiedOnly || nearMe;

  const handleNearMeToggle = () => {
    if (nearMe) {
      setNearMe(false);
      return;
    }
    setNearMe(true);
    // Request location ONLY on explicit activation (never on page load).
    if (!origin && locationCtx) locationCtx.requestCurrentLocation();
  };

  const clearAll = () => {
    setQuery('');
    setKind('all');
    setRating(null);
    setVerifiedOnly(false);
    setSort('newest');
    setNearMe(false);
  };

  const openProvider = (row: (typeof reviews.rows)[number]) => {
    if (!row.provider_slug) return;
    const base =
      row.provider_kind === 'hospital'
        ? ROUTES.hospitals
        : row.provider_kind === 'doctor'
          ? ROUTES.doctors
          : row.provider_kind === 'pharmacy'
            ? ROUTES.pharmacies
            : row.provider_kind === 'lab'
              ? ROUTES.labs
              : '';
    if (base) navigate(`${base}/${row.provider_slug}`);
  };

  const resultLabel =
    reviews.configured && reviews.loaded
      ? `${orderedRows.length} review${orderedRows.length === 1 ? '' : 's'} shown`
      : 'Reviews';

  return (
    <Container className="py-8 sm:py-10 lg:py-14">
      <main className="mx-auto max-w-5xl space-y-8 sm:space-y-10">
        <ReviewsSearchHeader query={query} onQueryChange={setQuery} onClear={() => setQuery('')} />

        {/* Manual location entry is shown when Near me is active or the browser
            denied permission, so a denied prompt never dead-ends the feature. */}
        {nearMe || locationCtx?.permission === 'denied' ? <LocationBanner /> : null}

        <ReviewsFilterBar
          kind={kind}
          onKindChange={setKind}
          rating={rating}
          onRatingChange={setRating}
          verifiedOnly={verifiedOnly}
          onVerifiedOnlyChange={setVerifiedOnly}
          sort={sort}
          onSortChange={(next) => {
            setNearMe(false);
            setSort(next);
          }}
          nearMe={nearMe}
          onNearMeToggle={handleNearMeToggle}
          nearMeBusy={Boolean(locationCtx?.isResolving)}
          permission={locationCtx?.permission ?? 'unknown'}
          hasLocation={Boolean(origin)}
          locationLabel={locationCtx?.location?.label ?? 'your location'}
          noPublishedCoordinates={noPublishedCoordinates}
          hasActiveFilters={hasActiveFilters}
          hasQuery={query.trim().length > 0}
          onClearAll={clearAll}
        />

        <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-start">
          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-white" aria-live="polite">
                {resultLabel}
              </p>
              {hasActiveFilters ? (
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-xs font-semibold text-brand-200 transition hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
                >
                  Clear all
                </button>
              ) : null}
            </div>

            <ReviewsResults
              rows={orderedRows}
              loading={reviews.loadingMore}
              initialLoading={reviews.initialLoading}
              error={reviews.error}
              hasMore={reviews.hasMore}
              sentinelRef={reviews.sentinelRef}
              searchQuery={query}
              hasActiveFilters={hasActiveFilters}
              configured={reviews.configured}
              onViewProvider={openProvider}
              onClearSearch={() => setQuery('')}
              onClearAll={clearAll}
              onRetry={reviews.retry}
            />

            {reviews.hasMore ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={reviews.loadMore}
                  disabled={reviews.loadingMore}
                  className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm font-semibold text-ink-200 transition hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 disabled:opacity-50"
                >
                  {reviews.loadingMore ? 'Loading…' : 'Load more reviews'}
                </button>
              </div>
            ) : null}
          </div>

          <ReviewsSummary facets={reviews.facets} unconfigured={!reviews.configured} />
        </div>
      </main>
    </Container>
  );
}
