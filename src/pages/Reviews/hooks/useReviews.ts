import { useEffect, useMemo, useState } from 'react';
import { sampleReviews } from '../data/reviewData';

export type ReviewCategory = 'all' | 'doctors' | 'hospitals';
export type ReviewRatingFilter = 'all' | '4+' | '3+' | '2+';
export type ReviewSortBy = 'latest' | 'highestRated';

const PAGE_SIZE = 6;

function getMinimumRating(value: ReviewRatingFilter) {
  switch (value) {
    case '4+':
      return 4;
    case '3+':
      return 3;
    case '2+':
      return 2;
    default:
      return null;
  }
}

export function useReviews() {
  const [category, setCategory] = useState<ReviewCategory>('all');
  const [rating, setRating] = useState<ReviewRatingFilter>('all');
  const [sortBy, setSortBy] = useState<ReviewSortBy>('latest');
  const [currentPage, setCurrentPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsLoading(false), 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [category, rating, sortBy]);

  const minimumRating = getMinimumRating(rating);

  const filteredReviews = useMemo(() => {
    const filtered = sampleReviews.filter((review) => {
      if (category === 'doctors' && review.subject_type !== 'Doctor') {
        return false;
      }

      if (category === 'hospitals' && review.subject_type !== 'Hospital') {
        return false;
      }

      if (minimumRating !== null && review.rating < minimumRating) {
        return false;
      }

      return true;
    });

    return filtered.sort((left, right) => {
      if (sortBy === 'highestRated') {
        return right.rating - left.rating || new Date(right.reviewed_at).getTime() - new Date(left.reviewed_at).getTime();
      }

      return new Date(right.reviewed_at).getTime() - new Date(left.reviewed_at).getTime();
    });
  }, [category, minimumRating, sortBy]);

  const pageCount = Math.max(1, Math.ceil(filteredReviews.length / PAGE_SIZE));
  const currentPageIndex = Math.min(currentPage, pageCount);
  const currentReviews = filteredReviews.slice((currentPageIndex - 1) * PAGE_SIZE, currentPageIndex * PAGE_SIZE);

  const activeFilterLabels = useMemo(() => {
    const labels: string[] = [];

    if (category === 'doctors') {
      labels.push('Doctors');
    }

    if (category === 'hospitals') {
      labels.push('Hospitals');
    }

    if (rating !== 'all') {
      labels.push(`Rating ${rating}`);
    }

    if (sortBy === 'highestRated') {
      labels.push('Highest rated');
    }

    return labels;
  }, [category, rating, sortBy]);

  const resetFilters = () => {
    setCategory('all');
    setRating('all');
    setSortBy('latest');
    setCurrentPage(1);
  };

  return {
    isLoading,
    reviews: filteredReviews,
    currentReviews,
    totalReviews: sampleReviews.length,
    filteredCount: filteredReviews.length,
    pageCount,
    currentPage: currentPageIndex,
    category,
    rating,
    sortBy,
    activeFilterLabels,
    setCategory,
    setRating,
    setSortBy,
    setCurrentPage,
    resetFilters,
  };
}
