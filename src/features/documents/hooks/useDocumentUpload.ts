/**
 * CareLink-AI — Step 11 upload pipeline hook.
 *
 * State machine for the SELECT → VALIDATE → UPLOAD → PERSIST → PROCESS → ANALYZE
 * pipeline. Each attachment carries its own state, progress, cancel token, and
 * error. The hook keeps transient attachments in React state only (never in
 * global store) so large binaries don't bloat app state.
 *
 * Exposes:
 * - addFiles: validate + queue
 * - startUpload: run the pipeline for one attachment
 * - retry: re-run a failed attachment
 * - cancel: abort an in-flight upload
 * - remove: discard an attachment (before or after)
 */

import { useCallback, useRef, useState } from 'react';
import { log } from '../../../lib/security';
import { createId } from '../../../lib';
import {
  detectDocumentKind,
  sanitizeDisplayName,
  sanitizePublicIdSlug,
  validateDocumentBatch,
  type DocumentValidationIssue,
} from '../services/fileValidation';
import { uploadAndAnalyzeDocument } from '../services/documentService';
import type { DocumentAttachment } from '../types';

export interface UseDocumentUploadContext {
  ownerId: string;
  familyProfileId: string | null;
}

export interface UseDocumentUploadResult {
  attachments: DocumentAttachment[];
  issues: DocumentValidationIssue[];
  addFiles: (files: FileList | File[] | null, ctx: UseDocumentUploadContext) => DocumentAttachment[];
  startUpload: (id: string, ctx: UseDocumentUploadContext) => Promise<void>;
  retry: (id: string, ctx: UseDocumentUploadContext) => Promise<void>;
  cancel: (id: string) => void;
  remove: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
}

const nowId = () => createId('att');

function fileToAttachment(file: File): DocumentAttachment {
  const kind = detectDocumentKind(file);
  const previewUrl = kind === 'image' && typeof URL !== 'undefined' ? URL.createObjectURL(file) : null;
  return {
    id: nowId(),
    file,
    fileName: sanitizeDisplayName(file.name),
    publicIdSlug: sanitizePublicIdSlug(file.name),
    mimeType: file.type || 'application/octet-stream',
    fileSize: file.size,
    kind,
    previewUrl,
    pipelineState: 'idle',
    uploadProgress: 0,
    processingProgress: 0,
    storageReference: null,
    storageSource: null,
    errorMessage: null,
  };
}

const isTerminal = (s: DocumentAttachment['pipelineState']) => s === 'completed' || s === 'failed' || s === 'cancelled';
const isMutable = (s: DocumentAttachment['pipelineState']) => s === 'idle' || s === 'failed' || s === 'cancelled';

export function useDocumentUpload(): UseDocumentUploadResult {
  const [attachments, setAttachments] = useState<DocumentAttachment[]>([]);
  const [issues, setIssues] = useState<DocumentValidationIssue[]>([]);
  const activeUploads = useRef<Set<string>>(new Set());

  const patch = useCallback((id: string, p: Partial<DocumentAttachment>) => {
    setAttachments((prev) => prev.map((a) => (a.id === id ? { ...a, ...p } : a)));
  }, []);

  const addFiles = useCallback(
    (files: FileList | File[] | null, _ctx: UseDocumentUploadContext): DocumentAttachment[] => {
      const existing = attachments.map((a) => ({ fileName: a.fileName, fileSize: a.fileSize }));
      const { accepted, issues: batchIssues } = validateDocumentBatch(files, existing);
      if (batchIssues.length > 0) setIssues((prev) => [...prev, ...batchIssues]);
      if (accepted.length === 0) return [];
      const newOnes = accepted.map(fileToAttachment);
      setAttachments((prev) => [...prev, ...newOnes]);
      return newOnes;
    },
    [attachments]
  );

  const startUpload = useCallback(
    async (id: string, ctx: UseDocumentUploadContext) => {
      const target = attachments.find((a) => a.id === id);
      if (!target) return;
      if (!isMutable(target.pipelineState)) return;
      if (activeUploads.current.has(id)) return;
      activeUploads.current.add(id);

      const abortController = new AbortController();
      patch(id, { pipelineState: 'validating', errorMessage: null, abortController });

      const onUploadProgress = (progress: number) => {
        patch(id, { pipelineState: 'uploading', uploadProgress: progress });
      };
      const onProcessingProgress = (progress: number) => {
        patch(id, { pipelineState: progress < 100 ? 'analyzing' : 'completed', processingProgress: progress });
      };

      try {
        patch(id, { pipelineState: 'uploading', uploadProgress: 5 });
        const res = await uploadAndAnalyzeDocument({
          file: target.file,
          ctx: { ownerId: ctx.ownerId, familyProfileId: ctx.familyProfileId },
          signal: abortController.signal,
          onUploadProgress,
          onProcessingProgress,
        });

        if (!res.ok) {
          patch(id, { pipelineState: 'failed', errorMessage: res.error, uploadProgress: 0 });
          return;
        }
        const { document, analysis } = res.outcome;
        patch(id, {
          pipelineState: 'completed',
          uploadProgress: 100,
          processingProgress: 100,
          storageReference: document.storageReference,
          storageSource: document.storageSource,
          errorMessage: null,
        });
        // Stash analysis id on the attachment via providerMetadata-free channel:
        // the consumer reads it from the returned document; we expose it through
        // a custom property set on the attachment for the agent integration.
        (target as DocumentAttachment & { analysisDocumentId?: string }).analysisDocumentId = document.id;
        void analysis;
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          patch(id, { pipelineState: 'cancelled', errorMessage: 'Upload cancelled.' });
        } else {
          log.warn('document-upload', 'pipeline failed', err);
          patch(id, { pipelineState: 'failed', errorMessage: 'We could not process this document. Please try again.' });
        }
      } finally {
        activeUploads.current.delete(id);
      }
    },
    [attachments, patch]
  );

  const retry = useCallback(
    async (id: string, ctx: UseDocumentUploadContext) => {
      patch(id, { errorMessage: null, uploadProgress: 0, processingProgress: 0, storageReference: null, storageSource: null });
      await startUpload(id, ctx);
    },
    [patch, startUpload]
  );

  const cancel = useCallback(
    (id: string) => {
      const target = attachments.find((a) => a.id === id);
      if (!target) return;
      if (isTerminal(target.pipelineState)) return;
      target.abortController?.abort();
      patch(id, { pipelineState: 'cancelled', errorMessage: 'Upload cancelled.' });
    },
    [attachments, patch]
  );

  const remove = useCallback(
    (id: string) => {
      setAttachments((prev) => {
        const target = prev.find((a) => a.id === id);
        if (target?.abortController) target.abortController.abort();
        if (target?.previewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(target.previewUrl);
        return prev.filter((a) => a.id !== id);
      });
    },
    []
  );

  const clearCompleted = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => {
        if (a.pipelineState === 'completed' && a.previewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(a.previewUrl);
      });
      return prev.filter((a) => !isTerminal(a.pipelineState));
    });
  }, []);

  const clearAll = useCallback(() => {
    setAttachments((prev) => {
      prev.forEach((a) => {
        a.abortController?.abort();
        if (a.previewUrl && typeof URL !== 'undefined') URL.revokeObjectURL(a.previewUrl);
      });
      return [];
    });
    setIssues([]);
  }, []);

  return {
    attachments,
    issues,
    addFiles,
    startUpload,
    retry,
    cancel,
    remove,
    clearCompleted,
    clearAll,
  };
}
