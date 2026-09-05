/**
 * useHomeStats — real-first platform statistics for the Home page.
 *
 * When Supabase is configured, counts and the average rating are computed from
 * the actual provider registry (hospitals + doctors). Otherwise the static
 * demo-derived values are used and flagged as demo content — the Home page
 * never invents numbers.
 */

import { useEffect, useState } from 'react';
import { fetchRealHospitals, fetchRealDoctors } from '../../../services/health-data';
import { isSupabaseConfigured } from '../../../services/supabase/client';
import { hospitalsData } from '../../../data/hospitals';
import { doctorsData } from '../../../data/doctors';
import type { PlatformStat } from '../components/homeData';

interface HomeStats {
  stats: PlatformStat[];
  source: 'real' | 'demo';
}

const demoStats = (): PlatformStat[] => {
  const avgRating = (hospitalsData.reduce((sum, h) => sum + h.rating, 0) / (hospitalsData.length || 1)).toFixed(1);
  const specialtySet = new Set<string>();
  hospitalsData.forEach((h) => h.specialties.forEach((s) => specialtySet.add(s)));
  doctorsData.forEach((d) => specialtySet.add(d.specialty));
  return [
    { label: 'Hospitals', value: String(hospitalsData.length), hint: 'Demo care partners' },
    { label: 'Doctors', value: String(doctorsData.length), hint: 'Across specialties' },
    { label: 'Specialties', value: String(specialtySet.size), hint: 'Covered today' },
    { label: 'Avg. rating', value: avgRating, hint: 'Demo patient voices' },
  ];
};

export function useHomeStats(): HomeStats {
  const [stats, setStats] = useState<PlatformStat[]>(demoStats());
  const [source, setSource] = useState<'real' | 'demo'>('demo');

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    (async () => {
      const [hospitals, doctors] = await Promise.all([fetchRealHospitals(), fetchRealDoctors()]);
      if (cancelled) return;
      if (hospitals.length > 0 || doctors.length > 0) {
        const specialtySet = new Set<string>();
        hospitals.forEach((h) => h.specialties.forEach((s) => specialtySet.add(s)));
        doctors.forEach((d) => specialtySet.add(d.specialty));
        const avgRating = hospitals.length
          ? (hospitals.reduce((sum, h) => sum + h.rating, 0) / hospitals.length).toFixed(1)
          : '—';
        setStats([
          { label: 'Hospitals', value: String(hospitals.length), hint: 'Verified care partners' },
          { label: 'Doctors', value: String(doctors.length), hint: 'Across specialties' },
          { label: 'Specialties', value: String(specialtySet.size), hint: 'Covered today' },
          { label: 'Avg. rating', value: avgRating, hint: 'From the provider registry' },
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