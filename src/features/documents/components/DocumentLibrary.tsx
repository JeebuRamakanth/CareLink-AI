/**
 * CareLink-AI — Step 11 medical document library.
 *
 * Premium, reusable list of a user's medical documents scoped to the selected
 * family profile. Filters: All / Reports / Lab Results / Prescriptions /
 * Medicines / Other. Each row shows type, profile, upload date, processing +
 * analysis status, and View / Analyze / Delete actions.
 *
 * Responsive: 1 column on mobile, 2 on tablet, 3 on desktop. Uses the design
 * tokens; never renders document contents.
 */

import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import {
  IconClose,
  IconLab,
  IconPaperclip,
  IconPharmacy,
  IconReport,
  IconShield,
  IconSparkle,
  IconTrash,
} from '../../../components/agent/AgentIcons';
import { formatFileSize } from '../services/fileValidation';
import type { DocumentAnalysisResult, HealthDocument } from '../types';

type LibraryFilter = 'all' | 'reports' | 'lab-results' | 'prescriptions' | 'medicines' | 'other';

const FILTERS: { id: LibraryFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'reports', label: 'Reports' },
  { id: 'lab-results', label: 'Lab Results' },
  { id: 'prescriptions', label: 'Prescriptions' },
  { id: 'medicines', label: 'Medicines' },
  { id: 'other', label: 'Other' },
];

function matchesFilter(analysis: DocumentAnalysisResult | undefined, filter: LibraryFilter): boolean {
  if (filter === 'all') return true;
  const category = analysis?.category;
  if (filter === 'lab-results') return category === 'lab-report';
  if (filter === 'prescriptions') return category === 'prescription';
  if (filter === 'medicines') return category === 'medicine-image';
  if (filter === 'reports') return category === 'lab-report' || category === 'discharge-summary' || category === 'imaging' || category === 'doctor-note';
  if (filter === 'other') return !category || category === 'general-document';
  return true;
}

function categoryIcon(category?: DocumentAnalysisResult['category']) {
  switch (category) {
    case 'lab-report': case 'discharge-summary': case 'imaging': return <IconReport width={18} height={18} aria-hidden />;
    case 'prescription': return <IconPaperclip width={18} height={18} aria-hidden />;
    case 'medicine-image': return <IconPharmacy width={18} height={18} aria-hidden />;
    default: return <IconLab width={18} height={18} aria-hidden />;
  }
}

