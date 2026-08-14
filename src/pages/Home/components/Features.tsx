import { Link } from 'react-router-dom';
import { Section } from '../../../components/ui/Section';
import { IconArrowRight } from '../../../components/agent/AgentIcons';
import { platformFeatures } from './homeData';
import { HomeIconGlyph, SectionBox, type HomeIcon } from './homePrimitives';

export function Features() {
  return (
    <Section title="Everything your care needs in one place" description="Core CareLink.AI capabilities — ask, store, book, track and navigate." eyebrow="Platform">
      <SectionBox className="min-h-[220px]">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {platformFeatures.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col gap-3 rounded-[1.25rem] border border-white/10 bg-slate-950/40 p-5 transition hover:border-brand-400/30"
            >
              <span className="flex size-10 items-center justify-center rounded-full border border-brand-400/25 bg-brand-500/12 text-brand-200">
                <HomeIconGlyph name={feature.icon as HomeIcon} />
              </span>
              <div className="space-y-1.5">
                <h3 className="text-base font-semibold text-white">{feature.title}</h3>
                <p className="text-[0.84rem] leading-6 text-ink-300">{feature.description}</p>
              </div>
              <Link to={feature.href} className="mt-auto inline-flex items-center gap-1.5 text-[0.82rem] font-semibold text-brand-200 transition hover:text-white">
                {feature.cta} <IconArrowRight width={14} height={14} aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </SectionBox>
    </Section>
  );
}
