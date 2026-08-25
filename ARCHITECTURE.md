# EnergyScope Pro — Architecture

> This document is the architectural source of truth for the **CURRENT** implementation.
> Planned or future architecture is explicitly labelled **Planned** and must never be
> described as if it already exists.
>
> Status: reflects the repository at release **v1.1.0** and later work on `main`.

---

## 1. Project Overview

EnergyScope Pro is a mobile-first Progressive Web App (PWA) for monitoring UTL Solar
inverter systems. It is an independent, modern alternative to the official UTL
monitoring application while remaining compatible with the official UTL Solar RMS API.

The project is in active production use: live monitoring, historical archiving,
exports, maintenance tracking, weather integration, authentication, and web push
notifications are implemented and deployed.

---

## 2. Current Technology Stack

### Frontend / application layer

| Concern | Technology |
| --- | --- |
| UI framework | React 19, TypeScript |
| Build tool | Vite 8 |
| App framework | TanStack Start (file-based routing via TanStack Router, data fetching via TanStack Query) |
| Server runtime / SSR | Nitro (`node-server` preset) |
| Styling | Tailwind CSS 4, shadcn/ui-style components on Radix UI primitives |
| Charts | Recharts |
| Animation | Framer Motion |
| Forms | react-hook-form + zod |
| PWA | vite-plugin-pwa (Workbox `generateSW`, web manifest) |

### Backend

| Concern | Technology |
| --- | --- |
| Runtime | Node.js (JavaScript, CommonJS modules) |
| HTTP framework | Express 4 |
| Database | SQLite via `better-sqlite3` |
| Auth | JWT (`jsonwebtoken`) + encrypted server-side sessions |
| Push | `web-push` (VAPID) |
| Exports | `exceljs`, `pdfkit`, `archiver` |
| HTTP client | `axios` / native `fetch`; `got` where used |
| UTL login helper | Python script spawned through a small Node adapter (see §7) |

### Process management / hosting

- PM2 for process management in production
- Oracle Cloud Infrastructure (OCI) for hosting
- nginx reverse proxy in front of the Nitro process
- HTTPS on a custom domain (domain name itself is private infrastructure and is
  intentionally not documented here)

---

## 3. Frontend Architecture

```
src/
    Application source code.
    src/api/          Typed API clients wrapping fetch against same-origin /api/*
    src/routes/       File-based routes (TanStack Router): index (dashboard),
                      energy, history, devices, diagnostics, weather, analytics,
                      maintenance, profile, settings, login
    src/components/   Reusable UI (cards, charts, dashboard, layout, ui, widgets)
    src/services/     Client-side services:
                        solarService.ts          solar/weather data access
                        archiveHistoryService.ts historical archive reads
                        pushService.ts           web push subscription logic
                        pushUiState.ts           pure permission->UI state mapping
    src/hooks/        Shared React hooks (auth, alerts, solar data)
    src/context/      React context providers (dashboard auth, theme)
    src/types/        Shared TypeScript types
    src/utils/        Formatting and helper utilities
    src/lib/          Internal helpers
    src/start.ts      TanStack Start bootstrap (+ service worker registration)
```

Responsibilities:

- Rendering, navigation, theming, charts, user interaction
- Calling the backend exclusively through same-origin `/api/**` requests
- Presentation-level state only

The frontend must never contain:

- UTL credentials or tokens
- Direct calls to the UTL API
- Business rules that belong to data ownership/aggregation

---

## 4. TanStack Start + Nitro Architecture

- `src/start.ts` bootstraps TanStack Start with two middlewares:
  - an error middleware that renders a friendly error page on unhandled SSR errors
  - a CSRF middleware protecting server functions
- Vite builds the app; Nitro produces the deployable server into `.output/`
  (`npm run build`).
- Production entrypoint: `node .output/server/index.mjs`.
- Nitro's `routeRules` proxy same-origin `/api/**` to the Express backend target
  configured by `API_PROXY_TARGET` (default `http://127.0.0.1:3001`). The browser
  therefore only ever talks to one origin.

---

## 5. Backend Express Architecture

