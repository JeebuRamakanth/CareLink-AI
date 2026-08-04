import { Section } from '../../../components/ui/Section';
import type { DoctorFilterState } from '../hooks/useDoctors';

type FilterBarProps = {
  searchValue: string;
  filters: DoctorFilterState;
  onSearchChange: (value: string) => void;
  onFilterChange: (changes: Partial<DoctorFilterState>) => void;
  onReset: () => void;
};

const specialtyOptions = ['Cardiology', 'Neurology', 'Pediatrics', 'Orthopedics', 'OB-GYN', 'Emergency Medicine'];
const experienceOptions = ['Any', '5+', '10+', '15+'];
const ratingOptions = ['Any', '3.5+', '4.0+', '4.5+'];
const availabilityOptions = ['Any', 'available', 'busy', 'limited', 'offline'];

export function FilterBar({ searchValue, filters, onSearchChange, onFilterChange, onReset }: FilterBarProps) {
  return (
    <Section>
      <div className="rounded-[1.4rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.2)] sm:p-5">
        <div className="grid gap-3 lg:grid-cols-[1.2fr_0.9fr_0.8fr_0.8fr]">
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3">
            <label className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-ink-400">Search doctor</label>
            <input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by name or specialty"
              className="mt-2 w-full rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
            />
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3">
            <label className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-ink-400">Specialty</label>
            <select
              value={filters.specialty}
              onChange={(event) => onFilterChange({ specialty: event.target.value })}
              className="mt-2 w-full rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
            >
              <option value="">All specialties</option>
              {specialtyOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3">
            <label className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-ink-400">Experience</label>
            <select
              value={filters.experience}
              onChange={(event) => onFilterChange({ experience: event.target.value })}
              className="mt-2 w-full rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
            >
              {experienceOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          <div className="rounded-[1rem] border border-white/10 bg-slate-950/60 p-3">
            <label className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-ink-400">Availability</label>
            <div className="mt-2 flex flex-wrap gap-2">
              <select
                value={filters.rating}
                onChange={(event) => onFilterChange({ rating: event.target.value })}
                className="w-[calc(50%-0.25rem)] rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {ratingOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              <select
                value={filters.availability}
                onChange={(event) => onFilterChange({ availability: event.target.value })}
                className="w-[calc(50%-0.25rem)] rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {availabilityOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={onReset}
              className="mt-2 text-sm font-medium text-brand-100 transition hover:text-white"
            >
              Clear filters
            </button>
          </div>
        </div>
      </div>
    </Section>
  );
}
