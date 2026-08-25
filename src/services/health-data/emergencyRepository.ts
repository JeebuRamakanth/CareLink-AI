/**
 * CareLink-AI — emergency / SOS workflow repository (Step 10.5 §14/§22).
 *
 * Step 10 emergency_events stays the patient-owned incident record; the 0015
 * workflow tables around it are mutated ONLY through guarded DB functions
 * (RPC) — there is no client-side transition path. Reads are owner-scoped
 * (patient) or membership-scoped (facility inbox) by RLS. Null/empty on
 * Supabase outage; never logs PHI.
 */

import { withClient, generateId } from './repository';
import type {
  AmbulanceRequestRow,
  AmbulanceStatus,
  AmbulanceStatusRow,
  EmergencyEventHistoryRow,
  HospitalEmergencyNotificationRow,
} from './types';

/* ------------------------------ patient side ------------------------------ */

/** One-time location fix for the caller's own emergency event (RLS-checked). */
export async function recordEmergencyLocation(
  emergencyEventId: string,
  position: { latitude: number; longitude: number; accuracyMeters?: number | null }
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const { data: authData } = await client.auth.getUser();
    const userId = authData.user?.id;
    if (!userId) throw new Error('unauthorized');
    const res = await client.from('emergency_locations').insert({
      id: generateId(),
      emergency_event_id: emergencyEventId,
      owner_id: userId,
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy_meters: position.accuracyMeters ?? null,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

/** Patient: notify a hospital about their own SOS (guarded function). */
export async function notifyHospitalForEmergency(
  emergencyEventId: string,
  hospitalId: string
): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_notify_hospital_for_emergency', {
      emergency_event_uuid: emergencyEventId,
      hospital_uuid: hospitalId,
    });
    if (res.error) throw res.error;
    return (res.data as string | null) ?? null;
  });
  return data;
}

/** Patient: read own SOS workflow state (notifications, ambulance, history). */
export async function listMyEmergencyNotifications(
  emergencyEventId: string
): Promise<HospitalEmergencyNotificationRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('hospital_emergency_notifications')
      .select('*')
      .eq('emergency_event_id', emergencyEventId)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as HospitalEmergencyNotificationRow[]) ?? [];
  });
  return data ?? [];
}

export async function listMyAmbulanceRequests(emergencyEventId: string): Promise<AmbulanceRequestRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('ambulance_requests')
      .select('*')
      .eq('emergency_event_id', emergencyEventId)
      .order('requested_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as AmbulanceRequestRow[]) ?? [];
  });
  return data ?? [];
}

export async function listMyAmbulanceStatus(emergencyEventId: string): Promise<AmbulanceStatusRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('ambulance_status')
      .select('*, ambulance_requests!inner(emergency_event_id)')
      .eq('ambulance_requests.emergency_event_id', emergencyEventId)
      .order('recorded_at', { ascending: false });
    if (res.error) throw res.error;
    return ((res.data as unknown as AmbulanceStatusRow[]) ?? []);
  });
  return data ?? [];
}

export async function listMyEmergencyHistory(emergencyEventId: string): Promise<EmergencyEventHistoryRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('emergency_event_history')
      .select('*')
      .eq('emergency_event_id', emergencyEventId)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as EmergencyEventHistoryRow[]) ?? [];
  });
  return data ?? [];
}

/* ---------------------------- facility (member) side ---------------------------- */

/** Facility inbox: notifications addressed to a hospital the caller administers (RLS). */
export async function listFacilityEmergencyInbox(
  hospitalId: string
): Promise<HospitalEmergencyNotificationRow[]> {
  const { data } = await withClient(async (client) => {
    const res = await client
      .from('hospital_emergency_notifications')
      .select('*')
      .eq('hospital_id', hospitalId)
      .order('created_at', { ascending: false });
    if (res.error) throw res.error;
    return (res.data as HospitalEmergencyNotificationRow[]) ?? [];
  });
  return data ?? [];
}

/** Hospital member: accept/reject a notification (guarded; membership-checked). */
export async function respondToEmergencyNotification(
  notificationId: string,
  action: 'accepted' | 'rejected'
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_respond_emergency_notification', {
      notification_uuid: notificationId,
      action,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}

/** Hospital member: request an ambulance after acceptance (guarded). */
export async function createAmbulanceRequest(
  emergencyEventId: string,
  hospitalId: string
): Promise<string | null> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_create_ambulance_request', {
      emergency_event_uuid: emergencyEventId,
      hospital_uuid: hospitalId,
    });
    if (res.error) throw res.error;
    return (res.data as string | null) ?? null;
  });
  return data;
}

/** Hospital member: advance ambulance state (guarded; never from terminal). */
export async function transitionAmbulance(
  ambulanceRequestId: string,
  newStatus: AmbulanceStatus,
  note?: string
): Promise<boolean> {
  const { data } = await withClient(async (client) => {
    const res = await client.rpc('carelink_transition_ambulance', {
      ambulance_request_uuid: ambulanceRequestId,
      new_status: newStatus,
      note: note ? note.slice(0, 200) : null,
    });
    if (res.error) throw res.error;
    return true;
  });
  return data ?? false;
}
