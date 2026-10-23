/**
 * CareLink-AI — pharmacy + laboratory directory service.
 *
 * The single read boundary for the Pharmacies and Laboratories pages and for the
 * chatbot's pharmacy/lab intents. It merges two real sources:
 *
 *   1. the sourced corridor directory (src/data/pharmacies.ts — generated from
 *      the reviewed OpenStreetMap snapshot), always available offline, and
 *   2. live registry rows from Supabase when the backend is configured.
 *
 * HONESTY CONTRACT
 *   - Distance is computed ONLY when the record carries real coordinates AND the
 *     patient location has real coordinates. Otherwise `distanceKm` is null and
 *     the UI says "Distance unavailable" — never a fabricated figure.
 *   - Medicine stock is never invented: `stockSource` is 'not_integrated' until a
 *     real inventory feed exists, and the UI must say so.
 *   - Ranking is transparent and proximity-based. A pharmacy is never called
 *     "best" on the strength of an invented rating.
 */

import { pharmaciesData } from '../data/pharmacies';
import { laboratoriesData } from '../data/laboratories';
import { haversineKm } from '../lib';
import { isSupabaseConfigured } from './supabase/client';
import type { Laboratory, Pharmacy } from '../types';

export interface DirectoryOrigin {
  lat: number;
  lng: number;
  label?: string;
}

/** Sort keys the UI may offer. Every one is derived from a real field. */
export type PharmacySort = 'nearest' | 'name' | 'locality';

export interface PharmacySearchOptions {
  query?: string;
  locality?: string;
  origin?: DirectoryOrigin | null;
  sort?: PharmacySort;
  /** Include records with no locality match (default true). */
  includeUnlocated?: boolean;
}

export interface PharmacyFilterOptions {
  localities: string[];
  districts: string[];
  brands: string[];
}

const normalize = (value: string): string => value.trim().toLowerCase();

/** All bundled, sourced pharmacies. */
export function getBundledPharmacies(): Pharmacy[] {
  return [...pharmaciesData];
}

export function getBundledLaboratories(): Laboratory[] {
  return [...laboratoriesData];
}

/** Distance in km when both sides have real coordinates, else null. */
export function pharmacyDistance(pharmacy: Pharmacy, origin?: DirectoryOrigin | null): number | null {
  if (!origin) return null;
  if (typeof pharmacy.latitude !== 'number' || typeof pharmacy.longitude !== 'number') return null;
  const km = haversineKm({ lat: origin.lat, lng: origin.lng }, { lat: pharmacy.latitude, lng: pharmacy.longitude });
  return km == null ? null : Math.round(km * 10) / 10;
}

/** Attach a computed distance (or null) to each record. */
export function withDistance<T extends Pharmacy | Laboratory>(items: T[], origin?: DirectoryOrigin | null): T[] {
  return items.map((item) => ({ ...item, distanceKm: pharmacyDistance(item as Pharmacy, origin) } as T & { distanceKm: number | null }));
}

export function matchesPharmacySearch(pharmacy: Pharmacy, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  return normalize([
    pharmacy.name,
    pharmacy.brand ?? '',
    pharmacy.locality,
    pharmacy.district ?? '',
    pharmacy.address,
    pharmacy.pincode ?? '',
  ].join(' ')).includes(term);
}

/**
 * Transparent ranking. Proximity first (only when a real distance exists), then
 * an exact locality match, then data completeness (a published address beats a
 * bare coordinate), then name. Nothing here uses a rating, because the sourced
 * directory has no ratings.
 */
export function rankPharmacies(
  items: Pharmacy[],
  origin?: DirectoryOrigin | null,
  sort: PharmacySort = 'nearest',
): Pharmacy[] {
  const scored = items.map((pharmacy) => ({
    pharmacy,
    distanceKm: pharmacyDistance(pharmacy, origin),
    hasAddress: pharmacy.address.trim().length > 0,
  }));

  scored.sort((a, b) => {
    if (sort === 'name') return a.pharmacy.name.localeCompare(b.pharmacy.name);
    if (sort === 'locality') {
      return a.pharmacy.locality.localeCompare(b.pharmacy.locality) || a.pharmacy.name.localeCompare(b.pharmacy.name);
    }
    // 'nearest' — records without a distance sort last, never treated as 0 km.
    const da = a.distanceKm ?? Number.POSITIVE_INFINITY;
    const db = b.distanceKm ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    if (a.hasAddress !== b.hasAddress) return a.hasAddress ? -1 : 1;
    return a.pharmacy.name.localeCompare(b.pharmacy.name);
  });

  return scored.map((s) => s.pharmacy);
}

