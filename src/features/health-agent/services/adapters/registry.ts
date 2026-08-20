/**
 * Provider registry (Step 9).
 *
 * The single place where REAL vs MOCK vs FALLBACK resolution happens. The
 * orchestrator and UI import `adapters` (the resolved registry) and never know
 * which path produced the data — they only see the normalized types + the
 * `source` flag the adapters carry.
 *
 * Resolution per provider:
 *   - env configured  → use the real boundary adapter (falls back to mock on error)
 *   - env unconfigured → use the mock adapter (transparent to the UI)
 *
 * Search adapters are wrapped with `runWithFallback` so a real-provider failure
 * degrades gracefully to mock + a truth-tagged source, never a crash.
 */

import { runWithFallback } from '../../../../lib';
import { env } from '../../../../config';
import type { AgentAdapters, HospitalSearchAdapter, LaboratorySearchAdapter, PharmacySearchAdapter } from './interfaces';
import {
  mockAdapters,
  mockDirectionsProvider,
  mockGeocodingProvider,
  mockMapsProvider,
  mockStorageProvider,
} from './mockAdapters';
import {
  realCloudinaryStorage,
  realDirectionsProvider,
  realDocumentAnalysis,
  realGeocodingProvider,
  realHospitalSearch,
  realLabSearch,
  realMapsProvider,
  realMedicineRecognition,
  realPharmacySearch,
} from './realAdapters';
import type { DocumentAnalysisAdapter, MedicineRecognitionAdapter } from './interfaces';

/* ----------------------------------------------------------------------------
 * Fallback-wrapped search adapters: real first, mock on failure, truth-tagged.
 * ------------------------------------------------------------------------- */

const hospitalSearch: HospitalSearchAdapter = {
  async search(query, context) {
    const result = await runWithFallback({
      provider: 'hospital-search',
      configured: env.search.hospital.configured,
      real: () => realHospitalSearch.search(query, context),
      mock: () => mockAdapters.hospitals.search(query, context),
    });
    return result.data;
  },
  async bySpecialty(specialty) {
    const result = await runWithFallback({
      provider: 'hospital-search',
      configured: env.search.hospital.configured,
      real: () => realHospitalSearch.bySpecialty(specialty),
      mock: () => mockAdapters.hospitals.bySpecialty(specialty),
    });
    return result.data;
  },
};

const pharmacySearch: PharmacySearchAdapter = {
  async search(medicineName, context) {
    const result = await runWithFallback({
      provider: 'pharmacy-search',
      configured: env.search.pharmacy.configured,
      real: () => realPharmacySearch.search(medicineName, context),
      mock: () => mockAdapters.pharmacies.search(medicineName, context),
    });
    return result.data;
  },
};

const labSearch: LaboratorySearchAdapter = {
  async search(query, context) {
    const result = await runWithFallback({
      provider: 'lab-search',
      configured: env.search.lab.configured,
      real: () => realLabSearch.search(query, context),
      mock: () => mockAdapters.labs.search(query, context),
    });
    return result.data;
  },
};

/* ----------------------------------------------------------------------------
 * Document analysis + medicine recognition (Step 13): real server-adapter
 * endpoints when configured, schema-validated, mock fallback on any failure.
 * ------------------------------------------------------------------------- */

const documentAnalysis: DocumentAnalysisAdapter = {
  async analyze(document) {
    const result = await runWithFallback({
      provider: 'document-analysis',
      configured: env.documents.configured,
      real: () => realDocumentAnalysis.analyze(document),
      mock: () => mockAdapters.documents.analyze(document),
    });
    return result.data;
  },
};

const medicineRecognition: MedicineRecognitionAdapter = {
  async recognize(input) {
    const result = await runWithFallback({
      provider: 'medicine-recognition',
      configured: env.medicine.configured,
      real: () => realMedicineRecognition.recognize(input),
      mock: () => mockAdapters.medicines.recognize(input),
    });
    return result.data;
  },
};

/* ----------------------------------------------------------------------------
 * Resolved registry. Mock-only providers (AI classify, recovery, emergency,
 * appointments, mapsRouting) keep their mock impls; the search + maps/storage/
 * directions/geocoding/documents/medicines providers are switched by env
 * availability. The structured AI engine (services/ai) resolves its own
 * REAL/MOCK/UNAVAILABLE mode via the secure gateway.
 * ------------------------------------------------------------------------- */

export const adapters: AgentAdapters = {
  ...mockAdapters,
  hospitals: hospitalSearch,
  pharmacies: pharmacySearch,
  labs: labSearch,
  documents: documentAnalysis,
  medicines: medicineRecognition,
  mapsProvider: env.maps.configured ? realMapsProvider : mockMapsProvider,
  directions: env.maps.configured ? realDirectionsProvider : mockDirectionsProvider,
  geocoding: env.maps.configured ? realGeocodingProvider : mockGeocodingProvider,
  storage: env.cloudinary.configured ? realCloudinaryStorage : mockStorageProvider,
};

/**
 * Whether the current run is using ANY real provider. Drives the global
 * "demo mode" badge — when false, the whole result is mock/demo data.
 */
export function isAnyProviderReal(): boolean {
  return (
    env.ai.configured ||
    env.supabase.configured ||
    env.cloudinary.configured ||
    env.maps.configured ||
    env.search.hospital.configured ||
    env.search.pharmacy.configured ||
    env.search.lab.configured ||
    env.documents.configured ||
    env.medicine.configured
  );
}

export { mockAdapters };
