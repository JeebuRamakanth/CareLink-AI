import { useMemo, useState } from 'react';
import { Section } from '../../../components/ui/Section';
import { FilterChip, FilterField } from './FilterField';

type FilterState = {
  hospital: string;
  city: string;
  department: string;
  specialty: string;
  emergency: boolean;
  hours24: boolean;
  icu: boolean;
  ambulance: boolean;
  bloodBank: boolean;
  parking: boolean;
  insurance: boolean;
  rating: string;
  distance: string;
  sortBy: string;
};

const initialFilters: FilterState = {
  hospital: '',
  city: '',
  department: '',
  specialty: '',
  emergency: false,
  hours24: false,
  icu: false,
  ambulance: false,
  bloodBank: false,
  parking: false,
  insurance: false,
  rating: 'Any',
  distance: 'Any',
  sortBy: 'Recommended',
};

const departmentOptions = ['Cardiology', 'Neurology', 'Orthopedics', 'Oncology', 'Pediatrics', 'Emergency'];
const specialtyOptions = ['Heart Care', 'Stroke', 'Sports Medicine', 'Cancer Care', 'Neonatal', 'Trauma'];
const ratingOptions = ['Any', '4.5+', '4.0+', '3.5+'];
const distanceOptions = ['Any', 'Within 5 km', 'Within 10 km', 'Within 20 km'];
const sortOptions = ['Recommended', 'Highest Rated', 'Nearest', '24x7 Access'];

export function FilterBar() {
  const [filters, setFilters] = useState<FilterState>(initialFilters);

  const activeFilters = useMemo(() => {
    const entries = [
      filters.hospital && 'Hospital',
      filters.city && 'City',
      filters.department && 'Department',
      filters.specialty && 'Specialty',
      filters.emergency && 'Emergency',
      filters.hours24 && '24×7',
      filters.icu && 'ICU',
      filters.ambulance && 'Ambulance',
      filters.bloodBank && 'Blood Bank',
      filters.parking && 'Parking',
      filters.insurance && 'Insurance',
      filters.rating !== 'Any' && 'Rating',
      filters.distance !== 'Any' && 'Distance',
      filters.sortBy !== 'Recommended' && 'Sort',
    ].filter(Boolean) as string[];

    return entries;
  }, [filters]);

  const updateFilter = <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const toggleFeature = (key: keyof Pick<FilterState, 'emergency' | 'hours24' | 'icu' | 'ambulance' | 'bloodBank' | 'parking' | 'insurance'>) => {
    setFilters((current) => ({ ...current, [key]: !current[key] }));
  };

  const resetFilters = () => {
    setFilters(initialFilters);
  };

  return (
    <Section>
      <div className="rounded-[1.6rem] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))] p-4 shadow-[0_20px_80px_rgba(0,0,0,0.2)] sm:p-5 lg:sticky lg:top-24 lg:z-20">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-1">
              <p className="text-[0.72rem] font-semibold uppercase tracking-[0.28em] text-brand-200">Hospital discovery</p>
              <h3 className="text-xl font-semibold text-white">Search and refine with precision</h3>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={resetFilters}
                className="rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-medium text-ink-200 transition hover:border-white/20 hover:bg-white/10 hover:text-white"
              >
                Clear all
              </button>
              <div className="rounded-full border border-brand-400/25 bg-brand-400/10 px-3.5 py-2 text-sm font-medium text-brand-100">
                {activeFilters.length > 0 ? `${activeFilters.length} active filters` : 'No filters selected'}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <FilterChip label="Emergency" active={filters.emergency} onClick={() => toggleFeature('emergency')} icon="🚑" />
            <FilterChip label="24×7" active={filters.hours24} onClick={() => toggleFeature('hours24')} icon="⏰" />
            <FilterChip label="ICU" active={filters.icu} onClick={() => toggleFeature('icu')} icon="🧠" />
            <FilterChip label="Ambulance" active={filters.ambulance} onClick={() => toggleFeature('ambulance')} icon="🚐" />
            <FilterChip label="Blood Bank" active={filters.bloodBank} onClick={() => toggleFeature('bloodBank')} icon="🩸" />
            <FilterChip label="Parking" active={filters.parking} onClick={() => toggleFeature('parking')} icon="🅿️" />
            <FilterChip label="Insurance" active={filters.insurance} onClick={() => toggleFeature('insurance')} icon="🛡️" />
          </div>

          <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr_0.8fr_0.8fr]">
            <FilterField label="Search hospital" hint="Name">
              <input
                value={filters.hospital}
                onChange={(event) => updateFilter('hospital', event.target.value)}
                placeholder="Search by hospital name"
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              />
            </FilterField>

            <FilterField label="Search city" hint="Location">
              <input
                value={filters.city}
                onChange={(event) => updateFilter('city', event.target.value)}
                placeholder="Search by city"
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              />
            </FilterField>

            <FilterField label="Department" hint="Care area">
              <select
                value={filters.department}
                onChange={(event) => updateFilter('department', event.target.value)}
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                <option value="">Select department</option>
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Specialty" hint="Expertise">
              <select
                value={filters.specialty}
                onChange={(event) => updateFilter('specialty', event.target.value)}
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                <option value="">Select specialty</option>
                {specialtyOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </FilterField>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <FilterField label="Rating" hint="Minimum">
              <select
                value={filters.rating}
                onChange={(event) => updateFilter('rating', event.target.value)}
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {ratingOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Distance" hint="Radius">
              <select
                value={filters.distance}
                onChange={(event) => updateFilter('distance', event.target.value)}
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {distanceOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Sort by" hint="Priority">
              <select
                value={filters.sortBy}
                onChange={(event) => updateFilter('sortBy', event.target.value)}
                className="rounded-[0.8rem] border border-white/10 bg-slate-950/70 px-3 py-2.5 text-sm text-white outline-none transition focus:border-brand-400/40 focus:ring-2 focus:ring-brand-400/20"
              >
                {sortOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </FilterField>

            <FilterField label="Availability" hint="Quick picks">
              <div className="flex flex-wrap gap-2">
                <FilterChip label="Open now" active={filters.emergency} onClick={() => toggleFeature('emergency')} />
                <FilterChip label="24×7" active={filters.hours24} onClick={() => toggleFeature('hours24')} />
              </div>
            </FilterField>
          </div>

          <div className="flex flex-wrap gap-2 border-t border-white/10 pt-3">
            {activeFilters.length > 0 ? (
              activeFilters.map((label) => (
                <span key={label} className="rounded-full border border-brand-400/20 bg-brand-400/10 px-3 py-1.5 text-sm text-brand-100">
                  {label}
                </span>
              ))
            ) : (
              <span className="text-sm text-ink-400">Active filters will appear here once you refine the search.</span>
            )}
          </div>
        </div>
      </div>
    </Section>
  );
}
