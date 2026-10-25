/**
 * CareLink-AI — PDF text-layer extraction.
 *
 * Reads the text layer of a PDF locally in the browser using pdfjs-dist. This
 * is the highest-fidelity path for laboratory reports and printed prescriptions
 * because it needs no OCR: the characters are already in the file.
 *
 * SECURITY / PRIVACY:
 * - The file never leaves the device: pdfjs parses the ArrayBuffer in-page.
 * - The library is dynamically imported so it stays out of the main bundle and
 *   a failure to load degrades to an honest "unavailable" result.
 * - Encrypted/corrupt PDFs return an honest failure; text is never invented.
 *
 * The pdf.js worker is loaded from the bundled asset URL Vite produces
 * (`pdfjs-dist/build/pdf.worker.min.mjs`), so no external CDN is contacted.
 */

import { joinPages, type DocumentExtraction, type ExtractedPage } from './types';

/** Extract the text layer from a PDF file. Never throws. */
export async function extractPdfText(file: File): Promise<DocumentExtraction> {
  let pdfjs: typeof import('pdfjs-dist');
  try {
    pdfjs = await import('pdfjs-dist');
  } catch {
    return {
      backend: 'none',
      status: 'unavailable',
      pages: [],
      text: '',
      partial: false,
      note: 'The PDF reader could not be loaded in this environment.',
      unavailableBackends: ['pdf-text'],
    };
  }

  // Wire the worker once. Vite resolves this to a hashed, same-origin asset.
  try {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  } catch {
    // Without a worker pdf.js still runs on the main thread; not fatal.
  }

  let bytes: ArrayBuffer;
  try {
    bytes = await file.arrayBuffer();
  } catch {
    return { backend: 'pdf-text', status: 'failed', pages: [], text: '', partial: false, note: 'The file could not be read.' };
  }

  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise;
    const pages: ExtractedPage[] = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      pages.push(await extractPage(doc, n));
    }
    const text = joinPages(pages);
    const readable = pages.filter((p) => p.status === 'extracted').length;
    if (readable === 0) {
      return {
        backend: 'pdf-text',
        status: 'unreadable',
        pages,
        text: '',
        partial: false,
        pageCount: doc.numPages,
        note: 'This PDF has no readable text layer (it may be a scan). Try uploading it as an image for OCR.',
      };
    }
    return {
      backend: 'pdf-text',
      status: 'extracted',
      pages,
      text,
      partial: readable < doc.numPages,
      pageCount: doc.numPages,
      note: readable < doc.numPages ? `${doc.numPages - readable} of ${doc.numPages} pages had no readable text.` : undefined,
    };
  } catch {
    return {
      backend: 'pdf-text',
      status: 'failed',
      pages: [],
      text: '',
      partial: false,
      note: 'This PDF could not be opened (it may be encrypted or corrupt).',
    };
  }
}

/** Read one page's text items, preserving line structure where possible. */
async function extractPage(doc: import('pdfjs-dist').PDFDocumentProxy, pageNumber: number): Promise<ExtractedPage> {
  try {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const chunks: string[] = [];
    let lastY: number | null = null;
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = 'transform' in item ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 2) chunks.push('\n');
      chunks.push(item.str);
      if (y !== null) lastY = y;
    }
    const text = chunks.join('').replace(/[ \t]+/g, ' ').trim();
    if (!text) {
      return { pageNumber, status: 'unreadable', text: '', note: 'No text on this page (likely an image/scan).' };
    }
    return { pageNumber, status: 'extracted', text };
  } catch {
    return { pageNumber, status: 'failed', text: '', note: 'This page could not be read.' };
  }
}
