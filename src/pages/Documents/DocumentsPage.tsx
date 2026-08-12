/**
 * CareLink-AI — Medical Documents page (Step 11).
 *
 * Premium, responsive document library for the authenticated user + selected
 * patient/family profile. Shows recent documents with type, upload date,
 * processing state, and View / Analyze / Delete actions. Supports the required
 * filters: All / Reports / Prescriptions / Medicines / Lab Results / Other.
 *
 * In mock/local mode (no Cloudinary/Supabase), uploads use a local blob URL
 * and results are clearly demo-labelled — never pretending real cloud
 * processing happened.
 */

import { useCallback, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';
import { useDocumentLibrary } from '../../features/health-agent/hooks/useDocumentLibrary';
import type { DocumentLibraryFilter } from '../../features/health-agent/hooks/useDocumentLibrary';
import { ACCEPT_ATTR, formatBytes, MAX_FILE_SIZE_BYTES } from '../../features/health-agent/utils/helpers';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { cn } from '../../components/common/cn';
import { IconReport, IconShield, IconClose, IconPaperclip, IconCamera } from '../../components/agent/AgentIcons';
import type { DocumentAttachment } from '../../features/health-agent/types';

const FILTERS: { value: DocumentLibraryFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'reports', label: 'Reports' },
  { value: 'prescriptions', label: 'Prescriptions' },
  { value: 'medicines', label: 'Medicines' },
  { value: 'lab-results', label: 'Lab Results' },
  { value: 'other', label: 'Other' },
];

function categoryLabel(d: DocumentAttachment): string {
  switch (d.analysis?.category) {
    case 'lab-report':
      return 'Lab report';
    case 'prescription':
      return 'Prescription';
    case 'medicine-image':
      return 'Medicine photo';
    case 'discharge-summary':
      return 'Discharge summary';
    case 'imaging':
      return 'Imaging';
    case 'general-document':
      return 'Document';
    default:
      return d.kind === 'pdf' ? 'PDF' : d.kind === 'image' ? 'Image' : 'Document';
  }
}

function stateLabel(d: DocumentAttachment): { text: string; tone: string } {
  switch (d.processingState) {
    case 'analyzed':
      return { text: 'Ready', tone: 'text-emerald-200' };
    case 'uploading':
    case 'uploaded':
    case 'processing':
    case 'validating':
      return { text: 'Processing…', tone: 'text-brand-200' };
    case 'failed':
      return { text: 'Failed', tone: 'text-rose-200' };
    case 'cancelled':
      return { text: 'Cancelled', tone: 'text-ink-300' };
    default:
      return { text: 'Queued', tone: 'text-ink-300' };
  }
}

