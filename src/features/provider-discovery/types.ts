export type DiscoveryDataStatus = 'REAL' | 'MOCK' | 'FALLBACK' | 'UNAVAILABLE' | 'PENDING_VERIFICATION';

export interface DiscoveryProviderBase {
  id: string;
  slug: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  rating: number | null;
  dataStatus: DiscoveryDataStatus | null;
  source: string | null;
  isOpen: boolean | null;
  distanceKm: number | null;
  fetchedAt: string | null;
}

export interface PharmacyDiscovery extends DiscoveryProviderBase {
  kind: 'pharmacy';
  hoursLabel: string | null;
  medicines: string[];
  hasInventory: boolean;
}

export interface LabDiscovery extends DiscoveryProviderBase {
  kind: 'lab';
  tests: string[];
  homeCollection: boolean | null;
}

export type ProviderDiscoveryKind = 'pharmacy' | 'lab';