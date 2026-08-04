import { doctorsData } from '../data/doctors';
import type { Doctor, DoctorFilters } from '../types';

const normalizeText = (value: string): string => value.trim().toLowerCase();

const sortDoctors = (items: Doctor[], sortBy?: DoctorFilters['sort_by']): Doctor[] => {
  if (!sortBy) {
    return items;
  }

  const sorted = [...items];

  switch (sortBy) {
    case 'highest_rated':
      return sorted.sort((left, right) => right.rating - left.rating || right.review_count - left.review_count);
    case 'experience':
      return sorted.sort((left, right) => right.years_of_experience - left.years_of_experience);
    case 'availability':
      return sorted.sort((left, right) => {
        const leftRank = left.availability_status === 'available' ? 0 : left.availability_status === 'limited' ? 1 : 2;
        const rightRank = right.availability_status === 'available' ? 0 : right.availability_status === 'limited' ? 1 : 2;
        return leftRank - rightRank;
      });
    case 'recommended':
    default:
      return sorted.sort((left, right) => right.rating - left.rating);
  }
};

export async function getDoctors(): Promise<Doctor[]> {
  return [...doctorsData];
}

export async function getDoctorById(id: string): Promise<Doctor | null> {
  return doctorsData.find((doctor) => doctor.id === id) ?? null;
}

export async function searchDoctors(query: string): Promise<Doctor[]> {
  const normalizedQuery = normalizeText(query);

  if (!normalizedQuery) {
    return getDoctors();
  }

  return doctorsData.filter((doctor) => {
    const haystack = [
      doctor.full_name,
      doctor.specialty,
      doctor.sub_specialties.join(' '),
      doctor.location,
      doctor.bio,
      doctor.hospital_ids.join(' '),
      doctor.education.join(' '),
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export async function filterDoctors(filters: DoctorFilters = {}): Promise<Doctor[]> {
  const result = doctorsData.filter((doctor) => {
    const matchesSpecialty = !filters.specialty || normalizeText(doctor.specialty).includes(normalizeText(filters.specialty));
    const matchesLocation = !filters.location || normalizeText(doctor.location).includes(normalizeText(filters.location));
    const matchesHospital = !filters.hospital_id || doctor.hospital_ids.includes(filters.hospital_id);
    const matchesAvailability = !filters.availability || doctor.availability_status === filters.availability;
    const matchesRating = filters.rating_min === undefined || doctor.rating >= filters.rating_min;
    const matchesNewPatients = filters.accepts_new_patients === undefined || doctor.accepts_new_patients === filters.accepts_new_patients;

    return matchesSpecialty && matchesLocation && matchesHospital && matchesAvailability && matchesRating && matchesNewPatients;
  });

  return sortDoctors(result, filters.sort_by);
}
