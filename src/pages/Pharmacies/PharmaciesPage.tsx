/**
 * CareLink-AI — Pharmacies discovery page.
 *
 * Centered, corridor-wide pharmacy discovery. Results come from the real sourced
 * directory (src/data/pharmacies.ts, generated from the reviewed OpenStreetMap
 * snapshot) merged with the live registry when Supabase is configured — never a
 * hardcoded array inside this component.
 *
 * LOCATION: "Use my location" requests browser permission only after the user
 * clicks. If it is denied or unavailable, manual locality/pincode search keeps
 * working — the feature is never blocked by a denied permission.
 *
 * STOCK: no live inventory feed exists, so the page states that medicine
 * availability must be confirmed with the pharmacy. It never shows a stock level.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { useOptionalLocationContext } from '../../contexts/LocationContext';
import { coverageScopeLabel } from '../../data/coverage';
import {
  getPharmacies,
  pharmacyFilterOptions,
  pharmacyStockState,
  isPharmacyBackendConfigured,
  type PharmacySort,
} from '../../services';
import type { Pharmacy } from '../../types';
import { PharmacyCard } from './components/PharmacyCard';

type PharmacyRow = Pharmacy & { distanceKm?: number | null };

const sortOptions: Array<{ label: string; value: PharmacySort }> = [
  { label: 'Nearest first', value: 'nearest' },
  { label: 'Name (A–Z)', value: 'name' },
  { label: 'Locality', value: 'locality' },
];

export function PharmaciesPage() {
  const locationCtx = useOptionalLocationContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [pharmacies, setPharmacies] = useState<PharmacyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [locality, setLocality] = useState(searchParams.get('locality') ?? '');
  const [sort, setSort] = useState<PharmacySort>('nearest');

  // Memoised so the loader's dependency list is stable (a fresh object each
  // render would re-trigger the load effect in a loop).
  const origin = useMemo(
    () => (locationCtx?.location && typeof locationCtx.location.lat === 'number' && typeof locationCtx.location.lng === 'number'
      ? { lat: locationCtx.location.lat, lng: locationCtx.location.lng, label: locationCtx.location.label }
      : null),
    [locationCtx?.location],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await getPharmacies({ origin, sort, query: search || undefined, locality: locality || undefined });
      setPharmacies(rows as PharmacyRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the pharmacy directory.');
    } finally {
      setLoading(false);
    }
  }, [origin, sort, search, locality]);

  useEffect(() => { void load(); }, [load]);

  // Reflect the active filters in the URL so a deep link can restore them.
  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (locality) next.set('locality', locality);
    setSearchParams(next, { replace: true });
  }, [search, locality, setSearchParams]);

  const options = useMemo(() => pharmacyFilterOptions(pharmacies), [pharmacies]);

  const hasActiveFilters = Boolean(search || locality);
  const reset = () => { setSearch(''); setLocality(''); setSort('nearest'); };

  const stockIntegrated = pharmacyStockState() === 'live';
  const backendConfigured = isPharmacyBackendConfigured();

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-200">Pharmacies</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Find a pharmacy near you</h1>
          <p className="mx-auto max-w-3xl text-sm leading-7 text-ink-300">
            Pharmacies sourced across the {coverageScopeLabel()}. Results are ranked by distance from your location when you
            share it, and every listing shows its own source. Medicine stock is not connected, so confirm availability with the pharmacy.
          </p>
        </header>

        {/* Location + search + sort */}
        <div className="rounded-[1.6rem] border border-white/10 bg-slate-950/60 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-ink-200">
              <span className="inline-flex size-2 rounded-full bg-brand-300" aria-hidden />
              <span className="font-medium">Location:</span>
              <span>{origin ? origin.label ?? 'Your current location' : 'Not set'}</span>
              {origin ? (
                <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-200">Live coordinates</span>
              ) : (
                <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-amber-200">No coordinates</span>
              )}
              {locationCtx?.permission === 'denied' ? (
                <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-rose-200">Permission denied</span>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => locationCtx?.requestCurrentLocation()}
                disabled={locationCtx?.isResolving}
                className="rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-sm font-semibold text-ink-100 transition hover:bg-white/10 disabled:opacity-50"
              >
                {locationCtx?.isResolving ? 'Locating…' : 'Use my location'}
              </button>
              {origin ? (
                <button
                  type="button"
                  onClick={() => locationCtx?.clearLocation()}
                  className="rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-sm font-semibold text-ink-100 transition hover:bg-white/10"
                >
                  Clear location
                </button>
              ) : null}
            </div>
          </div>

          {locationCtx?.error ? (
            <p role="status" className="mt-3 rounded-[0.8rem] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[0.78rem] text-amber-100">
              {locationCtx.error} You can still search by locality or pincode below.
            </p>
          ) : null}

          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Search</span>
              <input
                id="pharmacy-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Pharmacy name, area or pincode"
                aria-label="Search pharmacies by name, area or pincode"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Locality</span>
              <select
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                aria-label="Filter pharmacies by locality"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                <option value="">All localities</option>
                {options.localities.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Sort</span>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as PharmacySort)}
                aria-label="Sort pharmacies"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-300">
              {loading ? 'Loading pharmacies…' : `${pharmacies.length} pharmac${pharmacies.length === 1 ? 'y' : 'ies'} shown`}
              {!origin && !loading ? ' · set your location to sort by distance' : ''}
            </p>
            <button
              type="button"
              onClick={reset}
              disabled={!hasActiveFilters && sort === 'nearest'}
              className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-ink-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Reset filters
            </button>
          </div>
        </div>

        {/* Honest source + stock state */}
        <div role="note" className="rounded-[1.4rem] border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-6 text-amber-100">
          {stockIntegrated
            ? 'Live medicine stock is connected for supported pharmacies.'
            : 'Live medicine stock is not connected for any pharmacy here. Confirm availability directly with the pharmacy before travelling.'}
          {!backendConfigured ? ' Results come from the sourced corridor directory (OpenStreetMap, ODbL) — a community-mapped listing, not a licence or stock check.' : ''}
        </div>

        {error ? (
          <ErrorState
            title="Unable to load pharmacies"
            description={error}
            action={<button type="button" onClick={() => void load()} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>}
          />
        ) : loading ? (
          <div role="status" aria-live="polite" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-64 animate-pulse rounded-[1.6rem] border border-white/10 bg-white/5" />
            ))}
          </div>
        ) : pharmacies.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No pharmacies match those filters' : 'No pharmacies are in the directory yet'}
            description={
              hasActiveFilters
                ? 'Try a different locality, clear the search, or widen the search area.'
                : 'The sourced corridor directory has no pharmacy records yet. This is a coverage limitation of the source, not a statement that no pharmacy exists.'
            }
            action={hasActiveFilters ? <button type="button" onClick={reset} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Reset filters</button> : undefined}
          />
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pharmacies.map((pharmacy) => (
              <PharmacyCard key={pharmacy.id} pharmacy={pharmacy} showRankNote={sort === 'nearest' && Boolean(origin)} />
            ))}
          </div>
        )}

        <p className="text-center text-xs leading-5 text-ink-500">
          Source coverage is a limitation, not a confirmation of absence: OpenStreetMap records what has been surveyed, which is
          denser in Vijayawada than in smaller corridor villages.
        </p>
      </div>
    </Container>
  );
}
