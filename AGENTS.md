# EnergyScope AI Instructions

Guidance for AI coding assistants working in this repository.

## Smart Prediction & Weather History

Prediction is deterministic (no statistical/ML model): a weather-based base is
corrected by a similarity-weighted historical residual.

- `backend/services/predictionService.js`:
  - `predictDailyEnergy(...)` — base prediction. Base = `B * WF`, where `B` is a
    weather-normalized historical baseline (kWh) and `WF` is the current/forecast
    weather factor (clear/dry = 1, cloudy/rain buckets reduce it).
  - `predictForDate({ targetDate, currentEnergy, monthAverage, weather... })` —
    entry point for both the dashboard (`routes/prediction.js`) and the AI/Groq
    context (`plantContextService.js`). Calls `archiveService.getCorrectionFactor`
    first and uses its `baseline` (B) as the base, so base and residual share the
    same baseline.
  - `applyCorrection(base, corrections)` — clamps correction to ±30% and applies
    it only when there is enough weighted historical evidence (effectiveSample ≥
    1.5 and sampleSize ≥ 5).
- `backend/services/archiveService.js`:
  - `getCorrectionFactor(...)` — weather-normalized **multiplicative residual**
    `residual_r = gen_r / (B * WF_r) - 1`, averaged over completed history
    **strictly before `targetDate`** (`snapshot_date < targetDate` leaks nothing)
    weighted by weather similarity and recency. Baseline `B = mean(gen_r / WF_r)`,
    self-excluding per row. Returns `{ correctionFactor, sampleSize,
    effectiveSample, confidence, bucket, baseline }`.
  - `canonicalGeneration(row)` — authoritative daily generation, precedence
    `check_monthly_value → raw_generation_value → generation_kwh` (guards legacy
    Aug 21/22 integrated rows).
- `backend/adapters/archiveCollector.js` + `backend/services/archiveService.js`
  collect a `daily_weather_snapshot` per day via Open-Meteo's **archive API using
  observed** values (cloud cover averaged over daylight hours, **observed
  precipitation mm**, not forecast probability). Stale/legacy snapshots
  (missing observed mm) are repaired; valid snapshots and today's live snapshot
  are never rewritten.
- **Today's partial generation is excluded from the base**: `routes/prediction.js`
  and `plantContextService.js` both filter month-to-date rows with
  `Number(r.date) < today` (completed days only). `currentEnergy` (today's
  partial) is display/input only and never part of the learned baseline or
  correction.

Invariants to preserve: dashboard and Groq context must compute the **identical**
prediction (both call `predictForDate` with matching inputs); correction is based
only on dates before the prediction target; config-driven plant lat/lon
(`backend/config/plant.json`) is used for weather, never hardcoded.

## Manual Archive Entry & Archive Overrides

Implemented in commit `ab5631c` and deployed. Entry point is **History →
EnergyScope Archive → Manual Archive Entry** (`src/routes/history.tsx`,
`src/components/cards/ManualArchiveEntryDialog.tsx`). It is deliberately **not**
on the homepage (`src/routes/index.tsx` must show no trigger).

Flow: `POST /api/archive/manual` → `authMiddleware` → rate limiter (20 / 15 min)
→ `masterPasswordService.verifyMasterPassword()` (scrypt + `timingSafeEqual`) →
`archiveService.upsertManualOverride()` → `solar_generation_daily`
(`source = 'manual_override'`) + `manual_archive_log`.

Rules:

- `manual_override` rows are **operator data**. Never casually overwrite or
  delete them, and never "repair" one from a collected value.
- The collector must preserve them: `archiveCollector.js` skips manual days in
  both gap scans and reconciliation, and treats them as always valid. Keep that
  behaviour if you touch the collector.
- Audit data lives in `manual_archive_log` (actor, IP, user agent,
  previous/new kWh, timestamp), separate from the archive row.
- The production master password hash (`ARCHIVE_MASTER_PASSWORD_HASH`) is an
  **environment secret**: never commit `.env`, never commit a real hash, never
  put the password or hash in the frontend bundle, and never log either value.
- The local dev password/hash is for local testing only. Never deploy it or reuse
  it in production.
- `backend/scripts/seed-dev-archive.js` is development-only tooling. Its rows
  are **not** production data and must never be described as such.

## Current-Day Generation

"Today's generation" means generation for the **current Asia/Kolkata (IST)
calendar day**. `src/utils/currentDayGeneration.ts` owns this decision.

- Use IST calendar boundaries. Do **not** use UTC conversions such as
  `toISOString().slice(0, 10)` to determine the plant's local day — for the first
  5.5 hours of each IST day that yields the previous calendar day. Use
  `istTodayKey()`.
- UTL timestamps are naive IST wall-clock strings (`"2026-10-03 17:34:50"`). Read
  the calendar date out of the string; do not re-interpret it as browser-local
  time.
- A dated reading counts as today only when its IST date equals the current IST
  date. Otherwise display `0 kWh`.
- When no usable date exists, fall back to current-day signals already
  available (logger online, or a non-empty Day series for the day). Fail closed:
  absence of proof means `0`, never blind trust in the scalar.
- **Logger offline alone must not force today's generation to zero.** If valid
  current-day generation was collected before the logger dropped out, that
  generation stays on screen — the reading still carries today's date.
- Do not add a network request to solve this; reuse the existing Day-series
  query.
- Leave the EnergyScope Archive card, the UTL/Archive flip-card mechanism, and
  current-solar-power behaviour (0 W when offline) untouched.

## opencode-mem integration

The repo uses the **opencode-mem** memory plugin, configured globally at
`~/.config/opencode/opencode-mem.jsonc` (not stored in the repo):

