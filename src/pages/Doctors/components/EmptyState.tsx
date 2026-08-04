import { Section } from '../../../components/ui/Section';

type EmptyStateProps = {
  title?: string;
  description?: string;
};

export function EmptyState({ title = 'No doctors found', description = 'Try broadening your filters or adjusting your search phrase to discover more options.' }: EmptyStateProps) {
  return (
    <Section title={title} description={description} eyebrow="State">
      <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-6 text-sm text-ink-400">
        No doctor profiles match the selected criteria right now.
      </div>
    </Section>
  );
}
