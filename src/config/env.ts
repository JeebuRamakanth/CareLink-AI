/**
 * CareLink-AI environment configuration + validation (Step 9).
 *
 * Single source of truth for every external integration. Reads `import.meta.env`
 * once, normalizes values, and derives typed flags so the rest of the app never
 * touches `import.meta.env` directly or hardcodes keys.
 *
 * SECURITY:
 * - Only genuinely browser-safe values are surfaced here (URLs, anon keys,
 *   browser-restricted Maps keys, labels). No service-role keys, no API secrets.
 * - `isXConfigured()` flags let adapters choose REAL vs MOCK without leaking
 *   whether a secret is present (they only reflect browser-safe availability).
 * - Missing values never throw; the app degrades to MOCK automatically.
 */

const raw = import.meta.env;

function str(key: string): string {
  const value = raw[key];
  return typeof value === 'string' ? value.trim() : '';
}

const API_BASE_URL = str('VITE_API_BASE_URL') || '/api';

const AI_PROVIDER_BASE_URL = str('VITE_AI_PROVIDER_BASE_URL');
const ADMIN_GATEWAY_URL = str('VITE_ADMIN_GATEWAY_URL');

const SUPABASE_URL = str('VITE_SUPABASE_URL');
const SUPABASE_ANON_KEY = str('VITE_SUPABASE_ANON_KEY');

const CLOUDINARY_CLOUD_NAME = str('VITE_CLOUDINARY_CLOUD_NAME');
const CLOUDINARY_UNSIGNED_UPLOAD_PRESET = str('VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET');

const GOOGLE_MAPS_API_KEY = str('VITE_GOOGLE_MAPS_API_KEY');
const GEOAPIFY_API_KEY = str('VITE_GEOAPIFY_API_KEY');

const HOSPITAL_SEARCH_BASE_URL = str('VITE_HOSPITAL_SEARCH_BASE_URL');
const PHARMACY_SEARCH_BASE_URL = str('VITE_PHARMACY_SEARCH_BASE_URL');
const LAB_SEARCH_BASE_URL = str('VITE_LAB_SEARCH_BASE_URL');

const DOCUMENT_ANALYSIS_BASE_URL = str('VITE_DOCUMENT_ANALYSIS_BASE_URL');
const MEDICINE_INTELLIGENCE_BASE_URL = str('VITE_MEDICINE_INTELLIGENCE_BASE_URL');

export const env = {
  mode: raw.MODE ?? (import.meta.env.DEV ? 'development' : 'production'),
  apiBaseUrl: API_BASE_URL,

  ai: {
    providerBaseUrl: AI_PROVIDER_BASE_URL,
    configured: AI_PROVIDER_BASE_URL.length > 0,
  },

  admin: {
    gatewayUrl: ADMIN_GATEWAY_URL,
    configured: ADMIN_GATEWAY_URL.length > 0,
  },

  supabase: {
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
    configured: SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0,
  },

  cloudinary: {
    cloudName: CLOUDINARY_CLOUD_NAME,
    unsignedUploadPreset: CLOUDINARY_UNSIGNED_UPLOAD_PRESET,
    configured: CLOUDINARY_CLOUD_NAME.length > 0 && CLOUDINARY_UNSIGNED_UPLOAD_PRESET.length > 0,
  },

  maps: {
  apiKey: GOOGLE_MAPS_API_KEY,
  geoapifyApiKey: GEOAPIFY_API_KEY,
  configured: GEOAPIFY_API_KEY.length > 0,
},

  search: {
    hospital: { baseUrl: HOSPITAL_SEARCH_BASE_URL, configured: HOSPITAL_SEARCH_BASE_URL.length > 0 },
    pharmacy: { baseUrl: PHARMACY_SEARCH_BASE_URL, configured: PHARMACY_SEARCH_BASE_URL.length > 0 },
    lab: { baseUrl: LAB_SEARCH_BASE_URL, configured: LAB_SEARCH_BASE_URL.length > 0 },
  },

  documents: { baseUrl: DOCUMENT_ANALYSIS_BASE_URL, configured: DOCUMENT_ANALYSIS_BASE_URL.length > 0 },
  medicine: { baseUrl: MEDICINE_INTELLIGENCE_BASE_URL, configured: MEDICINE_INTELLIGENCE_BASE_URL.length > 0 },
} as const;

export type Env = typeof env;
