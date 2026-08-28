/**
 * Real-provider boundary adapters (Step 9).
 *
 * These adapters talk to real services ONLY when the corresponding env var is
 * configured. They never embed secret credentials client-side — they call the
 * browser-safe base URL and rely on a server adapter (or the provider's public
 * endpoint) for anything requiring a secret. If a call fails or the provider is
 * unconfigured, the provider registry falls back to mock (see registry.ts).
 *
 * Each `real*` adapter returns normalized CareLink types; vendor shapes never
 * leak out. Response normalization is defensive: malformed/missing fields are
 * defaulted rather than thrown.
 */

import { getJson, postJson } from '../../../../lib';
import { buildMapsDirectionsUrl, buildMapsPlaceUrl } from '../../../../lib';
import {
  asArray,
  asBoolean,
  asNumber,
  asString,
  asStringArray,
  pickBoolean,
  pickNumber,
  pickString,
} from '../../../../lib';
import { env } from '../../../../config';
import type {
  HospitalRecommendation,
  RouteRecommendation,
} from '../../types';
import type {
  DirectionsProvider,
  DocumentAnalysisAdapter,
  GeocodingProvider,
  HospitalSearchAdapter,
  LaboratorySearchAdapter,
  MapsProvider,
  MedicineRecognitionAdapter,
  PharmacySearchAdapter,
  StorageProvider,
  StorageUploadResult,
} from './interfaces';
import {
  validateDocumentAnalysisPayload,
  validateMedicinePayload,
} from '../ai/aiSchemas';

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/* ----------------------------------------------------------------------------
 * Hospital search — boundary over VITE_HOSPITAL_SEARCH_BASE_URL
 * ------------------------------------------------------------------------- */

interface RemoteHospital {
  id?: string;
  detailSlug?: string;
  slug?: string;
  name?: string;
  rating?: number;
  reviewCount?: number;
  specialties?: unknown;
  distanceKm?: number;
  estimatedTravelTimeMin?: number;
  isOpen?: boolean;
  hasEmergency?: boolean;
  address?: string;
  city?: string;
}

function normalizeHospital(r: RemoteHospital): HospitalRecommendation {
  const detailSlug = asString(r.detailSlug || r.slug);

  return {
    id: asString(r.id, detailSlug),
    detailSlug,
    name: asString(r.name),
    rating: asNumber(r.rating),
    reviewCount: asNumber(r.reviewCount),
    specialties: asStringArray(r.specialties),
    distanceKm: asNumber(r.distanceKm),
    estimatedTravelTimeMin: asNumber(r.estimatedTravelTimeMin),
    isOpen: asBoolean(r.isOpen),
    hasEmergency: asBoolean(r.hasEmergency),
    address: asString(r.address),
    city: asString(r.city),
  };
}

export const realHospitalSearch: HospitalSearchAdapter = {
  async search(query) {
    const data = await getJson<RemoteHospital[]>(
      `${env.search.hospital.baseUrl}/search?q=${encodeURIComponent(query)}`,
    );

    return asArray<RemoteHospital>(data).map(normalizeHospital);
  },

  async bySpecialty(specialty) {
    const data = await getJson<RemoteHospital[]>(
      `${env.search.hospital.baseUrl}/specialty/${encodeURIComponent(specialty)}`,
    );

    return asArray<RemoteHospital>(data).map(normalizeHospital);
  },
};

/* ----------------------------------------------------------------------------
 * Pharmacy search
 * ------------------------------------------------------------------------- */

interface RemotePharmacy {
  id?: string;
  name?: string;
  medicineName?: string;
  distanceKm?: number;
  estimatedTravelTimeMin?: number;
  isOpen?: boolean;
  availabilityPlaceholder?: string;
  estimatedPrice?: string;
  address?: string;
}

