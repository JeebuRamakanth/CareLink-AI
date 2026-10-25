/**
 * CareLink-AI — browser OCR extraction (tesseract.js).
 *
 * Reads text from photographed/scanned medical documents entirely on-device.
 * Used for images and for PDFs whose text layer is empty (scans).
 *
 * PRIVACY: tesseract.js runs the recognition locally in a WebAssembly worker.
 * The image bytes are never uploaded. Only the language data/wasm runtime is
 * fetched (from a CDN), which is not patient data.
 *
 * HONESTY: OCR is imperfect. Every page carries the engine's own confidence,
 * and pages that produce no usable text are reported as 'unreadable' rather
 * than being filled with guessed content. A low-confidence read is surfaced so
 * the UI can ask for a clearer photo.
 */

import { joinPages, type DocumentExtraction, type ExtractedPage } from './types';

/** Below this mean confidence the read is treated as unreliable. */
export const OCR_LOW_CONFIDENCE = 55;

/** Longest edge (px) the image is downscaled to before recognition. */
const MAX_EDGE_PX = 2200;

/** Whether OCR can run at all in this environment. */
export function isOcrAvailable(): boolean {
  return typeof window !== 'undefined' && typeof document !== 'undefined' && typeof Worker !== 'undefined';
}

/** Extract text from an image (or a rendered PDF page bitmap) using OCR. */
export async function extractImageText(file: Blob, pageNumber = 1): Promise<DocumentExtraction> {
  if (!isOcrAvailable()) {
    return {
      backend: 'none',
      status: 'unavailable',
      pages: [],
      text: '',
      partial: false,
      note: 'On-device text recognition is not available in this environment.',
      unavailableBackends: ['ocr'],
    };
  }

  let createWorker: typeof import('tesseract.js')['createWorker'];
  try {
    ({ createWorker } = await import('tesseract.js'));
  } catch {
    return {
      backend: 'none',
      status: 'unavailable',
      pages: [],
      text: '',
      partial: false,
      note: 'The text-recognition engine could not be loaded. You can still review the file and consult a clinician.',
      unavailableBackends: ['ocr'],
    };
  }

  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  try {
    const prepared = await prepareImageForOcr(file);
    worker = await createWorker('eng');
    const result = await worker.recognize(prepared);
    const text = (result.data.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const confidence = typeof result.data.confidence === 'number' ? result.data.confidence : undefined;

    if (text.replace(/\s/g, '').length < 8) {
      return {
        backend: 'ocr',
        status: 'unreadable',
        pages: [{ pageNumber, status: 'unreadable', text: '', confidence, note: 'No legible text was found in this image.' }],
        text: '',
        partial: false,
        note: 'No legible text was found. Try a sharper, well-lit photo that fills the frame.',
      };
    }

    const page: ExtractedPage = { pageNumber, status: 'extracted', text, confidence };
    if (confidence !== undefined && confidence < OCR_LOW_CONFIDENCE) {
      page.note = 'This text was read with low confidence — please check it against the original.';
    }
    return {
      backend: 'ocr',
      status: 'extracted',
      pages: [page],
      text: joinPages([page]),
      partial: false,
      note: page.note,
    };
  } catch {
    return {
      backend: 'ocr',
      status: 'failed',
      pages: [],
      text: '',
      partial: false,
      note: 'Text recognition failed for this image. Please retry, or consult a clinician to read it.',
    };
  } finally {
    try {
      await worker?.terminate();
    } catch {
      // Terminating a failed worker is best-effort.
    }
  }
}

/**
 * Downscale + grayscale the image on a canvas so OCR is faster and more
 * accurate on phone photos. Falls back to the original blob if the canvas is
 * unavailable (e.g. non-browser test environment).
 */
async function prepareImageForOcr(file: Blob): Promise<Blob | string> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE_PX / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const image = ctx.getImageData(0, 0, width, height);
    const data = image.data;
    // Grayscale with a mild contrast stretch improves text/background separation.
    let min = 255;
    let max = 0;
    for (let i = 0; i < data.length; i += 4) {
      const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = data[i + 1] = data[i + 2] = lum;
      if (lum < min) min = lum;
      if (lum > max) max = lum;
    }
    const range = Math.max(1, max - min);
    for (let i = 0; i < data.length; i += 4) {
      const stretched = ((data[i] - min) / range) * 255;
      data[i] = data[i + 1] = data[i + 2] = stretched;
    }
    ctx.putImageData(image, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    return blob ?? file;
  } catch {
    return file;
  }
}
