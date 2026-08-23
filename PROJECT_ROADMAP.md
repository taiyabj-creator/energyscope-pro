# EnergyScope Development Roadmap

> Status: Active Development
> Current release: **v1.1.0** (commit `3d7c951 — Release v1.1.0`)
>
> This roadmap reflects the CURRENT state of the repository. Items are labelled
> Completed / In Progress / Planned / Future. Speculative ideas live under
> Long-Term Vision and are not committed work.

---

## Current Release

**v1.1.0** — EnergyScope Pro is a deployed, production PWA for monitoring UTL
Solar inverters.

Current production state:

- Hosted on Oracle Cloud Infrastructure (OCI) with PM2 process management
- Served over HTTPS on a custom domain behind an nginx reverse proxy
- TanStack Start + Nitro frontend (`node .output/server/index.mjs`) proxying
  same-origin `/api/**` to the Express backend
- Installable PWA with offline app shell and Web Push notifications
- Daily production archiving running three times per day via a scheduled,
  gap-aware PM2 collector

Major capabilities actually implemented:

- Live inverter monitoring (plant, devices, logger diagnostics)
- Live generation charts (daily / monthly / yearly / total)
- Historical production data with automatic daily archival and gap backfill
- Production analytics, predictions, and performance score
- Weather dashboard and solar prediction backed by Open-Meteo
- Maintenance history module
- Data export (Excel / PDF / ZIP)
- Authentication with JWT and encrypted server-side sessions incl. automatic
  UTL token refresh
- Web push notifications: inverter online/offline alerts with debounce, daily
  production summary after sunset, per-device subscription management

---

## Completed

Verified from the repository:

- Reverse-engineered UTL Solar RMS API integration (login, plant status,
  plant info, inverter/device listing, daily/monthly/yearly/total charts),
  including a Python login helper spawned by the backend adapter
- React 19 + TypeScript dashboard with responsive mobile-first layout,
  dark/light theming, metric cards, Recharts visualizations
- TanStack Start application shell (file-based routing, SSR via Nitro)
- Express backend as the single source of truth; frontend never talks to the
  UTL API directly
- JWT authentication + encrypted session storage + automatic UTL token refresh
- Historical archive: gap-aware, idempotent collector (`backend/scripts/archive-collector.js`)
  scheduled through PM2 at 06:00 / 13:00 / 20:00 IST
- Archive query API (daily / monthly / yearly / lifetime aggregates)
- Maintenance history module
- Excel/PDF/ZIP export generation
- Weather page fed by the public Open-Meteo API (client-side) plus server-side
  Open-Meteo use for predictions and notification content
- Daily energy prediction + performance score endpoints
- PWA: installable manifest, Workbox service worker precache, auto-update flow
- Web Push notifications end-to-end (VAPID, per-account subscriptions,
  ownership-checked unsubscribe, failure pruning on send)
- Production deployment on OCI with PM2, nginx, HTTPS custom domain
- Dependency hygiene fix for `uuid` advisory via npm overrides in the backend

---

## Current Focus

Visible unfinished work in the project:

1. **Automated tests (In Progress conceptually, not yet in repo)** — there is
   currently **no automated test suite in the repository**. Establishing backend
   API/service tests and basic frontend checks is the top engineering priority.
2. **Push notification rollout hardening** — service-worker registration
   resilience was just improved (`fix: make service worker registration
   resilient`); real-world verification across Android/desktop Chrome continues.
3. **Reproducible production builds** — ensure server builds always run from a
   clean tree with `npm ci` so generated PWA artifacts are byte-stable.
4. **Operational observability** — log rotation/monitoring for the PM2 processes.

---

## Near-Term Roadmap

Planned engineering priorities based on the existing codebase:

- **Backend test suite (Planned)** — cover auth/session lifecycle, archive
  collector idempotency, subscription upsert/unsubscribe ownership, export
  generation.
- **Editable plant metadata (Planned)** — move beyond static
  `backend/config/plant.json` for name/location/timezone/capacity.
- **Maintenance storage migration (Planned)** — migrate `maintenance.json` to
  SQLite for consistency with other stores.
- **PWA update UX (Planned)** — surface "new version available" states instead of
  silent auto-reload behaviour.
- **Dependency audit automation (Planned)** — periodic `npm audit` gates for both
  packages.

---

## Medium-Term Roadmap

Features that are genuinely planned:

- **Multi-user support (Planned)** — multiple dashboard accounts with per-user
  sessions and preferences over the shared plant feed.
- **Seasonal comparisons (Planned)** — year-over-year production comparisons
  built on the existing archive aggregate APIs.
- **AI-powered analytics groundwork (Planned)** — anomaly detection on archived
  daily data (e.g., underperformance days), building on prediction/performance
  services already present.
- **Scheduled reports (Planned)** — periodic email/PDF production summaries from
  the archive.
- **Notification expansion (Planned)** — user-tunable thresholds for
  production/fault alerts alongside the existing inverter status notifications.

---

## Long-Term Vision

Future ideas consistent with the project's direction (not committed):

- Multiple plants / fleet view
- Advanced analytics: weather-correlated efficiency, capacity factor trends,
  best/worst production insights
- AI fault detection and maintenance suggestions
- Device/inverter comparison views
- Installer/multi-site dashboards
- Home Assistant / MQTT integrations
- Energy cost and carbon-savings calculator
- Public shareable read-only dashboards

---

## Development Principles

- Build production-quality software; avoid avoidable technical debt.
- Keep the frontend presentation-focused; keep integration/security logic in the
  backend.
- Preserve API compatibility during refactoring.
- Every new feature should align with ARCHITECTURE.md.
- Prefer completing and hardening existing features before adding new ones.
