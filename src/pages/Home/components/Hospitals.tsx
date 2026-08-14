import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconLocation } from '../../../components/agent/AgentIcons';
import { nearestHospitals, pharmacyCount, labCount } from './homeData';
import { DemoBadge, SectionBox, SectionFootnote, StarRow } from './homePrimitives';

export function Hospitals() {
  return (
    <Section title="Hospitals near you" description="Top-rated facilities from the CareLink.AI network, ranked by distance." eyebrow="Hospitals">
      <SectionBox className="min-h-[220px]">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {nearestHospitals.map((h) => (
            <li key={h.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-5 transition hover:border-brand-400/30">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/hospitals/${h.detailSlug}`} className="text-base font-semibold text-white transition hover:text-brand-200">
                  {h.name}
                </Link>
                <StarRow rating={h.rating} />
              </div>
              <p className="flex items-center gap-1.5 text-[0.8rem] text-ink-300">
                <IconLocation width={14} height={14} aria-hidden className="text-ink-400" />
                {h.address}, {h.city}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                {h.specialties.slice(0, 3).map((s) => (
                  <span key={s} className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.68rem] font-medium text-ink-200">
                    {s}
                  </span>
                ))}
              </div>
              <div className="mt-auto flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <span className="rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                    Open
                  </span>
                  <DemoBadge />
                </span>
                <span className="text-[0.76rem] text-ink-400">{h.distanceKm} km · {h.estimatedTravelTimeMin} min</span>
              </div>
              <Link to={`/hospitals/${h.detailSlug}`} className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white">
                View hospital <IconArrowRight width={14} height={14} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link to={ROUTES.hospitals}>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-ink-50 transition hover:border-brand-400/40 hover:bg-white/15">
              Explore all hospitals <IconArrowRight width={14} height={14} aria-hidden />
            </span>
          </Link>
          <span className="text-[0.76rem] text-ink-400">
            Plus {pharmacyCount} pharmacies and {labCount} labs in the discovery network.
          </span>
        </div>
        <SectionFootnote>
          Distances and travel times are demo estimates from the mock discovery network, not live values.
        </SectionFootnote>
      </SectionBox>
    </Section>
  );
}
