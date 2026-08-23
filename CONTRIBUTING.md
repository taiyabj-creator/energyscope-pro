# EnergyScope Contribution Guide

This document defines the development standards and workflow for the EnergyScope
Pro project. All contributors — human and AI assistants alike — must follow it.

---

# Project Philosophy

EnergyScope Pro prioritizes:

- Readability
- Maintainability
- Security
- Correctness over cleverness

Avoid quick fixes that introduce long-term technical debt.

---

# Repository Setup

Prerequisites:

- **Node.js 22 LTS or newer** (the production server runs Node 22; Vite 8
  requires modern Node) and npm
- Git
- Linux/Ubuntu is the reference environment (development and production)
- Python 3 is required at runtime for the backend's UTL login helper
  (`backend/adapters/python/utl_api.py`)

```bash
git clone https://github.com/taiyabj-creator/energyscope-pro.git
cd energyscope-pro
npm install          # frontend / app workspace

cd backend
cp .env.example .env # then fill in real values locally (never commit .env)
npm install
```

---

# Available Scripts

Frontend (repository root, from `package.json`):

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start the Vite dev server (TanStack Start + Nitro) |
| `npm run build` | Production build into `.output/` |
| `npm run build:dev` | Development-mode build |
| `npm run preview` | Preview a production build locally |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |

Backend (`backend/package.json`):

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start Express with nodemon auto-reload |
| `npm start` | Start Express without auto-reload |

During development the Nitro dev server proxies `/api/**` to
`API_PROXY_TARGET` (default `http://127.0.0.1:3001`), so the backend must be
running for data-driven pages to work.

---

# Verification Before Submitting Changes

The project currently has **no automated test suite** in the repository; do not
invent test commands. Verification means:

1. `npx tsc --noEmit` — TypeScript must pass (frontend)
2. `npm run lint` — ESLint must pass (frontend)
3. `npm run build` — production build must succeed end-to-end
4. Backend changes: start the server (`npm run dev` in `backend/`) and smoke-test
   the affected endpoints manually (e.g., `curl http://127.0.0.1:3001/api/health`)
5. PWA/service-worker changes: verify the build output contains a consistent
   `.output/public/sw.js` that references only assets that exist in
   `.output/public/assets/`

Any automated tests added in the future must be wired into real npm scripts and
documented here.

---

# Development Workflow

For every change:

1. Understand the requirement.
2. Inspect the existing implementation first.
3. Design the smallest appropriate solution.
4. Implement.
5. Verify (see above).
6. Refactor if needed.
7. Update documentation if architecture, workflow, or roadmap changed.

---

# Git Workflow

Branches:

- `main` — stable, deployable code
- `feature/<name>` / `fix/<name>` — one topic per branch

Avoid committing directly to `main`.

Commit messages: concise imperative summaries; conventional prefixes where they
fit, matching existing history:

```
feat: add logger uptime tracking
fix: make service worker registration resilient
docs: update architecture
refactor: extract archive gap scanner
```

Avoid generic messages ("update", "changes", "done").

Pull requests / reviews:

- One logical change per PR; no unrelated modifications
- State what changed, why, and how it was verified
- Preserve API contracts unless the task explicitly requires a change; call out
  any contract change loudly
- Keep diffs reviewable; prefer a series of small commits for larger work

---

# Environment Variables

- Copy `backend/.env.example` to `backend/.env` and fill in real values locally.
- **Never commit** `.env` files, tokens, API keys, passwords, cookies, or session
  material. They are gitignored by design; keep it that way.
- Frontend build-time variables (`VITE_API_BASE_URL`, `VITE_APP_VERSION`) and the
  Nitro proxy target (`API_PROXY_TARGET`) are non-secret; see README.md for the
  full list of variable names.
- Never log secret values; when logging request context (e.g., push endpoints),
  log origins/shapes, not capability URLs or key material.

---

# Security Rules

- The frontend must never receive UTL credentials, UTL tokens, database files,
  or third-party secrets.
- All solar data flows through the authenticated Express backend.
- New data routes must be protected by the existing auth middleware unless there
  is an explicit reason (health/config are the current exceptions).
- Never expose private server IPs, SSH details, or infrastructure specifics in
  code, logs, or documentation.

---

# Code Guidelines

## React / frontend

- Functional components + hooks, strict TypeScript
- TanStack Query for data fetching; typed API clients in `src/api/`
- Keep components small (one responsibility); split reusable UI out early
- Mobile-first responsive design; every page must work from 360px up
- Tailwind utilities + existing shadcn/ui-style components; avoid inline styles
- No business logic or credential handling in UI code

## Backend

- Routes stay thin; business logic lives in `backend/services/`
- Storage access lives in `backend/data/*Database.js` modules and services
- Preserve response shapes; additive changes over breaking changes
- Log failures meaningfully without leaking secrets

---

# Documentation Updates

Documentation is part of the project and must stay synchronized:

- Architecture changed → update `ARCHITECTURE.md`
- Milestones/priorities changed → update `PROJECT_ROADMAP.md`
- Workflow changed → update this file
- AI-assistant rules changed → update `AGENTS.md`

---

# Production Considerations

- Production runs on OCI under PM2 behind nginx on a custom HTTPS domain;
  infrastructure specifics are private and excluded from documentation.
- Deploy flow: pull latest commit → `npm ci` (both workspaces) → `vite build` →
  restart the PM2 frontend process. Builds must come from a clean tree so
  generated PWA artifacts are reproducible.
- The archive collector schedule lives in
  `backend/ecosystem.archive.config.js`; changes there require explicit review
  since they affect production data collection timing.
- Do not modify production configuration, databases, or environment files as a
  side effect of feature work.

---

# Long-Term Goal

EnergyScope Pro should remain a professional-grade, secure, installable solar
monitoring platform that exceeds the capabilities of the official UTL
application while staying easy to maintain.
