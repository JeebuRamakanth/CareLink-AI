/**
 * Maps service (Step 9 §5).
 *
 * Thin facade over the health-agent MapsProvider / DirectionsProvider /
 * GeocodingProvider contracts so the rest of the app imports a single maps
 * service and stays provider-independent.
 *
 * Distance/ETA are reported ONLY when a real provider returns them. When the
 * provider is unavailable, directions/ETA helpers return null and the UI shows
 * "Distance unavailable" rather than invented numbers.
 */

import type {
  DirectionsProvider,
  GeocodingProvider,
  MapsProvider,
} from '../../features/health-agent/services/adapters/interfaces';
import type { RouteRecommendation, TransportMode } from '../../features/health-agent/types';
import { realDirectionsProvider, realGeocodingProvider, realMapsProvider } from '../../features/health-agent/services/adapters/realAdapters';
import {
  mockDirectionsProvider,
  mockGeocodingProvider,
  mockMapsProvider,
} from '../../features/health-agent/services/adapters/mockAdapters';
import { env } from '../../config';

export function getMapsProvider(): MapsProvider {
  return env.maps.configured ? realMapsProvider : mockMapsProvider;
}

export function getDirectionsProvider(): DirectionsProvider {
  return env.maps.configured ? realDirectionsProvider : mockDirectionsProvider;
}

export function getGeocodingProvider(): GeocodingProvider {
  return env.maps.configured ? realGeocodingProvider : mockGeocodingProvider;
}

export function isMapsConfigured(): boolean {
  return env.maps.configured;
}

/** Convenience: build a directions deep-link URL for an action. */
export function directionsUrl(params: { destination: string; origin?: { label: string; lat?: number; lng?: number }; mode?: TransportMode }): string {
  return getMapsProvider().directionsUrl(params);
}

/** Convenience: build a place-search deep-link URL. */
export function placeUrl(query: string): string {
  return getMapsProvider().placeUrl(query);
}

export type { RouteRecommendation, TransportMode };
