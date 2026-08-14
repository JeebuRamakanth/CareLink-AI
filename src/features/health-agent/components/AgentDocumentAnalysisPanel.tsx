/**
 * CareLink-AI — Step 11 agent document analysis panel.
 *
 * Additive integration into the EXISTING Health Agent (/ai chat page). Lets a
 * user attach a blood report / lab report / prescription / medicine photo and
 * runs the SECURE pipeline (validate → upload → persist metadata → analyze),
 * then renders the structured DocumentAnalysisResultCard inline in the
 * conversation: extracted lab values, medicine recognition, prescription
 * extraction, possible concerns, and action cards to existing routes.
 *
 * Non-breaking: coexists with the agent's existing mock report response. The
 * secure analysis is clearly tagged REAL/MOCK so it's never mistaken for the
 * mock interpretation.
 *
 * Family-profile aware: uploads are scoped to the active profile so documents
 * are never mixed across members.
 */

import { useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../../../components/common/cn';
import { IconReport, IconShield, IconSparkle } from '../../../components/agent/AgentIcons';
import { useOptionalAuth } from '../../../contexts/AuthContext';
import { useDocumentUpload } from '../../documents/hooks/useDocumentUpload';
import { DocumentAnalysisResultCard } from '../../documents/components/DocumentAnalysisResultCard';
import { uploadAndAnalyzeDocument } from '../../documents/services/documentService';
import type { DocumentAnalysisResult, HealthDocument } from '../../documents/types';

interface Props {
  activeProfileId: string | null;
  /** Compact mode for embedding inside the chat composer area. */
  compact?: boolean;
}

interface CompletedAnalysis {
  document: HealthDocument;
  analysis: DocumentAnalysisResult;
}

export function AgentDocumentAnalysisPanel({ activeProfileId, compact = true }: Props) {
  const auth = useOptionalAuth();
  const ownerId = auth.user?.id ?? 'local-demo-user';
  const upload = useDocumentUpload();
  const [completed, setCompleted] = useState<CompletedAnalysis[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);

  // Run the full secure pipeline directly so we capture the analysis outcome.
  // The upload hook is used for transient attachment/issue state (validation +
  // progress) while documentService drives the real validate→upload→analyze.
  const handleFiles = useCallback(
    async (files: FileList | File[] | null) => {
      const newOnes = upload.addFiles(files, { ownerId, familyProfileId: activeProfileId });
      for (const att of newOnes) {
        try {
          const res = await uploadAndAnalyzeDocument({
            file: att.file,
            ctx: { ownerId, familyProfileId: activeProfileId },
          });
          if (res.ok) {
            const { document, analysis } = res.outcome;
            if (analysis) {
              setCompleted((prev) => [{ document, analysis }, ...prev].slice(0, 6));
              setActiveDocId(document.id);
              setExpanded(true);
            }
          } else {
            // The hook surfaces the issue; nothing else to do here.
          }
        } catch {
          // Swallow — the hook's issues list already explains what went wrong.
        }
      }
    },
    [upload, ownerId, activeProfileId]
  );

  const activeCompleted = completed.find((c) => c.document.id === activeDocId) ?? completed[0] ?? null;

  return (
    <div className={cn('space-y-3', compact && 'space-y-2')}>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-2 rounded-[0.8rem] border border-white/10 bg-white/[0.03] px-3 py-2 text-left transition hover:bg-white/[0.06]"
      >
        <span className="flex items-center gap-2">
          <IconReport width={15} height={15} className="text-brand-200" aria-hidden />
          <span className="text-[0.8rem] font-semibold text-white">Secure document analysis</span>
          {completed.length > 0 ? (
            <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2 py-0.5 text-[0.6rem] font-semibold text-emerald-100">
              {completed.length} analyzed
            </span>
          ) : null}
        </span>
        <IconSparkle width={13} height={13} className={cn('text-ink-300 transition', expanded && 'rotate-90')} aria-hidden />
      </button>

      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            key="panel"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden space-y-3"
          >
            {/* Upload zone (custom file handler so we capture analysis) */}
            <CustomFileArea onFiles={handleFiles} compact={compact} />

            {/* Inline issues */}
            {upload.issues.length > 0 ? (
              <div className="rounded-[0.7rem] border border-amber-400/25 bg-amber-500/8 px-3 py-2">
                {upload.issues.slice(-2).map((issue, idx) => (
                  <p key={idx} className="text-[0.74rem] text-amber-100">{issue.message}</p>
                ))}
              </div>
            ) : null}

            {/* Analysis result card (inline, like an AI result card) */}
            {activeCompleted ? (
              <DocumentAnalysisResultCard
                document={activeCompleted.document}
                analysis={activeCompleted.analysis}
              />
            ) : null}

            {/* Completed analysis chips (switch between multiple) */}
            {completed.length > 1 ? (
              <div className="flex flex-wrap gap-2">
                {completed.map((c) => (
                  <button
                    key={c.document.id}
                    type="button"
                    onClick={() => setActiveDocId(c.document.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium transition',
                      activeDocId === c.document.id ? 'border-brand-400/40 bg-brand-500/15 text-white' : 'border-white/12 bg-white/5 text-ink-200 hover:bg-white/10'
                    )}
                  >
                    <IconReport width={12} height={12} aria-hidden /> {c.document.fileName.slice(0, 20)}
                  </button>
                ))}
              </div>
            ) : null}

            <p className="flex items-center gap-1.5 text-[0.7rem] italic text-ink-400">
              <IconShield width={12} height={12} aria-hidden /> Analysis is navigational, not a diagnosis. {activeCompleted?.analysis.isMock ? 'Mock interpretation — no real AI ran.' : 'Real analysis.'}
            </p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** Compact file area that delegates to the custom handler (no internal upload state). */
function CustomFileArea({ onFiles, compact }: { onFiles: (files: FileList | File[] | null) => void; compact: boolean }) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-center gap-2 rounded-[0.9rem] border border-dashed border-white/15 bg-white/[0.03] px-3 py-3 text-center transition hover:border-brand-400/40 hover:bg-brand-400/[0.06] focus-within:outline-none focus-within:ring-2 focus-within:ring-brand-400/40',
        compact && 'py-2.5'
      )}
    >
      <IconReport width={16} height={16} className="text-brand-200" aria-hidden />
      <span className="text-[0.78rem] font-semibold text-white">Attach report / prescription / medicine photo</span>
      <input
        type="file"
        accept=".jpg,.jpeg,.png,.webp,.pdf,.doc,.docx,image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        multiple
        className="sr-only"
        onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }}
        aria-label="Attach a medical document for secure analysis"
      />
    </label>
  );
}
