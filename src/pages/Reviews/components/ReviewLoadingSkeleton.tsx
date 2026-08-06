import { Section } from '../../../components/ui/Section';

export function ReviewLoadingSkeleton() {
  return (
    <Section title="Loading reviews" description="Preparing the latest patient feedback." eyebrow="State">
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[1.5rem] border border-white/10 bg-white/5 p-6 shadow-[0_10px_40px_rgba(0,0,0,0.18)] animate-pulse">
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-3xl bg-white/10" />
              <div className="space-y-2">
                <div className="h-4 w-32 rounded-full bg-white/10" />
                <div className="h-3 w-24 rounded-full bg-white/10" />
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-4 w-24 rounded-full bg-white/10" />
              <div className="h-4 w-full rounded-full bg-white/10" />
              <div className="h-4 w-5/6 rounded-full bg-white/10" />
            </div>
          </div>
        ))}
      </div>
    </Section>
  );
}
