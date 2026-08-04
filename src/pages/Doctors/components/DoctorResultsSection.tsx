import { Section } from '../../../components/ui/Section';
import { DoctorCard } from './DoctorCard';
import { EmptyState } from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Pagination } from './Pagination';

type DoctorResultsSectionProps = {
  state?: 'loading' | 'empty' | 'success';
  title?: string;
  description?: string;
  eyebrow?: string;
};

export function DoctorResultsSection({
  state = 'success',
  title = 'Results',
  description = 'Doctors results infrastructure placeholder.',
  eyebrow = 'Doctors',
}: DoctorResultsSectionProps) {
  if (state === 'loading') {
    return <LoadingSkeleton />;
  }

  if (state === 'empty') {
    return <EmptyState />;
  }

  return (
    <Section title={title} description={description} eyebrow={eyebrow}>
      <div className="space-y-5">
        <div className="rounded-[1.3rem] border border-white/10 bg-white/5 p-4 text-sm text-ink-400">
          Results container placeholder for doctor listings and future profile previews.
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <DoctorCard />
          <DoctorCard />
        </div>
        <Pagination />
      </div>
    </Section>
  );
}
