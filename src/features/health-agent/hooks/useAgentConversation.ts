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

export function useAgentConversation(): UseAgentConversation {
  const orchestrator = useRef(createAgentOrchestrator(mockAdapters));
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

  const locationCtx = useOptionalLocationContext();

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
      clearDocuments();

      try {
        const response = await orchestrator.current.handle({
          text: trimmed || 'uploaded document',
          documents: pendingDocs,
          patientContext: activeProfile,
          language,
          conversationContext: context,
          history: messages,
        });

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
        setStatus(response.result.urgency === 'emergency' ? 'emergency' : 'idle');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        setStatus('error');
      }
    },
    [documents, activeProfile, language, context, messages, activeProfileId, clearDocuments]
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
  };
}
