# CareLink-AI — Repository Notes

## Project Overview
Healthcare platform with hospitals, doctors, appointments, reviews, and an AI
"command center" agent. Frontend is React + Vite + TypeScript + Tailwind v4.

## Commands
- `npm run dev` — Vite dev server (default port 5173)
- `npm run build` — `tsc -b && vite build` (type-checks then bundles)
- `npm run lint` — oxlint
- `npm run preview` — preview production build

## Running the dev server on the work host
The work host (`work-1-...prod-runtime.all-hands.dev`) maps port 12000. To serve
on it:
```
npm run dev -- --host 0.0.0.0 --port 12000
```
Vite blocks unknown hostnames by default. `vite.config.ts` has
`server.allowedHosts` configured for the work hostnames — keep these when
restarting the dev server for browser verification.

## Design system conventions
- Dark glassmorphism aesthetic. Reuse color tokens: `brand`, `accent`, `ink`.
- Spacing/typography/buttons/cards/badges defined globally — reuse, don't redefine.
- Use the `cn()` util from `src/components/common/cn.ts` for class merging.
- `surface-panel` and similar primitives exist; prefer them over ad-hoc styles.

## Agent command center architecture
- Workspace: `src/components/agent/` — `AgentCommandCenter` orchestrates
  `AgentHeader`, `ConversationSidebar`, `AgentConversation`, `AgentComposer`,
  `AttachmentTray`, `QuickActions`, `ContextPanel`.
- Response cards: `src/components/agent/cards/` — one component per response
  `kind`, dispatched by `AgentResponseCard.tsx`.
- Shared card primitives: `ResponseCardShell.tsx`, icons in `AgentIcons.tsx`,
  styles in `agent.css`.
- Mock intelligence: `src/services/agent/` — `agentService.ts`,
  `agentTypes.ts`, `mockAgentService.ts`, `agentIntentRouter.ts`.
- State: `src/contexts/AgentContext.tsx` (conversations, attachments, recovery,
  family profiles, language) — persisted to localStorage.
- Page: `src/pages/Agent/AgentCommandCenterPage.tsx`, route `/agent`.

### Safety architecture
The agent is navigational, not diagnostic. Response cards carry a
"Guidance, not a diagnosis" badge. Emergency inputs surface an
`EmergencyResponseCard` with tel: links and nearest facility — never buried in
plain chat. Mock interpretations are explicitly labelled.

### Deep-link integration (do not duplicate existing pages)
- Hospital card "View Hospital" → `/hospitals/:slug` (existing detail page)
- Doctor card "View Profile" → `/doctors/:slug` (existing profile)
- Appointment card "View appointments" → `/appointments` (existing system)

## Key gotchas
- Vite dev server must run on port 12000 with `--host 0.0.0.0` for the work host
  to proxy it; otherwise the work host URL returns Bad Gateway.
- `server.allowedHosts` in `vite.config.ts` must include the work hostnames or
  Vite returns "Blocked request".
- Conversation/attachment/recovery state is in localStorage — old persisted
  mock responses keep their original text even after a code fix. Clear the
  conversation to see corrected output.

## Home hero + agent integration (verified)
The agent lives inside the Home hero, not a separate middle-page section:
- `src/features/health-agent/components/HealthCommandCenter.tsx` is a
  `forwardRef` exposing `focus()` and `ask(prompt)` (useImperativeHandle) so
  hero CTAs ("Ask CareLink AI", "Find Care Near Me") drive the agent without
  lifting state.
- `src/pages/Home/components/Hero.tsx` renders the agent in the right column on
  `lg+` (two-column hero), single column below. Agent wrapper motion.div and
  `.agent-shell` and the composer textarea all have `min-w-0` to prevent
  mobile overflow/clipping.
- Responsive composition verified clean (no horizontal overflow / clipping) at
  360/390/412/768/820/1024/1280/1440. Mobile stacks: headline → CTAs (full
  width, vertical) → agent. CTAs go side-by-side ≥768.
- Navbar breakpoint is `xl` (not `lg`) in `GlobalLayout.tsx` so the hamburger
  shows at 1024 instead of overflowing.
