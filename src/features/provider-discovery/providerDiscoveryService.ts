import { listLabs, listPharmacies } from '../../services/health-data';
import { directionsUrl } from '../../services/maps';
import type { PharmacyRow, LabRow } from '../../services/health-data/types';
import type { LabDiscovery, PharmacyDiscovery, ProviderDiscoveryKind } from './types';

const REAL_STATUSES = ['REAL', 'MOCK', 'FALLBACK', 'UNAVAILABLE', 'PENDING_VERIFICATION'];

function toStatus(value: string | null | undefined): LabDiscovery['dataStatus'] {
  if (!value) return null;
  if (REAL_STATUSES.includes(value)) {
    return value as LabDiscovery['dataStatus'];
  }
  return null;
}

function withDistance<T extends { distanceKm: number | null }>(items: T[]): T[] {
  return items.sort((left, right) =>
    (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY),
  );
}

function fromPharmacy(row: PharmacyRow): PharmacyDiscovery {
  const partial = row as PharmacyRow & { data_status?: string; data_source?: string; fetched_at?: string };
  return {
    kind: 'pharmacy',
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address ?? null,
    city: row.city ?? null,
    phone: row.phone_number ?? null,
    rating: row.rating ?? null,
    dataStatus: toStatus(partial.data_status),
    source: partial.data_source ?? null,
    isOpen: null,
    distanceKm: null,
    fetchedAt: partial.fetched_at ?? null,
    hoursLabel: null,
    medicines: [],
    hasInventory: false,
  };
}

function fromLab(row: LabRow): LabDiscovery {
  const partial = row as LabRow & { data_status?: string; data_source?: string; fetched_at?: string };
  return {
    kind: 'lab',
    id: row.id,
    slug: row.slug,
    name: row.name,
    address: row.address ?? null,
    city: row.city ?? null,
    phone: row.phone_number ?? null,
    rating: row.rating ?? null,
    dataStatus: toStatus(partial.data_status),
    source: partial.data_source ?? null,
    isOpen: null,
    distanceKm: null,
    fetchedAt: partial.fetched_at ?? null,
    tests: [],
    homeCollection: null,
  };
}

export async function getProviderDiscovery(kind: ProviderDiscoveryKind): Promise<(PharmacyDiscovery | LabDiscovery)[]> {
  const items = kind === 'pharmacy'
    ? (await listPharmacies()).map(fromPharmacy)
    : (await listLabs()).map(fromLab);

  return withDistance(items as (PharmacyDiscovery | LabDiscovery)[]);
}

export function providerDirections(_kind: ProviderDiscoveryKind, provider: LabDiscovery | PharmacyDiscovery): string {
  const destination = provider.address?.trim() || (provider.name + ' ' + (provider.city ?? '')).trim();
  return directionsUrl({ destination });
}