```
backend/
    server.js                 Express bootstrap: helmet, cors, rate limiting,
                              route mounting, notification monitor start
    routes/                   REST endpoints (one file per domain)
        auth.js               login/logout/session endpoints
        archive.js            historical production archive
        charts.js             live generation charts (daily/monthly/yearly/total)
        config.js             public plant/app configuration
        export.js             Excel/PDF/ZIP exports
        health.js             unauthenticated health endpoint
        inverter.js           live inverter/device data
        maintenance.js        maintenance history CRUD
        notifications.js      web push subscription management + VAPID key
        ai.js                 AI chat endpoint (Gemini proxy, rate-limited)
        plant.js              plant information
        prediction.js         daily energy prediction + performance score
    services/                 business logic
        utlApi.js             UTL Solar RMS API client (token refresh, fetches)
        sessionService.js     encrypted session storage/retrieval
        authService.js        credential verification, session lifecycle
        archiveCollector.js   gap-aware daily archive collection
        archiveService.js     archive queries/aggregates
        exportService.js      export data assembly
        exportGenerator.js    xlsx/pdf stream generation
        weatherService.js     Open-Meteo forecast client (server-side)
        predictionService.js  next-day energy prediction
        performanceScore.js   performance score computation
        maintenanceService.js maintenance record storage
        notificationMonitor.js in-process poller for inverter status transitions
        pushService.js        Web Push send/broadcast with failure pruning
        geminiService.js      Google Gemini client for the solar assistant
    adapters/
        pythonAdapter.js      Node wrapper that spawns the Python UTL login helper
        python/utl_api.py     Python implementation of the UTL login flow
    middleware/auth.js        JWT bearer-token authentication middleware
    controllers/authController.js login request handling
    config/plant.json         static plant configuration
    data/                     database modules + runtime SQLite files (gitignored)
        database.js            sessions SQLite module
        archiveDatabase.js     production-archive SQLite module
        notificationDatabase.js push-subscription SQLite module
        maintenance.json       maintenance records (JSON file storage)
    scripts/archive-collector.js standalone headless collector entry point
    ecosystem.archive.config.js PM2 configuration for the scheduled collector
    .env.example              environment variable template
```

Principles:

- The backend is the **single source of truth** for application-owned data.
- Routes stay thin; business logic lives in services.
- All data routes are protected by `authMiddleware`; `/api/health`, `/api/config`
  and `/api/auth/login` are the intentional exceptions.
- Security middleware: `helmet`, `cors` (restricted origins), and
  `express-rate-limit` on the login endpoint.

---

## 6. API Request Flow

```
Browser / installed PWA
        │  same-origin fetch
        ▼
Nitro (TanStack Start server)  ── routeRules proxy ──►  Express backend (:3001)
        ▲                                                      │
        │                                                      ├─► UTL Solar RMS API
        └────────────── JSON responses ◄───────────────────────┼─► SQLite (sessions,
                                                               │    archive, notifications)
                                                               ├─► Open-Meteo (server-side)
                                                               └─► maintenance.json
```

- The frontend uses `src/api/client.ts` (`BASE_URL = VITE_API_BASE_URL ?? "/api"`),
  attaches the JWT bearer token, and normalizes endpoints to `/api/**`.
- Live inverter/plant/chart data is always fetched live from UTL at request time.
- Historical data is served from the backend's own SQLite archive.

---

## 7. UTL API Integration

- Base URL: the official UTL Solar RMS API (`utlsolarrms.com`), accessed **only**
  by the backend over HTTPS.
- Authentication: the backend performs UTL portal login on behalf of the user,
  stores the resulting UTL token inside an encrypted server-side session row
  (`SESSION_ENCRYPTION_KEY`), and refreshes it automatically when expired.
- Token refresh reuses a small Python helper (`adapters/python/utl_api.py`)
  spawned by `adapters/pythonAdapter.js`; other UTL calls are made directly from
  Node. Python 3 is therefore a runtime dependency of token refresh.
- Reverse-engineered endpoints currently used include plant status, plant info,
  inverter/device listing, logger diagnostics, and daily/monthly/yearly/total
  generation charts.
- A dedicated headless account (env: `UTL_COLLECTOR_EMAIL` /
  `UTL_COLLECTOR_PASSWORD`) drives the scheduled archive collector so archival
  does not depend on any interactive user being logged in.

---

