/**
 * Step 2 / 12 — Conversation view.
 * Renders user + assistant message bubbles, attachments on user messages,
 * and structured response cards for assistant messages. Includes thinking,
 * empty, and emergency visual states.
 */

import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../common/cn';
import { useAgent } from '../../contexts/AgentContext';
import { AgentResponseCard } from './cards/AgentResponseCard';
import { AttachmentPreview } from './AttachmentPreview';
import { IconSparkle } from './AgentIcons';
import type { AgentMessage, AgentAttachment } from '../../services/agent/agentTypes';

const formatTime = (iso: string): string => {
  try {
    return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

export function AgentConversation({ onPickReply }: { onPickReply: (reply: string) => void }) {
  const { activeConversation, isThinking, status } = useAgent();
  const messages = activeConversation?.messages ?? [];
  const endRef = useRef<HTMLDivElement | null>(null);
  const isEmergency = status.status === 'emergency';

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, isThinking]);

  return (
    <div className={cn('agent-scroll flex-1 overflow-y-auto', isEmergency && 'bg-rose-500/5')} aria-live="polite" aria-label="Conversation">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-6 sm:px-6">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <MessageRow key={message.id} message={message} onPickReply={onPickReply} />
          ))}
        </AnimatePresence>

        {isThinking ? <ThinkingIndicator /> : null}

        <div ref={endRef} />
      </div>
    </div>
  );
}

function MessageRow({ message, onPickReply }: { message: AgentMessage; onPickReply: (reply: string) => void }) {
  const isUser = message.role === 'user';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
      className={cn('flex', isUser ? 'justify-end' : 'justify-start')}
    >
      <div className={cn('max-w-full', isUser ? 'w-full sm:max-w-[85%]' : 'w-full')}>
        {/* User bubble */}
        {isUser ? (
          <div className="flex flex-col items-end gap-2">
            {message.content ? (
              <div className="rounded-[1.1rem] rounded-br-[0.4rem] border border-brand-400/25 bg-brand-500/15 px-4 py-2.5 text-[0.92rem] leading-6 text-white">
                {message.content}
              </div>
            ) : null}
            {message.attachments.length > 0 ? (
              <div className="flex flex-wrap justify-end gap-2">
                {message.attachments.map((att) => (
                  <AttachmentPreview key={att.id} attachment={att} />
                ))}
              </div>
            ) : null}
            <div className="flex items-center gap-2">
              <span className="text-[0.66rem] text-ink-400">{formatTime(message.createdAt)}</span>
              {message.contextTags.length > 0 ? (
                <span className="text-[0.66rem] text-ink-500">· {message.contextTags.join(', ')}</span>
              ) : null}
            </div>
          </div>
        ) : (
          // Assistant message: structured response card (or welcome bubble)
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-[0.7rem] font-semibold text-white">
                <IconSparkle width={14} height={14} />
              </span>
              <span className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-brand-200">CareLink AI</span>
              <span className="text-[0.66rem] text-ink-400">{formatTime(message.createdAt)}</span>
            </div>
            {message.response ? (
              <AgentResponseCard response={message.response} onPickReply={onPickReply} />
            ) : (
              <div className="rounded-[1.1rem] rounded-bl-[0.4rem] border border-white/10 bg-white/8 px-4 py-2.5 text-[0.92rem] leading-6 text-ink-100">
                {message.content}
              </div>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ThinkingIndicator() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex justify-start">
      <div className="flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/30 to-accent-500/20 text-[0.7rem] font-semibold text-white">
          <IconSparkle width={14} height={14} />
        </span>
        <div className="flex items-center gap-1.5 rounded-[1.1rem] rounded-bl-[0.4rem] border border-white/10 bg-white/8 px-4 py-3">
          <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" aria-hidden />
          <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" aria-hidden />
          <span className="agent-thinking-dot size-2 rounded-full bg-brand-300" aria-hidden />
          <span className="sr-only">CareLink is thinking</span>
        </div>
      </div>
    </motion.div>
  );
}

export type { AgentAttachment };
