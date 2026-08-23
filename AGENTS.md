# EnergyScope AI Instructions

Guidance for AI coding assistants working in this repository.

## Project Context

EnergyScope Pro is a solar monitoring dashboard/PWA for UTL Solar inverter
systems. It is an independent alternative to the official UTL monitoring app,
compatible with the official UTL Solar RMS API. It is deployed to production:
Oracle Cloud Infrastructure hosting, PM2 process management, nginx, HTTPS on a
custom domain (domain/infrastructure details are private and must not appear in
code or documentation).

Current release: **v1.1.0** (commit `3d7c951 — Release v1.1.0`). The backend
package version (`backend/package.json`) is maintained independently (currently
`1.0.0`) — do not assume it matches the frontend release.

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

## Change Discipline

For code changes:

- identify exact files first
- inspect the existing implementation
- make the smallest appropriate change
- verify the diff
- run relevant checks
- report changed files