## 8. Authentication Responsibility

- Login: `POST /api/auth/login` verifies credentials against UTL, creates a JWT
  plus an encrypted session row, and returns the token to the client.
- Every subsequent data request carries `Authorization: Bearer <JWT>`;
  `middleware/auth.js` validates the token **and** the matching session row.
- Sessions expire; automatic refresh of the underlying UTL token keeps long-lived
  sessions usable without re-prompting for credentials.
- The frontend stores the JWT client-side but never sees UTL credentials or the
  raw UTL token.

---

## 9. Weather / Data Integrations

Current (implemented):

- **Open-Meteo** is the weather provider.
  - Server-side: `services/weatherService.js` consumes Open-Meteo forecasts for
    the prediction/performance-score pipeline (`/api/prediction`) and the
    notification monitor.
  - Client-side: the weather page also fetches Open-Meteo forecasts directly from
    the browser (`src/services/solarService.ts`) because the forecast endpoint is
    public and keyless.
- **UTL Solar RMS API** — all solar/inverter data (see §7).
- **Google Gemini (AI chat)** — `services/geminiService.js` calls the official
  Generative Language API server-side via `fetch` for the `/api/ai/chat`
  solar-assistant endpoint (`routes/ai.js`, behind `authMiddleware` plus a
  per-IP rate limit). `GEMINI_API_KEY`/`GEMINI_MODEL` are backend-only env
  vars; the key is never logged or sent to the client. Conversation history is
  kept in frontend state only. Phase 1 is generic chat; a later phase will
  inject real EnergyScope context through
  `geminiService.buildSystemInstruction()`.

Note: the historical rule "frontend never talks to the weather provider" is no
longer strictly true for the public, keyless Open-Meteo forecast endpoint. Any
*new* provider that requires credentials must be integrated server-side only.

Planned:

- Additional providers (irradiance, air quality) — server-side only.

---

## 10. PWA Architecture

Implemented:

- `vite-plugin-pwa` with Workbox `generateSW` produces `.output/public/sw.js`,
  a precache manifest of all built assets, and a web manifest
  (`manifest.webmanifest`) with installable icons.
- `public/push-handlers.js` is imported into the generated service worker via
  Workbox `importScripts` and implements `push` + `notificationclick` handlers
  for inverter alerts and the daily production summary.
- Registration happens in `src/start.ts` via `registerSW({ immediate: true })`
  with explicit `onRegisteredSW` / `onRegisterError` logging so failures are
  observable in the console.
- `skipWaiting()`/`clientsClaim()` are enabled (`registerType: "autoUpdate"`),
  so new deployments propagate after one reload.
- Offline support covers the app shell and previously visited assets via the
  precache.

Planned:

- Richer offline behaviour beyond the shell (e.g., cached last-known data views).

---

## 11. Static Assets / Build Output

- `vite build` emits everything to `.output/`:
  - `.output/public/` — hashed static assets, `sw.js`, `workbox-*.js`,
    `push-handlers.js`, manifest, icons
  - `.output/server/index.mjs` — Nitro server bundle (production entrypoint)
- Static files are content-hashed and served with immutable caching headers;
  `sw.js` itself must never be long-cached.
- `public/` holds source-static assets (icons, favicon, `push-handlers.js`).

---

## 12. Production Deployment Architecture

```
Browser / installed PWA
        │ HTTPS
        ▼
nginx reverse proxy (custom domain, TLS termination)
        │
        ▼
PM2 process: energyscope-frontend
        runs: .output/server/index.mjs   (Nitro node-server preset)
        │  proxies /api/**
        ▼
PM2 process: energyscope-backend (Express, port 3001)
        │
        ├─► UTL Solar RMS API
        ├─► SQLite databases (sessions, archive, notifications)
        └─► Open-Meteo (server-side)

Scheduled (PM2 cron): energyscope-archive-collector
        backend/ecosystem.archive.config.js
        cron_restart "0 6,13,20 * * *"  TZ Asia/Kolkata
        runs scripts/archive-collector.js once per invocation (autorestart: false);
        every run performs the same gap-aware, idempotent scan that backfills any
        missing days in the archive window.
```

