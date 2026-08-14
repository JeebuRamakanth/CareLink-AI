import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconEmergency, IconLocation, IconPhone } from '../../../components/agent/AgentIcons';
import { emergencyHospitals } from './homeData';
import { DemoBadge, SectionBox, SectionFootnote, StarRow } from './homePrimitives';

export function Emergency() {
  return (
    <Section title="Emergency readiness" description="If this is an emergency, call your local emergency number now. Then find the nearest open facility." eyebrow="Emergency">
      <SectionBox className="min-h-[220px]">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="flex flex-col gap-4 rounded-[1.25rem] border border-rose-400/20 bg-rose-500/10 p-5">
            <span className="flex size-11 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-200">
              <IconEmergency width={22} height={22} aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-white">Call first. Navigate second.</h3>
              <p className="text-[0.84rem] leading-6 text-ink-300">
                In a life-threatening situation, contact emergency services immediately. The facilities below are open and emergency-capable.
              </p>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <a
                href="tel:911"
                className="inline-flex items-center gap-2 rounded-[var(--radius-xl)] bg-rose-500/90 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_50px_-24px_rgba(244,63,94,0.7)] transition hover:-translate-y-0.5 hover:bg-rose-500"
              >
                <IconPhone width={16} height={16} aria-hidden /> Call emergency
              </a>
              <Link
                to={ROUTES.hospitals}
                className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white"
              >
                View all hospitals <IconArrowRight width={14} height={14} aria-hidden />
              </Link>
            </div>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {emergencyHospitals.map((h) => (
              <li key={h.id} className="flex flex-col gap-2.5 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <h4 className="text-sm font-semibold text-white">{h.name}</h4>
                  <StarRow rating={h.rating} />
                </div>
                <p className="flex items-center gap-1.5 text-[0.78rem] text-ink-300">
                  <IconLocation width={13} height={13} aria-hidden className="text-ink-400" />
                  {h.address}, {h.city}
                </p>
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      Open
                    </span>
                    <DemoBadge />
                  </span>
                  <span className="text-[0.74rem] text-ink-400">{h.distanceKm} km · {h.estimatedTravelTimeMin} min</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <SectionFootnote>
          Distances and travel times are demo estimates from the mock discovery network, not live values. Always confirm with the facility.
        </SectionFootnote>
      </SectionBox>
    </Section>
  );
}
