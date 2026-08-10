/**
 * Step 8 — Attachment tray.
 * Premium upload experience: progress, preview, file type, size, processing
 * states (uploading → reading → extracting → organizing → preparing → ready),
 * success/error, remove/retry. Mock "AI analysis" pipeline UI only.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../common/cn';
import { IconPaperclip, IconCamera, IconClose, IconReport, IconShield } from './AgentIcons';
import { useAgent } from '../../contexts/AgentContext';
import type { AgentAttachment, AttachmentKind } from '../../services/agent/agentTypes';

const ACCEPT = '.jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const kindLabel: Record<AttachmentKind, string> = {
  image: 'Image',
  pdf: 'PDF',
  document: 'Document',
  camera: 'Camera scan',
  unknown: 'File',
};

const statusLabel: Record<AgentAttachment['status'], string> = {
  queued: 'Queued',
  uploading: 'Uploading',
  reading: 'Reading document',
  extracting: 'Extracting medical information',
  organizing: 'Organizing findings',
  preparing: 'Preparing explanation',
  ready: 'Analysis ready',
  error: 'Failed',
};

export function AttachmentTray() {
  const { attachments, addAttachments, removeAttachment, runAttachmentPipeline, status } = useAgent();

  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newOnes = addAttachments(Array.from(files));
    // Kick off the mock pipeline for each new attachment.
    for (const att of newOnes) {
      runAttachmentPipeline(att.id);
    }
  };

  const statusBanner = status.status === 'file-too-large' || status.status === 'unsupported-file' ? status : null;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label
          className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-200 transition-all duration-200 hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40"
        >
          <IconPaperclip width={15} height={15} aria-hidden />
          <span>Upload file</span>
          <input
            type="file"
            accept={ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
            aria-label="Upload medical report, prescription, or image"
          />
        </label>

        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-200 transition-all duration-200 hover:border-brand-400/40 hover:bg-brand-400/10 hover:text-white focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40">
          <IconCamera width={15} height={15} aria-hidden />
          <span>Scan / camera</span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
            aria-label="Use camera to scan a document"
          />
        </label>

        <span className="hidden text-[0.72rem] text-ink-400 sm:inline">
          JPG · PNG · WEBP · PDF · DOC · DOCX · max 10 MB
        </span>
      </div>

      {statusBanner ? (
        <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[0.78rem] text-amber-200" role="status">
          {status.status === 'file-too-large' ? `File too large — ${status.detail ?? 'exceeds 10 MB'}` : `Unsupported file — ${status.detail ?? 'format not allowed'}`}
        </p>
      ) : null}

      <AnimatePresence mode="popLayout">
        {attachments.map((attachment) => (
          <motion.div
            key={attachment.id}
            layout
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <AttachmentItem attachment={attachment} onRemove={() => removeAttachment(attachment.id)} onRetry={() => runAttachmentPipeline(attachment.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function AttachmentItem({ attachment, onRemove, onRetry }: { attachment: AgentAttachment; onRemove: () => void; onRetry: () => void }) {
  const isProcessing = attachment.status !== 'ready' && attachment.status !== 'error';
  const isError = attachment.status === 'error';

  return (
    <div className={cn('rounded-[0.9rem] border bg-slate-950/50 p-3', isError ? 'border-rose-400/30' : 'border-white/10')}>
      <div className="flex items-start gap-3">
        {attachment.kind === 'image' && attachment.previewUrl ? (
          <img src={attachment.previewUrl} alt={`Preview of ${attachment.fileName}`} className="size-12 shrink-0 rounded-[0.6rem] border border-white/10 object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[0.6rem] border border-white/10 bg-white/8 text-ink-200">
            <IconReport width={20} height={20} />
          </span>
        )}

        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <p className="truncate text-sm font-semibold text-white">{attachment.fileName}</p>
              <p className="text-[0.72rem] text-ink-400">
                {kindLabel[attachment.kind]} · {formatBytes(attachment.fileSize)}
              </p>
            </div>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${attachment.fileName}`}
              className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
            >
              <IconClose width={14} height={14} />
            </button>
          </div>

          {isProcessing ? (
            <div className="space-y-1.5">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={attachment.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${attachment.fileName} processing`}>
                <div className="agent-progress-bar h-full rounded-full transition-all duration-300" style={{ width: `${attachment.progress}%` }} />
              </div>
              <p className="flex items-center gap-1.5 text-[0.72rem] text-ink-300">
                <span className="size-1.5 animate-pulse rounded-full bg-brand-400" aria-hidden />
                {statusLabel[attachment.status]}…
              </p>
            </div>
          ) : null}

          {attachment.status === 'ready' ? (
            <p className="flex items-center gap-1.5 text-[0.72rem] font-medium text-emerald-200">
              <IconShield width={13} height={13} aria-hidden />
              {statusLabel.ready} — mock analysis complete
            </p>
          ) : null}

          {isError ? (
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.72rem] text-rose-200">{attachment.errorMessage ?? 'Analysis unavailable'}</p>
              <button
                type="button"
                onClick={onRetry}
                className="rounded-full border border-rose-400/30 bg-rose-400/10 px-2.5 py-1 text-[0.72rem] font-semibold text-rose-100 transition hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