- Deploys follow: pull latest commit on the server → `npm ci` → `vite build` →
  restart the PM2 frontend process. Builds must be produced from a clean tree.
- The archive collector is restart-scheduled by PM2 rather than kept resident.

---

## 13. OCI Hosting

- Production runs on Oracle Cloud Infrastructure.
- Only generic roles are documented: a single host runs nginx, the PM2-managed
  Nitro frontend, the Express backend, and the scheduled collector.
- Server addresses, SSH access, firewall specifics, and TLS certificate paths are
  private infrastructure details and are deliberately excluded from documentation.

---

## 14. PM2 Process Model

Verified process layout:

| Process | Runs | Behaviour |
| --- | --- | --- |
| Nitro frontend process | `.output/server/index.mjs` | Long-running application server |
| Express backend process | `backend/server.js` (port 3001) | Long-running API server |
| `energyscope-archive-collector` | `backend/ecosystem.archive.config.js` | Runs once per invocation; PM2 restarts it at 06:00, 13:00 and 20:00 IST (`cron_restart "0 6,13,20 * * *"`, `autorestart: false`, `TZ Asia/Kolkata`) |

Only the archive-collector PM2 configuration is tracked in the repository
(`backend/ecosystem.archive.config.js`); the long-running processes are managed
by PM2 on the server. Logs for the collector are written under `backend/logs/`.

---

## 15. Environment / Configuration Boundaries

Environment variable **names** (values are secrets and are never committed):

Frontend / build-time (Vite):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL for API calls (defaults to `/api`) |
| `VITE_APP_VERSION` | Optional version label shown on the diagnostics page |

Nitro / build-time:

| Variable | Purpose |
| --- | --- |
| `API_PROXY_TARGET` | Target for the `/api/**` proxy (default `http://127.0.0.1:3001`) |

Backend (`backend/.env`, see `backend/.env.example`; additional variables exist
for notifications):

| Variable | Purpose |
| --- | --- |
| `PORT` | Express listen port (example default 3001) |
| `JWT_SECRET` | Signs authentication tokens |
| `SESSION_ENCRYPTION_KEY` | Encrypts stored session material (incl. UTL tokens) |
| `UTL_COLLECTOR_EMAIL` / `UTL_COLLECTOR_PASSWORD` | Headless archive-collector UTL account |
| `ARCHIVE_PLANT_ID` | Plant ID to archive |
| `ARCHIVE_START_DATE` | Optional earliest day for archive backfill scans |
| `ARCHIVE_DB_PATH` | Optional archive SQLite path override |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (VAPID) keys for notifications |
| `NOTIFICATIONS_DB_PATH` | Optional push-subscription SQLite path override |
| `NOTIFY_PLANT_NAME`, `NOTIFY_POLL_INTERVAL_MS`, `OFFLINE_CONFIRMATIONS` | Notification-monitor tuning |
| `PLANT_LATITUDE`, `PLANT_LONGITUDE` | Plant coordinates for weather/prediction |

Static configuration: `backend/config/plant.json` holds non-secret plant
metadata. Anything secret belongs in environment files only.

---

## 16. Security Boundaries

- The browser never sees UTL credentials, the UTL token, database files, or any
  third-party API secret.
- All solar data flows through the authenticated Express backend; the frontend
  communicates only with its own origin.
- JWT + server-side session validation on every data route; sessions store UTL
  material encrypted at rest (`SESSION_ENCRYPTION_KEY`).
- `helmet` security headers, restricted CORS, and login rate limiting.
- Web Push subscriptions are scoped per authenticated account; unsubscribe is
  ownership-checked.
- Never commit `.env` files, keys, tokens, passwords, or cookies. Never expose
  private IPs or SSH details in code or documentation.
- Known gaps (documented honestly): there is no automated dependency-audit or
  security-scan step in CI yet (see PROJECT_ROADMAP.md, Current Focus).

---

## 17. Data / Storage Architecture

Implemented storage (all local to the backend host):

| Store | Module | Contents |
| --- | --- | --- |
| Sessions SQLite | `data/database.js` | User sessions incl. encrypted UTL tokens |
| Archive SQLite | `data/archiveDatabase.js` | Daily production archive rows + aggregates |
| Notifications SQLite | `data/notificationDatabase.js` | Push subscriptions (per endpoint, idempotent upsert) and notification dedupe/state ledger |
| Maintenance JSON | `data/maintenance.json` | Maintenance records (file-based storage) |

