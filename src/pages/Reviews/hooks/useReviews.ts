import { useEffect, useMemo, useState } from 'react';
import { sampleHospitalReviews } from '../data/reviewDiscoveryData';

export type ReviewChipFilter = 'Hospitals' | 'Doctors' | 'Specialties' | 'Diseases' | 'Top Rated' | 'Most Reviewed' | 'Near Me';
export type ReviewSortOption = 'Recommended' | 'Highest Rated' | 'Most Reviewed' | 'Nearest';

export function useReviews() {
  const [query, setQuery] = useState('');
  const [activeFilters, setActiveFilters] = useState<ReviewChipFilter[]>([]);
  const [sort, setSort] = useState<ReviewSortOption>('Recommended');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 320);
    return () => window.clearTimeout(timer);
  }, []);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredReviews = useMemo(() => {
    return sampleHospitalReviews
      .filter((review) => {
        if (!normalizedQuery) {
          return true;
        }

        const combinedFields = [
          review.name,
          review.location,
          ...review.specialties,
          ...review.doctors,
          ...review.diseaseTags,
        ];

        return combinedFields.some((value) => value.toLowerCase().includes(normalizedQuery));
      })
      .filter((review) => {
        if (activeFilters.includes('Hospitals')) {
          return /hospital|medical|institute/i.test(review.name);
        }

        if (activeFilters.includes('Doctors')) {
          return review.doctors.length > 0;
        }

        if (activeFilters.includes('Specialties')) {
          return review.specialties.length > 0;
        }

        if (activeFilters.includes('Diseases')) {
          return review.diseaseTags.length > 0;
        }

        return true;
      })
      .sort((left, right) => {
        if (activeFilters.includes('Top Rated')) {
          return right.rating - left.rating;
        }

        if (activeFilters.includes('Most Reviewed')) {
          return right.reviewCount - left.reviewCount;
        }

        if (activeFilters.includes('Near Me')) {
          return left.distanceKm - right.distanceKm;
        }

        if (sort === 'Highest Rated') {
          return right.rating - left.rating;
        }

        if (sort === 'Most Reviewed') {
          return right.reviewCount - left.reviewCount;
        }

        if (sort === 'Nearest') {
          return left.distanceKm - right.distanceKm;
        }

        return right.rating - left.rating || right.reviewCount - left.reviewCount;
      });
  }, [activeFilters, normalizedQuery, sort]);

  const toggleFilter = (filter: ReviewChipFilter) => {
    setActiveFilters((current) =>
      current.includes(filter) ? current.filter((item) => item !== filter) : [...current, filter]
    );
  };

  const clearFilters = () => setActiveFilters([]);

  return {
    query,
    setQuery,
    activeFilters,
    toggleFilter,
    clearFilters,
    filteredReviews,
    filteredCount: filteredReviews.length,
    isLoading,
    sort,
    setSort,
  };
}
