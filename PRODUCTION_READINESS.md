# CareLink-AI — Production Readiness

Status: candidate (security-hardened web core; Android shell per
`PLAY_STORE_RELEASE.md`). Last verified: 2026-08-28, Step 14.

## Verified gates

| Gate | Result |
|---|---|
| Clean migration replay（`0001`→`0021`） | 293 passed / 0 failed |
| Web build (`npm run build`) | PASS (0 errors) |
| Lint (`npm run lint`) | PASS (0 errors; pre-existing warnings only) |
| Responsive viewport sweep (320–1440px, 8+ routes) | PASS (0 overflows; `/reviews` 320px overflow fixed) |
| Browser console/network sweep（11 routes) | 0 exceptions / 0 console errors / 0 failed network calls |
| Production dependency audit (`npm audit --omit=dev`) | 0 vulnerabilities |
| Secret scan (tracked files) | No production secrets |

## Build & deploy

```bash
npm ci                # install locked deps
npm run build        # type-check + bundle (dist/
npm run lint         # oxlint
npm run dev -- --host 0.0.0.0 --port 12000   # dev (work hosts in vite.config.ts allowedHosts)
```

Supabase: apply `supabase/migrations/*.sql` in order to a fresh
project, then deploy `supabase/functions/ai-gateway`, configure bucket+
storage policies, and set the env vars in `.env.example` (browser-safe
`VITE_*` only; `AI_PROVIDER_API_KEY` server-side only)。Without
credentials the app runs the full mock experience, clearly labelled。



## Roles & scope recap

Patient: own + authorized family contexts only. Doctor: authorized
patient/provider scope。 Hospital/pharmacy/lab admin: own organization.
Admin/super_admin: server-verified elevated scopes with audit trail。
All authorization is re-enforced at RLS/RPC layer——frontend-only checks are never
assumed sufficient。



## Test commands

```bash
bash /tmp/carelink_replay.sh   # clean-DB replay (results 293 passed/0 failed)
npm run build
npm run lint
```

Browser smoke: run Vite on 12000; visit `/`、`/ai`、`/hospitals`,
`/hospitals/luma-children-hospital`, `/doctors`, `/reviews`, `/appointments`,
`/documents`, `/login`, `/register`, `/profile`; console/network must stay
clean (0 unexpected errors)。Responsive must hold at 320/375/390/768/
1024/1440（no horizontal overflow）。

Overflow fix reference: `ReviewDiscoverySection` grid children got
`min-w-0` so long content wraps at 320px (see `0021`-era audit)。

## Deploy checklist

- [ ] Supabase migrations applied (0001→0021) onto clean DB; RLS harness green。
- [ ] Edge fn `ai-gateway` deployed; `AI_PROVIDER_API_KEY` server-side only。
- [ ] `.env.example` → project env (VITE anon key, base URLs、
      Cloudinary unsigned preset if used; optional map key)。
- [ ] `medical_documents` bucket private + policies present。
- [ ] Web build+lint green；console sweep clean on all routes。
- [ ] Responsive sweep clean (320 … 1440)。
- [ ] Android release artifacts built per `PLAY_STORE_RELEASE.md`
      (keystore git-ignored; `CARELINK_*` env/gradle-git-ignored properties)。
- [ ] Dependency audit: `npm audit --omit=dev` = 0（dev-only
      Capacitor toolchain transitive advisories tracked, not shipped）。

## Operational notes

- Rate limiting for AI gateway: 8 req/60s per user; timeouts 9s; retry
  on 429/5xx only (not on abort)。Emergency short-circuit happens before
  any AI call。

- Audit trail: privileged role changes, document/health access probes,
  SOS transitions, donor disclosures, appointment status changes,and
  moderation are recorded via `carelink_record_audit`（append-only for
  ordinary users; PHI-minimized))。


## Known limitations / next (explicitly NOT Step 15)

- Real-device Android testing pending (build/signing verified)。
- Production credentials not present in this repo; mock mode exercised
  end-to-end。
- Play Store data-safety/listing prep tracked separately in
  `PLAY_STORE_RELEASE.md`；do not start before Step 14 completion。