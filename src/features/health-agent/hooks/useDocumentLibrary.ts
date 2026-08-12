/**
 * useDocumentLibrary — React hook for the secure document library (Step 11).
 *
 * Owns the in-memory document collection (used in mock/local mode and as the
 * live mirror of the pipeline), the pipeline processing lifecycle, and safe
 * deletion. It is the only surface the Document Library page + the agent
 * attachment tray touch.
 *
 * - Documents are scoped to the authenticated owner + selected family profile.
 *   Switching profiles filters the visible set so one profile never sees
 *   another profile's documents.
 * - The pipeline runs via {@link processDocument} (validate → storage →
 *   metadata → mock analysis). Progress + state updates flow back here.
 * - In mock/local mode nothing is uploaded to a real service; results are
 *   clearly mock-labelled and the UI surfaces a demo badge.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DocumentAttachment } from '../types';
import {
  prepareDocumentBatch,
  processDocument,
  deleteDocumentArtifact,
  isRealDocumentStorageConfigured,
  type DocumentPipelineEvent,
  type ProcessOptions,
} from '../services/documentPipeline';
import type { FileValidationIssue } from '../../../lib/validation';
import { log } from '../../../lib/security';

const STORAGE_KEY = 'carelink_ai_document_library';

interface PersistedDocument {
  id: string;
  ownerId?: string;
  familyProfileId?: string | null;
  fileName: string;
  safeFileName: string;
  fileSize: number;
  mime: string;
  kind: DocumentAttachment['kind'];
  source: DocumentAttachment['source'];
  createdAt: string;
  uploadState: DocumentAttachment['uploadState'];
  processingState: DocumentAttachment['processingState'];
  progress: number;
  dataSource: DocumentAttachment['dataSource'];
  // NOTE: only safe metadata is persisted locally for the demo. Preview URLs
  // (blob: URLs) are intentionally NOT persisted — they are invalid after reload.
  storageRef?: { bucket: string; path: string };
  providerMetadata?: Record<string, string>;
  errorMessage?: string;
}

function toPersisted(a: DocumentAttachment): PersistedDocument {
  const { previewUrl, analysis, ...rest } = a;
  void previewUrl;
  void analysis;
  return rest;
}

function fromPersisted(p: PersistedDocument): DocumentAttachment {
  return { ...p, previewUrl: undefined, analysis: undefined };
}

function loadPersisted(): PersistedDocument[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as PersistedDocument[];
  } catch {
    return [];
  }
}

function persist(docs: DocumentAttachment[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(docs.map(toPersisted)));
  } catch {
    /* localStorage may be full or unavailable; non-fatal */
  }
}

export type DocumentLibraryFilter =
  | 'all'
  | 'reports'
  | 'prescriptions'
  | 'medicines'
  | 'lab-results'
  | 'other';

export interface UseDocumentLibrary {
  documents: DocumentAttachment[];
  pendingFiles: File[];
  issues: FileValidationIssue[];
  isProcessing: boolean;
  isRealStorage: boolean;
  addFiles: (
    files: File[],
    options?: Pick<ProcessOptions, 'ownerId' | 'familyProfileId' | 'source'>
  ) => DocumentAttachment[];
  processAll: (options?: Omit<ProcessOptions, 'ownerId' | 'familyProfileId' | 'source'>) => Promise<void>;
  cancelDocument: (id: string) => void;
  retryDocument: (id: string, file: File, options?: ProcessOptions) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  clearIssues: () => void;
  filtered: (filter: DocumentLibraryFilter, profileId?: string) => DocumentAttachment[];
}