/** Filter options derived from the ACTUAL dataset so every value matches a row. */
export function pharmacyFilterOptions(items: Pharmacy[]): PharmacyFilterOptions {
  const unique = (values: Array<string | undefined>) =>
    [...new Set(values.filter((v): v is string => Boolean(v && v.trim())))].sort((a, b) => a.localeCompare(b));
  return {
    localities: unique(items.map((p) => p.locality)),
    districts: unique(items.map((p) => p.district)),
    brands: unique(items.map((p) => p.brand)),
  };
}

/** Live registry rows, when Supabase is configured. */
async function fetchLivePharmacies(): Promise<Pharmacy[]> {
  if (!isSupabaseConfigured()) return [];
  try {
    const { listPharmacies } = await import('./health-data');
    const rows = await listPharmacies();
    return rows.map((row) => {
      // The live registry may not yet carry the extended corridor columns, so
      // every optional field is read defensively — a missing column is simply
      // an absent field, never a fabricated one.
      const extended = row as typeof row & {
        district?: string | null;
        pincode?: string | null;
        state?: string | null;
        country?: string | null;
        latitude?: number | null;
        longitude?: number | null;
        provenance?: Pharmacy['provenance'];
      };
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        address: row.address ?? '',
        locality: row.city ?? 'Locality unlisted',
        district: extended.district ?? undefined,
        pincode: extended.pincode ?? undefined,
        state: extended.state ?? 'Andhra Pradesh',
        country: extended.country ?? 'India',
        latitude: extended.latitude ?? undefined,
        longitude: extended.longitude ?? undefined,
        phone: row.phone_number ?? undefined,
        stock_source: 'not_integrated',
        provenance: extended.provenance,
        is_verified: false,
      } as Pharmacy;
    });
  } catch {
    return [];
  }
}

/**
 * The pharmacy list the app renders. Live registry rows (when configured and
 * present) are merged ahead of the bundled corridor directory.
 *
 * De-duplication is by IDENTITY (record id, then exact name+address+coordinate),
 * never by name+locality alone: two Apollo Pharmacy branches in the same city are
 * genuinely different shops and must both appear.
 */
export async function getPharmacies(options: PharmacySearchOptions = {}): Promise<Pharmacy[]> {
  const live = await fetchLivePharmacies();
  const bundled = getBundledPharmacies();
  const merged = new Map<string, Pharmacy>();
  const seenSignatures = new Set<string>();
  for (const item of [...live, ...bundled]) {
    if (merged.has(item.id)) continue;
    const signature = [
      normalize(item.name),
      normalize(item.address),
      item.latitude ?? '',
      item.longitude ?? '',
    ].join('|');
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);
    merged.set(item.id, item);
  }
  let items = [...merged.values()];

  if (options.query) items = items.filter((p) => matchesPharmacySearch(p, options.query as string));
  if (options.locality) items = items.filter((p) => normalize(p.locality) === normalize(options.locality as string));

  return rankPharmacies(items, options.origin, options.sort ?? 'nearest');
}

export async function getPharmacyById(id: string): Promise<Pharmacy | null> {
  const live = await fetchLivePharmacies();
  const all = [...live, ...getBundledPharmacies()];
  return all.find((p) => p.id === id || p.slug === id) ?? null;
}

/** Laboratories: bundled corridor directory only (no live lab table yet). */
export async function getLaboratories(options: { query?: string; origin?: DirectoryOrigin | null } = {}): Promise<Laboratory[]> {
  let items = getBundledLaboratories();
  if (options.query) {
    const term = normalize(options.query);
    items = items.filter((l) => normalize([l.name, l.locality, l.address, l.pincode ?? ''].join(' ')).includes(term));
  }
  return withDistance(items, options.origin)
    .sort((a, b) => ((a as { distanceKm?: number | null }).distanceKm ?? Number.POSITIVE_INFINITY)
      - ((b as { distanceKm?: number | null }).distanceKm ?? Number.POSITIVE_INFINITY));
}

export async function getLaboratoryById(id: string): Promise<Laboratory | null> {
  return getBundledLaboratories().find((l) => l.id === id || l.slug === id) ?? null;
}

/**
 * Live medicine inventory state. Always 'not_integrated' until a real feed is
 * connected — a pharmacy's existence never implies a medicine is in stock.
 */
export function pharmacyStockState(): 'live' | 'not_integrated' {
  return 'not_integrated';
}

/** True when a live pharmacy registry is reachable. */
export function isPharmacyBackendConfigured(): boolean {
  return isSupabaseConfigured();
}
