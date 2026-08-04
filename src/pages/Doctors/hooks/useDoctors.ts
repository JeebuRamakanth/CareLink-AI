import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDoctors } from '../../../services';
import type { Doctor } from '../../../types';

export type DoctorFilterState = {
  specialty: string;
  experience: string;
  rating: string;
  availability: string;
};

const initialFilters: DoctorFilterState = {
  specialty: '',
  experience: 'Any',
  rating: 'Any',
  availability: 'Any',
};

const normalizeText = (value: string): string => value.trim().toLowerCase();

const getExperienceThreshold = (value: string): number | null => {
  switch (value) {
    case '15+':
      return 15;
    case '10+':
      return 10;
    case '5+':
      return 5;
    default:
      return null;
  }
};

const getRatingThreshold = (value: string): number | null => {
  switch (value) {
    case '4.5+':
      return 4.5;
    case '4.0+':
      return 4.0;
    case '3.5+':
      return 3.5;
    default:
      return null;
  }
};

const getAvailabilityValue = (value: string): Doctor['availability_status'] | undefined => {
  if (value === 'Any' || !value) {
    return undefined;
  }

  return value.toLowerCase() as Doctor['availability_status'];
};

export function useDoctors() {
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [filteredDoctors, setFilteredDoctors] = useState<Doctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<DoctorFilterState>(initialFilters);

  const loadDoctors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getDoctors();
      setDoctors(data);
      setFilteredDoctors(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load doctor data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDoctors();
  }, [loadDoctors]);

  const updateFilters = useCallback((changes: Partial<DoctorFilterState>) => {
    setFilters((current) => ({ ...current, ...changes }));
  }, []);

  const updateSearchTerm = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setFilters(initialFilters);
  }, []);

  const refresh = useCallback(() => {
    void loadDoctors();
  }, [loadDoctors]);

  useEffect(() => {
    const minimumExperience = getExperienceThreshold(filters.experience);
    const minimumRating = getRatingThreshold(filters.rating);
    const availabilityFilter = getAvailabilityValue(filters.availability);

    const nextDoctors = doctors.filter((doctor) => {
      const searchText = [doctor.full_name, doctor.specialty, doctor.location, doctor.bio, doctor.languages.join(' ')].join(' ').toLowerCase();
      const matchesSearch = !searchTerm || searchText.includes(normalizeText(searchTerm));
      const matchesSpecialty = !filters.specialty || normalizeText(doctor.specialty).includes(normalizeText(filters.specialty));
      const matchesExperience = minimumExperience === null || doctor.years_of_experience >= minimumExperience;
      const matchesRating = minimumRating === null || doctor.rating >= minimumRating;
      const matchesAvailability = !availabilityFilter || doctor.availability_status === availabilityFilter;

      return matchesSearch && matchesSpecialty && matchesExperience && matchesRating && matchesAvailability;
    });

    setFilteredDoctors(nextDoctors);
    setError(null);
  }, [doctors, filters, searchTerm]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (searchTerm) {
      labels.push('Search');
    }

    if (filters.specialty) {
      labels.push('Specialty');
    }

    if (filters.experience !== 'Any') {
      labels.push('Experience');
    }

    if (filters.rating !== 'Any') {
      labels.push('Rating');
    }

    if (filters.availability !== 'Any') {
      labels.push('Availability');
    }

    return labels;
  }, [filters, searchTerm]);

  return {
    doctors,
    filteredDoctors,
    loading,
    error,
    searchTerm,
    filters,
    setSearchTerm: updateSearchTerm,
    setFilters: updateFilters,
    resetFilters,
    refresh,
    activeFilterLabels,
  };
}
