/**
 * useGeolocation (Step 9 §5).
 *
 * Production-ready browser geolocation with explicit permission/error states and
 * a manual-location fallback. Never crashes when geolocation is unavailable.
 *
 * States: idle → prompting → granted | denied | unsupported | timeout | error.
 * When permission is denied or unsupported, the consumer can offer a manual
 * address/coords fallback (the hook accepts `setManualLocation`).
 */

import { useCallback, useState } from 'react';
import { haversineKm } from '../lib';
import type { Coordinates } from '../lib';

export type GeoStatus = 'idle' | 'prompting' | 'granted' | 'denied' | 'unsupported' | 'timeout' | 'error';

export interface GeoState {
  status: GeoStatus;
  coords: Coordinates | null;
  label: string | null;
  error: string | null;
}

export interface UseGeolocation extends GeoState {
  request: () => Promise<void>;
  setManualLocation: (label: string, coords?: Coordinates) => void;
  clear: () => void;
  distanceTo: (target: Coordinates) => number | null;
}

const supportsGeo = (): boolean =>
  typeof navigator !== 'undefined' && typeof navigator.geolocation?.getCurrentPosition === 'function';

export function useGeolocation(): UseGeolocation {
  const [state, setState] = useState<GeoState>({
    status: 'idle',
    coords: null,
    label: null,
    error: null,
  });

  const request = useCallback(async () => {
    if (!supportsGeo()) {
      setState({ status: 'unsupported', coords: null, label: null, error: 'Geolocation is not supported on this device.' });
      return;
    }
    setState((s) => ({ ...s, status: 'prompting', error: null }));

    await new Promise<void>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setState({
            status: 'granted',
            coords: { lat: pos.coords.latitude, lng: pos.coords.longitude },
            label: 'Current location',
            error: null,
          });
          resolve();
        },
        (err) => {
          let status: GeoStatus = 'error';
          let message = 'We could not access your location.';
          if (err.code === err.PERMISSION_DENIED) {
            status = 'denied';
            message = 'Location permission denied. You can enter your location manually.';
          } else if (err.code === err.TIMEOUT) {
            status = 'timeout';
            message = 'Location request timed out. Try again or enter your location manually.';
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            status = 'error';
            message = 'Your location is unavailable right now.';
          }
          setState({ status, coords: null, label: null, error: message });
          resolve();
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 },
      );
    });
  }, []);

  const setManualLocation = useCallback((label: string, coords?: Coordinates) => {
    setState({
      status: 'granted',
      coords: coords ?? null,
      label,
      error: null,
    });
  }, []);

  const clear = useCallback(() => {
    setState({ status: 'idle', coords: null, label: null, error: null });
  }, []);

  const distanceTo = useCallback(
    (target: Coordinates): number | null => (state.coords ? haversineKm(state.coords, target) : null),
    [state.coords],
  );

  return { ...state, request, setManualLocation, clear, distanceTo };
}
