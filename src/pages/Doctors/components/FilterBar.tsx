import { Section } from '../../../components/ui/Section';

export function FilterBar() {
  return (
    <Section>
      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-4">
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
            Doctor search placeholder
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
            Specialty placeholder
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3 text-sm text-ink-400">
            Availability placeholder
          </div>
        </div>
      </div>
    </Section>
  );
}
