/**
 * CareLink-AI — Step 11 upload zone.
 *
 * Premium drop target + file selector + camera capture. Desktop: drag & drop and
 * click-to-browse. Mobile: camera + gallery. Renders the list of in-flight
 * attachments via DocumentUploadCard and surfaces validation issues safely.
 *
 * Pure UI: it does not call storage directly. The parent passes an already-wired
 * `useDocumentUpload` instance (ctx-aware), so the zone only orchestrates UI.
 */

import { useCallback, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { IconClose, IconPaperclip, IconShield, IconUpload } from '../../../components/agent/AgentIcons';
import { DOCUMENT_ACCEPT_ATTR, formatFileSize, MAX_DOCUMENT_SIZE_BYTES } from '../services/fileValidation';
import { DocumentUploadCard, CameraCaptureButton } from './DocumentUploadCard';
import type { UseDocumentUploadContext, UseDocumentUploadResult } from '../hooks/useDocumentUpload';

interface Props {
  upload: UseDocumentUploadResult;
  ctx: UseDocumentUploadContext;
  /** Optional compact mode for embedding inside the agent composer. */
  compact?: boolean;
}

export function DocumentUploadZone({ upload, ctx, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handleFiles = useCallback(
    (files: FileList | File[] | null) => {
      const newOnes = upload.addFiles(files, ctx);
      // Auto-start upload for accepted files.
      for (const att of newOnes) {
        void upload.startUpload(att.id, ctx);
      }
    },
    [upload, ctx]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      if (e.dataTransfer?.files) handleFiles(e.dataTransfer.files);
    },
    [handleFiles]
  );

  const hasAttachments = upload.attachments.length > 0;

  return (
    <div className={cn('space-y-2.5', compact && 'space-y-2')}>
      {/* Drop target + selectors */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        aria-label="Upload medical documents — click or drop files"
        className={cn(
          'group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[1.1rem] border-2 border-dashed p-4 text-center transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 sm:p-5',
          dragging ? 'border-brand-400/60 bg-brand-400/10' : 'border-white/12 bg-white/[0.03] hover:border-brand-400/40 hover:bg-brand-400/[0.06]',
          compact && 'p-3'
        )}
      >
        <span className={cn('flex items-center justify-center rounded-full border border-white/10 bg-white/5 text-brand-200 transition group-hover:bg-brand-400/10', compact ? 'size-9' : 'size-11')}>
          <IconUpload width={compact ? 16 : 20} height={compact ? 16 : 20} aria-hidden />
        </span>
        <div className="space-y-0.5">
          <p className={cn('font-semibold text-white', compact ? 'text-[0.8rem]' : 'text-sm')}>
            {dragging ? 'Drop to upload' : 'Upload medical documents'}
          </p>
          <p className="text-[0.7rem] text-ink-400">
            Drag & drop, or browse · JPG · PNG · WEBP · PDF · DOC · DOCX · max {formatFileSize(MAX_DOCUMENT_SIZE_BYTES)}
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={DOCUMENT_ACCEPT_ATTR}
          multiple
          className="sr-only"
          onChange={(e) => { handleFiles(e.target.files); e.target.value = ''; }}
          aria-label="Choose medical documents to upload"
        />
      </div>

      {/* Selector chips (camera always visible for mobile) */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          <IconPaperclip width={15} height={15} aria-hidden /> Browse files
        </button>
        <CameraCaptureButton onFiles={handleFiles} />
        {hasAttachments ? (
          <button
            type="button"
            onClick={upload.clearCompleted}
            className="ml-auto inline-flex items-center gap-1 rounded-full border border-white/10 px-2.5 py-1 text-[0.72rem] font-medium text-ink-300 transition hover:bg-white/10 hover:text-white"
          >
            Clear completed
          </button>
        ) : null}
      </div>

      {/* Validation issues */}
      <AnimatePresence>
        {upload.issues.length > 0 ? (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5 overflow-hidden"
          >
            {upload.issues.slice(-4).map((issue, idx) => (
              <div key={`${issue.fileName}-${idx}`} className="flex items-start justify-between gap-2 rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2" role="status">
                <p className="text-[0.74rem] leading-5 text-amber-100">{issue.message}</p>
                <button
                  type="button"
                  onClick={() => upload.remove('__noop__')}
                  aria-label="Dismiss"
                  className="sr-only"
                />
                <span className="flex items-center gap-1 text-[0.66rem] font-semibold uppercase tracking-[0.18em] text-amber-200/80">
                  <IconShield width={11} height={11} aria-hidden /> blocked
                </span>
              </div>
            ))}
            <button
              type="button"
              onClick={() => upload.clearAll()}
              className="inline-flex items-center gap-1 text-[0.7rem] font-medium text-ink-300 hover:text-white"
            >
              <IconClose width={11} height={11} aria-hidden /> Dismiss notices
            </button>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* In-flight attachments */}
      <AnimatePresence mode="popLayout">
        {upload.attachments.map((attachment) => (
          <DocumentUploadCard
            key={attachment.id}
            attachment={attachment}
            onUpload={(id) => void upload.startUpload(id, ctx)}
            onRetry={(id) => void upload.retry(id, ctx)}
            onCancel={(id) => upload.cancel(id)}
            onRemove={(id) => upload.remove(id)}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}
