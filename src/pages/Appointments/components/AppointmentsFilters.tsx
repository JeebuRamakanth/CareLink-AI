import { useMemo } from 'react';
import type { AppointmentStatus } from '../data/appointmentsData';
import { Button } from '../../../components/ui/Button';

const tabs: Array<{ key: AppointmentStatus | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'confirmed', label: 'Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
  { key: 'rescheduled', label: 'Rescheduled' },
];

type AppointmentsFiltersProps = {
  activeTab: AppointmentStatus | 'all';
  onTabChange: (tab: AppointmentStatus | 'all') => void;
  searchValue: string;
  onSearchChange: (value: string) => void;
};

export function AppointmentsFilters({ activeTab, onTabChange, searchValue, onSearchChange }: AppointmentsFiltersProps) {
  const showTabs = useMemo(() => tabs, []);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-200">My Appointments</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white">Your care command center</h1>
          <p className="mt-3 max-w-2xl text-sm text-ink-300">
            Track upcoming care, review completed visits, and manage cancellations from a premium appointment dashboard.
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="sr-only">Search appointments</span>
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search by doctor, hospital, or booking ID"
              className="w-full rounded-[1.5rem] border border-white/10 bg-slate-950/80 px-4 py-3 text-sm text-white placeholder:text-ink-500 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-400/20"
            />
          </label>
          <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
            <p className="font-semibold text-white">Appointment count</p>
            <p className="mt-2 text-3xl font-semibold text-brand-100">{showTabs.length}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {showTabs.map((tab) => (
          <Button
            key={tab.key}
            type="button"
            variant={activeTab === tab.key ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => onTabChange(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
