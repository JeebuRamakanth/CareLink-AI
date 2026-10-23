/**
 * CareLink-AI — environment configuration diagnostics.
 *
 * Validates the browser-safe environment at startup and returns short,
 * NON-SENSITIVE messages the UI can show. Never prints a key, token, or URL
 * credential: messages only name the VARIABLE that is missing or inconsistent.
 *
 * Distinguishes three states so operators are not misled:
 *   - 'demo'      : no backend configured (intentional; the app runs locally)
 *   - 'ready'     : the integration is fully and consistently configured
 *   - 'misconfigured': a partial/invalid value is present (needs operator action)
 */

import { env } from './env';

export type ConfigSeverity = 'info' | 'warning';

export interface ConfigNotice {
  id: string;
  severity: ConfigSeverity;
  /** Variable names only — never values. */
  variables: string[];
  message: string;
}

const raw = import.meta.env;

function present(key: string): boolean {
  const v = raw[key];
  return typeof v === 'string' && v.trim().length > 0 && !/YOUR_/i.test(v);
}

function placeholder(key: string): boolean {
  const v = raw[key];
  return typeof v === 'string' && v.trim().length > 0 && /YOUR_/i.test(v);
}

/**
 * Inspect the environment and return notices for anything an operator must fix.
 * Returns an empty array when every integration is either absent (demo) or
 * fully configured — the healthy states.
 */
export function getConfigNotices(): ConfigNotice[] {
  const notices: ConfigNotice[] = [];

  // Supabase: the anon key and URL must be supplied together.
  const url = present('VITE_SUPABASE_URL');
  const key = present('VITE_SUPABASE_ANON_KEY');
  const urlPlaceholder = placeholder('VITE_SUPABASE_URL');
  const keyPlaceholder = placeholder('VITE_SUPABASE_ANON_KEY');

  if ((url || urlPlaceholder) !== (key || keyPlaceholder)) {
    const missing = url ? 'VITE_SUPABASE_ANON_KEY' : 'VITE_SUPABASE_URL';
    notices.push({
      id: 'supabase-partial',
      severity: 'warning',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      message:
        `Supabase is partially configured — ${missing} is missing. ` +
        'Set both browser-safe values (URL + anon key) or neither. ' +
        'Auth, persistence, and the provider directory stay in demo mode until both are present.',
    });
  } else if (urlPlaceholder || keyPlaceholder) {
    notices.push({
      id: 'supabase-placeholder',
      severity: 'warning',
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      message:
        'Supabase still contains the example placeholder values from .env.example. ' +
        'Replace them with your project URL and anon key, or remove them to run in demo mode.',
    });
  }

  // Cloudinary: an unsigned upload preset is useless without the cloud name.
  const cloudName = present('VITE_CLOUDINARY_CLOUD_NAME');
  const preset = present('VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET');
  if (cloudName !== preset) {
    notices.push({
      id: 'cloudinary-partial',
      severity: 'warning',
      variables: ['VITE_CLOUDINARY_CLOUD_NAME', 'VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET'],
      message:
        'Cloudinary is partially configured — set both the cloud name and the unsigned upload preset, ' +
        'or neither. Document uploads fall back to the local demo store otherwise.',
    });
  }

  // A browser-exposed service-role key is a critical leak, not a config nudge.
  if (/service_role/i.test(String(raw.VITE_SUPABASE_ANON_KEY ?? ''))) {
    notices.push({
      id: 'supabase-service-role-leak',
      severity: 'warning',
      variables: ['VITE_SUPABASE_ANON_KEY'],
      message:
        'VITE_SUPABASE_ANON_KEY appears to contain a service_role key. That key bypasses Row Level ' +
        'Security and must NEVER be shipped to the browser. Replace it with the anon/public key immediately.',
    });
  }

  return notices;
}

/** Human-readable summary of the current backend mode (safe to display). */
export function configModeLabel(): 'live' | 'demo' {
  return env.supabase.configured ? 'live' : 'demo';
}

/* ---------------------------------------------------------------------------
 * Integration readiness report (names/status only — never a value)
 * ------------------------------------------------------------------------- */

export type IntegrationStatus = 'configured' | 'not-configured' | 'placeholder' | 'misconfigured';

