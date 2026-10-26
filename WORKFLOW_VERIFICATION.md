# CareLink.AI — Connected Clinical Workflow Verification

Requirement-to-test checklist for the medical intelligence workflow.
Every requirement is marked only after its implementation AND verification.

**Status legend**

| Mark | Meaning |
| --- | --- |
| **IMPLEMENTED** | The feature exists and is wired into the real application. |
| **AUTOMATED-TESTED** | Covered by an automated test that runs the real code path. |
| **LIVE-INTEGRATION-VERIFIED** | Exercised against a real external service in this environment. |
| **BLOCKED** | Cannot be completed here; the exact blocker and the configuration path are stated. |

Date of the verification run in this environment: 2026-10-26.

---

## 1. Report workflow

Chain: upload → extraction → value/unit validation → reference-range
interpretation → seriousness assessment → emergency escalation → hospital
discovery when treatment assessment is indicated.

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 1.1 | A lab report uploads and its real text is extracted (PDF text layer) | IMPLEMENTED / AUTOMATED-TESTED | `verify:documents` 26/26; `treatmentFacilities.test.mjs` |
| 1.2 | Values, units and the report's own reference range are parsed | IMPLEMENTED / AUTOMATED-TESTED | `verify:documents` — "extracted value shown with its unit", "the report's own reference range is shown" |
| 1.3 | A value outside range is classified and explained | IMPLEMENTED / AUTOMATED-TESTED | `clinicalParsers.test.mjs`; `verify:documents` |
| 1.4 | A critical value raises the emergency banner naming the exact finding | IMPLEMENTED / AUTOMATED-TESTED | `verify:documents` — "a CRITICAL value triggers the emergency banner" |
| 1.5 | Emergency copy uses India numbers (112/108/104/14416), never US 911/988 | IMPLEMENTED / AUTOMATED-TESTED | `verify:documents` — "no US emergency number is offered" |
| 1.6 | The app never claims a call was placed or an ambulance dispatched | IMPLEMENTED / AUTOMATED-TESTED | `verify:documents` — "the app never claims an ambulance was dispatched" |
| 1.7 | An abnormal finding maps to the clinical SERVICE (not a diagnosis) | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — 18 tests |
| 1.8 | Treatment-relevant facilities are discovered from the report's findings | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "an uploaded lab report produces facility recommendations" |
| 1.9 | A facility is recommended ONLY when it publishes the matching department | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "a facility is relevant ONLY when it publishes the matching department" |
| 1.10 | The why-relevant explanation names the facility's own department + the exact value | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "the why-relevant reason names a facility department and cites the value" |
| 1.11 | The app never prescribes a treatment or a medicine for a report finding | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs`; `verify:workflow-e2e` — "a clinician (not the app) makes the treatment decision" |
| 1.12 | The app never diagnoses the user from a report | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "the report never diagnoses the user" |
| 1.13 | A report with nothing outside range says so instead of inventing a service | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "honest 'nothing to act on' notice" |
| 1.14 | No facility is shown when none publishes the service (no padded list) | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — `noPublishedMatch` |
| 1.15 | The clinical catalog is disclosed as not clinician-reviewed | IMPLEMENTED / AUTOMATED-TESTED | `verify:documents` — "the unreviewed clinical catalog is disclosed" |

## 2. Medicine workflow

Chain: image/text → identification → verified educational information →
prescription-aware instructions → safety checks → pharmacy discovery.

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 2.1 | A medicine photo is analysed by a real vision backend (never a filename guess) | IMPLEMENTED / AUTOMATED-TESTED / **BLOCKED** (live) | `verify:medicine-image` 25/25; `medicineVision.test.mjs`. Live vision call BLOCKED — no `XAI_API_KEY`/`XAI_VISION_MODEL` |
| 2.2 | A medicine is verified against an authoritative reference database | IMPLEMENTED / AUTOMATED-TESTED / LIVE-INTEGRATION-VERIFIED | RxNorm + openFDA reachable here; `treatmentFacilities.test.mjs` |
| 2.3 | Verified uses / side effects / warnings / reference dosage are shown | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "a verified medicine exposes its verified facts" |
| 2.4 | An unverified medicine shows NO fabricated facts | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "an unverified medicine shows NO fabricated facts" |
| 2.5 | A typed medicine outside the demo catalog is still verified | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "a typed medicine outside the demo catalog is verified and answered" |
| 2.6 | The reference dosage is labelled as the label's text, not the patient's dose | IMPLEMENTED / AUTOMATED-TESTED | `AIChatPage.tsx`; `verify:workflow-e2e` |
| 2.7 | A professional-consultation notice is attached to every medicine result | IMPLEMENTED / AUTOMATED-TESTED | `verify:medicine-image` — "the pharmacist/doctor consultation notice is shown" |
| 2.8 | No personalised dose is derived from a photo or a name | IMPLEMENTED / AUTOMATED-TESTED | `verify:medicine-image` — "no dosing instruction is shown" |
| 2.9 | Pharmacy discovery is offered for EVERY medicine | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "pharmacy discovery is offered for the medicine" |
| 2.10 | Pharmacy results come from the sourced directory, never a fabricated set | IMPLEMENTED / AUTOMATED-TESTED | `verify:directory` 21/21; `pharmacyService.test.mjs` |
| 2.11 | No live medicine stock level is ever claimed | IMPLEMENTED / AUTOMATED-TESTED | `verify:e2e` — "pharmacy result never fabricates a stock level" |

## 3. Prescription workflow

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 3.1 | An uploaded prescription is authoritative over the text classifier | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs`; `verify:wiring` |
| 3.2 | The medication schedule is reproduced EXACTLY as written | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "the extracted instruction is reproduced verbatim" |
| 3.3 | Every extracted medicine line is shown | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "all extracted medicine lines are shown" |
| 3.4 | An unreadable field is flagged "needs confirmation", never guessed | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "a prescription whose fields could not be read is flagged" |
| 3.5 | The app states it does not create/change/remind about a prescription | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "the app states it does not create or change a prescription" |
| 3.6 | The app adds no dosing advice of its own | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "no invented dose is added by the app" |
| 3.7 | The user's own instruction is attached to the matching medicine result | IMPLEMENTED / AUTOMATED-TESTED | `treatmentFacilities.test.mjs` — "the care info attaches the user own prescription instruction" |
| 3.8 | Pharmacy discovery is offered from the prescription | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "real pharmacy discovery is offered" |

