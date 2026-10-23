/**
 * Step 7 / 27 — Diagnostic / lab recommendation card.
 * REAL sourced records: tests and home collection are shown ONLY when a source
 * published them. "View lab" and "Get Directions" deep-link to real app routes.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconLab, IconLocation, IconRoute } from '../AgentIcons';
import { ROUTES } from '../../../routes/routeConstants';
import { directionsUrl } from '../../../services/maps/mapsService';
import { buildDirectionsUrl } from '../../../services/maps/directionsService';
import type { LabRecommendation } from '../../../services/agent/agentTypes';

interface Props {
  data: LabRecommendation[];
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
  onGetDirections?: (lab: LabRecommendation) => void;
}

export function LabResponseCard({ data, title, explanation, suggestedReplies, onPickReply, onGetDirections }: Props) {
  const navigate = useNavigate();

  const handleDirections = (lab: LabRecommendation) => {
    if (onGetDirections) {
      onGetDirections(lab);
      return;
    }
    const resolved = buildDirectionsUrl({
      name: lab.name,
      address: lab.address,
      latitude: lab.latitude,
      longitude: lab.longitude,
    }) ?? directionsUrl({ destination: `${lab.name}, ${lab.address}`, mode: 'driving' });
    window.open(resolved, '_blank', 'noopener,noreferrer');
  };

  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconLab width={20} height={20} />}
      meta={{ confidence: 'medium', urgency: 'routine', disclaimer: 'Test availability is not published for every facility — confirm directly with the lab.' }}
    >
      <div className="space-y-3">
        {data.map((lab) => (
          <article
            key={lab.id}
            className="rounded-[1.1rem] border border-white/10 bg-slate-950/45 p-4 transition duration-200 hover:border-brand-400/25"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h4 className="text-base font-semibold text-white">{lab.name}</h4>
                <p className="flex items-center gap-1.5 text-sm text-ink-300">
                  <IconLocation width={14} height={14} aria-hidden />
                  <span className="truncate">{lab.address}</span>
                </p>
              </div>
              {lab.distanceAvailable && lab.distanceKm > 0 ? (
                <span className="shrink-0 rounded-full border border-brand-400/25 bg-brand-400/10 px-2.5 py-1 text-[0.66rem] font-semibold text-brand-100">
                  {lab.distanceKm.toFixed(1)} km
                </span>
              ) : (
                <span className="shrink-0 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.66rem] font-semibold text-ink-300">
                  Distance unavailable
                </span>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-300">
              <span>{lab.hoursLabel ? `Hours: ${lab.hoursLabel}` : 'Opening hours not published'}</span>
              {lab.homeCollectionAvailable ? (
                <span className="rounded-full border border-accent-400/25 bg-accent-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-accent-100">
                  Home collection
                </span>
              ) : null}
            </div>

            {lab.testsOffered.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lab.testsOffered.slice(0, 4).map((test) => (
                  <span key={test} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.66rem] font-medium text-ink-300">
                    {test}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-3 text-[0.76rem] text-ink-400">Test menu and home collection are not published for this facility.</p>
            )}

            {lab.sourceLabel ? (
              <p className="mt-2 text-[0.7rem] text-ink-500">
                Source: {lab.sourceUrl ? <a href={lab.sourceUrl} target="_blank" rel="noopener noreferrer" className="underline">{lab.sourceLabel}</a> : lab.sourceLabel}
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <CardActionButton variant="secondary" onClick={() => navigate(ROUTES.labs)} ariaLabel={`View lab ${lab.name}`}>
                View lab
              </CardActionButton>
              <CardActionButton variant="primary" icon={<IconRoute width={15} height={15} />} onClick={() => handleDirections(lab)} ariaLabel={`Get directions to ${lab.name}`}>
                Get Directions
              </CardActionButton>
            </div>
          </article>
        ))}
      </div>

      <NextStepRow label="Call the laboratory to confirm test availability and whether home collection is offered." />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}
