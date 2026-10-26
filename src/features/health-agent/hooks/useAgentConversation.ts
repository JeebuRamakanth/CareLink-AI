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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { uploadAndAnalyzeDocument } from '../../documents/services/documentService';
import { recordAIActivity } from '../../../services/auth/authorization';
import { useOptionalAgent } from '../../../contexts/AgentContext';
import { useOptionalAuth } from '../../../contexts/AuthContext';
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
import { patientProfiles as mockPatientProfiles, recoverySeed } from '../data/mockData';
import {
  ACCEPTED_MIMES,
  detectDocumentKind,
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
  /** Run the REAL analysis pipeline for an attached document. */
  runDocumentPipeline: (id: string) => Promise<void>;
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

/**
 * Map a real document-analysis category onto the agent's narrower category set.
 * The agent's `DocumentAnalysisCategory` predates the documents pipeline and does
 * not include `doctor-note`; that category is reported as `general-document`.
 */
function toAgentCategory(category: string): import('../types').DocumentAnalysisCategory {
  switch (category) {
    case 'lab-report':
    case 'prescription':
    case 'medicine-image':
    case 'discharge-summary':
    case 'imaging':
      return category;
    default:
      return 'general-document';
  }
}

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
    // Kept in memory so the real analysis pipeline (vision/OCR/PDF) can read it.
    file,
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
  /**
   * In-flight pipeline promises by document id.
   *
   * `sendMessage` must be able to WAIT for an upload started by the composer,
   * otherwise pressing Send during analysis sent an un-analysed attachment (the
   * agent then had no extraction and answered generically). The promise is the
   * join point, and doubles as the "already running" guard.
   */
  const pipelineRuns = useRef<Map<string, Promise<void>>>(new Map());
  const handoffDrained = useRef(false);

  const [messages, setMessages] = useState<AgentMessage[]>([WELCOME_MESSAGE]);
  const [status, setStatus] = useState<ChatStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AgentLanguage>('en');
  const [activeProfileId, setActiveProfileId] = useState<string>('self');
  const [context, setContext] = useState<ConversationContext>(emptyContext());
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  // Synchronous mirror of `documents` — the real pipeline resolves the File from
  // here so a just-added document is found before React state has flushed.
  const documentsRef = useRef<HealthDocument[]>([]);
  useEffect(() => { documentsRef.current = documents; }, [documents]);
  const [recovery, setRecovery] = useState(recoverySeed);
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  const [toolSuggestions, setToolSuggestions] = useState<AIToolSuggestion[]>([]);
  const [pendingTool, setPendingTool] = useState<AIToolSuggestion | null>(null);
  const [toolError, setToolError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const locationCtx = useOptionalLocationContext();
  // Real, RLS-scoped patient profiles (self + authenticated family members)
  // loaded by AgentContext. The AI family resolver and the profile switcher
  // both read from this single source — never a fake/locally-invented set.
  const agentCtx = useOptionalAgent();
  const auth = useOptionalAuth();
  // Owner id used for the secure-document pipeline (RLS-scoped). Local demo
  // users fall back to a stable local id, matching the documents page.
  const ownerId = auth?.user?.id ?? 'local-demo-user';

  // Single source of truth for patient/family profiles: the real RLS-scoped set
  // loaded by AgentContext (self + authenticated family members) when present,
  // otherwise the welcome/mock set. Real family rows are a superset of "self".
  const realFamily = agentCtx?.patientProfiles ?? null;
  const profiles: PatientProfile[] = realFamily && realFamily.length > 0 ? realFamily : mockPatientProfiles;

  // Authorized family profiles for the AI tool family-resolver (RLS-scoped:
  // only profiles the authenticated user actually owns are candidates). The "self"
  // entry is excluded — family resolution is about OTHER members. `patientProfiles`
  // is AgentContext state, so its identity changes only when membership changes.
  const familyProfiles = useMemo<AuthorizedFamilyProfile[]>(() => {
    const source = realFamily && realFamily.length > 0 ? realFamily : mockPatientProfiles;
    return source
      .filter((p) => p.id !== 'self')
      .map((p) => ({ id: p.id, label: p.label, relation: p.relation }));
  }, [realFamily]);

  const activeProfile = useMemo<PatientContext>(() => {
    const profile = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];
    const loc = locationCtx?.location;
    // Only pass coordinates when a real location is available (geolocation or
    // manual with coords). The default label-only location carries no lat/lng,
    // so discovery falls back to dataset distances rather than fabricating.
    const location = loc && typeof loc.lat === 'number' && typeof loc.lng === 'number'
      ? { label: loc.label, lat: loc.lat, lng: loc.lng }
      : undefined;
    return { activeProfileId: profile.id, profile, location };
  }, [activeProfileId, locationCtx, profiles]);

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
      // Keep the synchronous mirror current so a pipeline run started right after
      // this call can resolve the File before React state flushes.
      documentsRef.current = [...documentsRef.current, ...valid];
      setDocuments((prev) => [...prev, ...valid]);
      setError(null);
    }
    return valid;
  }, []);

  const updateDocument = useCallback((id: string, patch: Partial<HealthDocument>) => {
    // Update the synchronous mirror too, so a caller that awaits the pipeline can
    // immediately read the analysis result from `documentsRef` (React state has
    // not necessarily flushed yet).
    documentsRef.current = documentsRef.current.map((d) => (d.id === id ? { ...d, ...patch } : d));
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const removeDocument = useCallback((id: string) => {
    documentsRef.current = documentsRef.current.filter((d) => {
      if (d.id === id && d.previewUrl) URL.revokeObjectURL(d.previewUrl);
      return d.id !== id;
    });
    setDocuments((prev) => {
      const target = prev.find((d) => d.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((d) => d.id !== id);
    });
  }, []);

  const clearDocuments = useCallback(() => {
    documentsRef.current.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
    documentsRef.current = [];
    setDocuments((prev) => {
      prev.forEach((d) => d.previewUrl && URL.revokeObjectURL(d.previewUrl));
      return [];
    });
  }, []);

  /**
   * Run the REAL secure document pipeline for one attachment.
   *
   * Previously this function only animated a progress bar and never read the
   * file — which is why an uploaded medicine photo produced a demo response.
   * It now runs validate → upload → extract → analyse (vision for a medicine
   * photo) and stores the REAL result on the document. The status/progress
   * updates remain, but they now reflect work that actually happened.
   */
  const runDocumentPipeline = useCallback(
    async (id: string) => {
      // A run is already in flight for this document — return the SAME promise so
      // a caller that needs the finished analysis can await it, instead of
      // silently returning and reading a half-analysed document.
      const existing = pipelineRuns.current.get(id);
      if (existing) return existing;

      const run = (async () => {
        const setStep = (status: HealthDocument['status'], progress: number) =>
          updateDocument(id, { status, progress });

        try {
        // Resolve the file from the synchronous mirror so a just-added document
        // is found even before React state has flushed.
        const doc = documentsRef.current.find((d) => d.id === id);
        if (!doc?.file) {
          updateDocument(id, { status: 'error', progress: 0, errorMessage: 'The file is no longer available in this session. Please attach it again.', pipelineError: 'missing-file' });
          return;
        }

        setStep('reading', 15);
        const res = await uploadAndAnalyzeDocument({
          file: doc.file,
          ctx: { ownerId, familyProfileId: activeProfileId === 'self' ? null : activeProfileId },
          onUploadProgress: (p) => updateDocument(id, { status: 'uploading', progress: Math.max(10, Math.round(p * 0.4)) }),
          onProcessingProgress: (p) => updateDocument(id, { status: 'extracting', progress: Math.max(45, 40 + Math.round(p * 0.5)) }),
        });

        if (!res.ok) {
          updateDocument(id, { status: 'error', progress: 0, errorMessage: res.error, pipelineError: res.error });
          return;
        }

        const { document: stored, analysis } = res.outcome;
        if (!analysis) {
          updateDocument(id, {
            status: 'error',
            progress: 0,
            errorMessage: 'The document was stored but no analysis result was produced.',
            pipelineError: 'no-analysis',
          });
          return;
        }
        updateDocument(id, {
          status: 'ready',
          progress: 100,
          secureAnalysis: analysis,
          pipelineError: undefined,
          // Map the real analysis onto the lightweight agent analysis shape so
          // existing agent rendering keeps working with REAL content.
          analysis: {
            category: toAgentCategory(analysis.category),
            extractedTextPlaceholder: analysis.extraction?.text?.slice(0, 1200) ?? '',
            keyFindings: analysis.importantObservations.slice(0, 6),
            isMock: analysis.isMock,
            provenance: { sourceDocumentId: stored.id, processedAt: new Date().toISOString(), provider: analysis.source },
          },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'The document could not be analysed.';
        updateDocument(id, { status: 'error', progress: 0, errorMessage: message, pipelineError: message });
        }
      })();

      pipelineRuns.current.set(id, run);
      try {
        await run;
      } finally {
        pipelineRuns.current.delete(id);
      }
    },
    [updateDocument, ownerId, activeProfileId]
  );

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (abortRef.current) return;

      // Ensure every attached document has finished its REAL analysis before the
      // orchestrator reads it. Without this the request could race the pipeline
      // and the agent would see an un-analysed attachment — which is exactly how
      // a report upload used to degrade to a generic answer.
      //
      // Two things must be waited on: a run that is already in flight (started by
      // the composer) and a document that has not been started yet.
      const inFlight = documentsRef.current
        .map((d) => pipelineRuns.current.get(d.id))
        .filter((p): p is Promise<void> => Boolean(p));
      const notStarted = documentsRef.current.filter((d) => d.file
        && !pipelineRuns.current.has(d.id)
        && (d.status === 'queued' || d.status === 'uploading' || d.status === 'reading' || d.status === 'extracting' || d.status === 'organizing' || d.status === 'preparing'));
      if (inFlight.length > 0 || notStarted.length > 0) {
        setStatus('thinking');
        await Promise.all([
          ...inFlight,
          ...notStarted.map((d) => runDocumentPipeline(d.id)),
        ]);
      }

      const pendingDocs = documentsRef.current;
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

        // Phase 2 — the orchestrator detected the language the user actually
        // wrote in. Adopt it so follow-up turns and safety copy stay in the
        // user's language without them having to pick one.
        if (response.language && response.language !== language) {
          setLanguage(response.language);
        }

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
    [activeProfile, language, context, messages, activeProfileId, clearDocuments, familyProfiles, runDocumentPipeline]
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
        // Seed the synchronous mirror too so the analysis pipeline can resolve
        // each File before React state flushes.
        documentsRef.current = handoff.documents;
        setDocuments(handoff.documents);
        handoff.documents.forEach((d) => void runDocumentPipeline(d.id));
      }
      // sendMessage awaits any in-flight analysis before calling the orchestrator.
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
    patientProfiles: profiles,
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
