/**
 * CareLink-AI Agent — conversation + state context (Steps 12, 13, 15).
 *
 * Owns: conversations list, active conversation, family profile switching,
 * language, recovery check-ins, the send pipeline (with thinking state), and
 * the attachment upload mock pipeline. All state is local (localStorage-backed)
 * per the "do not connect backend yet" constraint.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useLocalStorage } from '../hooks/useLocalStorage';
import { sendAgentMessage } from '../services/agent';
import { buildResponseForQuickAction } from '../services/agent/mockAgentService';
import {
  agentPatientProfiles,
  agentRecoverySeed,
} from '../services/agent/mockData';
import { useOptionalAuth } from './AuthContext';
import { listFamilyProfiles } from '../services/health-data';
import type { FamilyProfileRow } from '../services/health-data';
import type {
  AgentAttachment,
  AgentConversation,
  AgentLanguage,
  AgentMessage,
  AgentStateStatus,
  PatientProfile,
  RecoveryCheckIn,
  RecoveryStatus,
  RecoveryTrend,
} from '../services/agent/agentTypes';
import { createId } from '../lib';

const AGENT_STORAGE_KEY = 'carelink_ai_agent_conversations';
const RECOVERY_STORAGE_KEY = 'carelink_ai_agent_recovery';

const nowIso = () => new Date().toISOString();

const createWelcomeConversation = (): AgentConversation => {
  const messageId = createId('msg');
  const welcomeMessage: AgentMessage = {
    id: messageId,
    role: 'assistant',
    content:
      'I am your CareLink healthcare command center. Describe a symptom, upload a report, or ask me to find a hospital, doctor, pharmacy, or lab. How can I help you today?',
    createdAt: nowIso(),
    attachments: [],
    contextTags: ['Welcome'],
    patientProfileId: 'self',
  };
  return {
    id: createId('conv'),
    title: 'New conversation',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    messages: [welcomeMessage],
    language: 'en',
    patientProfileId: 'self',
  };
};

interface AgentContextValue {
  conversations: AgentConversation[];
  activeConversation: AgentConversation;
  activeConversationId: string;
  setActiveConversationId: (id: string) => void;
  startNewConversation: () => void;
  deleteConversation: (id: string) => void;
  clearActiveConversation: () => void;

  patientProfiles: PatientProfile[];
  activeProfile: PatientProfile;
  setActiveProfileId: (id: string) => void;

  language: AgentLanguage;
  setLanguage: (language: AgentLanguage) => void;

  status: AgentStateStatus;
  isThinking: boolean;

  sendMessage: (text: string, attachments: AgentAttachment[]) => Promise<void>;
  triggerQuickAction: (actionId: string) => Promise<void>;

  attachments: AgentAttachment[];
  addAttachments: (files: File[]) => AgentAttachment[];
  updateAttachment: (id: string, patch: Partial<AgentAttachment>) => void;
  removeAttachment: (id: string) => void;
  clearAttachments: () => void;
  runAttachmentPipeline: (id: string) => void;

  recovery: RecoveryStatus;
  addRecoveryCheckIn: (trend: RecoveryTrend, note?: string) => void;
}

const AgentContext = createContext<AgentContextValue | undefined>(undefined);

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ACCEPTED_MIMES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

const detectAttachmentKind = (file: File): AgentAttachment['kind'] => {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.includes('word') || file.name.match(/\.(docx?|DOCX?)$/)) return 'document';
  if (file.name.match(/\.(pdf|PDF)$/)) return 'pdf';
  return 'unknown';
};

const fileToAttachment = (file: File): AgentAttachment => {
  const kind = detectAttachmentKind(file);
  let previewUrl: string | undefined;
  if (kind === 'image' && typeof URL !== 'undefined') {
    previewUrl = URL.createObjectURL(file);
  }
  return {
    id: createId('att'),
    fileName: file.name,
    fileSize: file.size,
    mime: file.type || 'application/octet-stream',
    kind,
    status: 'queued',
    progress: 0,
    previewUrl,
  };
};

const PIPELINE_STEPS: { status: AgentAttachment['status']; label: string; progress: number }[] = [
  { status: 'uploading', label: 'Uploading', progress: 25 },
  { status: 'reading', label: 'Reading document', progress: 50 },
  { status: 'extracting', label: 'Extracting medical information', progress: 72 },
  { status: 'organizing', label: 'Organizing findings', progress: 88 },
  { status: 'preparing', label: 'Preparing explanation', progress: 96 },
  { status: 'ready', label: 'Ready', progress: 100 },
];

const deriveTitleFromText = (text: string): string => {
  const trimmed = text.trim();
  if (!trimmed) return 'New conversation';
  return trimmed.length > 38 ? `${trimmed.slice(0, 38)}…` : trimmed;
};

/** Convert a stored family-profile row into the agent's patient context shape. */
const toPatientProfile = (row: FamilyProfileRow): PatientProfile => ({
  id: row.id,
  label: row.label,
  relation: row.relation,
  contextSummary: row.context_summary ?? '',
  contextTags: row.context_tags ?? [],
});

