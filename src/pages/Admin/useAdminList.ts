/**
 * CareLink-AI — shared admin list loading hook.
 *
 * Drives the admin RPC-backed tables with honest loading/empty/error/retry
 * states. The data is always the server-authorized row set; nothing local is
 * ever invented when the backend is unavailable (callers render honest states).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { AdminResult } from '../../services/health-data/adminRepository';
import { isSupabaseConfigured } from '../../services/supabase/client';

interface UseAdminListOptions<T> {
  load: () => Promise<AdminResult<T[]>>;
  deps?: unknown[];
}

export function useAdminList<T>({ load, deps = [] }: UseAdminListOptions<T>) {
  const [data, setData] = useState<T[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadToken, setReloadToken] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await load();
    if (!mounted.current) return;
    if (res.error) {
      setData(null);
      setError(res.error);
    } else {
      setData(res.data);
    }
    setLoading(false);
  }, [load]);

  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadToken, ...deps]);

  const retry = useCallback(() => setReloadToken((t) => t + 1), []);

  const readiness = isSupabaseConfigured();

  return { data, error, loading, retry, readiness };
}