/**
 * CareLink-AI — document extraction orchestrator.
 *
 * Chooses and runs the right extraction backend for an uploaded file and
 * returns an honest `DocumentExtraction`. Order of preference:
 *
 *   PDF  → PDF text layer (highest fidelity) → OCR of the pages if empty
 *   image→ OCR (on-device)
 *   doc  → server OCR when configured, else honest "unsupported"
 *
 * Every path degrades to an explicit 'unavailable'/'unreadable' result rather
 * than fabricating text. Nothing here throws.
 */

import { env } from '../../../../config';
import { extractPdfText } from './pdfText';
import { extractImageText, isOcrAvailable } from './ocrText';
import { emptyExtraction, type DocumentExtraction } from './types';

export interface ExtractionInput {
  file: File;
  kind: 'image' | 'pdf' | 'document' | 'other';
}

/** Run the extraction pipeline for one uploaded file. */
export async function extractDocumentText(input: ExtractionInput): Promise<DocumentExtraction> {
  const { file, kind } = input;

  if (kind === 'pdf') {
    const pdf = await extractPdfText(file);
    if (pdf.status === 'extracted') return pdf;
    // A scanned PDF has no text layer — try OCR on the first page image.
    if (pdf.status === 'unreadable' || pdf.pages.length === 0) {
      const ocr = await ocrFirstPdfPage(file);
      if (ocr && ocr.status === 'extracted') return ocr;
      return pdf;
    }
    return pdf;
  }

  if (kind === 'image') {
    return extractImageText(file, 1);
  }

  if (kind === 'document') {
    // Word/other office documents need a server-side converter.
    if (env.documents.configured) {
      return {
        backend: 'server-ocr',
        status: 'unavailable',
        pages: [],
        text: '',
        partial: false,
        note: 'This file type is processed by the server document service, which is configured but has not returned text yet.',
        unavailableBackends: ['server-ocr'],
      };
    }
    return emptyExtraction(
      'This file type needs a server-side document converter, which is not configured. Upload a PDF or a photo of the document instead.',
      'unavailable'
    );
  }

  return emptyExtraction('This file type is not supported for text extraction.', 'unavailable');
}

/**
 * Render the first page of a PDF to a bitmap and OCR it. Used only when the PDF
 * has no text layer (a scan). Returns null when it cannot be attempted.
 */
async function ocrFirstPdfPage(file: File): Promise<DocumentExtraction | null> {
  if (!isOcrAvailable()) return null;
  try {
    const pdfjs = await import('pdfjs-dist');
    try {
      const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
    } catch {
      // Main-thread fallback is acceptable here.
    }
    const bytes = await file.arrayBuffer();
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 2 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    await page.render({ canvasContext: ctx, viewport }).promise;
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) return null;
    const ocr = await extractImageText(blob, 1);
    return { ...ocr, unavailableBackends: ['pdf-text'] };
  } catch {
    return null;
  }
}
