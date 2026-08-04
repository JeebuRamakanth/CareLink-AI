import { Section } from '../../../components/ui/Section';

export function EmptyState() {
  return (
    <Section title="No doctors found" description="Architecture placeholder for empty doctor results." eyebrow="State">
      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-6 text-sm text-ink-400">
        Empty state placeholder for doctor discovery.
      </div>
    </Section>
  );
}
