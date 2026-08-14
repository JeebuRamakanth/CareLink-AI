/**
 * CareLink-AI — Step 11 document upload card.
 *
 * Premium per-attachment card: file preview, name, size, type, upload progress,
 * processing animation, completion, retry, cancel, remove. Reuses the design
 * system tokens (glass surfaces, brand/accent). Subtle Framer Motion only.
 *
 * State-aware: idle/validating/uploading/uploaded/processing/analyzing/completed/
 * failed/cancelled each get a polished treatment.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { IconCamera, IconClose, IconPaperclip, IconReport, IconShield, IconSparkle } from '../../../components/agent/AgentIcons';
import { formatFileSize } from '../services/fileValidation';
import type { DocumentAttachment } from '../types';

const stateLabel: Record<DocumentAttachment['pipelineState'], string> = {
  idle: 'Ready to upload',
  validating: 'Validating',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  processing: 'Processing document',
  analyzing: 'Analyzing content',
  completed: 'Analysis ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const kindLabel: Record<DocumentAttachment['kind'], string> = {
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  lab_report: 'Lab report',
  prescription: 'Prescription',
  medicine_image: 'Medicine image',
  other: 'File',
};

interface Props {
  attachment: DocumentAttachment;
  onUpload: (id: string) => void;
  onRetry: (id: string) => void;
  onCancel: (id: string) => void;
  onRemove: (id: string) => void;
}

export function DocumentUploadCard({ attachment, onUpload, onRetry, onCancel, onRemove }: Props) {
  const { pipelineState: state } = attachment;
  const isInflight = state === 'uploading' || state === 'validating' || state === 'processing' || state === 'analyzing' || state === 'uploaded';
  const isError = state === 'failed';
  const isDone = state === 'completed';
  const isCancelled = state === 'cancelled';
  const canUpload = state === 'idle' || state === 'failed' || state === 'cancelled';

  const progress = Math.max(attachment.uploadProgress, attachment.processingProgress);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={cn(
        'overflow-hidden rounded-[1rem] border bg-slate-950/50 p-3 backdrop-blur-xl sm:p-3.5',
        isError ? 'border-rose-400/30' : isDone ? 'border-emerald-400/25' : 'border-white/10'
      )}
    >
      <div className="flex items-start gap-3">
        {/* Preview / icon */}
        <div className="relative shrink-0">
          {attachment.kind === 'image' && attachment.previewUrl ? (
            <img
              src={attachment.previewUrl}
              alt={`Preview of ${attachment.fileName}`}
              className="size-14 rounded-[0.7rem] border border-white/10 object-cover"
            />
          ) : (
            <span className="flex size-14 items-center justify-center rounded-[0.7rem] border border-white/10 bg-white/8 text-ink-200">
              <IconReport width={22} height={22} aria-hidden />
            </span>
          )}
          {isDone ? (
            <span className="absolute -bottom-1 -right-1 flex size-5 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/30 text-emerald-100">
              <IconShield width={11} height={11} aria-hidden />
            </span>
          ) : null}
        </div>

        {/* Meta + state */}
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-semibold text-white">{attachment.fileName}</p>
              <p className="text-[0.72rem] text-ink-400">
                {kindLabel[attachment.kind]} · {formatFileSize(attachment.fileSize)}
                {attachment.storageSource && attachment.storageSource !== 'local' ? ` · ${attachment.storageSource}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => (isInflight ? onCancel(attachment.id) : onRemove(attachment.id))}
              aria-label={isInflight ? `Cancel ${attachment.fileName}` : `Remove ${attachment.fileName}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
            >
              <IconClose width={14} height={14} />
            </button>
          </div>

          {/* Progress / state line */}
          <AnimatePresence mode="wait">
            {isInflight ? (
              <motion.div key="progress" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-1.5">
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
                  role="progressbar"
                  aria-valuenow={progress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${attachment.fileName} progress`}
                >
                  <div className="agent-progress-bar h-full rounded-full bg-gradient-to-r from-brand-400 to-accent-400 transition-all duration-300" style={{ width: `${progress}%` }} />
                </div>
                <p className="flex items-center gap-1.5 text-[0.72rem] text-ink-300">
                  <span className="agent-thinking-dot size-1.5 rounded-full bg-brand-400" aria-hidden />
                  {stateLabel[state]}…
                </p>
              </motion.div>
            ) : isDone ? (
              <motion.p key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center gap-1.5 text-[0.72rem] font-medium text-emerald-200">
                <IconShield width={13} height={13} aria-hidden /> {stateLabel.completed} — ready for the agent
              </motion.p>
            ) : isError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-2">
                <p className="text-[0.72rem] text-rose-200">{attachment.errorMessage ?? 'Upload failed'}</p>
                <button type="button" onClick={() => onRetry(attachment.id)} className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-rose-100 transition hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                  Retry
                </button>
              </motion.div>
            ) : isCancelled ? (
              <motion.div key="cancelled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-2">
                <p className="text-[0.72rem] text-ink-400">{stateLabel.cancelled}</p>
                <button type="button" onClick={() => onUpload(attachment.id)} className="rounded-full border border-white/12 bg-white/8 px-2.5 py-1 text-[0.72rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                  Upload again
                </button>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1.5 text-[0.72rem] text-ink-300">
                  <IconPaperclip width={12} height={12} aria-hidden /> {stateLabel.idle}
                </p>
                {canUpload ? (
                  <button type="button" onClick={() => onUpload(attachment.id)} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-2.5 py-1 text-[0.72rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
                    <IconSparkle width={12} height={12} aria-hidden /> Upload
                  </button>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  );
}

/** Compact camera icon button used in the upload zone. */
export function CameraCaptureButton({ onFiles, disabled }: { onFiles: (files: FileList | null) => void; disabled?: boolean }) {
  return (
    <label className={cn(
      'inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-200 transition hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40',
      disabled && 'pointer-events-none opacity-40'
    )}>
      <IconCamera width={15} height={15} aria-hidden />
      <span>Scan / camera</span>
      <input
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        aria-label="Use camera to scan or capture a document"
      />
    </label>
  );
}
