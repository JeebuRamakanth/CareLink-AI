/**
 * Step 2 — AgentCommandCenter.
 * Orchestrates the full workspace: header, sidebar, conversation, composer,
 * quick actions, context panel. NOT a generic chatbot — a healthcare command center.
 *
 * Suggested structure:
 *   AgentCommandCenter
 *    ├── AgentHeader
 *    ├── ConversationSidebar
 *    ├── AgentConversation (+ result cards)
 *    ├── QuickActions
 *    ├── AgentComposer (+ AttachmentTray)
 *    └── ContextPanel
 */

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '../common/cn';
import { useAgent } from '../../contexts/AgentContext';
import { AgentHeader } from './AgentHeader';
import { ConversationSidebar } from './ConversationSidebar';
import { AgentConversation } from './AgentConversation';
import { AgentComposer } from './AgentComposer';
import { QuickActions } from './QuickActions';
import { ContextPanel } from './ContextPanel';
import { IconEmergency } from './AgentIcons';

export function AgentCommandCenter() {
  const { isThinking, triggerQuickAction, sendMessage, attachments, status } = useAgent();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  const handleQuickAction = (actionId: string) => {
    if (isThinking) return;
    void triggerQuickAction(actionId);
  };

  const handlePickReply = (reply: string) => {
    if (isThinking) return;
    // Suggested replies are sent as a fresh user turn so the mock router re-classifies.
    void sendMessage(reply, attachments);
  };

  const isEmergency = status.status === 'emergency';

  return (
    <div className={cn('flex h-[100dvh] flex-col overflow-hidden', isEmergency && 'ring-1 ring-inset ring-rose-500/30')}>
      <AgentHeader
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleContext={() => setContextOpen((v) => !v)}
      />

      <div className="flex min-h-0 flex-1">
        <ConversationSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <main className="flex min-w-0 flex-1 flex-col">
          {/* Emergency banner — highly visible when active */}
          <AnimatePresence>
            {isEmergency ? (
              <motion.div
                key="emergency-banner"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="overflow-hidden border-b border-rose-400/30 bg-gradient-to-r from-rose-500/20 to-amber-500/15"
              >
                <div className="flex items-center gap-2 px-4 py-2.5 sm:px-6">
                  <span className="agent-emergency-ring flex size-7 shrink-0 items-center justify-center rounded-full border border-rose-400/40 bg-rose-500/30 text-rose-100">
                    <IconEmergency width={15} height={15} />
                  </span>
                  <p className="text-[0.8rem] font-semibold text-rose-100">
                    Emergency guidance is active. If this is life-threatening, call your local emergency number now.
                  </p>
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>

          {/* Conversation (scrollable) */}
          <AgentConversation onPickReply={handlePickReply} />

          {/* Quick actions */}
          <div className="border-t border-white/10 bg-slate-950/40 px-4 py-3 sm:px-6">
            <div className="mx-auto max-w-3xl">
              <p className="mb-2 text-[0.66rem] font-semibold uppercase tracking-[0.28em] text-ink-400">Quick actions</p>
              <QuickActions onAction={handleQuickAction} disabled={isThinking} />
            </div>
          </div>

          {/* Composer */}
          <AgentComposer disabled={isThinking} />
        </main>
      </div>

      <ContextPanel open={contextOpen} onClose={() => setContextOpen(false)} />
    </div>
  );
}