## 4. Mobile support

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 4.1 | A report uploads and is analysed AT a phone viewport (360/390/430) | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "a report uploads and is analysed at {360,390,430}px" |
| 4.2 | A camera-capture input is exposed for mobile | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "a camera-capture input exists at …px" |
| 4.3 | No horizontal overflow on any route at any width | IMPLEMENTED / AUTOMATED-TESTED | `verify:sweep` 18 routes × 8 widths = 0; `verify:workflow-e2e` mobile checks |
| 4.4 | Send / upload controls are usable touch targets on mobile | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "the send control is a usable touch target at …px" |
| 4.5 | Emergency call links are well-formed `tel:` links a phone can dial | IMPLEMENTED / AUTOMATED-TESTED | `verify:workflow-e2e` — "no malformed tel: link"; `verify:documents` — `tel:112` |
| 4.6 | Navigation works on mobile (shared hamburger drawer) | IMPLEMENTED / AUTOMATED-TESTED | `verify:e2e` 54/54 (drawer checks) |
| 4.7 | Maps/directions deep-links open from mobile cards | IMPLEMENTED / AUTOMATED-TESTED | `verify:e2e`; `directionsService.test.mjs` |
| 4.8 | Verified on a real physical device / real mobile browser | **BLOCKED** | No Android device or emulator is attached to this environment. The Capacitor Android shell builds (`npm run android:apk`) but cannot be installed/launched here. |

## 5. Integration + regression

