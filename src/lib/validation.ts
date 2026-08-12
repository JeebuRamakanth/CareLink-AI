/**
 * Input validation helpers (Step 9).
 *
 * Pure functions used at trust boundaries: file uploads, URLs, free text.
 * Keeps validation logic in one place and out of components.
 */

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const ALLOWED_EXT = /\.(jpe?g|png|webp|pdf|docx?)$/i;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileValidationIssue {
  fileName: string;
  code: 'file-too-large' | 'unsupported-type';
  message: string;
}

export function validateFile(file: File): FileValidationIssue | null {
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { fileName: file.name, code: 'file-too-large', message: `${file.name} exceeds 10 MB.` };
  }
  const mimeOk = !file.type || ALLOWED_MIME.has(file.type);
  const extOk = ALLOWED_EXT.test(file.name);
  if (!mimeOk && !extOk) {
    return { fileName: file.name, code: 'unsupported-type', message: `${file.name} is not a supported format.` };
  }
  return null;
}

/** RFC-safe URL validation that rejects javascript:/data: schemes. */
export function isSafeHttpUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (/^\s*(javascript|data|vbscript|file):/i.test(trimmed)) return false;
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Clamp a non-negative integer, useful for pagination/limits. */
export function clampNonNegativeInt(value: unknown, max: number, fallback = 0): number {
  const n = typeof value === 'string' ? parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, max);
}

/** Trim + collapse internal whitespace, with a max length guard. */
export function sanitizeText(value: string, maxLength = 2000): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}
