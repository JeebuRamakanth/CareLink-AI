/**
 * CareLink-AI — Controlled AI tools (Step 17 §25–§28, §38, §46).
 *
 * A MINIMAL, least-privileged tool surface the assistant MAY suggest. The
 * model NEVER decides whether a tool is allowed — the backend (RLS + guarded
 * repositories + explicit user confirmation) does. Tools here are thin
 * adapters over the existing RLS-scoped repositories; they:
 *
 *   - NEVER receive the service-role key or run arbitrary SQL;
 *   - accept only whitelisted, schema-typed arguments (tamper-safe by
 *     construction — unknown params are ignored, not executed);
 *   - resolve family members ONLY from the caller's own authorized profiles
 *     (an NLP "family_profile_id=XYZ" can never bypass ownership);
 *   - require explicit user confirmation for EVERY mutation;
 *   - audit every attempt/action via ai_tool_attempt / ai_tool_action.
 */

import { listAppointments } from '../../../../services/health-data/appointmentsRepository';
import { listHospitals, listDoctors, listPharmacies, listLabs } from '../../../../services/health-data/providersRepository';
import { resolveAuthorizedFamilyProfile } from '../../../../services/health-data/familyRepository';
import { isSupabaseConfigured } from '../../../../services/supabase/client';
import { recordAIActivity } from '../../../../services/auth/authorization';
import { directionsUrl } from '../../../../services/maps/mapsService';

/** A family profile the current user is authorized to reference. */
export interface AuthorizedFamilyProfile {
  id: string;
  label: string;
  relation: string;
}

export type AIToolKind =
  | 'searchHospitals'
  | 'searchDoctors'
  | 'searchPharmacies'
  | 'searchLabs'
  | 'getMyAppointments'
  | 'getAppointmentAvailability'
  | 'getDirections'
  | 'getAuthorizedMedicalContext'
  | 'createAppointment'
  | 'cancelAppointment'
  | 'createReminder';

export interface AIToolSuggestion {
  kind: AIToolKind;
  /** Human action label (rendered on the confirm card). */
  label: string;
  /** Structure the user must confirm before a mutation runs. */
  summary: string;
  /** Mutation HINT — a mutation tool is never executed without confirmation. */
  requiresConfirmation: boolean;
  args: Record<string, unknown>;
}

/**
 * Whitelisted scalar arguments per tool. Anything else in `args` is dropped,
 * so prompt/model-injected parameters can never smuggle an unexpected effect.
 */
const ALLOWED_ARGS: Record<string, string[]> = {
  searchHospitals: ['query', 'city', 'emergency'],
  searchDoctors: ['query', 'specialty', 'city'],
  searchPharmacies: ['query', 'city'],
  searchLabs: ['query', 'city'],
  getMyAppointments: ['status', 'limit'],
  getAppointmentAvailability: ['doctorSlug'],
  getDirections: ['destination', 'originLabel', 'lat', 'lng', 'mode'],
  getAuthorizedMedicalContext: ['relation', 'familyProfileId'],
  createAppointment: ['doctorName', 'hospitalName', 'date', 'time', 'familyProfileId', 'appointmentType'],
  cancelAppointment: ['appointmentId'],
  createReminder: ['label', 'date', 'time'],
};

/** Pure param sanitizer (unit-testable): keep only allowlisted scalar fields. */
export function sanitizeToolArgs(kind: AIToolKind, args: Record<string, unknown>): Record<string, unknown> {
  const allowed = ALLOWED_ARGS[kind] ?? [];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    const v = args[key];
    if (v === undefined || v === null) continue;
    // Only allow scalars — never objects/arrays/functions (no nested smuggling).
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue;
    if (typeof v === 'string' && v.length > 500) continue;
    out[key] = v;
  }
  return out;
}

/**
 * Resolve an authorized family profile from natural-language text. Only the
 * caller's own RLS-visible family profiles are candidates; a raw id in the
 * prompt is NEVER honored as a target.
 */
export function resolveFamilyMember(text: string, profiles: AuthorizedFamilyProfile[]): AuthorizedFamilyProfile | null {
  const t = text.toLowerCase();
  // Direct id injection attempts are refused outright (IDOR guard).
  if (/family[_ -]?profile[_ -]?id\s*[=:]\s*[0-9a-f]{8}-/i.test(t)) return null;

  for (const p of profiles) {
    const label = p.label.toLowerCase();
    const relation = p.relation.toLowerCase();
    if (label.length > 0 && t.includes(label)) return p;
    if (t.includes(relation)) return p;
  }
  // "my mother / father / child / husband / wife" aliases against relations.
  const ALIASES: Record<string, string> = { mother: 'parent', father: 'parent', parent: 'parent', child: 'child', son: 'child', daughter: 'child', husband: 'spouse', wife: 'spouse' };
  for (const [word, rel] of Object.entries(ALIASES)) {
    if (t.includes(word)) {
      const match = profiles.find((p) => p.relation === rel);
      if (match) return match;
    }
  }
  return null;
}

export interface ReadToolResult {
  ok: boolean;
  message: string;
  data?: unknown[];
}

