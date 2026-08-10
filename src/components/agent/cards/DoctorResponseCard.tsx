/**
 * Step 6 — Doctor recommendation card.
 * "View Profile" deep-links to the EXISTING doctor profile route.
 * "Book Appointment" links to the existing appointment system.
 */

import { useNavigate } from 'react-router-dom';
import { ResponseCardShell, CardActionButton, NextStepRow, SuggestedReplies } from '../ResponseCardShell';
import { IconDoctor, IconStar, IconClock, IconRoute, IconCalendar } from '../AgentIcons';
import type { DoctorRecommendation } from '../../../services/agent/agentTypes';
import { ROUTES } from '../../../routes/routeConstants';

interface Props {
  data: DoctorRecommendation[];
  title: string;
  explanation?: string;
  suggestedReplies?: string[];
  onPickReply?: (reply: string) => void;
  onGetDirections?: (doctor: DoctorRecommendation) => void;
}

const availabilityTone: Record<DoctorRecommendation['availabilityStatus'], string> = {
  available: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200',
  busy: 'border-brand-400/25 bg-brand-500/12 text-brand-100',
  limited: 'border-amber-400/25 bg-amber-500/12 text-amber-200',
  offline: 'border-white/10 bg-white/5 text-ink-300',
};

const availabilityLabel: Record<DoctorRecommendation['availabilityStatus'], string> = {
  available: 'Available',
  busy: 'Busy',
  limited: 'Limited',
  offline: 'Offline',
};

export function DoctorResponseCard({ data, title, explanation, suggestedReplies, onPickReply, onGetDirections }: Props) {
  const navigate = useNavigate();

  const handleDirections = (doctor: DoctorRecommendation) => {
    if (onGetDirections) {
      onGetDirections(doctor);
    } else if (doctor.route) {
      window.alert(`Directions to ${doctor.hospitalName} (mock): ${doctor.route.distanceKm} km · ~${doctor.route.estimatedTravelTimeMin} min`);
    }
  };

  return (
    <ResponseCardShell
      accent="accent"
      title={title}
      explanation={explanation}
      icon={<IconDoctor width={20} height={20} />}
      meta={{ confidence: 'high', urgency: 'routine', disclaimer: 'Slot availability is indicative — confirm during booking.' }}
    >
      <div className="space-y-3">
        {data.map((doctor) => (
          <article
            key={doctor.id}
            className="rounded-[1.1rem] border border-white/10 bg-slate-950/45 p-4 transition duration-200 hover:border-accent-400/25"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-full border border-accent-400/25 bg-gradient-to-br from-accent-500/25 to-brand-500/15 text-sm font-semibold text-white">
                  {doctor.fullName.replace('Dr. ', '').slice(0, 2)}
                </div>
                <div className="min-w-0 space-y-1">
                  <h4 className="text-base font-semibold text-white">{doctor.fullName}</h4>
                  <p className="text-sm text-ink-300">{doctor.specialty}</p>
                  <button
                    type="button"
                    onClick={() => doctor.hospitalDetailSlug && navigate(`${ROUTES.hospitals}/${doctor.hospitalDetailSlug}`)}
                    className="text-[0.8rem] font-medium text-brand-200 underline-offset-2 hover:underline"
                  >
                    {doctor.hospitalName}
                  </button>
                </div>
              </div>
              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] ${availabilityTone[doctor.availabilityStatus]}`}>
                {availabilityLabel[doctor.availabilityStatus]}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-ink-300 sm:grid-cols-3">
              <span className="inline-flex items-center gap-1">
                <IconStar width={14} height={14} className="text-amber-300" aria-hidden />
                <span className="font-semibold text-white">{doctor.rating.toFixed(1)}</span>
                <span className="text-ink-400">({doctor.reviewCount})</span>
              </span>
              <span>{doctor.yearsOfExperience} yrs exp</span>
              <span className="inline-flex items-center gap-1">
                <IconClock width={14} height={14} aria-hidden />
                <span className="truncate">{doctor.nextAvailableSlot}</span>
              </span>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {doctor.languages.map((lang) => (
                <span key={lang} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[0.66rem] font-medium text-ink-300">
                  {lang}
                </span>
              ))}
              {doctor.acceptsNewPatients ? (
                <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2.5 py-1 text-[0.66rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                  New patients
                </span>
              ) : null}
            </div>

            {doctor.consultationFee ? (
              <p className="mt-3 text-sm text-ink-300">
                <span className="text-ink-400">Consultation: </span>
                <span className="font-semibold text-white">{doctor.consultationFee}</span>
              </p>
            ) : null}

            <div className="mt-4 flex flex-wrap gap-2">
              <CardActionButton variant="secondary" to={`${ROUTES.doctors}/${doctor.detailSlug}`} ariaLabel={`View profile for ${doctor.fullName}`}>
                View Profile
              </CardActionButton>
              <CardActionButton variant="secondary" icon={<IconRoute width={15} height={15} />} onClick={() => handleDirections(doctor)} ariaLabel={`Get directions to ${doctor.hospitalName}`}>
                Directions
              </CardActionButton>
              <CardActionButton variant="primary" icon={<IconCalendar width={15} height={15} />} onClick={() => navigate(`${ROUTES.doctors}/${doctor.detailSlug}`)} ariaLabel={`Book an appointment with ${doctor.fullName}`}>
                Book Appointment
              </CardActionButton>
            </div>
          </article>
        ))}
      </div>

      <NextStepRow
        label="Review the specialist profiles and book the slot that suits you."
        action={<CardActionButton variant="ghost" to={ROUTES.doctors}>Browse all doctors</CardActionButton>}
      />

      <SuggestedReplies replies={suggestedReplies ?? []} onPick={(r) => onPickReply?.(r)} />
    </ResponseCardShell>
  );
}
