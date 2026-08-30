# ☀️ EnergyScope Pro

EnergyScope Pro is a modern, mobile-first Progressive Web App (PWA) for monitoring UTL Solar inverter systems.

The goal of the project is to build a faster, cleaner, and more feature-rich alternative to the official UTL monitoring application while remaining compatible with the official UTL backend API.

---

# Features

## Implemented

- Live inverter monitoring (plant, devices, logger diagnostics)
- Live generation charts (daily / monthly / yearly / total)
- Historical production data with automatic daily archival
- Weather dashboard
- Smart daily energy prediction (weather-based base, corrected by historical
  similarity/recency-weighted residuals) with per-day observed weather history
- Production analytics and performance insights
- Maintenance history module
- Data export (PDF / Excel)
- Authentication with JWT and server-side sessions
- Responsive dashboard with dark / light theme
- Modern UI built with shadcn/ui and Radix UI
- Installable PWA (offline-capable app shell via service worker)

## In Progress / Planned

- Web push notifications (inverter status alerts, daily production summary)
- Multi-user support
- AI-powered analytics
- Seasonal comparisons

---

# Technology Stack

| Layer | Technology |
| --- | --- |
| UI | React 19, TypeScript, Tailwind CSS 4, shadcn/ui, Radix UI, Recharts, Framer Motion |
| App framework | TanStack Start (TanStack Router + TanStack Query) |
| Server / SSR runtime | Nitro (`node-server` preset), Vite 8 |
| PWA | vite-plugin-pwa (Workbox service worker, web manifest) |
| Backend API | Node.js, Express 4 |
| Database | SQLite (`better-sqlite3`) for sessions, archives, and maintenance data |
| Process management | PM2 (production) |

External services:

- UTL Solar RMS API — accessed exclusively through the backend
- Open-Meteo — weather forecasts (forecast API) and historical weather
  (archive API, used server-side for the daily prediction correction)

---

# Architecture

```
Browser / installed PWA
        │
        ▼
TanStack Start frontend (React 19, served by Nitro)
        │  same-origin requests to /api/*
        ▼
Nitro proxy  ──►  Express backend API
                        │
                        ├────────► UTL Solar RMS API
                        ├────────► SQLite (sessions, archive, maintenance)
                        └────────► Open-Meteo (server-side weather use)
```

- The frontend is built with Vite + TanStack Start and served by Nitro using the `node-server` preset. The production build is emitted to `.output/`.
- All solar/inverter data flows through the Express backend, which talks to the UTL Solar API on behalf of authenticated clients. The frontend never communicates directly with the UTL API.
- The backend is the single source of truth for application data.
- In development and in production, Nitro proxies same-origin `/api/**` requests to the Express backend (`API_PROXY_TARGET`, default `http://127.0.0.1:3001`), so the browser only ever talks to one origin.
- Weather forecast data on the weather page is fetched from the public Open-Meteo API.

---

# Project Structure

```
src/
    Application source code.
    src/api/          Typed API clients for the backend
    src/routes/       File-based routes (TanStack Router): dashboard,
                      energy, history, devices, diagnostics, weather,
                      analytics, maintenance, settings, login, ...
    src/components/   Reusable UI (cards, charts, dashboard, layout, ui, widgets)
    src/services/     Client-side services (solar data, weather, push)
    src/hooks/        Shared React hooks
    src/context/      React context providers (auth, theme)
    src/types/        Shared TypeScript types
    src/utils/        Formatting and helper utilities
    src/lib/          Internal helpers

backend/
    Express API server.
    routes/           REST endpoints (auth, charts, plant, inverter,
                      archive, export, maintenance, health, ...)
    services/         Business logic (UTL client, session handling,
                      archive collector, exports, weather, ...)
    adapters/         External system adapters
    middleware/       Auth and other middleware
    controllers/      Request controllers
    config/           Plant configuration
    data/             SQLite databases and database modules (gitignored)
    scripts/          Standalone scripts (daily archive collector)
    .env.example      Environment variable template

public/
    Static assets and PWA icons.

vite.config.ts         Vite + TanStack Start + Nitro + PWA configuration
ecosystem configs      PM2 configuration (see backend/)
ARCHITECTURE.md        Technical architecture
PROJECT_ROADMAP.md     Development roadmap
CONTRIBUTING.md        Development guidelines
AGENTS.md              AI coding assistant guidelines
```

---

# Development Status

Current release: **v1.1.0** (active development).

The project has moved beyond the prototype stage: the dashboard, live monitoring, historical archiving, exports, maintenance, and weather features are implemented and deployed. See `PROJECT_ROADMAP.md` for the detailed roadmap.

Items listed under "In Progress / Planned" above are not complete and should not be considered stable.

---

# Running the Project

Prerequisites: Node.js (18+) and npm. Instructions below are for Linux/Ubuntu.

