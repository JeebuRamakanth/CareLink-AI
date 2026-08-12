/**
 * Security helpers (Step 9).
 *
 * Central place for the "never leak secrets" rules:
 * - `safeLog` strips anything that looks like a key/token before logging.
 * - `redact` masks long opaque strings (API keys, JWTs) in arbitrary objects.
 *
 * Used by the integration layer so diagnostics never surface credentials.
 */

const SECRETISH = /(key|token|secret|password|passwd|authorization|bearer|api[-_]?key)/i;
const LONG_OPAQUE = /[A-Za-z0-9_\-]{24,}/;
const BEARER = /Bearer\s+[A-Za-z0-9._\-]+/gi;
const BASIC_AUTH = /(\/\/[^:]+:)[^@]+@/g;

/** Mask a string that looks like a credential. */
export function maskSecret(value: string): string {
  if (!value) return '';
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}

/** Redact credential-like values from an arbitrary (often error) object. */
export function redact<T>(input: T): T {
  try {
    return JSON.parse(JSON.stringify(input, (key, value) => {
      if (SECRETISH.test(key)) return '••••';
      if (typeof value === 'string' && LONG_OPAQUE.test(value) && value.length > 20) return '••••';
      return value;
    })) as T;
  } catch {
    return input;
  }
}

/**
 * Safe logger. Redacts secrets from args and never prints raw tokens/bearer
 * headers or basic-auth credentials embedded in URLs.
 */
export function safeLog(level: 'info' | 'warn' | 'error', provider: string, ...args: unknown[]): void {
  if (typeof console === 'undefined') return;
  const sanitized = args.map((a) => {
    if (typeof a === 'string') return a.replace(BEARER, 'Bearer ••••').replace(BASIC_AUTH, '$1••••@');
    return redact(a);
  });
  // eslint-disable-next-line no-console
  console[level](`[CareLink:${provider}]`, ...sanitized);
}

export const log = {
  info: (provider: string, ...args: unknown[]) => safeLog('info', provider, ...args),
  warn: (provider: string, ...args: unknown[]) => safeLog('warn', provider, ...args),
  error: (provider: string, ...args: unknown[]) => safeLog('error', provider, ...args),
};