| # | Requirement | Status | Evidence |
| --- | --- | --- | --- |
| 5.1 | The full app type-checks and builds | IMPLEMENTED | `npm run build` green (813 modules) |
| 5.2 | Lint is clean | IMPLEMENTED | `npm run lint` 0 errors, 15 pre-existing warnings, 0 new |
| 5.3 | Unit / integration tests pass | IMPLEMENTED / AUTOMATED-TESTED | `npm run test:focused` 214/214 |
| 5.4 | Static wiring audit passes | IMPLEMENTED / AUTOMATED-TESTED | `npm run verify:wiring` 124/124 |
| 5.5 | Browser E2E (navigation/interaction) passes | IMPLEMENTED / AUTOMATED-TESTED | `npm run verify:e2e` 54/54 |
| 5.6 | Connected clinical workflow E2E passes | IMPLEMENTED / AUTOMATED-TESTED | `npm run verify:workflow-e2e` 32/32 |
| 5.7 | Console/overflow sweep is clean | IMPLEMENTED / AUTOMATED-TESTED | `npm run verify:sweep` 0 console errors / 0 overflow |
| 5.8 | Auth flow passes | IMPLEMENTED / AUTOMATED-TESTED | `npm run verify:auth` 11/11 |
| 5.9 | Database migrations replay cleanly with all suites | IMPLEMENTED / AUTOMATED-TESTED | SQL replay 672 passed / 0 failed |
| 5.10 | Live AI answers (xAI gateway) | **BLOCKED** | No `XAI_API_KEY` / `XAI_MODEL`. Path: `supabase functions deploy ai-gateway` + `supabase secrets set`. |
| 5.11 | Live medicine-photo vision | **BLOCKED** | No `XAI_VISION_MODEL`. Path: `supabase functions deploy medicine-vision` + `supabase secrets set XAI_VISION_MODEL=…`. |
| 5.12 | Live Supabase backend (registry/auth/appointments) | **BLOCKED** | No `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`. Path: apply `supabase/DEPLOY_ALL.sql`, then set both vars. |

---

## How to reproduce

```bash
npm install
npm run fixtures                      # synthetic, labelled test documents
npm run dev -- --host 0.0.0.0 --port 12000   # in one shell

npm run build                         # tsc -b && vite build
npm run lint
npm run test:focused                  # 214 unit/integration tests
npm run verify:wiring                 # 124 static wiring checks
npm run verify:e2e                    # 54 browser navigation/interaction checks
npm run verify:workflow-e2e           # 32 connected-workflow browser checks
npm run verify:sweep                  # console + responsive sweep
npm run verify:auth                   # 11 auth checks
npm run verify:documents              # 26 document-analysis checks
npm run verify:medicine-image         # 25 medicine-image checks
npm run verify:directory              # 21 directory-integrity checks
npm run verify:workflow               # 39 appointment-workflow checks
npm run verify:navigation             # 10 navigation checks
npm run verify:readiness              # per-integration configuration status
```

Database replay (local, disposable Postgres 16):

```bash
sudo dockerd &
sudo docker run -d --name carelink-pg -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=openhands -p 55432:5432 \
  -v /workspace/project/CareLink-AI:/repo:ro postgres:16
sudo docker exec carelink-pg bash -c \
  'export PGHOST=127.0.0.1 PGUSER=openhands PGPASSWORD=postgres; cd /repo/supabase/tests && bash run.sh'
```

---

## Defects found and fixed in this pass

Each was a real, reproducible defect traced to its root cause. No warning text
was merely softened.

1. **An uploaded prescription fell through to a generic answer.** The extracted
   medication schedule never reached the user; the text classifier only saw
   "uploaded document" and produced "Understanding your report".
   Fixed: `buildPrescriptionResult` + an `analysedPrescription` short-circuit.
2. **An abnormal or critical report recommended zero facilities.** Only a bare
   `/doctors` link was offered, with no evidence-grounded relevance.
   Fixed: analyte → clinical-service mapping + published-department facility
   discovery with an explicit why-relevant explanation.
3. **Medicine results surfaced no pharmacies** except for the three legacy demo
   drugs that carried a hardcoded `pharmacyDiscoveryAction`.
   Fixed: real sourced pharmacy discovery for every medicine.
4. **Verified medicine facts were discarded.** The reference lookup returned
   uses/side-effects/warnings, but `MedicineResult` had nowhere to carry them.
   Fixed: the fields are carried through and rendered with their sources.
5. **A typed medicine outside the tiny demo catalog produced no medicine result
   at all** ("tell me about atorvastatin" → a generic reply).
   Fixed: candidate-name extraction offered to the authoritative lookup, and a
   verified result routed through the medicine path.
6. **Pressing Send during analysis sent an un-analysed attachment.** The
   in-flight pipeline job was skipped rather than joined, so the agent received a
   document with no extraction.
   Fixed: the pipeline promise is stored and awaited by `sendMessage`.
7. **Duplicate React key** when one facility was relevant for two specialties
   (a real console error). Fixed: facility and doctor de-duplication.
