import { Section } from '../../../components/ui/Section';

export function EmptyState() {
  return (
    <Section title="Empty State" description="This area will hold the no-results experience." eyebrow="State">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-8 text-sm text-ink-400">
        Empty state placeholder
      </div>
    </Section>
  );
}
