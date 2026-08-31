import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProviderDiscovery } from '../providerDiscoveryService';
import type { LabDiscovery, PharmacyDiscovery, ProviderDiscoveryKind } from '../types';

export function useProviderDiscovery(kind: ProviderDiscoveryKind) {
  const [items, setItems] = useState<(PharmacyDiscovery | LabDiscovery)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getProviderDiscovery(kind);
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load provider data.');
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    return items.filter((item) => {
      const fields = [item.name, item.city ?? '', item.address?.trim() ?? ''];
      if (item.kind === 'pharmacy') {
        fields.push(...(item as PharmacyDiscovery).medicines ?? []);
      } else {
        fields.push(...(item as LabDiscovery).tests ?? []);
      }
      const queryText = fields.join(' ').toLowerCase();
      const matchesSearch = !normalizedSearch || queryText.includes(normalizedSearch);
      return matchesSearch;
    });
  }, [items, searchTerm]);

  return {
    items: filtered,
    loading,
    error,
    searchTerm,
    setSearchTerm,
    refresh: load,
  };
}