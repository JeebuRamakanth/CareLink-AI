/**
 * CareLink-AI — notifications repository (Step 10.5 §13/§22).
 *
 * Recipient-scoped reads + read-marking. Dispatch runs only in the
 * notification-dispatcher Edge Function (cron + service role, server-side).
 * Null/empty when Supabase is unavailable.
 */

import { withClient } from './repository';
import type { NotificationRow, NotificationStatus } from './types';

export async function listNotifications(options?: {
  status?: NotificationStatus[];
  limit?: number;
}): Promise<NotificationRow[]> {
  const { data } = await withClient(async (client) => {
    let q = client
      .from('notifications')
      .select('*')
      .order('scheduled_for', { ascending: false })
      .limit(options?.limit ?? 50);
    if (options?.status?.length) q = q.in('status', options.status);
    const res = await q;
    if (res.error) throw res.error;
    return (res.data as NotificationRow[]) ?? [];
  });
  return data ?? [];
}

export async function listUnreadNotifications(): Promise<NotificationRow[]> {
  return listNotifications({ status: ['sent'] });
}

export async function markNotificationRead(id: string): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.from('notifications').update({ status: 'read' }).eq('id', id).select('id');
    if (res.error) throw res.error;
    return (res.data?.length ?? 0) > 0;
  });
  return data ?? false;
}
