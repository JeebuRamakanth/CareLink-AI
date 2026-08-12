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

## Supabase backend + auth (Step 10)
- `@supabase/supabase-js` is installed but lazily imported (dynamic import) so
  missing credentials never crash the app or bloat the main bundle.
- Schema + RLS migrations live in `supabase/migrations/`:
  `0001_initial_health_schema.sql` (18 tables, UUID PKs, ownership columns,
  indexes, private `medical_documents` storage bucket, auto-profile trigger)
  and `0002_rls_policies.sql` (per-user, per-bucket RLS — NO broad "authenticated
  can read everything" policies). Apply both before enabling Supabase Auth.
- Typed DB row types: `src/services/health-data/types.ts`.
- Typed client: `src/services/supabase/client.ts` (anon key only; `persistSession`
  on). Never put `service_role` in `VITE_*`.
- Auth: `src/services/auth/authService.ts` + `src/contexts/AuthContext.tsx`.
  Real Supabase Auth when configured; deterministic LOCAL mock when not, so the
  auth UX + protected routes are exercisable without credentials. Mock accounts
  live in localStorage key `carelink_ai_mock_auth_*`.
- Repositories (no Supabase queries in UI): `src/services/health-data/*Repository.ts`.
  Each returns null/empty when Supabase is unavailable → existing
  localStorage-backed flows (AgentContext, AppointmentContext) remain the
  fallback source of truth.
- Storage boundary: `src/services/storage/supabaseStorage.ts` — private bucket,
  signed URLs only, metadata separate from binary. Path convention
  `<owner_id>/<document_id>/<file>` so RLS authorizes by folder name.
- Routes: `/login`, `/register` are real pages; `/profile` is protected
  (`ProtectedRoute`). Public browsing (hospitals/doctors/reviews) is NOT gated.
- Agent patient context: `AgentContext` loads the authenticated user's real
  family profiles into the profile switcher (falls back to mock otherwise).
  The agent reads only minimum-necessary context via `healthContextRepository`.

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
