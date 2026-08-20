/**
 * CareLink-AI — Step 11 file validation + filename sanitization.
 *
 * Trust-boundary validation for medical-document uploads. Runs BEFORE any file
 * touches storage or the DB. Rejects unsupported MIME/extension, oversized
 * files, malformed/empty filenames, and duplicate selections.
 *
 * SECURITY:
 * - The user-supplied filename is NEVER used as a Cloudinary public id or a
 *   storage path segment. It is sanitized into an opaque slug for references.
 * - Validation never trusts MIME alone — extension is checked too.
 * - Errors returned here are safe to show in the UI (no PHI, no paths).
 */

import type { DocumentKind } from '../../../services/health-data/types';

/** Max file size: 10 MB (matches Step 9 lib/validation + helpers). */
export const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024;

/** Allowed MIME types for medical documents. */
export const ALLOWED_DOCUMENT_MIMES = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

/** Allowed file extensions (case-insensitive). */
export const ALLOWED_DOCUMENT_EXTENSIONS = /\.(jpe?g|png|webp|pdf|docx?)$/i;

/** Accept attribute for <input type="file"> covering all supported types. */
export const DOCUMENT_ACCEPT_ATTR =
  '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,' +
  'image/jpeg,image/png,image/webp,' +
  'application/pdf,' +
  'application/msword,' +
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Max files accepted in a single upload batch (abuse control). */
export const MAX_DOCUMENTS_PER_BATCH = 8;

export type DocumentValidationCode =
  | 'file-too-large'
  | 'unsupported-type'
  | 'type-mismatch'
  | 'empty-file'
  | 'malformed-filename'
  | 'too-many-files'
  | 'duplicate';

export interface DocumentValidationIssue {
  fileName: string;
  code: DocumentValidationCode;
  message: string;
}

/** Derive a broad document kind from MIME + filename (mirrors Step 9 helpers). */
export function detectDocumentKind(file: File): DocumentKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.includes('word') || /\.(docx?)$/i.test(file.name)) return 'document';
  if (/\.pdf$/i.test(file.name)) return 'pdf';
  return 'other';
}

/**
 * Validate a single candidate file. Returns null when valid, otherwise a
 * safe, UI-ready issue. Checks size, MIME, extension, and filename shape.
 */
export function validateDocumentFile(file: File): DocumentValidationIssue | null {
  const displayName = sanitizeDisplayName(file.name || 'file');
  if (!file.name || file.name.trim().length === 0) {
    return { fileName: 'file', code: 'malformed-filename', message: 'This file has no name and cannot be uploaded.' };
  }
  // Path-traversal / suspicious filename: reject outright rather than relying
  // on downstream sanitization (defense in depth at the trust boundary).
  if (/[/\\]/.test(file.name) || file.name.includes('..') || /^\.+$/.test(file.name.trim())) {
    return { fileName: displayName, code: 'malformed-filename', message: 'This filename is not allowed.' };
  }
  if (file.size <= 0) {
    return { fileName: displayName, code: 'empty-file', message: `${displayName} is empty.` };
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return { fileName: displayName, code: 'file-too-large', message: `${displayName} exceeds the 10 MB limit.` };
  }
  const extOk = ALLOWED_DOCUMENT_EXTENSIONS.test(file.name);
  if (!extOk) {
    return { fileName: displayName, code: 'unsupported-type', message: `${displayName} is not a supported format. Use JPG, PNG, WEBP, PDF, DOC, or DOCX.` };
  }
  // MIME/extension must AGREE when a MIME type is declared — a renamed
  // executable (evil.exe → evil.pdf with a spoofed type, or a .exe carrying
  // an image MIME) is rejected instead of trusted.
  if (file.type && !ALLOWED_DOCUMENT_MIMES.has(file.type)) {
    return { fileName: displayName, code: 'type-mismatch', message: `${displayName} has a file type that does not match a supported document format.` };
  }
  if (file.type && !mimeMatchesExtension(file.type, file.name)) {
    return { fileName: displayName, code: 'type-mismatch', message: `${displayName} has a file type that does not match its extension.` };
  }
  return null;
}

/** MIME family must agree with the extension family (image vs pdf vs doc). */
function mimeMatchesExtension(mime: string, name: string): boolean {
  const ext = (name.split('.').pop() ?? '').toLowerCase();
  if (mime.startsWith('image/')) return ['jpg', 'jpeg', 'png', 'webp'].includes(ext);
  if (mime === 'application/pdf') return ext === 'pdf';
  if (mime === 'application/msword') return ext === 'doc';
  if (mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return ext === 'docx';
  return false;
}

export interface DocumentValidationResult {
  accepted: File[];
  issues: DocumentValidationIssue[];
}

/**
 * Validate a batch of files. Detects duplicates against an existing set (by
 * name+size) so re-selecting an already-queued file is rejected, not re-added.
 */
export function validateDocumentBatch(
  files: File[] | FileList | null,
  existing: { fileName: string; fileSize: number }[] = []
): DocumentValidationResult {
  const accepted: File[] = [];
  const issues: DocumentValidationIssue[] = [];
  if (!files) return { accepted, issues };

  const list = Array.from(files);
  const seen = new Set(existing.map((f) => `${f.fileName}|${f.fileSize}`));

  if (list.length + existing.length > MAX_DOCUMENTS_PER_BATCH) {
    issues.push({
      fileName: 'batch',
      code: 'too-many-files',
      message: `You can attach up to ${MAX_DOCUMENTS_PER_BATCH} files at a time.`,
    });
    return { accepted, issues };
  }

  for (const file of list) {
    const dupKey = `${file.name}|${file.size}`;
    if (seen.has(dupKey)) {
      issues.push({ fileName: sanitizeDisplayName(file.name), code: 'duplicate', message: `${sanitizeDisplayName(file.name)} is already added.` });
      continue;
    }
    const issue = validateDocumentFile(file);
    if (issue) {
      issues.push(issue);
      continue;
    }
    accepted.push(file);
    seen.add(dupKey);
  }
  return { accepted, issues };
}

const UNSAFE_PUBLIC_ID_CHARS = /[^a-zA-Z0-9_-]/g;

/**
 * Sanitize a filename into a Cloudinary-public-id-safe slug. The user's
 * original filename is NEVER used verbatim as a public id — this produces an
 * opaque, URL-safe token. Truncates to keep references compact.
 */
export function sanitizePublicIdSlug(fileName: string, salt = ''): string {
  const base = fileName.replace(/\.[^.]+$/, '').replace(UNSAFE_PUBLIC_ID_CHARS, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const safeBase = base.length > 0 ? base.slice(0, 32) : 'doc';
  const token = Math.random().toString(36).slice(2, 8);
  const saltSuffix = salt ? `_${salt.replace(UNSAFE_PUBLIC_ID_CHARS, '_').slice(0, 12)}` : '';
  return `${safeBase}_${token}${saltSuffix}`;
}

/** Sanitize a filename for *display* only (strip path traversal, trim). */
export function sanitizeDisplayName(fileName: string): string {
  return fileName.replace(/[/\\]+/g, '_').trim().slice(0, 120) || 'document';
}

/** Human-readable file size. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