export const realPharmacySearch: PharmacySearchAdapter = {
  async search(medicineName) {
    const data = await getJson<RemotePharmacy[]>(
      `${env.search.pharmacy.baseUrl}/search?medicine=${encodeURIComponent(
        medicineName,
      )}`,
    );

    return asArray<RemotePharmacy>(data).map((r: RemotePharmacy) => ({
      id: asString(r.id),
      name: asString(r.name),
      medicineName: asString(r.medicineName),
      distanceKm: asNumber(r.distanceKm),
      estimatedTravelTimeMin: asNumber(r.estimatedTravelTimeMin),
      isOpen: asBoolean(r.isOpen),
      availabilityPlaceholder: asString(
        r.availabilityPlaceholder,
        'Stock confirmation available on request',
      ),
      estimatedPrice: asString(r.estimatedPrice),
      address: asString(r.address),
    }));
  },
};

/* ----------------------------------------------------------------------------
 * Lab search
 * ------------------------------------------------------------------------- */

interface RemoteLab {
  id?: string;
  name?: string;
  testsOffered?: unknown;
  distanceKm?: number;
  estimatedTravelTimeMin?: number;
  isOpen?: boolean;
  homeCollectionAvailable?: boolean;
  address?: string;
}

export const realLabSearch: LaboratorySearchAdapter = {
  async search(query) {
    const data = await getJson<RemoteLab[]>(
      `${env.search.lab.baseUrl}/search?q=${encodeURIComponent(query)}`,
    );

    return asArray<RemoteLab>(data).map((r: RemoteLab) => ({
      id: asString(r.id),
      name: asString(r.name),
      testsOffered: asStringArray(r.testsOffered),
      distanceKm: asNumber(r.distanceKm),
      estimatedTravelTimeMin: asNumber(r.estimatedTravelTimeMin),
      isOpen: asBoolean(r.isOpen),
      homeCollectionAvailable: asBoolean(r.homeCollectionAvailable),
      address: asString(r.address),
    }));
  },
};

/* ----------------------------------------------------------------------------
 * Maps provider — builds public directions/place URLs (no key required)
 * ------------------------------------------------------------------------- */

export const realMapsProvider: MapsProvider = {
  name: 'Maps',
  directionsUrl: (params) => buildMapsDirectionsUrl(params),
  placeUrl: (query) => buildMapsPlaceUrl(query),
};

/* ----------------------------------------------------------------------------
 * Directions + geocoding — Geoapify
 *
 * Geoapify is used for live routing and geocoding.
 *
 * Routing:
 *   https://api.geoapify.com/v1/routing
 *
 * Geocoding:
 *   https://api.geoapify.com/v1/geocode/search
 *
 * Reverse geocoding:
 *   https://api.geoapify.com/v1/geocode/reverse
 *
 * CareLink-AI normalizes Geoapify distance (meters) and time (seconds)
 * into kilometers and minutes.
 * ------------------------------------------------------------------------- */

interface GeoapifyRouteResponse {
  results?: Array<{
    distance?: number;
    distance_units?: string;
    time?: number;
    legs?: Array<{
      distance?: number;
      time?: number;
    }>;
  }>;
}

interface GeoapifyGeocodeResponse {
  results?: Array<{
    lat?: number;
    lon?: number;
    formatted?: string;
    address_line1?: string;
    address_line2?: string;
    city?: string;
    state?: string;
    country?: string;
  }>;
}

export const realDirectionsProvider: DirectionsProvider = {
  available: env.maps.configured,

  async route(origin, destination): Promise<RouteRecommendation | null> {
    if (!env.maps.configured) {
      return null;
    }

    if (
      typeof origin.lat !== 'number' ||
      !Number.isFinite(origin.lat) ||
      typeof origin.lng !== 'number' ||
      !Number.isFinite(origin.lng) ||
      typeof destination.lat !== 'number' ||
      !Number.isFinite(destination.lat) ||
      typeof destination.lng !== 'number' ||
      !Number.isFinite(destination.lng)
    ) {
      return null;
    }

    const waypoints =
      `${origin.lat},${origin.lng}|${destination.lat},${destination.lng}`;

    const url =
      `https://api.geoapify.com/v1/routing` +
      `?waypoints=${encodeURIComponent(waypoints)}` +
      `&mode=drive` +
      `&format=json` +
      `&apiKey=${encodeURIComponent(env.maps.geoapifyApiKey)}`;

    try {
      const data = await getJson<GeoapifyRouteResponse>(url);
      const route = data?.results?.[0];

      if (
        !route ||
        typeof route.distance !== 'number' ||
        !Number.isFinite(route.distance) ||
        typeof route.time !== 'number' ||
        !Number.isFinite(route.time)
      ) {
        return null;
      }

      return {
        destinationName: asString(destination.label, 'Destination'),
        destinationAddress: asString(destination.label),
        distanceKm: route.distance / 1000,
        estimatedTravelTimeMin: route.time / 60,
        transportMode: 'driving',
      };
    } catch {
      return null;
    }
  },
};