- Vector storage: `~/.opencode-mem/data`; local embedding (Nomic Embed v1).
- Integration with opencode's own provider: `opencodeProvider: "opencode"` /
  `opencodeModel: "big-pickle"`; auto-capture enabled and scoped **per project**
  (`memory.defaultScope: "project"`).
- Web UI (optional management) at `http://localhost:4747`.

Use the memory tools to store/retrieve project knowledge (architecture decisions,
the smart-prediction algorithm, plant context). Memory is project-scoped by
default.

## Project Context

EnergyScope Pro is a solar monitoring dashboard/PWA for UTL Solar inverter
systems. It is an independent alternative to the official UTL monitoring app,
compatible with the official UTL Solar RMS API. It is deployed to production:
Oracle Cloud Infrastructure hosting, PM2 process management, nginx, HTTPS on a
custom domain (domain/infrastructure details are private and must not appear in
code or documentation).

Current release: **v1.2.0** (unreleased on `main`; the previous tag is v1.1.0 at
commit `3d7c951 — Release v1.1.0`). The backend package version
(`backend/package.json`) is maintained independently (currently `1.0.0`) — do not
assume it matches the frontend release.

## Architecture

Frontend / app layer:

- React 19 + TypeScript, Vite 8
- TanStack Start (TanStack Router file-based routes + TanStack Query)
- Nitro server (`node-server` preset); production entrypoint
  `.output/server/index.mjs`
- Tailwind CSS 4 + shadcn/ui-style components on Radix UI; Recharts
- PWA via vite-plugin-pwa (Workbox service worker, `public/push-handlers.js`,
  web push notifications)

Backend:

- Node.js + Express 4 (`backend/server.js`)
- Services/routes/adapters structure under `backend/` (`routes/`, `services/`,
  `adapters/`, `middleware/`, `controllers/`, `config/`, `data/`, `scripts/`)
- SQLite via `better-sqlite3`: sessions, daily production archive, push
  subscriptions/notification state; maintenance records currently in JSON
- JWT auth with encrypted server-side sessions and automatic UTL token refresh

External integration:

- The **backend** exclusively talks to the UTL Solar RMS API (Node fetches plus a
  Python login helper spawned through `backend/adapters/pythonAdapter.js`)
- Open-Meteo is the weather provider: consumed server-side for predictions and
  notifications, and directly by the browser for the public forecast endpoint
- The frontend must never access UTL credentials/tokens or any external API that
  is intended to remain backend-only

## Rules for AI Coding Assistants

Before modifying code:

1. Inspect the relevant existing implementation.
2. Read ARCHITECTURE.md.
3. Read README.md.
4. Check package.json (root and `backend/`) and relevant configuration.
5. Do not assume old architecture is still valid.
6. Do not introduce FastAPI/SQLAlchemy/Turso/Vercel/Render unless explicitly
   requested and architecturally approved — they belong to early planning that
   was superseded by the current Node/Express/Nitro stack.
7. Preserve existing API contracts unless the task explicitly requires a change.
8. Avoid unnecessary dependencies.
9. Do not modify unrelated files.
10. Keep frontend presentation-focused.
11. Keep backend integration/security responsibilities in the backend.
12. Never hardcode credentials.
13. Never expose secrets.
14. Use existing project patterns before introducing new ones.
15. Verify changes with the appropriate build/lint commands
    (`npx tsc --noEmit`, `npm run lint`, `npm run build`; backend smoke start).
16. Update documentation when architecture changes.

There is currently no automated test suite in the repository; do not invent test
commands. Verification means lint + typecheck + build (+ manual smoke tests).

## Documentation Priority

When documentation conflicts with implementation, trust in this order:

1. Actual current source/configuration
2. ARCHITECTURE.md
3. README.md
4. PROJECT_ROADMAP.md
5. CONTRIBUTING.md
6. AGENTS.md

However, if the implementation and architecture intentionally differ because a
migration is in progress, clearly identify that difference instead of silently
changing code.

## Production Safety

AI assistants must NOT:

- expose secrets
- expose SSH credentials
- expose private server IPs
- modify production configuration without explicit instruction
- replace production infrastructure
- change API contracts casually
- commit `.env` files

Production-critical files requiring explicit instruction before changes include
PM2 configurations (e.g., `backend/ecosystem.archive.config.js`), nginx setup,
and environment files.

## Deployment Discipline

- Never use destructive Git commands on the production checkout. No
  `reset --hard`, `clean`, `checkout .`, `stash`, or force push. Production
  fast-forward with `git merge --ff-only` only.
- Back up the archive SQLite database (`sqlite3 .backup`) before any deploy that
  changes archive schema or manual-entry behaviour. Keep existing backups.
- Preserve unrelated production state: a modified `backend/data/maintenance.json`
  and untracked `backend/data/archive.db.backup*` files are expected. Do not
  delete, reset, or "clean up" files you did not create.
- Stage files explicitly by path (`git add <file> ...`). Never `git add -A` /
  `git add .` — unrelated dirty work must stay unstaged and uncommitted.
- Restart only the PM2 processes that need it (`energyscope-backend`,
  `energyscope-frontend`). Do not restart or re-register
  `energyscope-archive-collector` unless explicitly asked; it is
  `cron_restart`-scheduled and its runs collect production data.
- Never deploy local `.env` files, local SQLite databases, or dev seed output to
  production.
- Build on the server from the committed tree (`npx tsc --noEmit` then
  `npm run build`) rather than shipping a locally generated `.output/`.

## Change Discipline

For code changes:

- identify exact files first
- inspect the existing implementation
- make the smallest appropriate change
- verify the diff
- run relevant checks
- report changed files
