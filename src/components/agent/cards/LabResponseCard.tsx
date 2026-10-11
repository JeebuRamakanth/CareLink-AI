/**
 * Step 7 — Diagnostic / lab recommendation card.
 * Mock-only: test availability is indicative, confirm directly with the lab.
 * "View lab" and "Get Directions" deep-link to real app routes / maps.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconLab, IconLocation, IconRoute } from '../AgentIcons';
import { ROUTES } from '../../../routes/routeConstants';
import { directionsUrl } from '../../../services/maps/mapsService';
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
    // Real maps deep-link — never a mock alert.
    window.open(directionsUrl({ destination: `${lab.name}, ${lab.address}`, mode: 'driving' }), '_blank', 'noopener,noreferrer');
  };

  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconLab width={20} height={20} />}
      meta={{ confidence: 'medium', urgency: 'routine', disclaimer: 'Test availability is indicative — confirm directly with the lab.' }}
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
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] ${lab.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300'}`}>
                {lab.isOpen ? 'Open now' : 'Closed'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-300">
              {lab.distanceKm > 0 ? (
                <span className="inline-flex items-center gap-1">
                  <IconRoute width={14} height={14} aria-hidden />
                  <span>{lab.distanceKm.toFixed(1)} km · ~{lab.estimatedTravelTimeMin} min</span>
                </span>
              ) : (
                <span className="text-accent-200">Home collection available</span>
              )}
              {lab.homeCollectionAvailable ? (
                <span className="rounded-full border border-accent-400/25 bg-accent-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-accent-100">
                  Home collection
                </span>
              ) : null}
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {lab.testsOffered.slice(0, 4).map((test) => (
                <span key={test} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.66rem] font-medium text-ink-300">
                  {test}
                </span>
              ))}
            </div>

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

      <NextStepRow label="Book a test, or choose a lab with home collection if you prefer not to travel." />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}
