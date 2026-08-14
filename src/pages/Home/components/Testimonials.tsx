import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconStar } from '../../../components/agent/AgentIcons';
import { featuredReviews } from './homeData';
import { SectionBox } from './homePrimitives';

export function Testimonials() {
  return (
    <Section title="What patients say" description="Verified voices from the CareLink.AI community." eyebrow="Voices">
      <SectionBox className="min-h-[220px]">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {featuredReviews.map((r) => (
            <li key={r.id} className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-full border border-brand-400/25 bg-brand-500/12 text-sm font-semibold text-brand-100">
                  {r.patient_initials}
                </span>
                <span className="inline-flex items-center gap-1 text-ink-300">
                  <IconStar width={14} height={14} aria-hidden className="text-amber-300" />
                  <span className="font-semibold text-white">{r.rating.toFixed(1)}</span>
                </span>
              </div>
              <h3 className="text-sm font-semibold text-white">{r.title}</h3>
              <p className="text-[0.82rem] leading-6 text-ink-300">{r.comment}</p>
              <div className="mt-auto flex items-center justify-between border-t border-white/5 pt-3">
                <span className="text-[0.76rem] text-ink-300">
                  {r.patient_name}
                  {r.patient_verified && (
                    <span className="ml-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/12 px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.16em] text-emerald-200">
                      Verified
                    </span>
                  )}
                </span>
                <span className="text-[0.72rem] text-ink-400">
                  {r.subject_type} · {r.subject_name}
                </span>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-5">
          <Link to={ROUTES.reviews}>
            <span className="inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-ink-50 transition hover:border-brand-400/40 hover:bg-white/15">
              Read all reviews <IconArrowRight width={14} height={14} aria-hidden />
            </span>
          </Link>
        </div>
      </SectionBox>
    </Section>
  );
}
