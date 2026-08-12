/**
 * Response normalization utilities (Step 9).
 *
 * Vendor responses vary wildly. These helpers coerce unknown shapes into
 * predictable internal values, defaulting safely instead of throwing, so a
 * malformed external payload never bubbles a `null`/`undefined` into the UI.
 */

export function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : typeof value === 'number' || typeof value === 'boolean' ? String(value) : fallback;
}

export function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
  return Number.isFinite(n) ? n : fallback;
}

export function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return value === 'true' || value === '1' || value === 'yes';
  if (typeof value === 'number') return value !== 0;
  return fallback;
}

export function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

export function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => asString(v)).filter((v) => v.length > 0);
  if (typeof value === 'string') return [value];
  return [];
}

export function pickString(obj: unknown, ...keys: string[]): string {
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (typeof v === 'string' && v.trim().length > 0) return v;
      if (typeof v === 'number') return String(v);
    }
  }
  return '';
}

export function pickNumber(obj: unknown, ...keys: string[]): number {
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN;
      if (Number.isFinite(n)) return n;
    }
  }
  return 0;
}

export function pickBoolean(obj: unknown, ...keys: string[]): boolean {
  if (obj && typeof obj === 'object') {
    for (const k of keys) {
      const v = (obj as Record<string, unknown>)[k];
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') return v === 'true';
    }
  }
  return false;
}
