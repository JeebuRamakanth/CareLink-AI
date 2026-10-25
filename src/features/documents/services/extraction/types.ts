/**
 * CareLink-AI — document extraction primitives.
 *
 * The shared shape every extraction backend (PDF text layer, browser OCR,
 * server OCR) produces. Extraction is a TRUST BOUNDARY: everything downstream
 * (classification, lab parsing, prescription parsing, triage) reads only these
 * records, and the records are explicit about what was and was not read.
 *
 * HARD RULE: nothing in this pipeline ever fabricates text. A page that could
 * not be read is reported with `status: 'unreadable'` and no text — callers must
 * surface that limitation instead of inventing content.
 */

/** Which backend produced the text. Drives the provenance badge in the UI. */
export type ExtractionBackend = 'pdf-text' | 'ocr' | 'server-ocr' | 'none';

/** Outcome for a single page/image of the uploaded document. */
export type PageExtractionStatus =
  /** Text was read with usable confidence. */
  | 'extracted'
  /** Backend ran but could not read the page (blank/blurred/unsupported). */
  | 'unreadable'
  /** Backend was not available in this environment (e.g. OCR assets offline). */
  | 'unavailable'
  /** Backend failed for this page; others may still succeed. */
  | 'failed';

/** One page of extracted text, with provenance. */
export interface ExtractedPage {
  /** 1-based page number as printed in the source document. */
  pageNumber: number;
  status: PageExtractionStatus;
  /** Raw text as read. Empty string when nothing could be read. */
  text: string;
  /** 0..1 confidence. Only set when the backend scores it (OCR). */
  confidence?: number;
  /** Safe, user-facing explanation when the page is not 'extracted'. */
  note?: string;
}

/** The complete extraction outcome for one uploaded file. */
export interface DocumentExtraction {
  backend: ExtractionBackend;
  /** Overall status: 'extracted' when at least one page yielded text. */
  status: PageExtractionStatus;
  pages: ExtractedPage[];
  /** Concatenated text of every extracted page (page order preserved). */
  text: string;
  /** True when some (not all) pages could not be read. */
  partial: boolean;
  /** Safe, user-facing summary of the extraction result. */
  note?: string;
  /** Total page count when the format reports one (PDF). */
  pageCount?: number;
  /** Backends that were attempted but unavailable in this environment. */
  unavailableBackends?: string[];
}

/** An empty, honest extraction result (nothing was read). */
export function emptyExtraction(note: string, status: PageExtractionStatus = 'unavailable'): DocumentExtraction {
  return { backend: 'none', status, pages: [], text: '', partial: false, note };
}

/** Join page texts while preserving page order. */
export function joinPages(pages: ExtractedPage[]): string {
  return pages
    .filter((p) => p.status === 'extracted' && p.text.trim().length > 0)
    .map((p) => p.text.trim())
    .join('\n\n');
}