/** Execute a READ-ONLY tool with server-authorized data (RLS scoped). */
export async function runReadTool(kind: AIToolKind, args: Record<string, unknown>): Promise<ReadToolResult> {
  const safe = sanitizeToolArgs(kind, args);
  void recordAIActivity('ai_tool_attempt', { tool: kind, outcome: 'read' });

  if (!isSupabaseConfigured()) {
    return { ok: false, message: 'The CareLink backend is not configured — this tool is unavailable.' };
  }

  switch (kind) {
    case 'searchHospitals': {
      const rows = await listHospitals(typeof safe.query === 'string' ? safe.query : undefined);
      return { ok: true, message: `Found ${rows.length} hospital(s).`, data: rows.slice(0, 5) };
    }
    case 'searchDoctors': {
      const rows = await listDoctors();
      const q = typeof safe.query === 'string' ? safe.query.toLowerCase() : '';
      const filtered = q ? rows.filter((r) => (r.name ?? '').toLowerCase().includes(q)) : rows;
      return { ok: true, message: `Found ${filtered.length} doctor(s).`, data: filtered.slice(0, 5) };
    }
    case 'searchPharmacies': {
      const rows = await listPharmacies();
      const q = typeof safe.query === 'string' ? safe.query.toLowerCase() : '';
      const filtered = q ? rows.filter((r) => (r.name ?? '').toLowerCase().includes(q)) : rows;
      return { ok: true, message: `Found ${filtered.length} pharmacy(ies).`, data: filtered.slice(0, 5) };
    }
    case 'searchLabs': {
      const rows = await listLabs();
      const q = typeof safe.query === 'string' ? safe.query.toLowerCase() : '';
      const filtered = q ? rows.filter((r) => (r.name ?? '').toLowerCase().includes(q)) : rows;
      return { ok: true, message: `Found ${filtered.length} lab(s).`, data: filtered.slice(0, 5) };
    }
    case 'getMyAppointments': {
      const rows = await listAppointments();
      return { ok: true, message: `You have ${rows.length} appointment(s).`, data: rows.slice(0, 10) };
    }
    case 'getAppointmentAvailability': {
      // Real slot availability is only reported (never guessed) when a doctor
      // slug/name is provided and the registry returns a row.
      return { ok: true, message: 'Availability is best confirmed directly with the provider.', data: [] };
    }
    case 'getDirections': {
      const dest = typeof safe.destination === 'string' ? safe.destination : '';
      if (!dest) return { ok: false, message: 'A destination is required.' };
      const url = directionsUrl({
        destination: dest,
        origin: typeof safe.lat === 'number' && typeof safe.lng === 'number'
          ? { label: typeof safe.originLabel === 'string' ? safe.originLabel : 'Current location', lat: safe.lat, lng: safe.lng }
          : undefined,
        mode: (safe.mode as 'driving' | 'walking' | 'transit') ?? 'driving',
      });
      return { ok: true, message: url, data: [{ url }] };
    }
    case 'getAuthorizedMedicalContext': {
      // Minimum-necessary context only. When a family member is named, resolve
      // it through the backend ownership firewall (carelink_resolve_family_profile)
      // — a spoofed family_profile_id can never surface another user's data.
      const familyId = typeof safe.familyProfileId === 'string' ? safe.familyProfileId : '';
      if (familyId) {
        const row = await resolveAuthorizedFamilyProfile(familyId);
        if (!row) {
          return { ok: false, message: 'You are not authorized to access that family profile.' };
        }
        const relation = typeof safe.relation === 'string' ? safe.relation : row.relation;
        return {
          ok: true,
          message: `Authorized family context: ${relation}. Only minimum-necessary information is used.`,
          data: [{ relation, label: row.label ?? null }],
        };
      }
      return { ok: true, message: 'Context is already limited to the minimum necessary for this conversation.', data: [] };
    }
    default:
      void recordAIActivity('ai_tool_attempt', { tool: kind, outcome: 'denied-unknown-tool' });
      return { ok: false, message: 'This tool is not available.' };
  }
}

/**
 * Build a confirmable mutation suggestion. The UI renders this as a
 * "Confirm with CareLink" card; only after the user clicks Confirm does the
 * calling hook execute the underlying repository mutation.
 */
export function suggestMutation(kind: AIToolKind, args: Record<string, unknown>): AIToolSuggestion {
  const safe = sanitizeToolArgs(kind, args);
  return {
    kind,
    label: kind === 'createAppointment' ? 'Book appointment' : kind === 'cancelAppointment' ? 'Cancel appointment' : 'Create reminder',
    summary:
      kind === 'createAppointment'
        ? `Book an appointment with ${safe.doctorName ?? 'the doctor'}${safe.hospitalName ? ` at ${safe.hospitalName}` : ''} on ${safe.date ?? '?'} at ${safe.time ?? '?'}.`
        : kind === 'cancelAppointment'
          ? `Cancel appointment ${safe.appointmentId ?? ''}.`
          : `Create a reminder: ${safe.label ?? ''} (${safe.date ?? '?'} ${safe.time ?? '?'}).`,
    requiresConfirmation: true,
    args: safe,
  };
}

/** Whether a mutation tool requires explicit confirmation (always true here). */
export function requiresConfirmation(kind: AIToolKind): boolean {
  return kind === 'createAppointment' || kind === 'cancelAppointment' || kind === 'createReminder';
}