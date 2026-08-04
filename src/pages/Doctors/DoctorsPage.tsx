import { Section } from '../../components/ui/Section';
import { Hero } from './components/Hero';
import { FilterBar } from './components/FilterBar';
import { ResultsToolbar } from './components/ResultsToolbar';
import { DoctorResultsSection } from './components/DoctorResultsSection';

export function DoctorsPage() {
  return (
    <main className="space-y-8">
      <Hero />
      <FilterBar />
      <ResultsToolbar />
      <DoctorResultsSection />
      <Section title="Doctors" description="Architecture placeholder for future doctor experience flows." eyebrow="Doctors">
        <div className="rounded-[1.4rem] border border-white/10 bg-white/5 p-6 text-sm text-ink-400">
          Additional doctors architecture can be added here without affecting the existing experience.
        </div>
      </Section>
    </main>
  );
}
