export const HOSPITAL_IMAGE_FALLBACK = '/images/hospital-image-fallback.svg';

export function hospitalImageSource(imageUrl?: string): string {
  return imageUrl || HOSPITAL_IMAGE_FALLBACK;
}
