/**
 * Step 5 — Hospital recommendation card.
 * "View Hospital" deep-links to the EXISTING hospital profile route.
 * "Get Directions" opens an abstract route action (maps provider pluggable later).
 * "Book Appointment" links to the existing appointments system.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconHospital, IconLocation, IconStar, IconRoute, IconCalendar } from '../AgentIcons';
import type { HospitalRecommendation } from '../../../services/agent/agentTypes';
import { ROUTES } from '../../../routes/routeConstants';
import { directionsUrl } from '../../../services/maps/mapsService';

interface Props {
  data: HospitalRecommendation[];
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
  onGetDirections?: (hospital: HospitalRecommendation) => void;
}

export function HospitalResponseCard({ data, title, explanation, suggestedReplies, onPickReply, onGetDirections }: Props) {
  const navigate = useNavigate();

  const handleDirections = (hospital: HospitalRecommendation) => {
    if (onGetDirections) {
      onGetDirections(hospital);
      return;
    }
    // Open the maps provider directions deep-link (origin omitted — no patient
    // coordinates are sent unless a provider action supplies them). Never alerts.
    const url = directionsUrl({
      destination: `${hospital.name}, ${hospital.address}, ${hospital.city}`,
      mode: 'driving',
    });
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <ResponseCardShell
      accent="brand"
      title={title}
      explanation={explanation}
      icon={<IconHospital width={20} height={20} />}
      meta={{ confidence: 'high', urgency: 'routine', disclaimer: 'Availability is indicative — confirm directly with the hospital.' }}
    >
      <div className="space-y-3">
        {data.map((hospital) => (
          <article
            key={hospital.id}
            className="rounded-[1.1rem] border border-white/10 bg-slate-950/45 p-4 transition duration-200 hover:border-brand-400/25"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h4 className="text-base font-semibold text-white">{hospital.name}</h4>
                <p className="flex items-center gap-1.5 text-sm text-ink-300">
                  <IconLocation width={14} height={14} aria-hidden />
                  <span className="truncate">{hospital.address}, {hospital.city}</span>
                </p>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.22em] ${hospital.isOpen ? 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200' : 'border-white/10 bg-white/5 text-ink-300'}`}>
                {hospital.isOpen ? 'Open now' : 'Closed'}
              </span>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-ink-300">
              <span className="inline-flex items-center gap-1">
                <IconStar width={14} height={14} className="text-amber-300" aria-hidden />
                <span className="font-semibold text-white">{hospital.rating.toFixed(1)}</span>
                <span className="text-ink-400">({hospital.reviewCount})</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <IconRoute width={14} height={14} aria-hidden />
                <span>{hospital.distanceKm.toFixed(1)} km · ~{hospital.estimatedTravelTimeMin} min</span>
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {hospital.specialties.slice(0, 3).map((s) => (
                <span key={s} className="rounded-full border border-brand-400/20 bg-brand-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-brand-100">
                  {s}
                </span>
              ))}
              {hospital.hasEmergency ? (
                <span className="rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-rose-200">
                  Emergency
                </span>
              ) : null}
              {hospital.is24x7 ? (
                <span className="rounded-full border border-accent-400/25 bg-accent-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-accent-100">
                  24×7
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <CardActionButton variant="secondary" to={`${ROUTES.hospitals}/${hospital.detailSlug}`} ariaLabel={`View hospital profile for ${hospital.name}`}>
                View Hospital
              </CardActionButton>
              <CardActionButton variant="secondary" icon={<IconRoute width={15} height={15} />} onClick={() => handleDirections(hospital)} ariaLabel={`Get directions to ${hospital.name}`}>
                Directions
              </CardActionButton>
              <CardActionButton variant="primary" icon={<IconCalendar width={15} height={15} />} onClick={() => navigate(ROUTES.appointments)} ariaLabel={`Book an appointment at ${hospital.name}`}>
                Book
              </CardActionButton>
            </div>
          </article>
        ))}
      </div>

      <NextStepRow
        label="Compare profiles and pick the closest facility that matches your needs."
        action={<CardActionButton variant="ghost" to={ROUTES.hospitals}>Browse all hospitals</CardActionButton>}
      />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}