export function AgentProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const [conversations, setConversations] = useLocalStorage<AgentConversation[]>(
    AGENT_STORAGE_KEY,
    [createWelcomeConversation()]
  );
  const [recovery, setRecovery] = useLocalStorage<RecoveryStatus>(RECOVERY_STORAGE_KEY, agentRecoverySeed);

  const [activeConversationIdState, setActiveConversationIdState] = useState<string>(() => conversations[0]?.id ?? '');
  const [activeProfileId, setActiveProfileId] = useState<string>('self');
  const [language, setLanguage] = useState<AgentLanguage>('en');
  const [status, setStatus] = useState<AgentStateStatus>({ status: 'initial' });
  const [attachments, setAttachments] = useState<AgentAttachment[]>([]);
  // Patient/family profiles. Default to the mock set; replaced with the
  // authenticated user's real family profiles when available (graceful
  // fallback to mock when Supabase is unconfigured).
  const [patientProfiles, setPatientProfiles] = useState<PatientProfile[]>(agentPatientProfiles);
  // Guards against React strict-mode double-invocation of the async pipeline.
  const pipelineLocks = useRef<Set<string>>(new Set());

  const activeConversationId = conversations.some((c) => c.id === activeConversationIdState)
    ? activeConversationIdState
    : (conversations[0]?.id ?? '');

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? conversations[0],
    [conversations, activeConversationId]
  );

  const activeProfile = useMemo(
    () => patientProfiles.find((p) => p.id === activeProfileId) ?? patientProfiles[0],
    [patientProfiles, activeProfileId]
  );

  // Load authenticated family profiles into the agent context when a real user
  // is signed in and Supabase is configured. Never silently reads another user's
  // data — RLS scopes rows to owner_id = auth.uid().
  useEffect(() => {
    let cancelled = false;
    if (!auth.user) {
      setPatientProfiles(agentPatientProfiles);
      return;
    }
    (async () => {
      const rows = await listFamilyProfiles();
      if (cancelled) return;
      const mapped: PatientProfile[] = rows.map((row) => toPatientProfile(row));
      // Always keep a "self" entry first; prepend real family members.
      const selfProfile = agentPatientProfiles[0];
      setPatientProfiles(mapped.length > 0 ? [selfProfile, ...mapped] : agentPatientProfiles);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.user?.id]);

  const setActiveConversationId = useCallback((id: string) => {
    setActiveConversationIdState(id);
  }, []);

  const startNewConversation = useCallback(() => {
    const conv = createWelcomeConversation();
    setConversations((current) => [conv, ...current]);
    setActiveConversationIdState(conv.id);
    setStatus({ status: 'initial' });
  }, [setConversations]);

  const deleteConversation = useCallback(
    (id: string) => {
      setConversations((current) => {
        const next = current.filter((c) => c.id !== id);
        if (next.length === 0) {
          const fresh = createWelcomeConversation();
          setActiveConversationIdState(fresh.id);
          return [fresh];
        }
        if (id === activeConversationIdState) {
          setActiveConversationIdState(next[0].id);
        }
        return next;
      });
    },
    [setConversations, activeConversationIdState]
  );

  const clearActiveConversation = useCallback(() => {
    setConversations((current) =>
      current.map((c) =>
        c.id === activeConversationId
          ? {
              ...c,
              title: 'New conversation',
              updatedAt: nowIso(),
              messages: [
                {
                  id: createId('msg'),
                  role: 'assistant',
                  content:
                    'Conversation cleared. Describe a symptom, upload a report, or ask me to find care near you.',
                  createdAt: nowIso(),
                  attachments: [],
                  contextTags: ['Welcome'],
                  patientProfileId: activeProfileId,
                },
              ],
            }
          : c
      )
    );
    setStatus({ status: 'initial' });
  }, [setConversations, activeConversationId, activeProfileId]);

  const addAttachments = useCallback((files: File[]): AgentAttachment[] => {
    const accepted: AgentAttachment[] = [];
    const newOnes: AgentAttachment[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setStatus({ status: 'file-too-large', detail: `${file.name} exceeds 10 MB` });
        continue;
      }
      if (file.type && !ACCEPTED_MIMES.includes(file.type) && !file.name.match(/\.(jpe?g|png|webp|pdf|docx?|DOCX?)$/i)) {
        setStatus({ status: 'unsupported-file', detail: `${file.name} is not a supported format` });
        continue;
      }
      const attachment = fileToAttachment(file);
      accepted.push(attachment);
      newOnes.push(attachment);
    }
    if (accepted.length > 0) {
      setAttachments((current) => [...current, ...accepted]);
    }
    return newOnes;
  }, [setAttachments]);

  const updateAttachment = useCallback(
    (id: string, patch: Partial<AgentAttachment>) => {
      setAttachments((current) => current.map((a) => (a.id === id ? { ...a, ...patch } : a)));
    },
    [setAttachments]
  );

  const removeAttachment = useCallback(
    (id: string) => {
      setAttachments((current) => {
        const target = current.find((a) => a.id === id);
        if (target?.previewUrl && typeof URL !== 'undefined') {
          URL.revokeObjectURL(target.previewUrl);
        }
        return current.filter((a) => a.id !== id);
      });
    },
    [setAttachments]
  );

  const clearAttachments = useCallback(() => {
    setAttachments((current) => {
      for (const a of current) {
        if (a.previewUrl && typeof URL !== 'undefined') {
          URL.revokeObjectURL(a.previewUrl);
        }
      }
      return [];
    });
  }, [setAttachments]);

  const runAttachmentPipeline = useCallback(
    (id: string) => {
      if (pipelineLocks.current.has(id)) return;
      pipelineLocks.current.add(id);

      let stepIndex = 0;
      const advance = () => {
        if (stepIndex >= PIPELINE_STEPS.length) {
          pipelineLocks.current.delete(id);
          return;
        }
        const step = PIPELINE_STEPS[stepIndex];
        updateAttachment(id, { status: step.status, progress: step.progress });
        stepIndex += 1;
        window.setTimeout(advance, 520);
      };
      advance();
    },
    [updateAttachment]
  );

  const persistAssistantMessage = useCallback(
    (conversationId: string, message: AgentMessage) => {
      setConversations((current) =>
        current.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                messages: [...c.messages, message],
                updatedAt: nowIso(),
              }
            : c
        )
      );
    },
    [setConversations]
  );

  const sendMessage = useCallback(
    async (text: string, pendingAttachments: AgentAttachment[]) => {
      const trimmed = text.trim();
      const hasAttachments = pendingAttachments.length > 0;
      if (!trimmed && !hasAttachments) return;

      const conversationId = activeConversationId;
      const profileId = activeProfileId;
      const userMessage: AgentMessage = {
        id: createId('msg'),
        role: 'user',
        content: trimmed || (hasAttachments ? 'Uploaded a document' : ''),
        createdAt: nowIso(),
        attachments: pendingAttachments,
        contextTags: activeProfile.contextTags,
        patientProfileId: profileId,
      };

      // Attach user message + update conversation title from first user turn.
      setConversations((current) =>
        current.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                title: c.messages.filter((m) => m.role === 'user').length === 0 && trimmed ? deriveTitleFromText(trimmed) : c.title,
                messages: [...c.messages, userMessage],
                updatedAt: nowIso(),
              }
            : c
        )
      );

      // Clear the composer's pending attachments now that they are persisted on the message.
      clearAttachments();
      setStatus({ status: 'thinking' });

      try {
        const { response } = await sendAgentMessage({
          text: trimmed || 'uploaded document',
          attachments: pendingAttachments,
          patientProfileId: profileId,
        });

        const assistantMessage: AgentMessage = {
          id: createId('msg'),
          role: 'assistant',
          content: response.title,
          createdAt: nowIso(),
          response,
          attachments: [],
          contextTags: activeProfile.contextTags,
          patientProfileId: profileId,
        };
        persistAssistantMessage(conversationId, assistantMessage);
        setStatus({ status: response.kind === 'emergency' ? 'emergency' : 'success' });
      } catch {
        setStatus({
          status: 'error',
          detail: 'We could not generate a response right now. Please try again.',
        });
      }
    },
    [activeConversationId, activeProfileId, activeProfile, setConversations, clearAttachments, persistAssistantMessage]
  );

  const triggerQuickAction = useCallback(
    async (actionId: string) => {
      const response = buildResponseForQuickAction(actionId);
      const conversationId = activeConversationId;

      const userMessage: AgentMessage = {
        id: createId('msg'),
        role: 'user',
        content: response.title,
        createdAt: nowIso(),
        attachments: [],
        contextTags: activeProfile.contextTags,
        patientProfileId: activeProfileId,
      };
      setConversations((current) =>
        current.map((c) =>
          c.id === conversationId
            ? {
                ...c,
                title: c.messages.filter((m) => m.role === 'user').length === 0 ? deriveTitleFromText(response.title) : c.title,
                messages: [...c.messages, userMessage],
                updatedAt: nowIso(),
              }
            : c
        )
      );

      setStatus({ status: 'thinking' });
      await new Promise<void>((resolve) => window.setTimeout(resolve, 500));
      const assistantMessage: AgentMessage = {
        id: createId('msg'),
        role: 'assistant',
        content: response.title,
        createdAt: nowIso(),
        response,
        attachments: [],
        contextTags: activeProfile.contextTags,
        patientProfileId: activeProfileId,
      };
      persistAssistantMessage(conversationId, assistantMessage);
      setStatus({ status: response.kind === 'emergency' ? 'emergency' : 'success' });
    },
    [activeConversationId, activeProfileId, activeProfile, setConversations, persistAssistantMessage]
  );

  const addRecoveryCheckIn = useCallback(
    (trend: RecoveryTrend, note?: string) => {
      const checkIn: RecoveryCheckIn = {
        id: createId('rec'),
        trend,
        note,
        recordedAt: nowIso(),
      };
      setRecovery((current) => ({
        ...current,
        currentTrend: trend,
        lastCheckInAt: nowIso(),
        streakDays: current.lastCheckInAt ? current.streakDays + 1 : 1,
        checkIns: [checkIn, ...current.checkIns].slice(0, 20),
      }));
    },
    [setRecovery]
  );

  const value = useMemo<AgentContextValue>(
    () => ({
      conversations,
      activeConversation,
      activeConversationId,
      setActiveConversationId,
      startNewConversation,
      deleteConversation,
      clearActiveConversation,
      patientProfiles,
      activeProfile,
      setActiveProfileId,
      language,
      setLanguage,
      status,
      isThinking: status.status === 'thinking' || status.status === 'processing',
      sendMessage,
      triggerQuickAction,
      attachments,
      addAttachments,
      updateAttachment,
      removeAttachment,
      clearAttachments,
      runAttachmentPipeline,
      recovery,
      addRecoveryCheckIn,
    }),
    [
      conversations,
      activeConversation,
      activeConversationId,
      setActiveConversationId,
      startNewConversation,
      deleteConversation,
      clearActiveConversation,
      patientProfiles,
      activeProfile,
      language,
      status,
      sendMessage,
      triggerQuickAction,
      attachments,
      addAttachments,
      updateAttachment,
      removeAttachment,
      clearAttachments,
      runAttachmentPipeline,
      recovery,
      addRecoveryCheckIn,
    ]
  );

  return <AgentContext.Provider value={value}>{children}</AgentContext.Provider>;
}

export function useAgent() {
  const context = useContext(AgentContext);
  if (!context) {
    throw new Error('useAgent must be used within an AgentProvider');
  }
  return context;
}
