/**
 * CareLink-AI — LocationBanner.
 *
 * Honest location state for discovery pages. Shows the active location (browser
 * GPS or manual) and offers a manual entry fallback. Distances are only shown
 * when real coordinates exist — never fabricated.
 */

import { useState } from 'react';
import { useOptionalLocationContext } from '../../contexts/LocationContext';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export function LocationBanner() {
  const ctx = useOptionalLocationContext();
  const [manual, setManual] = useState('');
  const [showManual, setShowManual] = useState(false);

  if (!ctx) return null;

  const { location, permission, isResolving, error, requestCurrentLocation, setManualLocation } = ctx;
  const hasCoords = Boolean(location && typeof location.lat === 'number' && typeof location.lng === 'number');

  const submitManual = () => {
    const label = manual.trim();
    if (!label) return;
    setManualLocation(label);
    setShowManual(false);
    setManual('');
  };

  return (
    <div className="flex flex-col gap-3 rounded-[1.2rem] border border-white/10 bg-white/[0.04] p-4 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2 text-sm text-ink-200">
        <span className="inline-flex h-2 w-2 rounded-full bg-brand-300" aria-hidden />
        <span className="font-medium">Location:</span>
        <span>{location?.label ?? 'Not set'}</span>
        {hasCoords ? (
          <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-emerald-200">
            Live coordinates
          </span>
        ) : (
          <span className="rounded-full border border-amber-400/25 bg-amber-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-amber-200">
            No coordinates
          </span>
        )}
        {permission === 'denied' ? (
          <span className="rounded-full border border-rose-400/25 bg-rose-500/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.14em] text-rose-200">
            Permission denied
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" loading={isResolving} onClick={requestCurrentLocation}>
          {permission === 'granted' ? 'Update my location' : 'Use my location'}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setShowManual((v) => !v)}>
          {showManual ? 'Cancel' : 'Enter manually'}
        </Button>
      </div>

      {showManual ? (
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
          <Input
            label="City / area"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            placeholder="e.g. Machilipatnam"
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitManual(); } }}
          />
          <Button size="sm" onClick={submitManual} disabled={!manual.trim()}>Set</Button>
        </div>
      ) : null}

      {error ? <p className="text-xs text-rose-200">{error}</p> : null}
      {!hasCoords ? (
        <p className="text-xs text-ink-400">
          Distances are unavailable without coordinates. Share your location or enter it manually to rank providers by real distance.
        </p>
      ) : null}
    </div>
  );
}