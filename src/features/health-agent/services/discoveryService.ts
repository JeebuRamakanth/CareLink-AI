/**
 * Location-aware healthcare discovery service (Step 12).
 *
 * Provider-independent overlay that recomputes distance/ETA for hospitals,
 * doctors, pharmacies, and labs from the patient's runtime location using
 * great-circle distance. It does NOT replace the adapter search — it enriches
 * the adapter results with location-aware distance/ETA and provenance metadata.
 *
 * When no patient location is available, results keep their dataset distances
 * (clearly mock) and provenance is tagged accordingly. Distance/ETA are only
 * ever reported from a real computation — never fabricated.
 *
 * SECURITY: only coordinates flow through this layer. No patient health context
 * is sent anywhere; this is pure local math.
 */

import { estimateDriveMinutes, haversineKm } from '../../../lib';
import type {
  DoctorRecommendation,
  HospitalRecommendation,
  LabRecommendation,
  PharmacyRecommendation,
  RouteRecommendation,
} from '../types';
import {
  hospitalCoordinates,
  labCoordinates,
  pharmacyCoordinates,
} from '../data/mockData';

export interface PatientPoint {
  lat: number;
  lng: number;
  label?: string;
}

export type DiscoveryProvenance = {
  /** Where the distance/ETA came from. */
  distanceSource: 'patient-location' | 'dataset' | 'unavailable';
  /** Whether the underlying data is mock. */
  isMock: boolean;
  /** Provider that produced the candidates. */
  provider: string;
  fetchedAt: string;
};

const nowIso = () => new Date().toISOString();

function recomputeRoute(
  existing: RouteRecommendation | undefined,
  destinationName: string,
  destinationAddress: string,
  deepLink: RouteRecommendation['deepLink'],
  patient: PatientPoint | null,
  facilityCoords: { lat: number; lng: number } | undefined,
  datasetDistance: number,
  datasetEta: number
): { route: RouteRecommendation; distanceKm: number; eta: number; distanceSource: 'patient-location' | 'dataset' } {
  if (patient && facilityCoords) {
    const km = haversineKm(patient, facilityCoords);
    if (km != null) {
      const eta = estimateDriveMinutes(km) ?? datasetEta;
      return {
        route: { destinationName, destinationAddress, distanceKm: round1(km), estimatedTravelTimeMin: eta, transportMode: 'driving', deepLink },
        distanceKm: round1(km),
        eta,
        distanceSource: 'patient-location',
      };
    }
  }
  return {
    route: existing ?? { destinationName, destinationAddress, distanceKm: datasetDistance, estimatedTravelTimeMin: datasetEta, transportMode: 'driving', deepLink },
    distanceKm: datasetDistance,
    eta: datasetEta,
    distanceSource: 'dataset',
  };
}

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Enrich hospital results with location-aware distance/ETA. */
export function localizeHospitals(
  hospitals: HospitalRecommendation[],
  patient: PatientPoint | null,
  isMock: boolean,
  provider = 'CareLink hospital network'
): { results: HospitalRecommendation[]; provenance: DiscoveryProvenance } {
  const results = hospitals.map((h) => {
    const coords = hospitalCoordinates[h.detailSlug];
    const { route, distanceKm, eta } = recomputeRoute(
      h.route,
      h.name,
      `${h.address}, ${h.city}`,
      { kind: 'hospital', id: h.detailSlug },
      patient,
      coords,
      h.distanceKm,
      h.estimatedTravelTimeMin
    );
    return { ...h, distanceKm, estimatedTravelTimeMin: eta, route };
  });
  return {
    results,
    provenance: {
      distanceSource: patient ? 'patient-location' : 'dataset',
      isMock,
      provider,
      fetchedAt: nowIso(),
    },
  };
}

/** Enrich doctor results with location-aware distance/ETA (via hospital coords). */
export function localizeDoctors(
  doctors: DoctorRecommendation[],
  patient: PatientPoint | null,
  isMock: boolean,
  provider = 'CareLink doctor network'
): { results: DoctorRecommendation[]; provenance: DiscoveryProvenance } {
  const results = doctors.map((d) => {
    const coords = d.hospitalDetailSlug ? hospitalCoordinates[d.hospitalDetailSlug] : undefined;
    const destName = d.hospitalName;
    const destAddr = d.route?.destinationAddress ?? d.hospitalName;
    const { route } = recomputeRoute(
      d.route,
      destName,
      destAddr,
      { kind: 'doctor', id: d.detailSlug },
      patient,
      coords,
      d.route?.distanceKm ?? 5,
      d.route?.estimatedTravelTimeMin ?? 15
    );
    return { ...d, route };
  });
  return {
    results,
    provenance: {
      distanceSource: patient ? 'patient-location' : 'dataset',
      isMock,
      provider,
      fetchedAt: nowIso(),
    },
  };
}

/** Enrich pharmacy results with location-aware distance/ETA. */
export function localizePharmacies(
  pharmacies: PharmacyRecommendation[],
  patient: PatientPoint | null,
  isMock: boolean,
  provider = 'CareLink pharmacy network'
): { results: PharmacyRecommendation[]; provenance: DiscoveryProvenance } {
  const results = pharmacies.map((p) => {
    const coords = pharmacyCoordinates[p.id];
    const { route, distanceKm, eta } = recomputeRoute(
      p.route,
      p.name,
      p.address,
      undefined,
      patient,
      coords,
      p.distanceKm,
      p.estimatedTravelTimeMin
    );
    return { ...p, distanceKm, estimatedTravelTimeMin: eta, route };
  });
  return {
    results,
    provenance: {
      distanceSource: patient ? 'patient-location' : 'dataset',
      isMock,
      provider,
      fetchedAt: nowIso(),
    },
  };
}

/** Enrich lab results with location-aware distance/ETA. */
export function localizeLabs(
  labs: LabRecommendation[],
  patient: PatientPoint | null,
  isMock: boolean,
  provider = 'CareLink lab network'
): { results: LabRecommendation[]; provenance: DiscoveryProvenance } {
  const results = labs.map((l) => {
    const coords = labCoordinates[l.id];
    const { route, distanceKm, eta } = recomputeRoute(
      l.route,
      l.name,
      l.address,
      undefined,
      patient,
      coords,
      l.distanceKm,
      l.estimatedTravelTimeMin
    );
    return { ...l, distanceKm, estimatedTravelTimeMin: eta, route };
  });
  return {
    results,
    provenance: {
      distanceSource: patient ? 'patient-location' : 'dataset',
      isMock,
      provider,
      fetchedAt: nowIso(),
    },
  };
}

/** Build a Google Maps directions deep-link from the patient to a destination. */
export function buildDirectionsDeepLink(
  destination: { label: string; lat?: number; lng?: number },
  patient: PatientPoint | null,
  mode: RouteRecommendation['transportMode'] = 'driving'
): string {
  const dest = destination.lat != null && destination.lng != null
    ? `${destination.lat},${destination.lng}`
    : encodeURIComponent(destination.label);
  const base = `https://www.google.com/maps/dir/?api=1&destination=${dest}&travelmode=${mode}`;
  if (patient) {
    return `${base}&origin=${patient.lat},${patient.lng}`;
  }
  return base;
}
