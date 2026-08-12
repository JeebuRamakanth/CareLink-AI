/**
 * Input validation helpers (Step 9, extended Step 11).
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

/** Extension expected for a given MIME type, for mismatch detection. */
const MIME_TO_EXT: Record<string, RegExp> = {
  'image/jpeg': /\.(jpe?g)$/i,
  'image/png': /\.(png)$/i,
  'image/webp': /\.(webp)$/i,
  'application/pdf': /\.(pdf)$/i,
  'application/msword': /\.(doc)$/i,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': /\.(docx)$/i,
};

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export interface FileValidationIssue {
  fileName: string;
  code: 'file-too-large' | 'unsupported-type' | 'mime-ext-mismatch';
  message: string;
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

/**
 * Sanitize a filename for safe storage: strip path components, control chars,
 * traversal sequences, and trim length. The result preserves the extension but
 * never trusts a caller-supplied path.
 */
export function sanitizeFileName(name: string, maxLength = 120): string {
  // Take the last path segment only — never trust a path with directories.
  const base = (name || 'document').split(/[/\\]/).pop() || 'document';
  // Remove control chars and path-traversal / null bytes.
  const cleaned = base.replace(/[\u0000-\u001F<>:"|?*]/g, '').replace(/\.\.+/g, '.').trim();
  const trimmed = cleaned.slice(0, maxLength);
  return trimmed.length > 0 ? trimmed : 'document';
}

/** Extract the lowercased extension (without dot) from a filename, or null. */
export function fileExtension(name: string): string | null {
  const match = (name || '').toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : null;
}

/** Detect a MIME/extension mismatch (e.g. a .pdf with image/jpeg MIME). */
export function detectMimeExtMismatch(file: File): boolean {
  const ext = fileExtension(file.name);
  const mime = file.type;
  if (!ext || !mime || !ALLOWED_MIME.has(mime)) return false;
  const expected = MIME_TO_EXT[mime];
  return expected ? !expected.test(file.name) : false;
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
  if (detectMimeExtMismatch(file)) {
    return { fileName: file.name, code: 'mime-ext-mismatch', message: `${file.name} extension does not match its type.` };
  }
  return null;
}

/**
 * Validate a batch of files for upload. Returns accepted files + per-file
 * rejection issues (size, type, mismatch, duplicates by name+size).
 */
export interface FileBatchValidation {
  accepted: File[];
  issues: FileValidationIssue[];
}

export function validateFileBatch(files: File[]): FileBatchValidation {
  const accepted: File[] = [];
  const issues: FileValidationIssue[] = [];
  const seen = new Set<string>();
  for (const file of files) {
    const issue = validateFile(file);
    if (issue) {
      issues.push(issue);
      continue;
    }
    const dedupeKey = `${file.name}:${file.size}`;
    if (seen.has(dedupeKey)) {
      // Silently skip duplicates rather than surfacing as an error.
      continue;
    }
    seen.add(dedupeKey);
    accepted.push(file);
  }
  return { accepted, issues };
}
