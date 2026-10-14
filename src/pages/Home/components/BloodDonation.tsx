import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconHeart } from '../../../components/agent/AgentIcons';
import { SectionBox } from './homePrimitives';

export function BloodDonation() {
  return (
    <Section title="Blood donation information" description="Confirm blood bank services and current inventory directly with a facility." eyebrow="Blood network">
      <SectionBox className="min-h-[220px]">
        <div className="max-w-2xl">
          <div className="flex flex-col gap-4 rounded-[1.25rem] border border-rose-400/20 bg-rose-500/10 p-5">
            <span className="flex size-11 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-200">
              <IconHeart width={22} height={22} aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-white">No independently verified blood bank listings yet</h3>
              <p className="text-[0.84rem] leading-6 text-ink-300">
                Facility-specific blood bank information is not currently available in this directory. Contact healthcare services directly to confirm where to donate.
              </p>
            </div>
            <Link
              to={ROUTES.hospitals}
              className="mt-auto inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white"
            >
              Find a hospital <IconArrowRight width={14} height={14} aria-hidden />
            </Link>
          </div>
        </div>
      </SectionBox>
    </Section>
  );
}
