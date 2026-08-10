/**
 * Step 1 / 20 / 21 / 22 — AgentCommandCenterPage.
 * Full-screen command center layout (own chrome, not the marketing GlobalLayout).
 * Imports agent styles, renders the workspace, and provides a skip link for a11y.
 */

import { AgentCommandCenter } from '../../components/agent/AgentCommandCenter';
import '../../components/agent/agent.css';

export function AgentCommandCenterPage() {
  return (
    <div className="agent-shell flex h-[100dvh] flex-col bg-transparent">
      <a
        href="#agent-main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-full focus:border focus:border-white/15 focus:bg-slate-950 focus:px-4 focus:py-2 focus:text-sm focus:text-white"
      >
        Skip to conversation
      </a>
      <div id="agent-main" className="flex min-h-0 flex-1 flex-col">
        <AgentCommandCenter />
      </div>
    </div>
  );
}
