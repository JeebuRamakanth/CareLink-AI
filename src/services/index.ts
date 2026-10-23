export const serviceRegistry = {
  supabase: 'Supabase',
  maps: 'Google Maps',
  storage: 'Cloudinary',
  notifications: 'Notifications',
  ai: 'Future AI integration',
} as const;

export { getHospitals, getHospitalById, searchHospitals, filterHospitals } from './hospitalService';
export { getDoctors, getDoctorById, searchDoctors, filterDoctors } from './doctorService';
export {
  getPharmacies,
  getPharmacyById,
  getBundledPharmacies,
  rankPharmacies,
  pharmacyFilterOptions,
  pharmacyDistance,
  pharmacyStockState,
  isPharmacyBackendConfigured,
  matchesPharmacySearch,
  getLaboratories,
  getLaboratoryById,
  getBundledLaboratories,
} from './pharmacyService';
export type { DirectoryOrigin, PharmacySort, PharmacySearchOptions, PharmacyFilterOptions } from './pharmacyService';