export const realGeocodingProvider: GeocodingProvider = {
  available: env.maps.configured,

  async geocode(address: string) {
    if (!env.maps.configured || !address.trim()) {
      return null;
    }

    const url =
      `https://api.geoapify.com/v1/geocode/search` +
      `?text=${encodeURIComponent(address)}` +
      `&lang=en` +
      `&limit=1` +
      `&format=json` +
      `&apiKey=${encodeURIComponent(env.maps.geoapifyApiKey)}`;

    try {
      const data = await getJson<GeoapifyGeocodeResponse>(url);
      const result = data?.results?.[0];

      if (
        !result ||
        typeof result.lat !== 'number' ||
        !Number.isFinite(result.lat) ||
        typeof result.lon !== 'number' ||
        !Number.isFinite(result.lon)
      ) {
        return null;
      }

      return {
        lat: result.lat,
        lng: result.lon,
        label:
          result.formatted ||
          [result.address_line1, result.address_line2]
            .filter(Boolean)
            .join(', ') ||
          address,
      };
    } catch {
      return null;
    }
  },

  async reverseGeocode(coords: { lat: number; lng: number }) {
    if (!env.maps.configured) {
      return null;
    }

    if (
      !Number.isFinite(coords.lat) ||
      !Number.isFinite(coords.lng)
    ) {
      return null;
    }

    const url =
      `https://api.geoapify.com/v1/geocode/reverse` +
      `?lat=${encodeURIComponent(String(coords.lat))}` +
      `&lon=${encodeURIComponent(String(coords.lng))}` +
      `&limit=1` +
      `&format=json` +
      `&apiKey=${encodeURIComponent(env.maps.geoapifyApiKey)}`;

    try {
      const data = await getJson<GeoapifyGeocodeResponse>(url);
      const result = data?.results?.[0];

      if (!result) {
        return null;
      }

      return (
        result.formatted ||
        [
          result.address_line1,
          result.address_line2,
          result.city,
          result.state,
          result.country,
        ]
          .filter(Boolean)
          .join(', ') ||
        null
      );
    } catch {
      return null;
    }
  },
};

/* ----------------------------------------------------------------------------
 * Storage — Cloudinary unsigned upload boundary (browser-safe).
 * Uses cloud name + unsigned upload preset only (no API secret in the browser).
 * ------------------------------------------------------------------------- */

export const realCloudinaryStorage: StorageProvider = {
  name: 'Cloudinary',
  available: env.cloudinary.configured,

  async upload(file, options) {
    if (!env.cloudinary.configured) {
      throw new Error('Cloudinary not configured');
    }

    const form = new FormData();
    form.append('file', file);
    form.append('upload_preset', env.cloudinary.unsignedUploadPreset);

    if (options?.folder) {
      form.append('folder', options.folder);
    }

    const url = `https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/auto/upload`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);

    if (options?.signal) {
      if (options.signal.aborted) {
        controller.abort();
      } else {
        options.signal.addEventListener(
          'abort',
          () => controller.abort(),
          { once: true },
        );
      }
    }

    try {
      const res = await fetch(url, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(`upload status ${res.status}`);
      }

      const json = (await res.json()) as Record<string, unknown>;

      const publicUrl = pickString(json, 'secure_url', 'url');
      const previewUrl = pickString(json, 'url');

      const providerMetadata: Record<string, string> = {};

      const publicId = pickString(json, 'public_id');
      const format = pickString(json, 'format');
      const version = pickNumber(json, 'version');

      if (publicId) {
        providerMetadata.publicId = publicId;
      }

      if (format) {
        providerMetadata.format = format;
      }

      if (version) {
        providerMetadata.version = String(version);
      }

      const result: StorageUploadResult = {
        url: publicUrl,
        previewUrl: previewUrl || undefined,
        providerMetadata,
        source: 'real',
      };

      return result;
    } finally {
      clearTimeout(timer);
    }
  },
};

