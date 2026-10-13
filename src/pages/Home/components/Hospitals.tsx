import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight } from '../../../components/agent/AgentIcons';
import { SectionBox } from './homePrimitives';

export function Hospitals() {
  return (
    <Section title="Machilipatnam healthcare directory" description="Search hospitals and other healthcare facilities in a clearly defined local area." eyebrow="Hospitals">
      <SectionBox className="min-h-[180px]">
        <p className="text-sm leading-6 text-ink-300">
          Directory results come from the configured provider registry and live discovery sources. Listings are not represented as exhaustive or independently verified by default.
        </p>
        <Link to={ROUTES.hospitals} className="mt-5 inline-flex items-center gap-1.5 rounded-[var(--radius-xl)] border border-white/10 bg-white/10 px-4 py-2.5 text-sm font-semibold text-ink-50 transition hover:border-brand-400/40 hover:bg-white/15">
          Open local directory <IconArrowRight width={14} height={14} aria-hidden />
        </Link>
      </SectionBox>
    </Section>
  );
}
