import { Section } from '../../../components/ui/Section';

export function LoadingSkeleton() {
  return (
    <Section title="Loading" description="This area will hold the loading experience." eyebrow="State">
      <div className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6">
        <div className="space-y-3">
          <div className="h-3 w-32 rounded-full bg-white/10" />
          <div className="h-3 w-full rounded-full bg-white/10" />
          <div className="h-3 w-5/6 rounded-full bg-white/10" />
          <div className="h-3 w-2/3 rounded-full bg-white/10" />
        </div>
      </div>
    </Section>
  );
}