Rules:

- SQLite stores **application-owned** data only: sessions, archives,
  subscriptions, notification state, maintenance.
- Live values (current power, live plant/inverter status) are always fetched live
  from the UTL API and never persisted.
- The daily archive is the analytical backbone: history, analytics, predictions,
  and the daily summary notification read from it.

Planned:

- Migrating maintenance storage from JSON to SQLite for transactional integrity.
- Retention/pruning policies for archive growth.

---

## 18. Current API Design

All under `/api`, JSON over HTTPS. Data routes require `Authorization: Bearer`.

| Area | Endpoints (representative) |
| --- | --- |
| Auth | `POST /api/auth/login`, `POST /api/auth/logout`, session status |
| Plant | `GET /api/plant`, `GET /api/config` |
| Live data | `GET /api/charts/daily|monthly|yearly|total`, `GET /api/inverter` |
| Archive | `GET /api/archive/status|daily|monthly|yearly|total` |
| Exports | `GET /api/export/...` (Excel/PDF/ZIP streams) |
| Prediction | `GET /api/prediction/...` (next-day energy, performance score) |
| Maintenance | CRUD under `/api/maintenance` |
| Notifications | `GET /api/notifications/status`, `GET /api/notifications/vapid-public`, `POST /api/notifications/subscribe`, `POST /api/notifications/unsubscribe` |
| Health | `GET /api/health` (unauthenticated) |

Contract rules:

- Preserve response shapes unless a change is explicitly agreed; the frontend's
  typed clients (`src/api/*`) mirror these contracts.
- New capabilities get new routes/services rather than breaking changes.

---

## 19. Coding Principles

- Frontend stays presentation-focused; integration/security logic stays in the
  backend.
- Strong TypeScript on the frontend; clear module boundaries (routes → services
  → storage) on the backend.
- No hardcoded credentials; environment variables for all secrets.
- Prefer incremental refactoring over rewrites; smallest change that solves the
  problem correctly.
- Avoid unnecessary dependencies; prefer existing project patterns.
- Maintainable code over clever code.
- Documentation must be updated whenever architecture changes.

---

## 20. Git / Development Workflow

- Branches: `main` (stable, deployable) and short-lived `feature/<name>` or
  `fix/<name>` branches. Avoid committing directly to `main`.
- Commit style: concise imperative summaries, conventional prefixes where they
  fit (`feat:`, `fix:`, `docs:`, `refactor:`), matching existing history.
- Verify before pushing: `npm run lint`, `npx tsc --noEmit`, `npm run build`
  (and a backend smoke start for backend changes).
- Releases are tagged GitHub releases (current: v1.1.0 at commit `3d7c951`).
  Note: the backend package version (`backend/package.json`) is maintained
  independently and is currently `1.0.0`; do not assume it matches the frontend
  release tag.

---

## 21. AI Assistant Guidance

Before modifying code:

1. Read `README.md`, this document, `PROJECT_ROADMAP.md`, and `CONTRIBUTING.md`.
2. Inspect the actual implementation — do not assume this document (or older
   versions of it) reflect code you have not read.
3. Identify the exact files to change before editing; make the smallest
   appropriate change.
4. Preserve API contracts unless the task explicitly requires a change.
5. Do not introduce FastAPI, SQLAlchemy, Turso, Vercel, Render, or similar
   technologies from the project's early planning phase — they are historical
   ideas, not the current stack — unless explicitly requested and architecturally
   approved.
6. Never hardcode credentials or secrets; never commit `.env` files.
7. Keep frontend presentation-focused; keep UTL/external-integration
   responsibilities in the backend.
8. Run the appropriate checks (lint, typecheck, build) and report exactly what
   changed.
9. Update documentation when the architecture changes.
10. When documentation and implementation disagree, treat the implementation as
    ground truth, then fix the documentation — or flag the mismatch instead of
    silently changing code if a migration is in progress.

This document is authoritative for the CURRENT architecture. Future/planned
architecture must be proposed through updates to this file and
PROJECT_ROADMAP.md, clearly labelled as planned.
