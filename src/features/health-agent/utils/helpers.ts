/**
 * Shared helpers for the health-agent feature.
 */

import type { AgentLanguage, HealthDocument, HealthDocumentKind } from '../types';

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export const ACCEPTED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const ACCEPT_ATTR = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export function detectDocumentKind(file: File): HealthDocumentKind {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.includes('word') || /\.(docx?)$/i.test(file.name)) return 'document';
  if (/\.pdf$/i.test(file.name)) return 'pdf';
  return 'unknown';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const PIPELINE_STEPS: { status: HealthDocument['status']; progress: number }[] = [
  { status: 'uploading', progress: 18 },
  { status: 'reading', progress: 38 },
  { status: 'extracting', progress: 58 },
  { status: 'organizing', progress: 76 },
  { status: 'preparing', progress: 90 },
  { status: 'ready', progress: 100 },
];

export const documentPipelineSteps = PIPELINE_STEPS;

export const statusLabel: Record<HealthDocument['status'], string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  reading: 'Reading document',
  extracting: 'Extracting medical information',
  organizing: 'Organizing findings',
  preparing: 'Preparing explanation',
  ready: 'Analysis ready',
  error: 'Failed',
};

export const kindLabel: Record<HealthDocumentKind, string> = {
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  camera: 'Camera scan',
  unknown: 'File',
};

export const LANGUAGE_LABELS: Record<AgentLanguage, string> = {
  en: 'English',
  te: 'Telugu',
  hi: 'Hindi',
};

export const QUICK_PROMPTS: { label: string; lang: AgentLanguage }[] = [
  { label: 'Naaku fever and severe headache undi', lang: 'te' },
  { label: 'Find cardiologists near me', lang: 'en' },
  { label: 'Show hospitals treating diabetes', lang: 'en' },
  { label: 'Ee tablet enti?', lang: 'te' },
  { label: 'Explain this blood report', lang: 'en' },
  { label: 'Find a pharmacy near me', lang: 'en' },
  { label: 'Book a doctor', lang: 'en' },
  { label: 'What should I do next?', lang: 'en' },
];