## 1. Clone and install

```bash
git clone https://github.com/taiyabj-creator/energyscope-pro.git
cd energyscope-pro
npm install
```

## 2. Configure the backend

```bash
cd backend
cp .env.example .env
# Edit backend/.env and fill in real values (never commit this file)
npm install
```

Available backend scripts:

```bash
npm run dev      # start with nodemon (auto-reload)
npm start        # start without auto-reload
```

By default the backend listens on port `3001` (see `PORT` in `.env.example`).

## 3. Run the frontend

From the repository root:

```bash
npm run dev      # Vite dev server (TanStack Start + Nitro)
```

Available root scripts:

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (outputs to `.output/`) |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

During development, Nitro proxies `/api/**` to the backend target defined by `API_PROXY_TARGET` (default `http://127.0.0.1:3001`), so the backend must be running for data-driven pages to work.

---

# Production / Deployment

EnergyScope Pro is hosted on **Oracle Cloud Infrastructure (OCI)**.

Production architecture, as configured in this repository:

- The web application is built with `vite build` into `.output/` and served as a Node.js application by Nitro's `node-server` preset (`node .output/server/index.mjs`).
- The Nitro layer proxies `/api/**` requests to the Express backend process running on the same host.
- PM2 manages backend processes, including the scheduled daily archive collector (`backend/ecosystem.archive.config.js`), which runs once per day via `cron_restart` to archive the previous day's production data.

Example (on the server):

```bash
pm2 start ecosystem.archive.config.js
pm2 save
```

Notes:

- The application is served over HTTPS through a custom domain name. The domain itself is infrastructure configuration and is intentionally not documented here.
- Server addresses, SSH access, reverse-proxy details, and credentials are private infrastructure information and are deliberately excluded from this repository's documentation.

---

# Environment Variables

Environment variable **names** used by the project. Never commit real values.

Frontend / build-time (Vite):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Base URL for backend API calls from the client (defaults to `/api`) |
| `VITE_APP_VERSION` | Optional version label shown on the diagnostics page |

Nitro / build-time:

| Variable | Purpose |
| --- | --- |
| `API_PROXY_TARGET` | Target the Nitro `/api/**` proxy forwards to (default `http://127.0.0.1:3001`) |

Backend (`backend/.env`, see `backend/.env.example`):

| Variable | Purpose |
| --- | --- |
| `PORT` | Port the Express API listens on |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `SESSION_ENCRYPTION_KEY` | Key used to encrypt stored session material |
| `UTL_COLLECTOR_EMAIL` | UTL portal account used by the headless archive collector |
| `UTL_COLLECTOR_PASSWORD` | Password for the archive collector account |
| `ARCHIVE_PLANT_ID` | Plant ID to archive |
| `ARCHIVE_DB_PATH` | Optional override of the SQLite archive file location |

**Warning:** never commit `.env` files, tokens, passwords, or API keys. `.env` files are gitignored by design; keep it that way. Store secrets only in environment files or your hosting provider's secret management.

---

# Documentation

Read these before contributing:

- [ARCHITECTURE.md](ARCHITECTURE.md) — technical architecture
- [PROJECT_ROADMAP.md](PROJECT_ROADMAP.md) — development roadmap
- [CONTRIBUTING.md](CONTRIBUTING.md) — coding standards and workflow
- [AGENTS.md](AGENTS.md) — guidelines for AI coding assistants

---

# AI / Memory (opencode-mem)

The project is edited with opencode and uses the **opencode-mem** memory plugin
to persist project knowledge (architecture decisions, the smart-prediction
algorithm, plant context) between sessions. It is configured **globally** in
`~/.config/opencode/opencode-mem.jsonc` (not stored in this repo):

- Vector store: `~/.opencode-mem/data`, with local embedding (Nomic Embed v1).
- Integrated with opencode's own provider (`opencodeProvider: "opencode"`,
  `opencodeModel: "big-pickle"`); auto-capture is enabled and scoped
  **per project** (`memory.defaultScope: "project"`).
- Optional management web UI at `http://localhost:4747`.

---

# Project Goals

EnergyScope Pro is designed to be:

- Modern and fast
- Mobile-first
- Installable as a Progressive Web App
- Secure
- Easy to maintain and extend
- A better experience than the official UTL monitoring dashboard

---

# Disclaimer

EnergyScope Pro is an independent project developed for educational and personal use.

It is not affiliated with, endorsed by, or sponsored by UTL Solar or any related company.

Users are responsible for complying with the terms of service of third-party services and with applicable laws when interacting with them.

No guarantees are made regarding accuracy of monitored data, system performance, or availability.

---

# License

This project is under active development. A license will be selected before wider distribution.

---

# Version

Current version: **v1.1.0**

Status: actively developed.
