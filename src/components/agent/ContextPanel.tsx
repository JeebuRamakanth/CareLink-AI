/**
 * Step 12 / 13 — Context panel.
 * Active patient (family profile) switching, context tags, recovery quick view,
 * and language. Active patient is clearly visible here and in the header.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../common/cn';
import { useAgent } from '../../contexts/AgentContext';
import { IconFamily, IconHeart, IconGlobe, IconClose, IconShield } from './AgentIcons';
import type { AgentLanguage } from '../../services/agent/agentTypes';

interface Props {
  open: boolean;
  onClose: () => void;
}

const relationLabel: Record<string, string> = {
  self: 'Self',
  parent: 'Parent',
  child: 'Child',
  spouse: 'Spouse',
  other: 'Other',
};

const languageOptions: { value: AgentLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'te', label: 'తెలుగు (Telugu)' },
  { value: 'hi', label: 'हिन्दी / Hinglish' },
];

export function ContextPanel({ open, onClose }: Props) {
  const { patientProfiles, activeProfile, setActiveProfileId, language, setLanguage, recovery } = useAgent();

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            key="ctx-overlay"
            type="button"
            onClick={onClose}
            aria-label="Close context panel"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm"
          />
          <motion.aside
            key="ctx-panel"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="fixed inset-y-0 right-0 z-50 flex w-[320px] flex-col border-l border-white/10 bg-slate-950/85 backdrop-blur-xl sm:w-[360px]"
            aria-label="Context panel"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-8 items-center justify-center rounded-full border border-brand-400/25 bg-brand-500/15 text-brand-100">
                  <IconFamily width={16} height={16} />
                </span>
                <h2 className="text-sm font-semibold text-white">Patient context</h2>
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close context panel"
                className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300 transition hover:bg-white/10"
              >
                <IconClose width={16} height={16} />
              </button>
            </div>

            <div className="agent-scroll flex-1 space-y-6 overflow-y-auto p-4">
              {/* Active patient + family profile switcher */}
              <section className="space-y-3">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Active patient</p>
                <div className="rounded-[1rem] border border-brand-400/25 bg-brand-500/10 p-4">
                  <p className="text-base font-semibold text-white">{activeProfile.label}</p>
                  <p className="mt-0.5 text-sm text-ink-300">{activeProfile.contextSummary}</p>
                </div>

                <div className="space-y-1.5">
                  {patientProfiles.map((profile) => {
                    const isActive = profile.id === activeProfile.id;
                    return (
                      <button
                        key={profile.id}
                        type="button"
                        onClick={() => setActiveProfileId(profile.id)}
                        aria-pressed={isActive}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 rounded-[0.8rem] border px-3 py-2.5 text-left transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40',
                          isActive ? 'border-brand-400/40 bg-brand-500/12' : 'border-white/10 bg-white/5 hover:bg-white/10'
                        )}
                      >
                        <div>
                          <p className="text-sm font-semibold text-white">{profile.label}</p>
                          <p className="text-[0.74rem] text-ink-400">{relationLabel[profile.relation]}</p>
                        </div>
                        {isActive ? <span className="size-2 rounded-full bg-brand-400" aria-hidden /> : null}
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Context tags */}
              <section className="space-y-2">
                <p className="text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Context</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeProfile.contextTags.map((tag) => (
                    <span key={tag} className="rounded-full border border-accent-400/20 bg-accent-400/10 px-2.5 py-1 text-[0.74rem] font-medium text-accent-100">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              {/* Recovery quick view */}
              <section className="space-y-2">
                <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">
                  <IconHeart width={12} height={12} aria-hidden /> Recovery tracker
                </p>
                <div className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-ink-300">Current trend</span>
                    <span className="text-sm font-semibold text-white capitalize">{recovery.currentTrend}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-ink-300">Streak</span>
                    <span className="text-sm font-semibold text-white">{recovery.streakDays} days</span>
                  </div>
                  <p className="mt-3 rounded-[0.6rem] border border-white/10 bg-slate-950/50 px-2.5 py-2 text-[0.72rem] italic text-ink-400">
                    {recovery.followUpReminderPlaceholder}
                  </p>
                </div>
              </section>

              {/* Language */}
              <section className="space-y-2">
                <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">
                  <IconGlobe width={12} height={12} aria-hidden /> Language
                </p>
                <div className="grid gap-1.5">
                  {languageOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setLanguage(opt.value)}
                      aria-pressed={language === opt.value}
                      className={cn(
                        'flex items-center justify-between rounded-[0.8rem] border px-3 py-2.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40',
                        language === opt.value ? 'border-brand-400/40 bg-brand-500/12 text-white' : 'border-white/10 bg-white/5 text-ink-200 hover:bg-white/10'
                      )}
                    >
                      <span>{opt.label}</span>
                      {language === opt.value ? <span className="size-2 rounded-full bg-brand-400" aria-hidden /> : null}
                    </button>
                  ))}
                </div>
              </section>

              {/* Privacy note */}
              <section className="rounded-[1rem] border border-white/10 bg-white/5 p-4">
                <p className="flex items-center gap-1.5 text-[0.66rem] font-semibold uppercase tracking-[0.24em] text-ink-400">
                  <IconShield width={13} height={13} aria-hidden /> Privacy-first
                </p>
                <p className="mt-2 text-[0.74rem] leading-5 text-ink-300">
                  Conversations and recovery data are stored locally on this device only. No data leaves your browser until backend sync is connected.
                </p>
              </section>
            </div>
          </motion.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
