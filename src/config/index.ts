/**
 * Legacy app config — kept for backward compatibility with existing imports.
 * The authoritative, validated environment lives in `./env` (Step 9). Prefer
 * importing `env` for new code; `appConfig` is a thin view over the same data.
 */
import { env } from './env';
export { env };
export type { Env } from './env';

export const appConfig = {
  appName: 'CareLink.AI',
  environment: env.mode,
  apiBaseUrl: env.apiBaseUrl,
  supabaseUrl: env.supabase.url,
  supabaseAnonKey: env.supabase.anonKey,
  googleMapsApiKey: env.maps.apiKey,
  cloudinaryCloudName: env.cloudinary.cloudName,
} as const;
