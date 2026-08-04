export const serviceRegistry = {
  supabase: 'Supabase',
  maps: 'Google Maps',
  storage: 'Cloudinary',
  notifications: 'Notifications',
  ai: 'Future AI integration',
} as const;

export { getHospitals, getHospitalById, searchHospitals, filterHospitals } from './hospitalService';
export { getDoctors, getDoctorById, searchDoctors, filterDoctors } from './doctorService';
