import { useCallback, useEffect, useMemo, useState } from 'react';
import { getHospitals } from '../../../services';
import type { Hospital } from '../../../types';

export type HospitalFilterState = {
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

const initialFilters: HospitalFilterState = {
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

const normalizeText = (value: string): string => value.trim().toLowerCase();

const getRatingThreshold = (ratingValue: string): number | null => {
  switch (ratingValue) {
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

const getDistanceThreshold = (distanceValue: string): number | null => {
  switch (distanceValue) {
    case 'Within 5 km':
      return 5;
    case 'Within 10 km':
      return 10;
    case 'Within 20 km':
      return 20;
    default:
      return null;
  }
};

export function useHospitals() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState<HospitalFilterState>(initialFilters);

  const loadHospitals = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getHospitals();
      setHospitals(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load hospital data.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadHospitals();
  }, [loadHospitals]);

  const updateFilters = useCallback((changes: Partial<HospitalFilterState>) => {
    setFilters((current) => ({ ...current, ...changes }));
  }, []);

  const updateSearchTerm = useCallback((value: string) => {
    setSearchTerm(value);
    setFilters((current) => ({ ...current, hospital: value }));
  }, []);

  const resetFilters = useCallback(() => {
    setSearchTerm('');
    setFilters(initialFilters);
  }, []);

  const refresh = useCallback(() => {
    void loadHospitals();
  }, [loadHospitals]);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (searchTerm) {
      labels.push('Search');
    }

    if (filters.city) {
      labels.push('City');
    }

    if (filters.department) {
      labels.push('Department');
    }

    if (filters.specialty) {
      labels.push('Specialty');
    }

    if (filters.emergency) {
      labels.push('Emergency');
    }

    if (filters.hours24) {
      labels.push('24×7');
    }

    if (filters.icu) {
      labels.push('ICU');
    }

    if (filters.ambulance) {
      labels.push('Ambulance');
    }

    if (filters.bloodBank) {
      labels.push('Blood Bank');
    }

    if (filters.parking) {
      labels.push('Parking');
    }

    if (filters.insurance) {
      labels.push('Insurance');
    }

    if (filters.rating !== 'Any') {
      labels.push('Rating');
    }

    if (filters.distance !== 'Any') {
      labels.push('Distance');
    }

    if (filters.sortBy !== 'Recommended') {
      labels.push('Sort');
    }

    return labels;
  }, [filters, searchTerm]);

  const filteredHospitals = useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    const minimumRating = getRatingThreshold(filters.rating);
    const maximumDistance = getDistanceThreshold(filters.distance);

    const result = hospitals.filter((hospital) => {
      const searchText = [
        hospital.name,
        hospital.city,
        hospital.address,
        hospital.description,
        hospital.specialties.join(' '),
        hospital.departments.join(' '),
      ].join(' ');

      const matchesSearch = !normalizedSearch || normalizeText(searchText).includes(normalizedSearch);
      const matchesCity = !filters.city || normalizeText(hospital.city).includes(normalizeText(filters.city));
      const matchesDepartment = !filters.department || hospital.departments.some((department) => normalizeText(department).includes(normalizeText(filters.department)));
      const matchesSpecialty = !filters.specialty || hospital.specialties.some((specialty) => normalizeText(specialty).includes(normalizeText(filters.specialty)));
      const matchesEmergency = !filters.emergency || hospital.facilities.emergency;
      const matchesHours24 = !filters.hours24 || hospital.facilities.twenty_four_hours;
      const matchesIcu = !filters.icu || hospital.facilities.icu;
      const matchesAmbulance = !filters.ambulance || hospital.facilities.ambulance;
      const matchesBloodBank = !filters.bloodBank || hospital.facilities.blood_bank;
      const matchesParking = !filters.parking || hospital.facilities.parking;
      const matchesInsurance = !filters.insurance || (hospital.insurance_partners?.length ?? 0) > 0;
      const matchesRating = minimumRating === null || hospital.rating >= minimumRating;
      const matchesDistance = maximumDistance === null || (hospital.distance_km ?? Number.POSITIVE_INFINITY) <= maximumDistance;

      return matchesSearch && matchesCity && matchesDepartment && matchesSpecialty && matchesEmergency && matchesHours24 && matchesIcu && matchesAmbulance && matchesBloodBank && matchesParking && matchesInsurance && matchesRating && matchesDistance;
    });

    switch (filters.sortBy) {
      case 'Highest Rated':
        return [...result].sort((left, right) => right.rating - left.rating || right.review_count - left.review_count);
      case 'Nearest':
        return [...result].sort((left, right) => (left.distance_km ?? Number.POSITIVE_INFINITY) - (right.distance_km ?? Number.POSITIVE_INFINITY));
      case '24x7 Access':
        return [...result].sort((left, right) => Number(right.facilities.twenty_four_hours) - Number(left.facilities.twenty_four_hours));
      case 'Recommended':
      default:
        return [...result].sort((left, right) => right.rating - left.rating);
    }
  }, [filters, hospitals, searchTerm]);

  return {
    hospitals,
    filteredHospitals,
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
