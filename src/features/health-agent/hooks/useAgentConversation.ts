/**
 * useAgentConversation — multi-turn chat hook for the dedicated /ai chat page.
 *
 * Owns the conversation: message list, thinking/streaming state, conversation
 * context memory (via ContextManager), the document upload pipeline, family
 * profile + language, and recovery check-ins. Routes each turn through the
 * AgentOrchestrator (intent → adapters → ranked, explainable results).
 *
 * This is the chat-native counterpart to useHealthAgent (which is single-result
 * for the Home hero). Both share the same typed orchestrator + mock adapters.
 *
 * SAFETY: emergency intents short-circuit to the emergency state and never
 * claim a diagnosis. Severity is re-evaluated every turn.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { createAgentOrchestrator } from '../services/agentOrchestrator';
import { mockAdapters } from '../services/adapters/mockAdapters';
import { emptyContext } from '../services/contextManager';
import { drainPendingHandoff } from '../services/pendingHandoff';
import { useOptionalLocationContext } from '../../../contexts/LocationContext';
import {
  runReadTool,
  resolveFamilyMember,
  suggestMutation,
  requiresConfirmation,
} from '../services/ai/aiTools';
import type { AIToolKind, AIToolSuggestion, AuthorizedFamilyProfile } from '../services/ai/aiTools';
import { createAppointment as persistAppointmentRow } from '../../../services/health-data/appointmentsRepository';
import { isSupabaseConfigured } from '../../../services/supabase/client';
import { recordAIActivity } from '../../../services/auth/authorization';
import type {
  AgentLanguage,
  AgentMessage,
  AgentResult,
  ConversationContext,
  HealthDocument,
  PatientContext,
  PatientProfile,
  RecoveryTrend,
} from '../types';
import { patientProfiles, recoverySeed } from '../data/mockData';
import {
  ACCEPTED_MIMES,
  detectDocumentKind,
  documentPipelineSteps,
  MAX_FILE_SIZE_BYTES,
  QUICK_PROMPTS,
} from '../utils/helpers';

export type ChatStatus = 'idle' | 'thinking' | 'error' | 'emergency';

export interface UseAgentConversation {
  messages: AgentMessage[];
  status: ChatStatus;
  isThinking: boolean;
  error: string | null;
  language: AgentLanguage;
  setLanguage: (lang: AgentLanguage) => void;
  patientProfiles: PatientProfile[];
  activeProfileId: string;
  setActiveProfileId: (id: string) => void;
  activeProfile: PatientContext;
  context: ConversationContext;
  recovery: import('../types').RecoveryStatus;
  documents: HealthDocument[];
  /** Send a user turn; appends the message and the assistant result. */
  sendMessage: (text: string) => Promise<void>;
  /** Seed the first turn from the Home handoff (drained once). */
  drainHandoff: () => void;
  addDocuments: (files: File[]) => HealthDocument[];
  removeDocument: (id: string) => void;
  clearDocuments: () => void;
  runDocumentPipeline: (id: string) => void;
  recoveryCheckIn: (trend: RecoveryTrend, note?: string) => Promise<void>;
  clearConversation: () => void;
  suggestedPrompts: typeof QUICK_PROMPTS;
  result: AgentResult | null;
  /** Stop the in-flight AI turn (abort + reset state). */
  stop: () => void;
  /** Suggested controlled AI tools for the latest result (read + confirmable mutations). */
  toolSuggestions: AIToolSuggestion[];
  /** A mutation awaiting explicit user confirmation. */
  pendingTool: AIToolSuggestion | null;
  /** Request a tool: reads execute immediately, mutations are parked for confirm. */
  requestTool: (suggestion: AIToolSuggestion) => void;
  confirmTool: () => Promise<void>;
  cancelTool: () => void;
  /** Safe tool error message (surfaced on the tool card). */
  toolError: string | null;
}