const pipelineLabel: Record<HealthDocument['pipelineState'], string> = {
  idle: 'Queued',
  validating: 'Validating',
  uploading: 'Uploading',
  uploaded: 'Uploaded',
  processing: 'Processing',
  analyzing: 'Analyzing',
  completed: 'Analysis ready',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const pipelineTone: Record<HealthDocument['pipelineState'], string> = {
  idle: 'border-white/12 bg-white/5 text-ink-200',
  validating: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  uploading: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  uploaded: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  processing: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  analyzing: 'border-brand-400/25 bg-brand-500/10 text-brand-100',
  completed: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
  failed: 'border-rose-400/30 bg-rose-500/10 text-rose-100',
  cancelled: 'border-white/12 bg-white/5 text-ink-300',
};

interface Props {
  documents: HealthDocument[];
  activeProfileLabel: string;
  onView: (doc: HealthDocument) => void;
  onAnalyze: (doc: HealthDocument) => void;
  onDelete: (doc: HealthDocument) => void;
}

export function DocumentLibrary({ documents, activeProfileLabel, onView, onAnalyze, onDelete }: Props) {
  const [filter, setFilter] = useState<LibraryFilter>('all');

  const filtered = useMemo(
    () => documents.filter((d) => matchesFilter(d.analysis, filter)),
    [documents, filter]
  );

  const counts = useMemo(() => {
    const c: Record<LibraryFilter, number> = { all: documents.length, reports: 0, 'lab-results': 0, prescriptions: 0, medicines: 0, other: 0 };
    for (const d of documents) {
      if (matchesFilter(d.analysis, 'reports')) c.reports++;
      if (matchesFilter(d.analysis, 'lab-results')) c['lab-results']++;
      if (matchesFilter(d.analysis, 'prescriptions')) c.prescriptions++;
      if (matchesFilter(d.analysis, 'medicines')) c.medicines++;
      if (matchesFilter(d.analysis, 'other')) c.other++;
    }
    return c;
  }, [documents]);

  return (
    <div className="space-y-4">
      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            aria-pressed={filter === f.id}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.76rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40',
              filter === f.id ? 'border-brand-400/40 bg-brand-500/15 text-white' : 'border-white/12 bg-white/5 text-ink-200 hover:bg-white/10 hover:text-white'
            )}
          >
            {f.label}
            <span className={cn('rounded-full px-1.5 text-[0.64rem]', filter === f.id ? 'bg-white/20 text-white' : 'bg-white/10 text-ink-300')}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {/* Profile isolation banner */}
      <div className="flex items-center gap-2 rounded-[0.8rem] border border-white/10 bg-white/[0.03] px-3 py-2">
        <IconShield width={14} height={14} className="text-brand-200" aria-hidden />
        <p className="text-[0.74rem] text-ink-300">
          Showing documents for <span className="font-semibold text-white">{activeProfileLabel}</span>. Documents are isolated by family profile.
        </p>
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((doc) => (
              <motion.div
                key={doc.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <DocumentLibraryRow doc={doc} onView={() => onView(doc)} onAnalyze={() => onAnalyze(doc)} onDelete={() => onDelete(doc)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

function DocumentLibraryRow({ doc, onView, onAnalyze, onDelete }: { doc: HealthDocument; onView: () => void; onAnalyze: () => void; onDelete: () => void }) {
  return (
    <div className="flex h-full flex-col rounded-[1rem] border border-white/10 bg-slate-950/40 p-3.5 backdrop-blur-xl transition hover:border-brand-400/30 sm:p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[0.7rem] border border-white/10 bg-white/8 text-brand-200">
          {categoryIcon(doc.analysis?.category)}
        </span>
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-sm font-semibold text-white">{doc.fileName}</p>
          <p className="text-[0.7rem] text-ink-400">
            {doc.analysis?.category ? doc.analysis.category.replace('-', ' ') : doc.kind} · {formatFileSize(doc.fileSize)}
          </p>
          <p className="text-[0.68rem] text-ink-400">{new Date(doc.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className={cn('rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]', pipelineTone[doc.pipelineState])}>
          {pipelineLabel[doc.pipelineState]}
        </span>
        {doc.analysis ? (
          <span className={cn('rounded-full border px-2 py-0.5 text-[0.6rem] font-semibold uppercase tracking-[0.14em]', doc.analysis.isMock ? 'border-amber-400/25 bg-amber-500/10 text-amber-100' : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100')}>
            {doc.analysis.isMock ? 'Mock' : 'Analyzed'}
          </span>
        ) : null}
        <span className="rounded-full border border-white/12 bg-white/5 px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.14em] text-ink-300">
          {doc.storageSource}
        </span>
      </div>

      <div className="mt-auto flex flex-wrap gap-2 pt-3">
        <button type="button" onClick={onView} className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3 py-1.5 text-[0.74rem] font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
          <IconReport width={13} height={13} aria-hidden /> View
        </button>
        <button type="button" onClick={onAnalyze} className="inline-flex items-center gap-1 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.74rem] font-semibold text-ink-100 transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
          <IconSparkle width={13} height={13} aria-hidden /> Analyze
        </button>
        <button type="button" onClick={onDelete} aria-label={`Delete ${doc.fileName}`} className="ml-auto inline-flex items-center justify-center rounded-full border border-rose-400/25 bg-rose-400/10 px-2.5 py-1.5 text-rose-100 transition hover:bg-rose-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40">
          <IconTrash width={13} height={13} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function EmptyState({ filter }: { filter: LibraryFilter }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[1.2rem] border border-dashed border-white/12 bg-white/[0.02] px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300">
        <IconReport width={22} height={22} aria-hidden />
      </span>
      <p className="mt-3 text-sm font-semibold text-white">No documents yet{filter !== 'all' ? ` in ${filter.replace('-', ' ')}` : ''}</p>
      <p className="mt-1 max-w-xs text-[0.78rem] leading-6 text-ink-400">
        Upload a blood report, lab report, prescription, medicine photo, or medical image to see it here.
      </p>
    </div>
  );
}

/** Close button used by the viewer modal. */
export function ViewerCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close document viewer"
      className="flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/8 text-ink-200 transition hover:bg-white/15 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
    >
      <IconClose width={16} height={16} />
    </button>
  );
}
