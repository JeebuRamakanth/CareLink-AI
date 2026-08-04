export const appConfig = {
  appName: 'CareLink.AI',
  environment: import.meta.env.MODE,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL ?? '/api',
  supabaseUrl: import.meta.env.VITE_SUPABASE_URL ?? '',
  supabaseAnonKey: import.meta.env.VITE_SUPABASE_ANON_KEY ?? '',
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY ?? '',
  cloudinaryCloudName: import.meta.env.VITE_CLOUDINARY_CLOUD_NAME ?? '',
} as const;
