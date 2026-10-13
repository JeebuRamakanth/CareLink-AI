# CareLink AI

CareLink AI is a healthcare platform for provider discovery, appointments,
patient records, and AI-assisted health guidance. The frontend is built with
React 19, TypeScript 6, Vite 8, and Tailwind CSS 4. Supabase provides optional
authentication, data services, and Edge Functions; Capacitor 8 wraps the web
app for Android.

## Requirements and local setup

- Node.js 22
- npm (use the committed `package-lock.json`)

Install dependencies and start the development server:

```bash
npm ci
npm run dev
```

Copy `.env.example` to `.env` and configure the browser-safe Supabase and Maps
values needed for the integrations you want to use. Server-only credentials
must stay in their respective server environments; never use a `VITE_` name
for an API secret.

## Build and checks

```bash
npm run build          # TypeScript project check and Vite production build
npm run lint           # Oxlint
npm run test:focused   # focused Node test suite
```

Additional integration and repository checks are available as npm scripts:
`verify:wiring`, `verify:directory`, `verify:workflow`, `verify:live-schema`,
`verify:navigation`, `verify:e2e`, and `verify:sweep`. The live-schema check
requires the relevant Supabase environment configuration.

## Android app (Capacitor)

The Android app is a Capacitor 8 shell around the web application. See
[PLAY_STORE_RELEASE.md](./PLAY_STORE_RELEASE.md) for build, signing, and
publishing instructions.

```bash
npm run android:sync
npm run android:open
npm run android:run
npm run android:apk
npm run android:aab
npm run android:assets
```

Android builds require JDK 21 and Android SDK platform 36. Release signing is
configured through a git-ignored `android/keystore.properties` file or
`CARELINK_*` environment variables. Never commit keystores or passwords.

## AI gateway

The chat UI calls the authenticated Supabase Edge Function `ai-gateway`, which
uses xAI's OpenAI-compatible Chat Completions endpoint. For local development,
configure `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env`; configure
`XAI_API_KEY` and `XAI_MODEL` only in the Edge Function environment. The
application does not assume a default xAI model.

For a local Supabase stack, install the Supabase CLI and Docker, initialize and
start Supabase, then serve the function:

```bash
supabase init
supabase start
supabase functions serve ai-gateway --env-file .env
```

Use the local URL and anon key reported by `supabase status`. In another
terminal run `npm run dev`, sign in with a real Supabase Auth account, and open
`/ai`. Mock/demo sign-in cannot authenticate to the Edge Function.

For production, deploy `supabase/functions/ai-gateway` and set `XAI_API_KEY`
and `XAI_MODEL` as Supabase Edge Function secrets. Keep only browser-safe
Supabase values in the frontend environment. Local tests do not verify live
credentials or production service configuration.
