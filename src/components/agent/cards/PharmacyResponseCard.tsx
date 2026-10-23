/**
 * Step 7 / 27 — Pharmacy recommendation card.
 * REAL sourced records: medicine stock is NOT connected, so the card says so
 * instead of showing a placeholder level. Distance is shown only when real
 * coordinates exist. "View pharmacy" and "Get Directions" deep-link to real app
 * routes / maps.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconPharmacy, IconLocation, IconRoute } from '../AgentIcons';
import { ROUTES } from '../../../routes/routeConstants';
import { directionsUrl } from '../../../services/maps/mapsService';
import { buildDirectionsUrl } from '../../../services/maps/directionsService';
import type { PharmacyRecommendation } from '../../../services/agent/agentTypes';

interface Props {
  data: PharmacyRecommendation[];
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
  onGetDirections?: (pharmacy: PharmacyRecommendation) => void;
}

export function PharmacyResponseCard({ data, title, explanation, suggestedReplies, onPickReply, onGetDirections }: Props) {
  const navigate = useNavigate();

  const handleDirections = (pharmacy: PharmacyRecommendation) => {
    if (onGetDirections) {
      onGetDirections(pharmacy);
      return;
    }
    // Prefer the shared resolver (coordinates → address), then fall back to a
    // name+address query. Never a mock alert, never a default coordinate.
    const resolved = buildDirectionsUrl({
      name: pharmacy.name,
      address: pharmacy.address,
      latitude: pharmacy.latitude,
      longitude: pharmacy.longitude,
    }) ?? directionsUrl({ destination: `${pharmacy.name}, ${pharmacy.address}`, mode: 'driving' });
    window.open(resolved, '_blank', 'noopener,noreferrer');
  };

  return (
    <ResponseCardShell
      accent="accent"
      title={title}
      explanation={explanation}
      icon={<IconPharmacy width={20} height={20} />}
      meta={{
        confidence: 'medium',
        urgency: 'routine',
        disclaimer: 'Medicine stock is not connected — confirm availability directly with the pharmacy before visiting.',
      }}
    >
      <div className="space-y-3">
        {data.map((pharmacy) => (
          <article
            key={pharmacy.id}
            className="rounded-[1.1rem] border border-white/10 bg-slate-950/45 p-4 transition duration-200 hover:border-accent-400/25"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h4 className="text-base font-semibold text-white">{pharmacy.name}</h4>
                <p className="flex items-center gap-1.5 text-sm text-ink-300">
                  <IconLocation width={14} height={14} aria-hidden />
                  <span className="truncate">{pharmacy.address}</span>
                </p>
              </div>
              {pharmacy.distanceAvailable && pharmacy.distanceKm > 0 ? (
                <span className="shrink-0 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.66rem] font-semibold text-brand-100">
                  {pharmacy.distanceKm.toFixed(1)} km
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.66rem] font-semibold text-ink-300">
                  Distance unavailable
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-300">
              <span>{pharmacy.hoursLabel ? `Hours: ${pharmacy.hoursLabel}` : 'Opening hours not published'}</span>
            </div>

            <p className="mt-3 rounded-[0.7rem] border border-white/10 bg-white/5 px-3 py-2 text-[0.78rem] text-ink-300">
              {pharmacy.availabilityPlaceholder}
            </p>

            {pharmacy.sourceLabel ? (
              <p className="mt-2 text-[0.7rem] text-ink-500">
                Source: {pharmacy.sourceUrl ? <a href={pharmacy.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{pharmacy.sourceLabel}</a> : pharmacy.sourceLabel}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <CardActionButton variant="secondary" onClick={() => navigate(ROUTES.pharmacies)} ariaLabel={`View pharmacy ${pharmacy.name}`}>
                View pharmacy
              </CardActionButton>
              <CardActionButton variant="primary" icon={<IconRoute width={15} height={15} />} onClick={() => handleDirections(pharmacy)} ariaLabel={`Get directions to ${pharmacy.name}`}>
                Get Directions
              </CardActionButton>
            </div>
          </article>
        ))}
      </div>

      <NextStepRow label="Call ahead to confirm the medicine is in stock before you travel." />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}
