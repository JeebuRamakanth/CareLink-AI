import { Section } from '../../../components/ui/Section';
import { howItWorksSteps } from './homeData';
import { HomeIconGlyph, SectionBox, type HomeIcon } from './homePrimitives';

export function HowItWorks() {
  return (
    <Section title="How CareLink.AI works" description="From understanding a concern to following up — one connected journey." eyebrow="Process">
      <SectionBox className="min-h-[220px]">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {howItWorksSteps.map((step) => (
            <li key={step.step} className="relative flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-5">
              <div className="flex items-center justify-between">
                <span className="flex size-10 items-center justify-center rounded-full border border-accent-400/25 bg-accent-500/12 text-accent-200">
                  <HomeIconGlyph name={step.icon as HomeIcon} />
                </span>
                <span className="text-[0.72rem] font-semibold uppercase tracking-[0.24em] text-ink-400">{step.step}</span>
              </div>
              <h3 className="text-base font-semibold text-white">{step.title}</h3>
              <p className="text-[0.84rem] leading-6 text-ink-300">{step.description}</p>
            </li>
          ))}
        </ol>
      </SectionBox>
    </Section>
  );
}
