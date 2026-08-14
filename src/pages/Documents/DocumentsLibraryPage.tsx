/**
 * CareLink-AI — Step 11 Medical Documents library page.
 *
 * Premium, reusable surface that combines:
 * - the family-profile switcher (documents are isolated per profile),
 * - the secure upload zone (validate → upload → analyze),
 * - the document library with filters + View / Analyze / Delete,
 * - a modal viewer that renders the analysis result card.
 *
 * Reuses the design system tokens and existing routes for actions. Never
 * renders document contents; never exposes public medical URLs.
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Container } from '../../components/ui/Container';
import { Badge } from '../../components/ui/Badge';
import { ROUTES } from '../../routes/routeConstants';
import {
  IconArrowRight,
  IconFamily,
  IconReport,
  IconShield,
  IconSparkle,
} from '../../components/agent/AgentIcons';
import { useAgent } from '../../contexts/AgentContext';
import { useDocumentUpload } from '../../features/documents/hooks/useDocumentUpload';
import { useDocumentLibrary } from '../../features/documents/hooks/useDocumentLibrary';
import { DocumentUploadZone } from '../../features/documents/components/DocumentUploadZone';
import { DocumentLibrary, ViewerCloseButton } from '../../features/documents/components/DocumentLibrary';
import { DocumentAnalysisResultCard } from '../../features/documents/components/DocumentAnalysisResultCard';

export function DocumentsLibraryPage() {
  const agent = useAgent();
  const upload = useDocumentUpload();
  const library = useDocumentLibrary();
  const [showUpload, setShowUpload] = useState(true);

  const ctx = { ownerId: library.ownerId, familyProfileId: library.activeProfileId };

  return (
    <Container className="py-8 sm:py-10 lg:py-14">
      <div className="space-y-8 sm:space-y-10">
        {/* Header */}
        <header className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <Badge tone="brand">Step 11 · Secure documents</Badge>
              <h1 className="text-balance text-2xl font-semibold leading-tight text-white sm:text-3xl">
                Medical documents
              </h1>
              <p className="max-w-xl text-sm leading-6 text-ink-300">
                Upload and analyze blood reports, lab results, prescriptions, medicine photos, and medical images. Documents are stored securely and isolated by family profile.
              </p>
            </div>
            <div className="flex flex-col items-end gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[0.72rem] font-semibold text-ink-200">
                <IconShield width={13} height={13} className="text-brand-200" aria-hidden /> {library.storageModeLabel}
              </span>
              <Link to={ROUTES.agent} className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/8 px-3 py-1.5 text-[0.78rem] font-semibold text-ink-100 transition hover:bg-white/15">
                <IconSparkle width={14} height={14} aria-hidden /> Ask CareLink AI <IconArrowRight width={12} height={12} aria-hidden />
              </Link>
            </div>
          </div>

          {/* Family profile switcher */}
          <div className="flex flex-wrap items-center gap-2 rounded-[0.9rem] border border-white/10 bg-white/[0.03] p-2.5">
            <span className="inline-flex items-center gap-1.5 px-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-ink-400">
              <IconFamily width={14} height={14} aria-hidden /> Profile
            </span>
            <div className="flex flex-wrap gap-1.5">
              {agent.patientProfiles.map((profile) => {
                const isActive = (profile.id === 'self' ? null : profile.id) === library.activeProfileId;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    onClick={() => agent.setActiveProfileId(profile.id)}
                    aria-pressed={isActive}
                    className={
                      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[0.76rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40 ' +
                      (isActive ? 'border-brand-400/40 bg-brand-500/15 text-white' : 'border-white/12 bg-white/5 text-ink-200 hover:bg-white/10 hover:text-white')
                    }
                  >
                    {profile.label}
                    {isActive ? <span className="size-1.5 rounded-full bg-emerald-400" aria-hidden /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </header>

        {/* Upload zone (collapsible) */}
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowUpload((v) => !v)}
            aria-expanded={showUpload}
            className="inline-flex items-center gap-1.5 text-[0.78rem] font-semibold uppercase tracking-[0.18em] text-ink-300 transition hover:text-white"
          >
            <IconReport width={14} height={14} aria-hidden /> {showUpload ? 'Hide' : 'Show'} upload
          </button>
          <AnimatePresence initial={false}>
            {showUpload ? (
              <motion.div
                key="upload"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden rounded-[1.2rem] border border-white/10 bg-slate-950/30 p-4 backdrop-blur-xl sm:p-5"
              >
                <DocumentUploadZone upload={upload} ctx={ctx} />
                {upload.attachments.some((a) => a.pipelineState === 'completed') ? (
                  <button
                    type="button"
                    onClick={() => void library.reload()}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3.5 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90"
                  >
                    <IconArrowRight width={13} height={13} aria-hidden /> Refresh library
                  </button>
                ) : null}
              </motion.div>
            ) : null}
          </AnimatePresence>
        </section>

        {/* Library */}
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-white">Your documents</h2>
            {library.loading ? <span className="text-[0.72rem] text-ink-400">Loading…</span> : null}
          </div>

          {library.error ? (
            <div className="rounded-[0.85rem] border border-amber-400/25 bg-amber-500/8 p-3.5" role="alert">
              <p className="text-sm text-amber-100">{library.error}</p>
              <button type="button" onClick={() => void library.reload()} className="mt-2 text-[0.72rem] font-semibold text-brand-200 hover:text-white">Try again</button>
            </div>
          ) : null}

          {library.loading && library.documents.length === 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-40 animate-pulse rounded-[1rem] border border-white/10 bg-white/[0.03]" aria-hidden />
              ))}
            </div>
          ) : (
            <DocumentLibrary
              documents={library.documents}
              activeProfileLabel={library.activeProfileLabel}
              onView={library.onView}
              onAnalyze={(doc) => void library.onAnalyze(doc)}
              onDelete={(doc) => void library.onDelete(doc)}
            />
          )}
        </section>
      </div>

      {/* Viewer modal */}
      <AnimatePresence>
        {library.selected ? (
          <motion.div
            key="viewer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/70 p-4 backdrop-blur-sm sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label={`Document: ${library.selected.fileName}`}
            onClick={library.closeViewer}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className="relative my-6 w-full max-w-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex justify-end">
                <ViewerCloseButton onClose={library.closeViewer} />
              </div>
              {library.selectedAnalysis ? (
                <DocumentAnalysisResultCard
                  document={library.selected}
                  analysis={library.selectedAnalysis}
                  onAnalyze={(id) => { const doc = library.documents.find((d) => d.id === id); if (doc) void library.onAnalyze(doc); }}
                  onDelete={(id) => { const doc = library.documents.find((d) => d.id === id); if (doc) void library.onDelete(doc); }}
                />
              ) : library.analyzingId === library.selected.id ? (
                <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-8 text-center backdrop-blur-xl">
                  <span className="agent-thinking-dot mx-auto block size-2.5 rounded-full bg-brand-400" aria-hidden />
                  <p className="mt-3 text-sm text-ink-300">Analyzing document…</p>
                </div>
              ) : (
                <div className="rounded-[1.25rem] border border-white/10 bg-slate-950/50 p-6 backdrop-blur-xl">
                  <p className="text-sm text-ink-200">{library.selected.fileName}</p>
                  <p className="mt-2 text-[0.78rem] text-ink-400">This document has not been analyzed yet.</p>
                  <button
                    type="button"
                    onClick={() => void library.onAnalyze(library.selected!)}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-3.5 py-1.5 text-[0.78rem] font-semibold text-white transition hover:opacity-90"
                  >
                    <IconSparkle width={13} height={13} aria-hidden /> Analyze now
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Container>
  );
}
