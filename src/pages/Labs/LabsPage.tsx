/**
 * CareLink-AI — Laboratories discovery page.
 *
 * Uses the same sourced corridor directory as Pharmacies (generated from the
 * reviewed OpenStreetMap snapshot). Laboratory coverage is genuinely thinner
 * than pharmacy coverage, so the page states that honestly rather than padding
 * the list. Tests, prices and home-collection appear only when published.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { EmptyState, ErrorState } from '../../components/ui/states';
import { useOptionalLocationContext } from '../../contexts/LocationContext';
import { coverageScopeLabel } from '../../data/coverage';
import { getLaboratories, getBundledLaboratories } from '../../services';
import type { Laboratory } from '../../types';
import { LaboratoryCard } from './components/LaboratoryCard';

type LaboratoryRow = Laboratory & { distanceKm?: number | null };

export function LabsPage() {
  const locationCtx = useOptionalLocationContext();
  const [searchParams, setSearchParams] = useSearchParams();

  const [labs, setLabs] = useState<LaboratoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [locality, setLocality] = useState(searchParams.get('locality') ?? '');

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
      const rows = await getLaboratories({ origin });
      setLabs(rows as LaboratoryRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load the laboratory directory.');
    } finally {
      setLoading(false);
    }
  }, [origin]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (search) next.set('q', search);
    if (locality) next.set('locality', locality);
    setSearchParams(next, { replace: true });
  }, [search, locality, setSearchParams]);

  const options = useMemo(() => {
    const unique = (values: Array<string | undefined>) =>
      [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) => a.localeCompare(b));
    return { localities: unique(getBundledLaboratories().map((l) => l.locality)) };
  }, []);

  const filtered = useMemo(
    () => labs.filter((lab) => {
      const term = search.trim().toLowerCase();
      const matchesSearch = !term || [lab.name, lab.locality, lab.address, lab.pincode ?? ''].join(' ').toLowerCase().includes(term);
      const matchesLocality = !locality || lab.locality === locality;
      return matchesSearch && matchesLocality;
    }),
    [labs, search, locality],
  );

  const hasActiveFilters = Boolean(search || locality);
  const reset = () => { setSearch(''); setLocality(''); };

  return (
    <Container className="py-8 sm:py-10 lg:py-16">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.32em] text-brand-200">Laboratories</p>
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">Find a diagnostic laboratory</h1>
          <p className="mx-auto max-w-3xl text-sm leading-7 text-ink-300">
            Laboratories sourced across the {coverageScopeLabel()}. Test menus, prices and home-collection are shown only when a
            source publishes them — otherwise the listing says so.
          </p>
        </header>

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
            </div>
            <button
              type="button"
              onClick={() => locationCtx?.requestCurrentLocation()}
              disabled={locationCtx?.isResolving}
              className="rounded-full border border-white/12 bg-white/5 px-3.5 py-2 text-sm font-semibold text-ink-100 transition hover:bg-white/10 disabled:opacity-50"
            >
              {locationCtx?.isResolving ? 'Locating…' : 'Use my location'}
            </button>
          </div>

          <div className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Search</span>
              <input
                id="lab-search-input"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Laboratory name, area or pincode"
                aria-label="Search laboratories by name, area or pincode"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              />
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className="text-xs font-semibold uppercase tracking-[0.24em] text-ink-400">Locality</span>
              <select
                value={locality}
                onChange={(event) => setLocality(event.target.value)}
                aria-label="Filter laboratories by locality"
                className="w-full min-w-0 rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                <option value="">All localities</option>
                {options.localities.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-300">{loading ? 'Loading laboratories…' : `${filtered.length} laborator${filtered.length === 1 ? 'y' : 'ies'} shown`}</p>
            <button
              type="button"
              onClick={reset}
              disabled={!hasActiveFilters}
              className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-ink-200 transition hover:bg-white/10 disabled:opacity-50"
            >
              Reset filters
            </button>
          </div>
        </div>

        <div role="note" className="rounded-[1.4rem] border border-amber-400/25 bg-amber-500/10 px-5 py-4 text-sm leading-6 text-amber-100">
          Laboratory coverage in this corridor is thin in public sources. An empty or short list means the source has not
          published those facilities — it is not proof that no laboratory exists. Confirm tests and availability with the facility.
        </div>

        {error ? (
          <ErrorState
            title="Unable to load laboratories"
            description={error}
            action={<button type="button" onClick={() => void load()} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Try again</button>}
          />
        ) : loading ? (
          <div role="status" aria-live="polite" className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((n) => <div key={n} className="h-56 animate-pulse rounded-[1.6rem] border border-white/10 bg-white/5" />)}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            title={hasActiveFilters ? 'No laboratories match those filters' : 'No laboratories are in the directory yet'}
            description={
              hasActiveFilters
                ? 'Try a different locality or clear the search.'
                : 'The sourced corridor directory has no laboratory records yet. This is a source coverage limitation, not a confirmation of absence.'
            }
            action={hasActiveFilters ? <button type="button" onClick={reset} className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-semibold text-white">Reset filters</button> : undefined}
          />
        ) : (
          <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((lab) => <LaboratoryCard key={lab.id} laboratory={lab} />)}
          </div>
        )}
      </div>
    </Container>
  );
}
