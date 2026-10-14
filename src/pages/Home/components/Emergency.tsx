import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconEmergency, IconPhone } from '../../../components/agent/AgentIcons';
import { SectionBox } from './homePrimitives';

export function Emergency() {
  return (
    <Section title="Emergency information" description="In an emergency, contact local emergency services directly. Directory listings do not confirm real-time availability." eyebrow="Emergency">
      <SectionBox className="min-h-[220px]">
        <div className="max-w-2xl">
          <div className="flex flex-col gap-4 rounded-[1.25rem] border border-rose-400/20 bg-rose-500/10 p-5">
            <span className="flex size-11 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-200">
              <IconEmergency width={22} height={22} aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-white">Call first. Navigate second.</h3>
              <p className="text-[0.84rem] leading-6 text-ink-300">
                For India’s national emergency response number, call 112. Do not rely on third-party directory data for emergency availability.
              </p>
            </div>
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <a
                href="tel:112"
                className="inline-flex items-center gap-2 rounded-[var(--radius-xl)] bg-rose-500/90 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_20px_50px_-24px_rgba(244,63,94,0.7)] transition hover:-translate-y-0.5 hover:bg-rose-500"
              >
                <IconPhone width={16} height={16} aria-hidden /> Call emergency
              </a>
              <Link
                to={ROUTES.hospitals}
                className="inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white"
              >
                Search the local directory <IconArrowRight width={14} height={14} aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </SectionBox>
    </Section>
  );
}
