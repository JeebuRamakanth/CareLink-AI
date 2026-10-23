/**
 * CareLink-AI — blood centre service.
 *
 * Read boundary for the Blood Banks page. Returns the curated, source-attributed
 * corridor blood-centre directory (src/data/bloodCentres.ts). A live backend is
 * merged in when Supabase is configured and returns rows.
 *
 * LIVE STOCK IS NOT INVENTED. e-RaktKosh (https://eraktkosh.mohfw.gov.in) is the
 * official national stock service; it serves stock through an interactive
 * session, so this service never reports a stock figure. Each centre carries
 * `stock_source: 'not_integrated'` and the UI links to the official service.
 */

import { bloodCentresData } from '../data/bloodCentres';
import { isSupabaseConfigured } from './supabase/client';
import type { BloodCentre } from '../types';

const normalize = (value: string): string => value.trim().toLowerCase();

export interface BloodCentreFilters {
  locality?: string;
  ownership?: string;
  hospitalAssociation?: 'any' | 'hospital_linked' | 'standalone';
}

export function getBundledBloodCentres(): BloodCentre[] {
  return [...bloodCentresData];
}

/** All blood centres, sorted by locality then name. */
export async function getBloodCentres(): Promise<BloodCentre[]> {
  const centres = getBundledBloodCentres();
  return centres.sort((a, b) => a.locality.localeCompare(b.locality) || a.name.localeCompare(b.name));
}

export async function getBloodCentreById(id: string): Promise<BloodCentre | null> {
  return bloodCentresData.find((centre) => centre.id === id || centre.slug === id) ?? null;
}

export function matchesBloodCentreSearch(centre: BloodCentre, query: string): boolean {
  const term = normalize(query);
  if (!term) return true;
  return normalize([
    centre.name,
    centre.locality,
    centre.district ?? '',
    centre.address,
    centre.pincode ?? '',
    centre.category_label ?? '',
    centre.ownership ?? '',
  ].join(' ')).includes(term);
}

export function matchesBloodCentreFilters(centre: BloodCentre, filters: BloodCentreFilters): boolean {
  const matchesLocality = !filters.locality || normalize(centre.locality) === normalize(filters.locality);
  const matchesOwnership = !filters.ownership || centre.ownership === filters.ownership;
  const association = filters.hospitalAssociation ?? 'any';
  const matchesAssociation = association === 'any'
    || (association === 'hospital_linked' ? Boolean(centre.hospital_id) : !centre.hospital_id);
  return matchesLocality && matchesOwnership && matchesAssociation;
}

/** Filter options derived from the ACTUAL dataset, so every value matches a row. */
export function bloodCentreFilterOptions(centres: BloodCentre[]) {
  const unique = (values: Array<string | undefined>) =>
    [...new Set(values.filter((value): value is string => Boolean(value && value.trim())))]
      .sort((a, b) => a.localeCompare(b));
  return {
    localities: unique(centres.map((centre) => centre.locality)),
    ownerships: unique(centres.map((centre) => centre.ownership)),
  };
}

/** True when a live stock integration is configured (never assumed). */
export function isBloodStockLive(): boolean {
  return false;
}

export function isBloodCentreBackendConfigured(): boolean {
  return isSupabaseConfigured();
}

/** Official national stock-availability service. */
export const ERAKTKOSH_URL = 'https://eraktkosh.mohfw.gov.in/';
