import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { ROUTES } from '../../../routes/routeConstants';
import { IconArrowRight, IconHeart, IconLocation } from '../../../components/agent/AgentIcons';
import { bloodBankHospitals } from './homeData';
import { SectionBox, SectionFootnote, StarRow } from './homePrimitives';

export function BloodDonation() {
  return (
    <Section title="Blood donation network" description="Hospitals in the network that operate a blood bank facility." eyebrow="Blood network">
      <SectionBox className="min-h-[220px]">
        <div className="grid gap-4 lg:grid-cols-[0.9fr_1.4fr]">
          <div className="flex flex-col gap-4 rounded-[1.25rem] border border-rose-400/20 bg-rose-500/10 p-5">
            <span className="flex size-11 items-center justify-center rounded-full border border-rose-400/30 bg-rose-500/15 text-rose-200">
              <IconHeart width={22} height={22} aria-hidden />
            </span>
            <div className="space-y-1.5">
              <h3 className="text-base font-semibold text-white">{bloodBankHospitals.length} blood bank facilities</h3>
              <p className="text-[0.84rem] leading-6 text-ink-300">
                Donate or locate a blood bank near you. Availability of specific blood groups is confirmed directly with the facility.
              </p>
            </div>
            <Link
              to={ROUTES.hospitals}
              className="mt-auto inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white"
            >
              Find a hospital <IconArrowRight width={14} height={14} aria-hidden />
            </Link>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {bloodBankHospitals.map((h) => (
              <li key={h.id} className="flex flex-col gap-2.5 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-4">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/hospitals/${h.slug}`} className="text-sm font-semibold text-white transition hover:text-brand-200">
                    {h.name}
                  </Link>
                  <StarRow rating={h.rating} />
                </div>
                <p className="flex items-center gap-1.5 text-[0.78rem] text-ink-300">
                  <IconLocation width={13} height={13} aria-hidden className="text-ink-400" />
                  {h.address}, {h.city}, {h.state}
                </p>
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-rose-400/25 bg-rose-500/12 px-2 py-0.5 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-rose-200">
                    Blood bank
                  </span>
                  <span className="text-[0.74rem] text-ink-400">{h.specialties.slice(0, 2).join(' · ')}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <SectionFootnote>
          Blood bank status reflects the hospital facility record, not live inventory. Contact the hospital to confirm group availability.
        </SectionFootnote>
      </SectionBox>
    </Section>
  );
}