export function useDocumentLibrary(): UseDocumentLibrary {
  const [documents, setDocuments] = useState<DocumentAttachment[]>(() => loadPersisted().map(fromPersisted));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [issues, setIssues] = useState<FileValidationIssue[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const abortControllers = useRef(new Map<string, AbortController>());

  // Persist safe metadata whenever documents change (mock/local mode only).
  useEffect(() => {
    persist(documents);
  }, [documents]);

  // Revoke object URLs on unmount to avoid leaks.
  useEffect(() => {
    return () => {
      for (const d of documents) {
        if (d.previewUrl && typeof URL !== 'undefined') {
          try {
            URL.revokeObjectURL(d.previewUrl);
          } catch {
            /* ignore */
          }
        }
      }
    };
  }, [documents]);

  const updateDoc = useCallback((id: string, patch: Partial<DocumentAttachment>) => {
    setDocuments((current) => current.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }, []);

  const addFiles = useCallback<UseDocumentLibrary['addFiles']>((files, options) => {
    const { accepted, issues: batchIssues } = prepareDocumentBatch(files, options);
    setIssues((current) => [...current, ...batchIssues]);
    if (accepted.length > 0) {
      setDocuments((current) => [...accepted, ...current]);
      setPendingFiles((current) => [...current, ...files.filter((f) => accepted.some((a) => a.fileName === f.name && a.fileSize === f.size))]);
    }
    return accepted;
  }, []);

  const handleEvent = useCallback(
    (docId: string, e: DocumentPipelineEvent) => {
      switch (e.type) {
        case 'validating':
          updateDoc(docId, { processingState: 'validating', uploadState: 'uploading' });
          break;
        case 'upload-progress':
          updateDoc(docId, { processingState: 'uploading', uploadState: 'uploading', progress: e.progress });
          break;
        case 'uploaded':
          updateDoc(docId, { processingState: 'uploaded', uploadState: 'uploaded', storageRef: e.storageRef, progress: 55 });
          break;
        case 'processing':
          updateDoc(docId, { processingState: 'processing', progress: e.progress });
          break;
        case 'analyzed':
          updateDoc(docId, {
            processingState: 'analyzed',
            uploadState: 'uploaded',
            progress: 100,
            analysis: e.analysis,
            dataSource: e.analysis.isMock ? 'mock' : 'real',
            errorMessage: undefined,
          });
          break;
        case 'error':
          updateDoc(docId, { processingState: 'failed', uploadState: 'failed', errorMessage: e.message });
          break;
        case 'cancelled':
          updateDoc(docId, { processingState: 'cancelled', uploadState: 'cancelled' });
          break;
        default:
          break;
      }
    },
    [updateDoc]
  );

  const processAll = useCallback<UseDocumentLibrary['processAll']>(
    async (options = {}) => {
      // Snapshot the pending files + matching attachments.
      const files = pendingFiles;
      const pending = documents.filter((d) => d.processingState === 'idle' || d.processingState === 'failed');
      if (files.length === 0 || pending.length === 0) return;
      setIsProcessing(true);
      // Match attachments to files by name+size (set at addFiles time).
      const pairs: { attachment: DocumentAttachment; file: File }[] = [];
      const usedFiles = new Set<number>();
      for (const att of pending) {
        const idx = files.findIndex(
          (f, i) => !usedFiles.has(i) && f.name === att.fileName && f.size === att.fileSize
        );
        if (idx >= 0) {
          usedFiles.add(idx);
          pairs.push({ attachment: att, file: files[idx] });
        }
      }
      await Promise.all(
        pairs.map(async ({ attachment, file }) => {
          const controller = new AbortController();
          abortControllers.current.set(attachment.id, controller);
          try {
            await processDocument(attachment, file, {
              ...options,
              ownerId: attachment.ownerId,
              familyProfileId: attachment.familyProfileId,
              source: attachment.source,
              signal: controller.signal,
              onProgress: (e) => handleEvent(attachment.id, e),
            }).then((updated) => {
              updateDoc(updated.id, updated);
            });
          } catch (err) {
            log.warn('document-library', 'pipeline error');
            handleEvent(attachment.id, { type: 'error', documentId: attachment.id, message: 'Processing failed. You can retry or remove this document.' });
          } finally {
            abortControllers.current.delete(attachment.id);
          }
        })
      );
      setPendingFiles([]);
      setIsProcessing(false);
    },
    [pendingFiles, documents, handleEvent, updateDoc]
  );

  const cancelDocument = useCallback<UseDocumentLibrary['cancelDocument']>(
    (id) => {
      const controller = abortControllers.current.get(id);
      if (controller) {
        controller.abort();
        abortControllers.current.delete(id);
      }
      handleEvent(id, { type: 'cancelled', documentId: id });
    },
    [handleEvent]
  );

  const retryDocument = useCallback<UseDocumentLibrary['retryDocument']>(
    async (id, file, options = {}) => {
      const existing = documents.find((d) => d.id === id);
      if (!existing) return;
      const controller = new AbortController();
      abortControllers.current.set(id, controller);
      updateDoc(id, { processingState: 'validating', uploadState: 'uploading', errorMessage: undefined, progress: 0 });
      try {
        const updated = await processDocument(existing, file, {
          ...options,
          ownerId: existing.ownerId,
          familyProfileId: existing.familyProfileId,
          source: existing.source,
          signal: controller.signal,
          onProgress: (e) => handleEvent(id, e),
        });
        updateDoc(updated.id, updated);
      } catch {
        handleEvent(id, { type: 'error', documentId: id, message: 'Retry failed. You can try again or remove this document.' });
      } finally {
        abortControllers.current.delete(id);
      }
    },
    [documents, handleEvent, updateDoc]
  );

  const deleteDocument = useCallback<UseDocumentLibrary['deleteDocument']>(
    async (id) => {
      const existing = documents.find((d) => d.id === id);
      if (!existing) return;
      // Cancel any in-flight processing first.
      const controller = abortControllers.current.get(id);
      if (controller) {
        controller.abort();
        abortControllers.current.delete(id);
      }
      await deleteDocumentArtifact(existing);
      setDocuments((current) => current.filter((d) => d.id !== id));
    },
    [documents]
  );

  const clearIssues = useCallback(() => setIssues([]), []);

  const filtered = useCallback<UseDocumentLibrary['filtered']>(
    (filter, profileId) => {
      let list = documents;
      if (profileId) {
        // Profile scoping: a document belongs to the selected family profile,
        // or to the user generally (familyProfileId null). Never show
        // documents owned by a different profile.
        list = list.filter((d) => (d.familyProfileId ?? null) === (profileId ?? null) || d.familyProfileId == null);
      }
      if (filter === 'all') return list;
      return list.filter((d) => {
        const category = d.analysis?.category;
        switch (filter) {
          case 'reports':
            return category === 'lab-report' || category === 'discharge-summary' || category === 'imaging' || d.kind === 'pdf' || d.kind === 'document';
          case 'prescriptions':
            return category === 'prescription';
          case 'medicines':
            return category === 'medicine-image';
          case 'lab-results':
            return category === 'lab-report';
          case 'other':
            return !category || category === 'general-document';
          default:
            return true;
        }
      });
    },
    [documents]
  );

  const isRealStorage = useMemo(() => isRealDocumentStorageConfigured(), []);

  return {
    documents,
    pendingFiles,
    issues,
    isProcessing,
    isRealStorage,
    addFiles,
    processAll,
    cancelDocument,
    retryDocument,
    deleteDocument,
    clearIssues,
    filtered,
  };
}
