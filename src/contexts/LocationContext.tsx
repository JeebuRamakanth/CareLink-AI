/**
 * LocationContext (Step 12).
 *
 * Runtime patient location for location-aware healthcare discovery. Supports
 * browser geolocation (one-shot, never continuous tracking), manual fallback
 * (city/address/postal code), and explicit permission states.
 *
 * PRIVACY:
 * - No continuous tracking (getCurrentPosition, not watchPosition).
 * - No persistence of precise live coordinates — location lives in memory only
 *   and is cleared on unmount/logout. A manually-entered location is kept in
 *   sessionStorage as a convenience preference (city-scale, not GPS).
 * - Coordinates are never placed in URLs or logs (see lib/security).
 * - Emergency location is handled separately and never auto-shared with a
 *   third party without an explicit user action.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { haversineKm } from '../lib';

export type LocationPermissionState = 'unknown' | 'prompt' | 'granted' | 'denied' | 'unavailable';

export interface PatientLocation {
  /** Human label, e.g. "Hyderabad · 500032" or "Current location". */
  label: string;
  lat?: number;
  lng?: number;
  /** Whether this came from browser GPS vs manual entry. */
  source: 'geolocation' | 'manual' | 'default';
}

export interface LocationContextValue {
  location: PatientLocation | null;
  permission: LocationPermissionState;
  isResolving: boolean;
  error: string | null;
  /** Request browser geolocation (one-shot). Prompts the user. */
  requestCurrentLocation: () => void;
  /** Set a manual location (city/address/postal code). */
  setManualLocation: (label: string, coords?: { lat: number; lng: number }) => void;
  /** Clear the active location. */
  clearLocation: () => void;
  /** Great-circle distance from the active location to a point, or null. */
  distanceTo: (lat: number, lng: number) => number | null;
}

const LocationContext = createContext<LocationContextValue | undefined>(undefined);

const MANUAL_STORAGE_KEY = 'carelink_ai_location_manual';

/** A sensible default location label so the UI is never empty (no coordinates). */
const DEFAULT_LOCATION: PatientLocation = { label: 'Hyderabad · 500032', source: 'default' };

function readManualPreference(): PatientLocation | null {
  try {
    const raw = sessionStorage.getItem(MANUAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PatientLocation;
    if (parsed && typeof parsed.label === 'string') return parsed;
  } catch {
    /* ignore malformed */
  }
  return null;
}

function writeManualPreference(loc: PatientLocation | null): void {
  try {
    if (loc) sessionStorage.setItem(MANUAL_STORAGE_KEY, JSON.stringify(loc));
    else sessionStorage.removeItem(MANUAL_STORAGE_KEY);
  } catch {
    /* storage may be unavailable */
  }
}

export function LocationProvider({ children }: { children: ReactNode }) {
  const [location, setLocation] = useState<PatientLocation | null>(() => readManualPreference() ?? DEFAULT_LOCATION);
  const [permission, setPermission] = useState<LocationPermissionState>('unknown');
  const [isResolving, setIsResolving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeRequest = useRef<number | null>(null);

  // Probe the permission state without prompting (where the API supports it).
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('permissions' in navigator)) return;
    let cancelled = false;
    navigator.permissions
      .query({ name: 'geolocation' as PermissionName })
      .then((status) => {
        if (cancelled) return;
        const map: Record<PermissionState, LocationPermissionState> = {
          granted: 'granted',
          denied: 'denied',
          prompt: 'prompt',
        };
        setPermission(map[status.state] ?? 'unknown');
        status.onchange = () => setPermission(map[status.state] ?? 'unknown');
      })
      .catch(() => {
        /* permissions API unsupported — leave as 'unknown' */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const requestCurrentLocation = useCallback(() => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      setPermission('unavailable');
      setError('Geolocation is not available on this device.');
      return;
    }
    setIsResolving(true);
    setError(null);
    setPermission('prompt');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        activeRequest.current = null;
        setIsResolving(false);
        setPermission('granted');
        // Coarse label — no reverse-geocoding call here to avoid sending
        // coordinates to a third party without an explicit action.
        setLocation({ label: 'Current location', lat: pos.coords.latitude, lng: pos.coords.longitude, source: 'geolocation' });
      },
      (err) => {
        activeRequest.current = null;
        setIsResolving(false);
        if (err.code === err.PERMISSION_DENIED) {
          setPermission('denied');
          setError('Location permission denied. Enter your location manually to find nearby care.');
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setPermission('unavailable');
          setError('Your location could not be determined. Enter it manually.');
        } else {
          setPermission('unavailable');
          setError('Location request timed out. Try again or enter your location manually.');
        }
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  }, []);

  const setManualLocation = useCallback((label: string, coords?: { lat: number; lng: number }) => {
    const next: PatientLocation = { label: label.trim() || 'Manual location', ...coords, source: 'manual' };
    setLocation(next);
    writeManualPreference(next);
    setError(null);
    setPermission((p) => (p === 'granted' ? p : 'unknown'));
  }, []);

  const clearLocation = useCallback(() => {
    setLocation(DEFAULT_LOCATION);
    writeManualPreference(null);
    setError(null);
  }, []);

  const distanceTo = useCallback(
    (lat: number, lng: number): number | null => {
      if (location?.lat == null || location?.lng == null) return null;
      return haversineKm({ lat: location.lat, lng: location.lng }, { lat, lng });
    },
    [location]
  );

  const value = useMemo<LocationContextValue>(
    () => ({ location, permission, isResolving, error, requestCurrentLocation, setManualLocation, clearLocation, distanceTo }),
    [location, permission, isResolving, error, requestCurrentLocation, setManualLocation, clearLocation, distanceTo]
  );

  return <LocationContext.Provider value={value}>{children}</LocationContext.Provider>;
}

export function useLocationContext(): LocationContextValue {
  const ctx = useContext(LocationContext);
  if (!ctx) {
    throw new Error('useLocationContext must be used within a LocationProvider');
  }
  return ctx;
}

/** Optional hook that returns the location context (or null) without throwing. */
export function useOptionalLocationContext(): LocationContextValue | null {
  return useContext(LocationContext) ?? null;
}
