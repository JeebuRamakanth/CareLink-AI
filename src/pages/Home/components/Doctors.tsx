import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconClock } from '../../../components/agent/AgentIcons';
import { featuredDoctors } from './homeData';
import { SectionBox, StarRow } from './homePrimitives';

const availabilityTone: Record<string, string> = {
  available: 'border-emerald-400/25 bg-emerald-500/12 text-emerald-200',
  busy: 'border-amber-400/25 bg-amber-500/12 text-amber-200',
  limited: 'border-amber-400/25 bg-amber-500/12 text-amber-200',
};

export function Doctors() {
  return (
    <Section title="Doctors you can book with" description="Trusted clinicians across the network, with next available slots." eyebrow="Doctors">
      <SectionBox className="min-h-[220px]">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredDoctors.map((d) => (
            <li key={d.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-5 transition hover:border-brand-400/30">
              <div className="flex items-start justify-between gap-2">
                <Link to={`/doctors/${d.detailSlug}`} className="text-base font-semibold text-white transition hover:text-brand-200">
                  {d.fullName}
                </Link>
                <StarRow rating={d.rating} />
              </div>
              <p className="text-[0.8rem] text-ink-300">
                {d.specialty} · {d.hospitalName}
              </p>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full border px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] ${availabilityTone[d.availabilityStatus] ?? 'border-white/10 bg-white/5 text-ink-200'}`}>
                  {d.availabilityStatus}
                </span>
                <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[0.68rem] font-medium text-ink-200">
                  {d.yearsOfExperience} yrs exp
                </span>
              </div>
              <p className="mt-auto flex items-center gap-1.5 text-[0.78rem] text-ink-300">
                <IconClock width={13} height={13} aria-hidden className="text-ink-400" />
                Next: {d.nextAvailableSlot}
              </p>
              <Link to={`/doctors/${d.detailSlug}`} className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white">
                View profile <IconArrowRight width={14} height={14} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <Link to={ROUTES.doctors}>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-ink-50 transition hover:border-brand-400/40 hover:bg-white/15">
              Browse all doctors <IconArrowRight width={14} height={14} aria-hidden />
            </span>
          </Link>
        </div>
      </SectionBox>
    </Section>
  );
}