const createId = (prefix = 'msg') => `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
const nowIso = () => new Date().toISOString();

const WELCOME_MESSAGE: AgentMessage = {
  id: 'welcome',
  role: 'assistant',
  content:
    'I am your CareLink healthcare command center. Describe a symptom, upload a report, or ask me to find a hospital, doctor, pharmacy, or lab. How can I help you today?',
  createdAt: nowIso(),
  documents: [],
  contextTags: ['Welcome'],
  patientProfileId: 'self',
};

const fileToDocument = (file: File): HealthDocument => {
  const kind = detectDocumentKind(file);
  let previewUrl: string | undefined;
  if (kind === 'image' && typeof URL !== 'undefined') previewUrl = URL.createObjectURL(file);
  return {
    id: createId('doc'),
    fileName: file.name,
    fileSize: file.size,
    mime: file.type || 'application/octet-stream',
    kind,
    status: 'queued',
    progress: 0,
    previewUrl,
  };
};

/**
 * Build controlled AI tool suggestions for the latest result. Read tools are
 * offered directly; mutations are ALWAYS gated behind explicit confirmation
 * (requiresConfirmation). Family members resolve ONLY from authorized profiles.
 */
function buildToolSuggestions(
  text: string,
  result: AgentResult,
  familyProfiles: AuthorizedFamilyProfile[]
): AIToolSuggestion[] {
  const suggestions: AIToolSuggestion[] = [];
  const t = text.toLowerCase();

  const family = resolveFamilyMember(text, familyProfiles);
  const familyArg = family ? { familyProfileId: family.id } : {};

  // Appointment intent → view my appointments (read) or book (confirmable).
  if (result.intent === 'appointment' || /appointment|book|schedule/.test(t)) {
    if (/book|schedule|appointment/.test(t) && result.doctors.length > 0) {
      const doc = result.doctors[0];
      suggestions.push(
        suggestMutation('createAppointment', {
          doctorName: doc.fullName,
          hospitalName: doc.hospitalName,
          date: '',
          time: '',
          appointmentType: 'Consultation',
          ...familyArg,
        })
      );
    } else {
      suggestions.push({
        kind: 'getMyAppointments',
        label: 'View my appointments',
        summary: 'Read your upcoming appointments from the CareLink backend.',
        requiresConfirmation: false,
        args: { status: 'upcoming', limit: 10 },
      });
    }
  }

  // Doctor intent → search doctors (read).
  if (result.intent === 'doctor' || /doctor|physician|specialist/.test(t)) {
    suggestions.push({
      kind: 'searchDoctors',
      label: 'Search doctors',
      summary: 'Search the CareLink doctor registry.',
      requiresConfirmation: false,
      args: { query: result.doctors[0]?.fullName ?? '' },
    });
  }

  // Hospital intent → search hospitals (read).
  if (result.intent === 'hospital' || /hospital|nearest|near me/.test(t)) {
    suggestions.push({
      kind: 'searchHospitals',
      label: 'Search hospitals',
      summary: 'Search the CareLink hospital registry.',
      requiresConfirmation: false,
      args: { query: result.hospitals[0]?.name ?? '' },
    });
  }

  // Directions for the top hospital when location is present.
  if (result.hospitals.length > 0 && /direction|route|how (do i|to) get/.test(t)) {
    const h = result.hospitals[0];
    suggestions.push({
      kind: 'getDirections',
      label: 'Get directions',
      summary: `Open directions to ${h.name}.`,
      requiresConfirmation: false,
      args: { destination: `${h.name}, ${h.address}, ${h.city}`, mode: 'driving' },
    });
  }

  return suggestions.slice(0, 3);
}

export function useAgentConversation(): UseAgentConversation {
  // Resolved registry (Step 9/13): real providers engage when configured,
  // mock fallback otherwise — never a hardcoded mock-only pipeline.
  const orchestrator = useRef(createAgentOrchestrator());
  const pipelineLocks = useRef<Set<string>>(new Set());
  const handoffDrained = useRef(false);

  const [messages, setMessages] = useState<AgentMessage[]>([WELCOME_MESSAGE]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AgentLanguage>('en');
  const [activeProfileId, setActiveProfileId] = useState<string>('self');
  const [context, setContext] = useState<ConversationContext>(emptyContext());
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [recovery, setRecovery] = useState(recoverySeed);
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  const [toolSuggestions, setToolSuggestions] = useState<AIToolSuggestion[]>([]);
  const [pendingTool, setPendingTool] = useState<AIToolSuggestion | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const locationCtx = useOptionalLocationContext();

  // Authorized family profiles for the AI tool family-resolver (RLS-scoped:
  // only profiles the authenticated user actually owns are candidates).
  const familyProfiles = useMemo<AuthorizedFamilyProfile[]>(
    () =>
      (patientProfiles as PatientProfile[])
        .filter((p) => p.id !== 'self')
        .map((p) => ({ id: p.id, label: p.label, relation: p.relation })),
    []
  );

  const activeProfile = useMemo<PatientContext>(() => {
    const profile = patientProfiles.find((p) => p.id === activeProfileId) ?? patientProfiles[0];
    const loc = locationCtx?.location;
    // Only pass coordinates when a real location is available (geolocation or
    // manual with coords). The default label-only location carries no lat/lng,
    // so discovery falls back to dataset distances rather than fabricating.
    const location = loc && typeof loc.lat === 'number' && typeof loc.lng === 'number'
      ? { label: loc.label, lat: loc.lat, lng: loc.lng }
      : undefined;
    return { activeProfileId: profile.id, profile, location };
  }, [activeProfileId, locationCtx]);

  const addDocuments = useCallback((files: File[]): HealthDocument[] => {
    const valid: HealthDocument[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`${file.name} exceeds 10 MB`);
        continue;
      }
      const mime = file.type || 'application/octet-stream';
      if (file.type && !ACCEPTED_MIMES.includes(mime) && !/\.(jpg|jpeg|png|webp|pdf|docx?)$/i.test(file.name)) {
        setError(`${file.name} is not a supported format`);
        continue;
      }
      valid.push(fileToDocument(file));
    }
    if (valid.length > 0) {
      setDocuments((prev) => [...prev, ...valid]);
      setError(null);
    }
    return valid;
  }, []);

  const updateDocument = useCallback((id: string, patch: Partial<HealthDocument>) => {
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const removeDocument = useCallback((id: string) => {
    setDocuments((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const clearDocuments = useCallback(() => {
    setDocuments((prev) => {
      prev.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
      return [];
    });
  }, []);

  const runDocumentPipeline = useCallback(
    (id: string) => {
      if (pipelineLocks.current.has(id)) return;
      pipelineLocks.current.add(id);
      let stepIndex = 0;
      const advance = () => {
        if (stepIndex >= documentPipelineSteps.length) {
          pipelineLocks.current.delete(id);
          return;
        }
        const step = documentPipelineSteps[stepIndex];
        updateDocument(id, { status: step.status, progress: step.progress });
        stepIndex += 1;
        window.setTimeout(advance, 520);
      };
      advance();
    },
    [updateDocument]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const pendingDocs = documents;
      if (!trimmed && pendingDocs.length === 0) return;

      const userMessage: AgentMessage = {
        id: createId('u'),
        role: 'user',
        content: trimmed || 'uploaded document',
        createdAt: nowIso(),
        documents: pendingDocs,
        contextTags: [],
        patientProfileId: activeProfileId,
      };
      setMessages((prev) => [...prev, userMessage]);
      setStatus('thinking');
      setError(null);
      setToolSuggestions([]);
      setPendingTool(null);
      setToolError(null);
      clearDocuments();

      // Allow stopping the in-flight turn (abort request; never fake success).
      const abort = new AbortController();
      abortRef.current = abort;

      try {
        const response = await orchestrator.current.handle({
          text: trimmed || 'uploaded document',
          documents: pendingDocs,
          patientContext: activeProfile,
          language,
          conversationContext: context,
          history: messages,
        });

        if (abort.signal.aborted) return;

        const assistantMessage: AgentMessage = {
          id: createId('a'),
          role: 'assistant',
          content: response.result.explanation || response.result.summary,
          createdAt: nowIso(),
          result: response.result,
          documents: [],
          contextTags: response.context.hasContext ? [response.context.summary] : [],
          patientProfileId: activeProfileId,
        };
        setMessages((prev) => [...prev, assistantMessage]);
        setContext(response.context);
        setLastResult(response.result);
        setToolSuggestions(buildToolSuggestions(trimmed, response.result, familyProfiles));
        setStatus(response.result.urgency === 'emergency' ? 'emergency' : 'idle');
      } catch (e) {
        if (abort.signal.aborted) {
          setStatus('idle');
          return;
        }
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        setStatus('error');
      } finally {
        abortRef.current = null;
      }
    },
    [documents, activeProfile, language, context, messages, activeProfileId, clearDocuments, familyProfiles]
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus('idle');
    setError(null);
  }, []);

  /** Run a read-only AI tool (data is server-authorized via its repository). */
  const runSuggestion = useCallback(async (suggestion: AIToolSuggestion) => {
    setToolError(null);
    const res = await runReadTool(suggestion.kind as AIToolKind, suggestion.args);
    if (!res.ok) {
      setToolError(res.message);
      return;
    }
    const suffix =
      suggestion.kind === 'getMyAppointments' && Array.isArray(res.data) && res.data.length > 0
        ? ` Found ${res.data.length} appointment(s) in your account.`
        : suggestion.kind === 'searchHospitals' || suggestion.kind === 'searchDoctors'
          ? ''
          : '';
    const note: AgentMessage = {
      id: createId('tool'),
      role: 'assistant',
      content: `${suggestion.label} — ${res.message}${suffix}`,
      createdAt: nowIso(),
      documents: [],
      contextTags: ['tool'],
      patientProfileId: activeProfileId,
    };
    setMessages((prev) => [...prev, note]);
  }, [activeProfileId]);

  /** Confirm a mutation tool → executes ONLY the RLS-backed repository write. */
  const confirmTool = useCallback(async () => {
    const tool = pendingTool;
    if (!tool) return;
    setPendingTool(null);
    setToolError(null);
    if (!requiresConfirmation(tool.kind)) {
      void runSuggestion(tool);
      return;
    }
    if (!isSupabaseConfigured()) {
      setToolError('The CareLink backend is not configured — this action cannot be saved. No fake success was recorded.');
      void recordAIActivity('ai_tool_attempt', { tool: tool.kind, outcome: 'unavailable' });
      return;
    }
    void recordAIActivity('ai_tool_attempt', { tool: tool.kind, outcome: 'attempted' });
    if (tool.kind === 'createAppointment') {
      const familyProfileId = (tool.args.familyProfileId as string | undefined) ?? null;
      const { appointment, error: err } = await persistAppointmentRow({
        family_profile_id: familyProfileId,
        doctor_name: (tool.args.doctorName as string | undefined) ?? 'Doctor',
        hospital_name: (tool.args.hospitalName as string | undefined) ?? null,
        appointment_type: ((tool.args.appointmentType as string | undefined) ?? 'Consultation') as never,
        scheduled_date: (tool.args.date as string | undefined) ?? '',
        scheduled_time: (tool.args.time as string | undefined) ?? '',
        status: 'confirmed',
      });
      if (err || !appointment) {
        setToolError(err ?? 'We could not book this appointment. Please try again.');
        void recordAIActivity('ai_tool_attempt', { tool: tool.kind, outcome: 'failed' });
        return;
      }
      void recordAIActivity('ai_tool_action', { tool: tool.kind, outcome: 'succeeded' });
      const ok: AgentMessage = {
        id: createId('tool'),
        role: 'assistant',
        content: `Appointment booked for ${tool.args.date} at ${tool.args.time}${familyProfileId ? ' (family profile)' : ''}. Manage it from your appointments page.`,
        createdAt: nowIso(),
        documents: [],
        contextTags: ['appointment'],
        patientProfileId: activeProfileId,
      };
      setMessages((prev) => [...prev, ok]);
      return;
    }
    setToolError('This action is not available yet.');
    void recordAIActivity('ai_tool_attempt', { tool: tool.kind, outcome: 'denied' });
  }, [pendingTool, runSuggestion, activeProfileId]);

  const cancelTool = useCallback(() => {
    setPendingTool(null);
    setToolError(null);
  }, []);

  /** Request a tool: reads run immediately; mutations are parked for confirm. */
  const requestTool = useCallback(
    (suggestion: AIToolSuggestion) => {
      if (requiresConfirmation(suggestion.kind)) {
        setPendingTool(suggestion);
        setToolError(null);
        void recordAIActivity('ai_tool_attempt', { tool: suggestion.kind, outcome: 'confirmation-pending' });
        return;
      }
      void runSuggestion(suggestion);
    },
    [runSuggestion]
  );

  const drainHandoff = useCallback(() => {
    if (handoffDrained.current) return;
    handoffDrained.current = true;
    const handoff = drainPendingHandoff();
    if (handoff && handoff.text.trim()) {
      if (handoff.documents.length > 0) {
        setDocuments(handoff.documents);
        handoff.documents.forEach((d) => runDocumentPipeline(d.id));
      }
      void sendMessage(handoff.text);
    }
  }, [sendMessage, runDocumentPipeline]);

  const clearConversation = useCallback(() => {
    setMessages([WELCOME_MESSAGE]);
    setContext(emptyContext());
    setLastResult(null);
    setError(null);
    setStatus('idle');
  }, []);

  const recoveryCheckIn = useCallback(async (trend: RecoveryTrend, note?: string) => {
    setStatus('thinking');
    try {
      const updated = await mockAdapters.recovery.checkIn(trend, note);
      setRecovery(updated);
      setStatus('idle');
    } catch {
      setError('Could not save your check-in. Please try again.');
      setStatus('error');
    }
  }, []);

  return {
    messages,
    status,
    isThinking: status === 'thinking',
    error,
    language,
    setLanguage,
    patientProfiles,
    activeProfileId,
    setActiveProfileId,
    activeProfile,
    context,
    recovery,
    documents,
    sendMessage,
    drainHandoff,
    addDocuments,
    removeDocument,
    clearDocuments,
    runDocumentPipeline,
    recoveryCheckIn,
    clearConversation,
    suggestedPrompts: QUICK_PROMPTS,
    result: lastResult,
    stop,
    toolSuggestions,
    pendingTool,
    requestTool,
    confirmTool,
    cancelTool,
    toolError,
  };
}
