/**
 * CareLink-AI  Step 1 14: Browser-side image optimization pipeline.
 *
 * Decode  resize  re-encode  validate final byte size before upload. The
 * goal is aggressive-but-honest optimization: thumbnails/profile images target
 * 10 KB where technically/visually reasonable, never claiming a size that
 * wasn't actually measured. Medical documents get a gentler document-specific
 * pass (quality floor + max dimension) so legibility is preserved. If
 * decoding fails or the browser lacks canvas support, the original file is
 * returned untouched so uploads never silently die.
 */

export interface ImageOptimizeOptions {
  maxDimension?: number;
  quality?: number;
  targetKind?: 'avatar' | 'document' | 'provider' | 'any';
  mimeType?: string;
}

export interface ImageOptimizeResult {
  file: File;
  width: number | null;
  height: number | null;
  byteSize: number;
  optimized: boolean;
  skippedReason?: string;
}

const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const AVATAR_MAX = 512;
const AVATAR_QUALITY = 0.72;
const PROVIDER_MAX = 1280;
const PROVIDER_QUALITY = 0.78;
const DOCUMENT_MAX = 1600;
const DOCUMENT_QUALITY = 0.85;

function createCanvas(width: number, height: number): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function decodeImage(file: File): Promise<{ image: HTMLImageElement; width: number; height: number } | null> {
  if (typeof Image === 'undefined') return null;
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('decode-failed'));
      image.src = url;
    });
    return { image, width: image.naturalWidth, height: image.naturalHeight };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

function targetSize(opts: ImageOptimizeOptions): { max: number; quality: number; type: string } {
  const kind = opts.targetKind ?? 'any';
  if (kind === 'avatar') return { max: AVATAR_MAX, quality: AVATAR_QUALITY, type: 'image/webp' };
  if (kind === 'provider') return { max: PROVIDER_MAX, quality: PROVIDER_QUALITY, type: 'image/webp' };
  if (kind === 'document') return { max: DOCUMENT_MAX, quality: DOCUMENT_QUALITY, type: 'image/jpeg' };
  return { max: 1600, quality: 0.82, type: 'image/webp' };
}

/**
 * Optimize an image file for upload. Returns the re-encoded file when
 * decoding succeeded and the result is smaller; otherwise the original file
 * unchanged (skippedReason explains why) so non-images/PDFs pass through.
 */
export async function optimizeImageForUpload(
  file: File,
  opts: ImageOptimizeOptions = {},
): Promise<ImageOptimizeResult> {
  const byteSize = file.size;
  if (byteSize > MAX_IMAGE_BYTES) {
    return { file, width: null, height: null, byteSize, optimized: false, skippedReason: 'too-large' };
  }
  if (!file.type.startsWith('image/') || file.type === 'image/gif') {
    return { file, width: null, height: null, byteSize, optimized: false, skippedReason: 'not-raster-image' };
  }
  const decoded = await decodeImage(file);
  if (!decoded) {
    return { file, width: null, height: null, byteSize, optimized: false, skippedReason: 'decode-failed' };
  }
  const { max, quality, type } = targetSize(opts);
  const scale = Math.min(1, max / Math.max(decoded.width, decoded.height));
  const width = Math.max(1, Math.round(decoded.width * scale));
  const height = Math.max(1, Math.round(decoded.height * scale));
  const canvas = createCanvas(width, height);
  if (!canvas) {
    return { file, width: decoded.width, height: decoded.height, byteSize, optimized: false, skippedReason: 'canvas-unavailable' };
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return { file, width: decoded.width, height: decoded.height, byteSize, optimized: false, skippedReason: 'canvas-unavailable' };
  }
  ctx.drawImage(decoded.image, 0, 0, width, height);
  const blob = await toBlob(canvas, type, quality);
  if (!blob || blob.size >= byteSize) {
    // Re-encode didn't help  keep the original bytes (never inflate)
    return { file, width: decoded.width, height: decoded.height, byteSize, optimized: false, skippedReason: 'no-size-gain' };
  }
	 const optimizedFile = new File([blob], file.name.replace(/\.(jpe?g|png|webp)$/i, '.webp'), { type: blob.type || type });
	 return { file: optimizedFile, width, height, byteSize: blob.size, optimized: true };
}