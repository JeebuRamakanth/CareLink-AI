/**
 * useHealthAgent — React hook wrapping the AgentOrchestrator.
 *
 * Exposes a small state machine (idle → thinking → result | error | emergency)
 * plus the document pipeline and recovery check-ins. The hook is the only
 * surface components touch; it keeps all async/orchestration logic out of JSX.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { createAgentOrchestrator } from '../services/agentOrchestrator';
import { mockAdapters } from '../services/adapters/mockAdapters';
import { useOptionalLocationContext } from '../../../contexts/LocationContext';
import type {
  AgentLanguage,
  AgentOrchestratorResponse,
  AgentResult,
  HealthDocument,
  PatientContext,
  PatientProfile,
  RecoveryTrend,
} from '../types';
import { patientProfiles, newCheckIn, recoverySeed } from '../data/mockData';
import {
  ACCEPTED_MIMES,
  detectDocumentKind,
  documentPipelineSteps,
  MAX_FILE_SIZE_BYTES,
} from '../utils/helpers';

export type HealthAgentStatus =
  | 'idle'
  | 'thinking'
  | 'processing'
  | 'result'
  | 'error'
  | 'emergency';

export interface HealthAgentState {
  status: HealthAgentStatus;
  result: AgentResult | null;
  lastResponse: AgentOrchestratorResponse | null;
  documents: HealthDocument[];
  error: string | null;
  language: AgentLanguage;
  patientProfiles: PatientProfile[];
  activeProfileId: string;
}

export interface UseHealthAgent extends HealthAgentState {
  activeProfile: PatientContext;
  recovery: import('../types').RecoveryStatus;
  setLanguage: (lang: AgentLanguage) => void;
  setActiveProfileId: (id: string) => void;
  submit: (text: string) => Promise<void>;
  addDocuments: (files: File[]) => HealthDocument[];
  removeDocument: (id: string) => void;
  clearDocuments: () => void;
  runDocumentPipeline: (id: string) => void;
  reset: () => void;
  recoveryCheckIn: (trend: RecoveryTrend, note?: string) => Promise<void>;
}

const createId = (prefix = 'doc') => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

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

const activePatientContext = (profileId: string): PatientContext => {
  const profile = patientProfiles.find((p) => p.id === profileId) ?? patientProfiles[0];
  return { activeProfileId: profile.id, profile };
};

export function useHealthAgent(): UseHealthAgent {
  // Resolved registry (Step 9/13): real providers engage when configured,
  // mock fallback otherwise — never a hardcoded mock-only pipeline.
  const orchestrator = useRef(createAgentOrchestrator());
  const pipelineLocks = useRef<Set<string>>(new Set());

  const [status, setStatus] = useState<HealthAgentStatus>('idle');
  const [result, setResult] = useState<AgentResult | null>(null);
  const [lastResponse, setLastResponse] = useState<AgentOrchestratorResponse | null>(null);
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<AgentLanguage>('en');
  const [activeProfileId, setActiveProfileId] = useState<string>('self');
  const [recovery, setRecovery] = useState(recoverySeed);

  const locationCtx = useOptionalLocationContext();
  const activeProfile = useMemo<PatientContext>(() => {
    const base = activePatientContext(activeProfileId);
    const loc = locationCtx?.location;
    const location = loc && typeof loc.lat === 'number' && typeof loc.lng === 'number'
      ? { label: loc.label, lat: loc.lat, lng: loc.lng }
      : undefined;
    return { ...base, location };
  }, [activeProfileId, locationCtx]);

  const addDocuments = useCallback((files: File[]): HealthDocument[] => {
    const valid: HealthDocument[] = [];
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError(`${file.name} exceeds 10 MB`);
        continue;
      }
      const mime = file.type || 'application/octet-stream';
      if (file.type && !ACCEPTED_MIMES.includes(mime) && /\.(jpg|jpeg|png|webp|pdf|docx?)$/i.test(file.name) === false) {
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

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      const pendingDocs = documents;
      if (!trimmed && pendingDocs.length === 0) return;

      setStatus('thinking');
      setError(null);

      try {
        const response = await orchestrator.current.handle({
          text: trimmed || 'uploaded document',
          documents: pendingDocs,
          patientContext: activeProfile,
          language,
        });
        setResult(response.result);
        setLastResponse(response);
        setStatus(response.result.urgency === 'emergency' ? 'emergency' : 'result');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
        setStatus('error');
      }
    },
    [documents, activeProfile, language]
  );

  const reset = useCallback(() => {
    setResult(null);
    setLastResponse(null);
    setError(null);
    setStatus('idle');
  }, []);

  const recoveryCheckIn = useCallback(async (trend: RecoveryTrend, note?: string) => {
    setStatus('thinking');
    try {
      const updated = await mockAdapters.recovery.checkIn(trend, note);
      setRecovery(updated);
      setStatus('result');
    } catch {
      setError('Could not save your check-in. Please try again.');
      setStatus('error');
    }
  }, []);

  const state: HealthAgentState = {
    status,
    result,
    lastResponse,
    documents,
    error,
    language,
    patientProfiles,
    activeProfileId,
  };

  // Merge recovery into result so the recovery card stays reactive after a check-in.
  const reactiveResult = useMemo<AgentResult | null>(() => {
    if (!result) return null;
    if (result.intent === 'recovery') return { ...result, recovery };
    return result;
  }, [result, recovery]);

  return {
    ...state,
    result: reactiveResult,
    activeProfile,
    setLanguage,
    setActiveProfileId,
    submit,
    addDocuments,
    removeDocument,
    clearDocuments,
    runDocumentPipeline,
    reset,
    recoveryCheckIn,
    recovery,
  };
}

export { newCheckIn };
