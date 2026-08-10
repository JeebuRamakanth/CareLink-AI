/**
 * Step 12 — Conversation sidebar.
 * Conversation history, new conversation, delete. Active patient shown clearly.
 */

import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../common/cn';
import { useAgent } from '../../contexts/AgentContext';
import { IconPlus, IconTrash, IconSparkle, IconClose } from './AgentIcons';
import type { AgentConversation } from '../../services/agent/agentTypes';

interface Props {
  open: boolean;
  onClose: () => void;
}

const relativeTime = (iso: string): string => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function ConversationSidebar({ open, onClose }: Props) {
  const { conversations, activeConversationId, setActiveConversationId, startNewConversation, deleteConversation } = useAgent();

  return (
    <>
      {/* Mobile overlay */}
      <AnimatePresence>
        {open ? (
          <motion.button
            key="overlay"
            type="button"
            onClick={onClose}
            aria-label="Close conversation list"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden"
          />
        ) : null}
      </AnimatePresence>

      <motion.aside
        initial={false}
        animate={{ x: open ? 0 : '-100%' }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-white/10 bg-slate-950/80 backdrop-blur-xl lg:static lg:z-auto lg:w-[260px] lg:translate-x-0',
          open ? 'lg:flex' : 'lg:flex'
        )}
        aria-label="Conversation history"
      >
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-full border border-brand-400/25 bg-gradient-to-br from-brand-500/25 to-accent-500/15 text-white">
              <IconSparkle width={16} height={16} />
            </span>
            <div>
              <p className="text-sm font-semibold text-white">Conversations</p>
              <p className="text-[0.66rem] text-ink-400">{conversations.length} stored locally</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            className="flex size-8 items-center justify-center rounded-full border border-white/10 bg-white/5 text-ink-300 transition hover:bg-white/10 lg:hidden"
          >
            <IconClose width={16} height={16} />
          </button>
        </div>

        <div className="p-3">
          <button
            type="button"
            onClick={() => {
              startNewConversation();
              onClose();
            }}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand-500 to-accent-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/50"
          >
            <IconPlus width={16} height={16} />
            New conversation
          </button>
        </div>

        <nav className="agent-scroll flex-1 space-y-1 overflow-y-auto px-2 pb-4" aria-label="Past conversations">
          {conversations.map((conversation) => (
            <ConversationItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeConversationId}
              onSelect={() => {
                setActiveConversationId(conversation.id);
                onClose();
              }}
              onDelete={() => deleteConversation(conversation.id)}
            />
          ))}
        </nav>

        <div className="border-t border-white/10 p-3">
          <p className="text-[0.66rem] leading-5 text-ink-400">
            Conversations are stored locally on this device for now. Backend sync is coming soon.
          </p>
        </div>
      </motion.aside>
    </>
  );
}

function ConversationItem({
  conversation,
  active,
  onSelect,
  onDelete,
}: {
  conversation: AgentConversation;
  active: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const lastUserMessage = [...conversation.messages].reverse().find((m) => m.role === 'user');
  const preview = lastUserMessage?.content ?? conversation.title;

  return (
    <div
      className={cn(
        'group relative rounded-[0.8rem] border p-3 transition duration-200 focus-within:border-brand-400/40',
        active ? 'border-brand-400/30 bg-brand-500/10' : 'border-transparent hover:border-white/10 hover:bg-white/5'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="block w-full text-left focus-visible:outline-none"
        aria-current={active ? 'true' : undefined}
      >
        <p className={cn('truncate text-sm font-semibold', active ? 'text-white' : 'text-ink-100')}>{conversation.title}</p>
        <p className="mt-0.5 truncate text-[0.74rem] text-ink-400">{preview}</p>
        <p className="mt-1 text-[0.66rem] text-ink-500">{relativeTime(conversation.updatedAt)}</p>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Delete conversation ${conversation.title}`}
        className="absolute right-2 top-2 flex size-7 items-center justify-center rounded-full border border-white/10 bg-slate-950/60 text-ink-400 opacity-0 transition group-hover:opacity-100 hover:border-rose-400/30 hover:bg-rose-400/10 hover:text-rose-200 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/40"
      >
        <IconTrash width={13} height={13} />
      </button>
    </div>
  );
}