export function DocumentsPage() {
  const { user } = useAuth();
  const library = useDocumentLibrary();
  const [filter, setFilter] = useState<DocumentLibraryFilter>('all');
  const [selected, setSelected] = useState<DocumentAttachment | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null, source: DocumentAttachment['source'] = 'upload') => {
      if (!files || files.length === 0) return;
      library.addFiles(Array.from(files), {
        ownerId: user?.id,
        familyProfileId: null,
        source,
      });
    },
    [library, user]
  );

  const onDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      if (e.dataTransfer.files?.length) {
        handleFiles(e.dataTransfer.files, 'drag-drop');
      }
    },
    [handleFiles]
  );

  const list = library.filtered(filter, user?.id);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-[0.72rem] font-semibold uppercase tracking-[0.32em] text-brand-200">Health records</p>
          <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">Medical Documents</h1>
          <p className="mt-1.5 max-w-2xl text-sm text-ink-300">
            Securely upload and review reports, prescriptions, and medicine photos. Files are private to your account.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPT_ATTR}
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files);
              e.target.value = '';
            }}
            aria-label="Upload medical documents"
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => {
              handleFiles(e.target.files, 'camera');
              e.target.value = '';
            }}
            aria-label="Capture a document with the camera"
          />
          <Button variant="secondary" size="sm" onClick={() => cameraInputRef.current?.click()}>
            <IconCamera width={16} height={16} aria-hidden />
            Camera
          </Button>
          <Button variant="primary" size="sm" onClick={() => fileInputRef.current?.click()}>
            <IconPaperclip width={16} height={16} aria-hidden />
            Upload document
          </Button>
        </div>
      </header>

      {!library.isRealStorage ? (
        <p className="mb-4 rounded-[0.8rem] border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-[0.78rem] text-amber-100" role="status">
          Demo mode — no cloud storage is configured. Uploads stay on this device and analysis is clearly labelled mock data. Connect Cloudinary or Supabase to enable secure cloud storage.
        </p>
      ) : null}

      {library.issues.length > 0 ? (
        <div className="mb-4 space-y-1.5 rounded-[0.8rem] border border-rose-400/25 bg-rose-500/10 px-3 py-2.5" role="status">
          <div className="flex items-center justify-between">
            <p className="text-[0.78rem] font-semibold text-rose-100">Some files were rejected</p>
            <button type="button" onClick={library.clearIssues} className="text-[0.72rem] text-rose-200 underline" aria-label="Dismiss file rejection notices">
              Dismiss
            </button>
          </div>
          <ul className="space-y-0.5">
            {library.issues.map((iss, i) => (
              <li key={`${iss.fileName}-${i}`} className="text-[0.74rem] text-rose-100/90">{iss.message}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'mb-6 rounded-[1rem] border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center transition-colors',
          'hover:border-brand-400/40 hover:bg-brand-400/[0.04]'
        )}
      >
        <p className="text-sm text-ink-200">
          Drag & drop medical files here, or use the upload button.
        </p>
        <p className="mt-1 text-[0.72rem] text-ink-400">
          JPG · PNG · WEBP · PDF · DOC · DOCX · max {Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024))} MB
        </p>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={cn(
              'rounded-full border px-3 py-1.5 text-[0.78rem] font-semibold transition-all',
              filter === f.value
                ? 'border-brand-400/50 bg-brand-400/15 text-white'
                : 'border-white/12 bg-white/8 text-ink-200 hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white'
            )}
          >
            {f.label}
          </button>
        ))}
        {list.some((d) => d.processingState === 'idle' || d.processingState === 'failed') ? (
          <Button
            variant="glass"
            size="sm"
            onClick={() => library.processAll()}
            loading={library.isProcessing}
            className="ml-auto"
          >
            Process pending
          </Button>
        ) : null}
      </div>

      {list.length === 0 ? (
        <Card padding="lg" className="text-center">
          <span className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/8 text-ink-200">
            <IconReport width={22} height={22} aria-hidden />
          </span>
          <p className="text-sm font-semibold text-white">No documents yet</p>
          <p className="mx-auto mt-1 max-w-sm text-[0.8rem] text-ink-400">
            Upload a lab report, prescription, or medicine photo to get a clearly-labelled mock analysis and next-step actions.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {list.map((doc) => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <DocumentCard
                  doc={doc}
                  onView={() => setSelected(doc)}
                  onAnalyze={() => library.retryDocument(doc.id, new File([], doc.fileName), { ownerId: user?.id })}
                  onDelete={() => library.deleteDocument(doc.id)}
                />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      <DocumentViewer doc={selected} onClose={() => setSelected(null)} />
    </div>
  );
}

function DocumentCard({
  doc,
  onView,
  onAnalyze,
  onDelete,
}: {
  doc: DocumentAttachment;
  onView: () => void;
  onAnalyze: () => void;
  onDelete: () => void;
}) {
  const state = stateLabel(doc);
  const isProcessing = doc.processingState === 'uploading' || doc.processingState === 'processing' || doc.processingState === 'validating';
  const isError = doc.processingState === 'failed';
  return (
    <Card padding="md" className={cn('flex h-full flex-col gap-3', isError && 'border-rose-400/30')}>
      <div className="flex items-start gap-3">
        {doc.kind === 'image' && doc.previewUrl ? (
          <img src={doc.previewUrl} alt={`Preview of ${doc.fileName}`} className="size-12 shrink-0 rounded-[0.6rem] border border-white/10 object-cover" />
        ) : (
          <span className="flex size-12 shrink-0 items-center justify-center rounded-[0.6rem] border border-white/10 bg-white/8 text-ink-200">
            <IconReport width={20} height={20} aria-hidden />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{doc.fileName}</p>
          <p className="text-[0.72rem] text-ink-400">
            {categoryLabel(doc)} · {formatBytes(doc.fileSize)}
          </p>
        </div>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${doc.fileName}`}
          className="flex size-7 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
        >
          <IconClose width={14} height={14} aria-hidden />
        </button>
      </div>

      {isProcessing ? (
        <div className="space-y-1.5">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={doc.progress} aria-valuemin={0} aria-valuemax={100} aria-label={`${doc.fileName} processing`}>
            <div className="agent-progress-bar h-full rounded-full transition-all duration-300" style={{ width: `${doc.progress}%` }} />
          </div>
          <p className={cn('text-[0.72rem]', state.tone)}>{state.text}…</p>
        </div>
      ) : (
        <p className={cn('flex items-center gap-1.5 text-[0.72rem] font-medium', state.tone)}>
          {doc.processingState === 'analyzed' ? <IconShield width={13} height={13} aria-hidden /> : null}
          {state.text}
          {doc.analysis?.isMock ? <span className="text-ink-400"> · mock</span> : null}
        </p>
      )}

      {doc.errorMessage ? (
        <p className="text-[0.72rem] text-rose-200">{doc.errorMessage}</p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onView} disabled={doc.processingState !== 'analyzed'}>
          View
        </Button>
        <Button variant="ghost" size="sm" onClick={onAnalyze} disabled={isProcessing}>
          {doc.processingState === 'analyzed' ? 'Re-analyze' : 'Analyze'}
        </Button>
        <span className="ml-auto text-[0.66rem] text-ink-400">{new Date(doc.createdAt).toLocaleDateString()}</span>
      </div>
    </Card>
  );
}

function DocumentViewer({ doc, onClose }: { doc: DocumentAttachment | null; onClose: () => void }) {
  return (
    <AnimatePresence>
      {doc ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={`${doc.fileName} details`}
        >
          <motion.div
            className="w-full max-w-lg rounded-[1.2rem] border border-white/12 bg-slate-950/90 p-5 shadow-2xl"
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">{doc.fileName}</p>
                <p className="text-[0.72rem] text-ink-400">{categoryLabel(doc)} · {formatBytes(doc.fileSize)}</p>
              </div>
              <button type="button" onClick={onClose} aria-label="Close" className="flex size-7 items-center justify-center rounded-full border border-white/10 text-ink-300 hover:bg-white/10">
                <IconClose width={14} height={14} aria-hidden />
              </button>
            </div>

            {doc.previewUrl ? (
              <img src={doc.previewUrl} alt={`Preview of ${doc.fileName}`} className="mb-3 max-h-64 w-full rounded-[0.6rem] border border-white/10 object-contain" />
            ) : null}

            {doc.analysis ? (
              <div className="space-y-3">
                <p className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2 text-[0.74rem] text-amber-100">
                  Mock analysis — no real OCR/medical interpretation has been performed. Confirm any values with your clinician.
                </p>
                {doc.analysis.keyFindings.length > 0 ? (
                  <div>
                    <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-ink-300">Key findings (demo)</p>
                    <ul className="space-y-1">
                      {doc.analysis.keyFindings.map((k) => (
                        <li key={k} className="flex gap-2 text-[0.8rem] text-ink-200">
                          <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-300" aria-hidden />
                          {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {doc.analysis.safety ? (
                  <div className="rounded-[0.7rem] border border-white/10 bg-white/5 px-3 py-2.5">
                    <p className="text-[0.8rem] leading-6 text-ink-100">{doc.analysis.safety.summary}</p>
                    {doc.analysis.safety.recommendedActions.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {doc.analysis.safety.recommendedActions.map((a) => (
                          <li key={a} className="flex gap-2 text-[0.76rem] text-ink-200">
                            <span className="text-brand-200" aria-hidden>→</span>
                            {a}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <p className="text-[0.8rem] text-ink-400">Analysis not yet available for this document.</p>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
