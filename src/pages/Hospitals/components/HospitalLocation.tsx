import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

import { Button } from '../../../components/ui/Button';
import type { HospitalDetail } from '../data/hospitalDetailsData';
import { getGeocodingProvider } from '../../../services/maps/mapsService';

type HospitalLocationProps = {
  hospital: HospitalDetail;
  onGetDirections: () => void;
};

type MapState = 'loading' | 'ready' | 'unavailable';

export function HospitalLocation({
  hospital,
  onGetDirections,
}: HospitalLocationProps) {
  const shouldReduceMotion = useReducedMotion();

  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [mapState, setMapState] = useState<MapState>('loading');

  useEffect(() => {
    let cancelled = false;
    let marker: maplibregl.Marker | null = null;

    const loadMap = async () => {
      setMapState('loading');

      const provider = getGeocodingProvider();

      if (!provider.available) {
        if (!cancelled) {
          setMapState('unavailable');
        }
        return;
      }

      const address = `${hospital.name}, ${hospital.address}, ${hospital.location}`;

      const coordinates = await provider.geocode(address);

      if (cancelled) return;

      if (!coordinates || !mapContainerRef.current) {
        setMapState('unavailable');
        return;
      }

      const map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: 'https://tiles.openfreemap.org/styles/liberty',
        center: [coordinates.lng, coordinates.lat],
        zoom: 14,
      });

      map.addControl(
        new maplibregl.NavigationControl({
          showCompass: true,
          showZoom: true,
          visualizePitch: true,
        }),
        'top-right',
      );

      marker = new maplibregl.Marker({ color: '#ef4444' })
        .setLngLat([coordinates.lng, coordinates.lat])
        .setPopup(
          new maplibregl.Popup({ offset: 24 }).setHTML(
            `<strong>${hospital.name}</strong><br />${coordinates.label}`,
          ),
        )
        .addTo(map);

      mapRef.current = map;

      map.once('load', () => {
        if (!cancelled) {
          setMapState('ready');
        }
      });
    };

    void loadMap();

    return () => {
      cancelled = true;
      marker?.remove();

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [hospital.name, hospital.address, hospital.location]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: shouldReduceMotion ? 0 : 0.5,
        ease: 'easeOut',
      }}
      className="rounded-[2rem] border border-white/10 bg-slate-950/75 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.18)]"
    >
      <div className="space-y-5">
        <div>
          <p className="text-sm uppercase tracking-[0.3em] text-brand-200">
            Location
          </p>

          <h2 className="mt-4 text-2xl font-semibold text-white">
            Hospital address and route guidance
          </h2>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.95fr_0.65fr]">
          <div className="space-y-4 rounded-[1.75rem] border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm text-ink-300">
              {hospital.address}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                <p className="text-ink-400">Location</p>
                <p className="mt-2 text-white">
                  {hospital.location}
                </p>
              </div>

              <div className="rounded-[1.5rem] border border-white/10 bg-slate-950/80 p-4 text-sm text-ink-300">
                <p className="text-ink-400">Distance</p>
                <p className="mt-2 text-white">
                  {hospital.distanceKm.toFixed(1)} km
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="primary"
              onClick={onGetDirections}
            >
              Get Directions
            </Button>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-white/10 bg-slate-950/80 p-3">
            <div className="relative h-80 overflow-hidden rounded-[1.5rem] border border-white/10 bg-slate-900">
              {mapState !== 'ready' && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/85 p-5 text-center">
                  <div>
                    <p className="text-sm uppercase tracking-[0.3em] text-brand-200">
                      {mapState === 'loading'
                        ? 'Loading map'
                        : 'Map unavailable'}
                    </p>

                    <p className="mt-3 max-w-xs text-sm leading-6 text-ink-300">
                      {mapState === 'loading'
                        ? 'Resolving the hospital location…'
                        : 'The hospital location could not be resolved right now.'}
                    </p>
                  </div>
                </div>
              )}

              <div
                ref={mapContainerRef}
                className="h-full w-full"
                aria-label={`Map showing ${hospital.name}`}
              />
            </div>

            <div className="mt-3 flex items-center justify-between px-1">
              <p className="text-xs text-ink-400">
                OpenFreeMap · OpenStreetMap data
              </p>

              <p className="text-xs text-ink-400">
                {mapState === 'ready'
                  ? 'Live map'
                  : 'Location service'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}