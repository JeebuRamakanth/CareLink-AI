import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { Button } from '../../../components/ui/Button';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight } from '../../../components/agent/AgentIcons';
import { useHomeStats } from '../hooks/useHomeStats';
import { SectionBox } from './homePrimitives';

export function Stats() {
  const { stats, source } = useHomeStats();
  return (
    <Section title="Trusted by patients and partners" description="A snapshot of the CareLink.AI care network today." eyebrow="Overview">
      <SectionBox className="min-h-[180px]">
        {source === 'demo' ? (
          <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-amber-400/25 bg-amber-500/10 px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.16em] text-amber-200">
            Demo figures — connect a backend for live registry counts
          </p>
        ) : null}
        <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4 text-center">
              <dd className="text-3xl font-semibold tracking-tight text-white">{stat.value}</dd>
              <dt className="mt-1.5 text-sm font-medium text-ink-200">{stat.label}</dt>
              <p className="mt-0.5 text-[0.72rem] text-ink-400">{stat.hint}</p>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Link to={ROUTES.hospitals}>
            <Button size="sm" variant="secondary">
              Browse hospitals <IconArrowRight width={14} height={14} aria-hidden />
            </Button>
          </Link>
          <Link to={ROUTES.reviews}>
            <Button size="sm" variant="ghost">
              Read patient reviews <IconArrowRight width={14} height={14} aria-hidden />
            </Button>
          </Link>
        </div>
      </SectionBox>
    </Section>
  );
}
