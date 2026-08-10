/**
 * Step 3 — Premium composer.
 * Large intelligent composer: text, send, attachment, image, PDF, DOC/DOCX,
 * camera/scanning placeholder, microphone/voice placeholder, language selector,
 * clear conversation, keyboard shortcuts (Enter to send, Shift+Enter newline).
 */

import { useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../common/cn';
import { IconSend, IconMic, IconGlobe, IconTrash, IconSparkle } from './AgentIcons';
import { useAgent } from '../../contexts/AgentContext';
import { AttachmentTray } from './AttachmentTray';
import type { AgentLanguage } from '../../services/agent/agentTypes';

const placeholderByLanguage: Record<AgentLanguage, string> = {
  en: 'Describe your symptoms, upload a report, or ask CareLink anything…',
  te: 'మీ లక్షణాలను వివరించండి, నివేదికను అప్‌లోడ్ చేయండి, లేదా కేర్‌లింక్‌ని ఏదైనా అడగండి…',
  hi: 'अपने लक्षण बताएं, रिपोर्ट अपलोड करें, या CareLink से कुछ भी पूछें…',
};

const languageLabels: Record<AgentLanguage, string> = {
  en: 'English',
  te: 'తెలుగు',
  hi: 'Hindi',
};

const quickPrompts = [
  'I have severe chest pain',
  'Find a cardiologist near me',
  'Explain this blood report',
  'Find hospitals for diabetes treatment',
  'Where can I get this medicine?',
  'Help me book a doctor',
  'Show my appointments',
];

interface Props {
  disabled?: boolean;
}

export function AgentComposer({ disabled }: Props) {
  const { sendMessage, language, setLanguage, attachments, clearActiveConversation } = useAgent();
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  const hasInput = text.trim().length > 0 || attachments.length > 0;
  const canSend = hasInput && !disabled;

  const handleSubmit = () => {
    if (!canSend) return;
    const pending = attachments;
    const message = text;
    setText('');
    void sendMessage(message, pending);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleQuickPrompt = (prompt: string) => {
    setText(prompt);
    textareaRef.current?.focus();
  };

  return (
    <div className="border-t border-white/10 bg-slate-950/60 backdrop-blur-xl">
      {/* Quick prompts */}
      <div className="mx-auto max-w-3xl px-4 pb-2 pt-4 sm:px-6">
        <div className="agent-scroll flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Quick prompts">
          {quickPrompts.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => handleQuickPrompt(prompt)}
              className="shrink-0 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[0.78rem] font-medium text-ink-200 transition-all duration-200 hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Attachment tray */}
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <AttachmentTray />
      </div>

      {/* Composer input */}
      <div className="mx-auto max-w-3xl px-4 pb-5 pt-3 sm:px-6">
        <div className="agent-composer rounded-[1.25rem] border border-white/12 bg-white/8 p-2.5 shadow-[0_18px_50px_-24px_rgba(77,132,255,0.4)] focus-within:border-brand-400/40">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderByLanguage[language]}
            rows={1}
            disabled={disabled}
            aria-label="Message CareLink AI"
            className="w-full resize-none bg-transparent px-3 py-2.5 text-[0.95rem] leading-6 text-white outline-none placeholder:text-ink-400 disabled:opacity-60"
          />

          <div className="flex items-center justify-between gap-2 px-1">
            <div className="flex items-center gap-1.5">
              {/* Language selector */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setLangOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={langOpen}
                  aria-label="Select language"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-[0.72rem] font-semibold text-ink-200 transition hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
                >
                  <IconGlobe width={14} height={14} aria-hidden />
                  <span>{languageLabels[language]}</span>
                </button>
                {langOpen ? (
                  <div
                    role="menu"
                    className="absolute bottom-full mb-2 left-0 z-30 min-w-[160px] overflow-hidden rounded-[0.9rem] border border-white/12 bg-slate-950/95 p-1 shadow-[var(--shadow-glow)] backdrop-blur-xl"
                  >
                    {(Object.keys(languageLabels) as AgentLanguage[]).map((lang) => (
                      <button
                        key={lang}
                        type="button"
                        role="menuitemradio"
                        aria-checked={language === lang}
                        onClick={() => {
                          setLanguage(lang);
                          setLangOpen(false);
                        }}
                        className={cn(
                          'flex w-full items-center justify-between rounded-[0.6rem] px-3 py-2 text-sm transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40',
                          language === lang ? 'text-white' : 'text-ink-300'
                        )}
                      >
                        <span>{languageLabels[lang]}</span>
                        {language === lang ? <span className="size-1.5 rounded-full bg-brand-400" aria-hidden /> : null}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              {/* Voice placeholder */}
              <button
                type="button"
                onClick={() => window.alert('Voice input is coming soon — architecture placeholder.')}
                aria-label="Voice input (coming soon)"
                className="inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/5 text-ink-300 transition hover:border-brand-400/30 hover:bg-brand-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                <IconMic width={16} height={16} />
              </button>

              {/* Clear conversation */}
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clear this conversation?')) clearActiveConversation();
                }}
                aria-label="Clear conversation"
                className="inline-flex size-9 items-center justify-center rounded-full border border-white/12 bg-white/5 text-ink-300 transition hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
              >
                <IconTrash width={16} height={16} />
              </button>
            </div>

            <motion.button
              type="button"
              onClick={handleSubmit}
              disabled={!canSend}
              whileTap={{ scale: 0.96 }}
              aria-label="Send message"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50',
                canSend
                  ? 'bg-gradient-to-r from-brand-500 to-accent-500 text-white shadow-[0_14px_40px_-18px_rgba(77,132,255,0.8)] hover:-translate-y-0.5'
                  : 'cursor-not-allowed bg-white/8 text-ink-400'
              )}
            >
              <IconSend width={16} height={16} />
              <span className="hidden sm:inline">Send</span>
              <kbd className="ml-1 hidden rounded border border-white/15 bg-white/5 px-1 text-[0.62rem] font-medium text-ink-300 sm:inline" aria-hidden>↵</kbd>
            </motion.button>
          </div>
        </div>

        <p className="mt-2 flex items-center justify-center gap-1.5 text-center text-[0.7rem] text-ink-400">
          <IconSparkle width={12} height={12} aria-hidden />
          CareLink provides navigational guidance, not a medical diagnosis. In an emergency, call your local emergency number.
        </p>
      </div>
    </div>
  );
}

export { quickPrompts };
