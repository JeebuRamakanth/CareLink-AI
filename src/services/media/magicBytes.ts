/**
 * CareLink-AI  Step 1 15: Magic-byte validation.
 *
 * Client-side MIME is untrusted; we sniff the actual file prefix to confirm
 * the declared type before anything reaches storage. Browsers expose bytes
 * asynchronously via File.arrayBuffer(), so this runs in the upload pipeline
 * (not only on the accept attribute)SVG/HTML et al. are rejected
 */

export interface MagicByteMatch {
  kind: 'jpeg' | 'png' | 'webp' | 'gif' | 'pdf' | 'unknown' | 'unsafe';
  /** The declared MIME, normalized (lowercase, trimmed), if any. */
  declaredMime: string | null;
  /** True when the sniffed kind matches the declared MIME family. */
  matchesDeclared: boolean;
}

const UNSAFE_TEXT_PREFIXES: RegExp[] = [
  /^\s*<!doctype html>/i,
  /^\s*<html[\s>]/i,
  /^\s*<svg[\s>]/i,
  /^\s*<script[\s>]/i,
  /^\s*<img[\s>]/i,
  /^\s*<iframe[\s>]/i,
];

function detectImageKind(bytes: Uint8Array): MagicByteMatch['kind'] {
  if (
    bytes.length > 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) return 'jpeg';
  if (
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) return 'png';
  if (
    bytes.length > 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) return 'webp';
  if (
    bytes.length > 6 &&
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    (bytes[3] === 0x38) &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) return 'gif';
  if (
    bytes.length > 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) return 'pdf';
  const head = new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, 512));
  if (UNSAFE_TEXT_PREFIXES.some((re) => re.test(head))) return 'unsafe';
  return 'unknown';
}

const KIND_MIME_FAMILIES: Record<MagicByteMatch['kind'], string[]> = {
  jpeg: ['image/jpeg', 'image/pjpeg'],
  png: ['image/png'],
  webp: ['image/webp'],
  gif: ['image/gif'],
  pdf: ['application/pdf'],
  unknown: [],
  unsafe: [],
};

/** Sniff a File's magic bytes and compare with its declared MIME. */
export function sniffFileMagic(file: File): Promise<MagicByteMatch> {
  return file
    .arrayBuffer()
    .then((buffer) => {
      const bytes = new Uint8Array(buffer);
      const kind = detectImageKind(bytes);
      const declaredMime = (file.type || '').toLowerCase().trim() || null;
      const family = KIND_MIME_FAMILIES[kind];
      const matchesDeclared = declaredMime !== null && (declaredMime === 'image/gif' ? kind === 'gif' : family.includes(declaredMime);
      return { kind, declaredMime, matchesDeclared };
    })
    .catch(() => ({ kind: 'unknown' as const, declaredMime: null, matchesDeclared: false });
}

/** Whether a sniffed kind is acceptable for medical/document upload. */
export function isSafeMagicKind(match: MagicByteMatch): boolean {
  return (
    match.kind === 'jpeg' ||
    match.kind === 'png' ||
    match.kind === 'webp' ||
    match.kind === 'pdf'
  );
}