export interface IntegrationReadiness {
  id: string;
  /** What the integration unlocks for the user. */
  label: string;
  status: IntegrationStatus;
  /** Variable NAMES the operator must set (never their values). */
  variables: string[];
  /** Server-side secret location when the credential must not reach the browser. */
  serverOnly?: boolean;
  /** What to do when it is not configured. */
  setup: string;
}

/**
 * A status-only readiness report for every external integration. It reports
 * whether each integration is CONFIGURED — never a key, token, connection
 * string or provider error. Presence alone is reported as `configured`; a live
 * health check (e.g. `npm run verify:live-schema`) is required to prove the
 * backend actually works.
 */
export function getIntegrationReadiness(): IntegrationReadiness[] {
  const supabaseUrl = present('VITE_SUPABASE_URL');
  const supabaseKey = present('VITE_SUPABASE_ANON_KEY');
  const supabasePlaceholder = placeholder('VITE_SUPABASE_URL') || placeholder('VITE_SUPABASE_ANON_KEY');
  const supabaseStatus: IntegrationStatus = supabasePlaceholder
    ? 'placeholder'
    : supabaseUrl && supabaseKey
      ? 'configured'
      : supabaseUrl || supabaseKey
        ? 'misconfigured'
        : 'not-configured';

  const cloudName = present('VITE_CLOUDINARY_CLOUD_NAME');
  const preset = present('VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET');

  return [
    {
      id: 'supabase',
      label: 'Supabase backend (auth, appointment persistence, provider registry)',
      status: supabaseStatus,
      variables: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
      setup:
        'Set both browser-safe values, apply supabase/migrations (npm run db:bundle → supabase/DEPLOY_ALL.sql), ' +
        'then run `npm run verify:live-schema` to confirm the schema actually exists.',
    },
    {
      id: 'ai-gateway',
      label: 'AI provider (xAI) via the Supabase Edge Function',
      // The AI key lives ONLY in the Edge Function environment, never in VITE_*.
      status: supabaseStatus === 'configured' ? 'configured' : 'not-configured',
      variables: ['XAI_API_KEY', 'XAI_MODEL'],
      serverOnly: true,
      setup:
        'Deploy the ai-gateway function and set XAI_API_KEY + XAI_MODEL as Supabase Edge Function secrets ' +
        '(`supabase secrets set ...`). Until then the assistant runs in clearly-labelled demo mode.',
    },
    {
      id: 'google-places',
      label: 'Google Places discovery',
      status: placeholder('VITE_GOOGLE_MAPS_API_KEY') ? 'placeholder' : present('VITE_GOOGLE_MAPS_API_KEY') ? 'configured' : 'not-configured',
      variables: ['VITE_GOOGLE_MAPS_API_KEY'],
      setup:
        'Create a Google Cloud API key, enable Places API (New) + billing, restrict the key to your HTTP referrers ' +
        'and to Places API, then set VITE_GOOGLE_MAPS_API_KEY. Maps directions links work without any key.',
    },
    {
      id: 'maps-directions',
      label: 'Google Maps directions deep-links',
      // The universal maps/dir URL needs no key at all.
      status: 'configured',
      variables: [],
      setup: 'Directions links use the keyless universal Google Maps URL and work without configuration.',
    },
    {
      id: 'cloudinary',
      label: 'Cloudinary medical-document uploads',
      status: cloudName && preset ? 'configured' : cloudName || preset ? 'misconfigured' : 'not-configured',
      variables: ['VITE_CLOUDINARY_CLOUD_NAME', 'VITE_CLOUDINARY_UNSIGNED_UPLOAD_PRESET'],
      setup: 'Set both the cloud name and an UNSIGNED upload preset (never the API secret) to store documents in Cloudinary; otherwise uploads stay in the local demo store.',
    },
    {
      id: 'provider-directory',
      label: 'Provider directory source pipeline',
      // The importer runs without credentials and produces the bundled directory.
      status: 'configured',
      variables: [],
      setup: 'Run `npm run directory:refresh` to re-import the government district directories.',
    },
    {
      id: 'blood-centres',
      label: 'Blood-centre directory',
      status: 'configured',
      variables: [],
      setup: 'Curated from the Indian Red Cross Society listing. Live stock requires e-RaktKosh (interactive session) and is not integrated.',
    },
  ];
}