/* ----------------------------------------------------------------------------
 * AI provider boundary — calls the configured AI provider base URL.
 * A real LLM/intent backend replaces the mock heuristic when configured. The
 * server adapter (behind the same base URL) holds any secret token; the browser
 * only sends the public endpoint + the user input.
 * ------------------------------------------------------------------------- */

export interface RemoteIntent {
  intent?: string;
  confidence?: string;
  entities?: unknown;
}

export async function classifyWithRealAI(
  text: string,
): Promise<RemoteIntent | null> {
  if (!env.ai.configured) {
    return null;
  }

  try {
    const data = await getJson<RemoteIntent>(
      `${env.ai.providerBaseUrl}/classify?q=${encodeURIComponent(text)}`,
    );

    return data ?? null;
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * Document analysis boundary — calls the configured document-analysis base URL.
 * The OCR/NLP secret stays server-side; the browser only POSTs the file to the
 * server adapter.
 * ------------------------------------------------------------------------- */

export async function analyzeDocumentRemotely(
  file: File,
  documentId: string,
): Promise<{
  category: string;
  extractedTextPlaceholder: string;
  keyFindings: string[];
  isMock: false;
} | null> {
  if (!env.documents.configured) {
    return null;
  }

  try {
    const form = new FormData();
    form.append('file', file);
    form.append('documentId', documentId);

    const res = await fetch(`${env.documents.baseUrl}/analyze`, {
      method: 'POST',
      body: form,
    });

    if (!res.ok) {
      return null;
    }

    const json = (await res.json()) as Record<string, unknown>;

    const findings = asArray<unknown>(json.keyFindings)
      .map((v: unknown) => asString(v))
      .filter((v: string) => v.length > 0);

    return {
      category: asString(
        pickString(json, 'category'),
        'general-document',
      ),
      extractedTextPlaceholder: asString(
        pickString(json, 'extractedText'),
      ),
      keyFindings: findings,
      isMock: false,
    };
  } catch {
    return null;
  }
}

/* ----------------------------------------------------------------------------
 * Real document-analysis adapter (Step 13 §7/§8) — schema-validated responses
 * with extraction provenance. The OCR/NLP secret stays server-side; the
 * browser sends document metadata to the server adapter endpoint.
 * ------------------------------------------------------------------------- */

export const realDocumentAnalysis: DocumentAnalysisAdapter = {
  async analyze(document) {
    if (!env.documents.configured) {
      throw new Error('document analysis not configured');
    }

    const raw = await postJson<unknown>(
      `${env.documents.baseUrl}/analyze-ref`,
      {
        documentId: document.id,
        fileName: document.fileName,
        mime: document.mime,
        kind: document.kind,
      },
    );

    const validated = validateDocumentAnalysisPayload(
      raw,
      document.id,
    );

    if (!validated) {
      throw new Error('malformed document analysis response');
    }

    return validated;
  },
};

/* ----------------------------------------------------------------------------
 * Real medicine-recognition adapter (Step 13 §9) — validated payloads, no
 * invented dosage, low-confidence results marked uncertain.
 * ------------------------------------------------------------------------- */

export const realMedicineRecognition: MedicineRecognitionAdapter = {
  async recognize(input) {
    if (!env.medicine.configured) {
      throw new Error('medicine intelligence not configured');
    }

    const raw = await postJson<unknown>(
      `${env.medicine.baseUrl}/recognize`,
      {
        text: input.text?.slice(0, 200),
        documentId: input.documentId,
      },
    );

    return validateMedicinePayload(raw);
  },
};

export {
  wait,
  normalizeHospital,
  pickBoolean,
  pickNumber,
  pickString,
};

export type { RouteRecommendation };