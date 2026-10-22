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
