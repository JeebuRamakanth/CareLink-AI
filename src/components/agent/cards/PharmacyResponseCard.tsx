/**
 * Step 7 — Pharmacy recommendation card.
 * Mock-only: availability is a PLACEHOLDER, never claimed as real-time stock.
 */

import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconPharmacy, IconLocation, IconRoute } from '../AgentIcons';
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
  const handleDirections = (pharmacy: PharmacyRecommendation) => {
    if (onGetDirections) {
      onGetDirections(pharmacy);
    } else if (pharmacy.route) {
      window.alert(`Directions to ${pharmacy.name} (mock): ${pharmacy.route.distanceKm} km · ~${pharmacy.route.estimatedTravelTimeMin} min`);
    }
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
        disclaimer: 'Stock availability shown is a placeholder — confirm directly with the pharmacy before visiting.',
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
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] ${pharmacy.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300'}`}>
                {pharmacy.isOpen ? 'Open now' : 'Closed'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-300">
              <span className="inline-flex items-center gap-1">
                <IconRoute width={14} height={14} aria-hidden />
                <span>{pharmacy.distanceKm.toFixed(1)} km · ~{pharmacy.estimatedTravelTimeMin} min</span>
              </span>
              {pharmacy.estimatedPrice ? (
                <span>
                  <span className="text-ink-400">Est. price: </span>
                  <span className="font-semibold text-white">{pharmacy.estimatedPrice}</span>
                </span>
              ) : null}
            </div>

            <p className="mt-3 rounded-[0.7rem] border border-white/10 bg-white/5 px-3 py-2 text-[0.78rem] italic text-ink-300">
              {pharmacy.availabilityPlaceholder}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <CardActionButton variant="secondary" onClick={() => window.alert(`View pharmacy profile for ${pharmacy.name} (mock)`)} ariaLabel={`View pharmacy ${pharmacy.name}`}>
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
