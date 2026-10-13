/**
 * useHomeStats — real-first platform statistics for the Home page.
 *
 * Home statistics are sourced from the provider registry when available.
 * Missing figures remain unavailable instead of using demo directory values.
 */

import { useEffect, useState } from 'react';
import { fetchRealHospitals, fetchRealDoctors } from '../../../services/health-data';
import { isSupabaseConfigured } from '../../../services/supabase/client';
import type { PlatformStat } from '../components/homeData';

interface HomeStats {
  stats: PlatformStat[];
  source: 'real' | 'unavailable';
}

const unavailableStats = (): PlatformStat[] => [
  { label: 'Hospitals', value: '—', hint: 'Registry unavailable' },
  { label: 'Doctors', value: '—', hint: 'Registry unavailable' },
  { label: 'Specialties', value: '—', hint: 'Registry unavailable' },
  { label: 'Avg. rating', value: '—', hint: 'No verified rating data' },
];

export function useHomeStats(): HomeStats {
  const [stats, setStats] = useState<PlatformStat[]>(unavailableStats());
  const [source, setSource] = useState<'real' | 'unavailable'>('unavailable');

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const [hospitals, doctors] = await Promise.all([fetchRealHospitals(), fetchRealDoctors()]);
      if (cancelled) return;
      if (hospitals.length > 0 || doctors.length > 0) {
        const specialtySet = new Set<string>();
        const machilipatnamHospitals = hospitals.filter((hospital) =>
          `${hospital.city} ${hospital.address}`.toLowerCase().includes('machilipatnam'),
        );
        machilipatnamHospitals.forEach((h) => h.specialties.forEach((s) => specialtySet.add(s)));
        doctors.forEach((d) => specialtySet.add(d.specialty));
        const ratedHospitals = machilipatnamHospitals.filter((hospital) => hospital.rating > 0);
        const avgRating = ratedHospitals.length
          ? (ratedHospitals.reduce((sum, h) => sum + h.rating, 0) / ratedHospitals.length).toFixed(1)
          : '—';
        setStats([
          { label: 'Hospitals', value: String(machilipatnamHospitals.length), hint: 'Machilipatnam registry records' },
          { label: 'Doctors', value: String(doctors.length), hint: 'Across specialties' },
          { label: 'Specialties', value: String(specialtySet.size), hint: 'Covered today' },
          { label: 'Avg. rating', value: avgRating, hint: ratedHospitals.length ? 'From the provider registry' : 'No verified rating data' },
        ]);
        setSource('real');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { stats, source };
}