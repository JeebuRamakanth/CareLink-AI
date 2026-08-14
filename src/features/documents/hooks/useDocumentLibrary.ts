/**
 * CareLink-AI — Step 11 documents library hook.
 *
 * Loads the active family profile's documents (RLS-scoped / local mock), keeps
 * the selected document + its analysis for the viewer, and wires View / Analyze
 * / Delete actions. Family-profile switching reloads the list so documents are
 * never mixed across members.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { log } from '../../../lib/security';
import { useOptionalAuth } from '../../../contexts/AuthContext';
import { useAgent } from '../../../contexts/AgentContext';
import {
  analyzeExistingDocument,
  deleteDocument,
  documentStorageModeLabel,
  listDocumentsForContext,
} from '../services/documentService';
import type { DocumentAnalysisResult, HealthDocument } from '../types';

export interface UseDocumentLibrary {
  documents: HealthDocument[];
  loading: boolean;
  error: string | null;
  activeProfileLabel: string;
  activeProfileId: string | null;
  ownerId: string;
  storageModeLabel: string;
  selected: HealthDocument | null;
  selectedAnalysis: DocumentAnalysisResult | null;
  reload: () => Promise<void>;
  onView: (doc: HealthDocument) => void;
  onAnalyze: (doc: HealthDocument) => Promise<void>;
  onDelete: (doc: HealthDocument) => Promise<void>;
  closeViewer: () => void;
  analyzingId: string | null;
}

export function useDocumentLibrary(): UseDocumentLibrary {
  const auth = useOptionalAuth();
  const agent = useAgent();
  const [documents, setDocuments] = useState<HealthDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzingId, setAnalyzingId] = useState<string | null>(null);

  const activeProfileId = agent.activeProfile.id === 'self' ? null : agent.activeProfile.id;
  const activeProfileLabel = agent.activeProfile.label || 'Self';
  // Use the auth user id when available; otherwise a stable local-demo id.
  const ownerId = auth.user?.id ?? 'local-demo-user';

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const docs = await listDocumentsForContext({ ownerId, familyProfileId: activeProfileId });
      setDocuments(docs);
    } catch (err) {
      log.warn('document-library', 'load failed', err);
      setError('We could not load your documents. Please try again.');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [ownerId, activeProfileId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const selected = useMemo(() => documents.find((d) => d.id === selectedId) ?? null, [documents, selectedId]);
  const selectedAnalysis = selected?.analysis ?? null;

  const onView = useCallback((doc: HealthDocument) => {
    setSelectedId(doc.id);
  }, []);

  const onAnalyze = useCallback(async (doc: HealthDocument) => {
    setAnalyzingId(doc.id);
    setError(null);
    try {
      const analysis = await analyzeExistingDocument(doc.id);
      if (analysis) {
        setDocuments((prev) => prev.map((d) => (d.id === doc.id ? { ...d, analysis, analysisStatus: 'ready', pipelineState: 'completed' } : d)));
      }
    } catch (err) {
      log.warn('document-library', 'analyze failed', err);
      setError('We could not analyze this document. Please try again.');
    } finally {
      setAnalyzingId(null);
    }
  }, []);

  const onDelete = useCallback(async (doc: HealthDocument) => {
    setError(null);
    try {
      const ok = await deleteDocument(doc.id);
      if (ok) {
        setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
        if (selectedId === doc.id) setSelectedId(null);
      } else {
        setError('We could not delete this document. Please try again.');
      }
    } catch (err) {
      log.warn('document-library', 'delete failed', err);
      setError('We could not delete this document. Please try again.');
    }
  }, [selectedId]);

  const closeViewer = useCallback(() => setSelectedId(null), []);

  return {
    documents,
    loading,
    error,
    activeProfileLabel,
    activeProfileId,
    ownerId,
    storageModeLabel: documentStorageModeLabel(),
    selected,
    selectedAnalysis,
    reload,
    onView,
    onAnalyze,
    onDelete,
    closeViewer,
    analyzingId,
  };
}
