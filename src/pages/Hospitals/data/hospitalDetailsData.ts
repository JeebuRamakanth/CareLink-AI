export type ReviewFilterOption = 'All' | '5 Star' | '4 Star' | '3 Star' | '2 Star' | '1 Star' | 'Most Recent' | 'Most Helpful';
export type HospitalDoctorTopic = 'All' | 'Cardiology' | 'Diabetes' | 'Neurology' | 'Migraine' | 'Orthopedics';

export interface HospitalReviewItem {
  id: string;
  rating: number;
  title: string;
  content: string;
  date: string;
  verified: boolean;
  treatmentTag: string;
  helpfulCount: number;
  response?: string;
}

export interface HospitalDoctorItem {
  id: string;
  name: string;
  specialty: string;
  experienceYears: number;
  rating: number;
  reviewCount: number;
  successRate: string;
  fee: string;
  availability: string;
  availabilityStatus: 'Available now' | 'Available soon' | 'Limited' | 'On leave' | 'Unlisted';
  nextAvailable: string;
  patientsTreated: string;
  languages: string[];
  topics: HospitalDoctorTopic[];
  profileInitials: string;
  location: string;
}

export interface HospitalSpecialtyDiscoveryItem {
  id: string;
  name: string;
  reviewCount: number;
  rating: number;
  signal: string;
}

export interface HospitalRatingCategory {
  label: string;
  score: number;
}

export interface HospitalDetail {
  id: string;
  name: string;
  type: string;
  location: string;
  address: string;
  phone: string;
  rating: number;
  reviewCount: number;
  verified: boolean;
  mainSpecialties: string[];
  emergencyAvailable: boolean;
  consultationAvailability: string;
  distanceKm: number;
  about: string;
  yearsInService: number;
  departments: string[];
  specialties: string[];
  facilities: string[];
  patientExperienceIndicators: Array<{ label: string; value: string }>;
  starBreakdown: Array<{ stars: number; percent: number }>;
  categoryRatings: HospitalRatingCategory[];
  reviews: HospitalReviewItem[];
  doctors: HospitalDoctorItem[];
  specialtyDiscovery: HospitalSpecialtyDiscoveryItem[];
}

export const hospitalDetails: HospitalDetail[] = [];

export function getHospitalDetailById(id: string): HospitalDetail | undefined {
  return hospitalDetails.find((hospital) => hospital.id === id);
}

/**
 * Build a detail view from a Hospital directory record (the Supabase registry or
 * the sourced Machilipatnam fallback data). This lets the EXISTING detail page
 * render any real directory hospital without a second, hand-authored dataset —
 * it never invents facts: missing figures stay 0/empty and the UI shows its
 * honest "unavailable"/"unlisted" states.
 */
export function buildHospitalDetailFromDirectory(hospital: import('../../../types').Hospital): HospitalDetail {
  const location = [hospital.address, hospital.city, hospital.state].filter(Boolean).join(', ');
  return {
    id: hospital.id,
    name: hospital.name,
    type: hospital.type,
    location: location || hospital.city,
    address: hospital.address,
    phone: hospital.phone ?? '',
    rating: hospital.rating ?? 0,
    reviewCount: hospital.review_count ?? 0,
    verified: Boolean(hospital.is_verified),
    mainSpecialties: hospital.specialties ?? [],
    emergencyAvailable: Boolean(hospital.facilities?.emergency),
    consultationAvailability: hospital.availability_status ?? '',
    distanceKm: hospital.distance_km ?? 0,
    about: hospital.description ?? '',
    yearsInService: 0,
    departments: hospital.departments ?? [],
    specialties: hospital.specialties ?? [],
    facilities: [
      ...(hospital.facilities?.emergency ? ['Emergency'] : []),
      ...(hospital.facilities?.icu ? ['ICU'] : []),
      ...(hospital.facilities?.ambulance ? ['Ambulance'] : []),
      ...(hospital.facilities?.blood_bank ? ['Blood Bank'] : []),
      ...(hospital.facilities?.parking ? ['Parking'] : []),
      ...(hospital.facilities?.twenty_four_hours ? ['24x7'] : []),
      ...(hospital.facilities?.telehealth ? ['Telehealth'] : []),
    ],
    patientExperienceIndicators: [],
    starBreakdown: [],
    categoryRatings: [],
    reviews: [],
    doctors: [],
    specialtyDiscovery: [],
  };
}
