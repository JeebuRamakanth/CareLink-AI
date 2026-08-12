/**
 * Storage service (Cloudinary) boundary (Step 9 §10).
 *
 * Delegates to the health-agent StorageProvider contract so the UI stays
 * provider-independent. When Cloudinary credentials are absent, the mock/local
 * adapter returns a local blob URL — the app keeps working in demo mode.
 *
 * Cloudinary privileged credentials (API secret/signature) are NEVER used
 * client-side; only the browser-safe unsigned-upload preset is.
 */

import type { StorageProvider, StorageUploadResult } from '../../features/health-agent/services/adapters/interfaces';
import { realCloudinaryStorage } from '../../features/health-agent/services/adapters/realAdapters';
import { mockStorageProvider } from '../../features/health-agent/services/adapters/mockAdapters';
import { env } from '../../config';

export type { StorageUploadResult };

export function getStorageProvider(): StorageProvider {
  return env.cloudinary.configured ? realCloudinaryStorage : mockStorageProvider;
}

/** Whether a real storage backend is configured (drives demo-data badge). */
export function isRealStorageConfigured(): boolean {
  return env.cloudinary.configured;
}

export { realCloudinaryStorage, mockStorageProvider };
