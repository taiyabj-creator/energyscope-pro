# EnergyScope Architecture

## Project Overview

EnergyScope is a professional solar monitoring dashboard for UTL Solar inverters.

The objective is NOT to clone the official UTL application.

The objective is to build a faster, cleaner, more modern, mobile-first monitoring platform with additional features that the official application does not provide.

---

# Project Goals

- Zero hosting cost
- No VPS
- No self-hosting
- Mobile-first
- Progressive Web App (PWA)
- Fast loading
- Modern UI
- Responsive
- Easy to maintain
- Easily scalable
- Secure
- Clean architecture

---

# Final Technology Stack

## Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Radix UI
- TanStack Query
- TanStack Router (or existing router until migration)
- Framer Motion
- Recharts

Hosting:

- Vercel

---

## Backend

- FastAPI
- SQLAlchemy 2.x
- Alembic
- Pydantic v2
- httpx

Hosting:

- Render

---

## Database

Turso (Cloud SQLite)

Reasons:

- SQLite compatible
- Persistent
- Free
- Easy migration later
- Minimal maintenance

---

# Final Architecture

```
Browser / PWA
        │
        ▼
React Frontend
        │
        ▼
FastAPI Backend
        │
        ├──────────► UTL Solar API
        │
        ├──────────► Weather Provider
        │
        └──────────► Turso Database
```

The frontend MUST NEVER communicate directly with:

- UTL API
- Weather API
- Database

Everything passes through FastAPI.

---

# Frontend Responsibilities

Frontend is responsible only for:

- Rendering UI
- User interactions
- Charts
- Theme
- Navigation
- Calling our backend API

Frontend must never contain:

- Business logic
- Authentication logic
- UTL credentials
- Weather provider logic

---

# Backend Responsibilities

Backend is responsible for:

- UTL authentication
- Session management
- Token refresh
- Weather integration
- Data aggregation
- Excel export
- CSV export
- Future PDF export
- Notifications
- Logger uptime
- Analytics
- Maintenance history
- Plant configuration

Backend is the single source of truth.

---

## Dashboard Aggregation Architecture

The dashboard should be assembled through a dedicated aggregation layer rather than by making many independent frontend requests. The purpose of DashboardService is to orchestrate the data required for the dashboard experience, combine it into a stable DashboardDTO, and return a single response that is optimized for the UI.

DashboardService should be responsible for orchestration and assembly, while domain-specific behavior remains in dedicated services. It should not contain duplicated business rules or become the place where every new widget is implemented directly. Instead, it should coordinate provider interfaces and domain services that already own their own responsibilities.

DashboardService should support partial failure handling so that one failed provider does not cause the entire dashboard to fail. If a weather provider is slow or unavailable, the dashboard can still return plant status, energy totals, and inverter data, while marking the affected widget as degraded or unavailable. This keeps the user experience resilient and prevents a single downstream issue from collapsing the whole page.

Each widget should use a per-widget timeout strategy so that slow providers do not block the entire dashboard response. Short-lived widgets such as realtime power can use shorter timeouts, while less urgent widgets such as historical summaries can use longer ones. Timeout behavior should be explicit and consistent so that the backend can fail fast for unresponsive dependencies without introducing unnecessary latency.

Independent service calls should be orchestrated concurrently where possible. DashboardService should fan out requests to independent providers and wait for the set of results in parallel, rather than performing them sequentially. This improves response time and allows the aggregation layer to scale better as the number of dashboard widgets grows.

DashboardService should depend on interfaces rather than concrete services. This allows different implementations for live UTL data, cached data, database-backed metadata, or future providers without forcing changes to the aggregation layer. The service contract should focus on what each provider can deliver, not on the implementation details of how it is delivered.

Dashboard-specific persistence should be handled through DashboardRepository. This repository should own dashboard-related state such as user layout preferences, widget visibility, widget ordering, dashboard configuration, and other personalization settings. DashboardRepository keeps dashboard persistence concerns separate from domain services and prevents the aggregation layer from becoming tightly coupled to storage implementation details.

As new widgets are added, DashboardService can continue scaling without becoming a "God Service" by keeping the aggregation layer thin and by delegating widget-specific logic to focused providers and domain services. New widgets should be added through small provider implementations, widget-specific DTO fragments, and optional repository extensions rather than by expanding a single central service with more responsibilities. This preserves separation of concerns, makes testing easier, and allows the dashboard architecture to evolve without creating a large, fragile orchestration bottleneck.

---

# Database Responsibilities

Database WILL store:

## Users

- User profile
- Password hash
- Preferences

## Plants

- Plant ID
- Logger serial
- Plant name
- Capacity
- Installation date
- Latitude
- Longitude
- Timezone

## Settings

- Theme
- Units
- Notification preferences
- Weather preferences

## Maintenance

- Cleaning
- Inspection
- Repairs
- Notes
- Images (future)

## Logger Health

- Online events
- Offline events
- Daily uptime
- Monthly uptime
- Availability statistics

---

Database WILL NOT store

- Current power
- Daily generation
- Monthly generation
- Yearly generation
- Live inverter data
- Live plant status

Those must always be requested live from the UTL API.

---

# Weather Architecture

```
Frontend

↓

FastAPI

↓

Weather Service
```

Frontend never communicates with weather providers.

Changing weather providers should require backend changes only.

---

# Authentication

Frontend never stores:

- UTL username
- UTL password
- UTL token

Backend performs:

- Login
- Token storage
- Session management
- Token refresh

Only our backend communicates with UTL.

---

# PWA

PWA is REQUIRED.

Required features:

- Installable
- Offline shell
- Splash screen
- Home screen icon
- Automatic updates
- Full screen
- Responsive

Future:

- Push notifications

---

# Logger Health

Logger Health is a core module.

Required features:

- Online alerts
- Offline alerts
- Timestamp history
- Daily uptime
- Monthly uptime
- Availability %
- Longest outage
- Average uptime
- Export
- Push notifications

---

# Weather Module

Future features:

- Current weather
- Hourly forecast
- Daily forecast
- Cloud prediction
- Rain prediction
- Solar production prediction

Backend only.

---

# Export Module

Supported exports:

- Excel (.xlsx)
- CSV

Future:

- PDF

Generated on backend.

---

# Coding Principles

- Keep components small.
- Prefer composition.
- Avoid duplication.
- Strong typing.
- No hardcoded credentials.
- Use environment variables.
- Business logic belongs in backend.
- Frontend should remain presentation-focused.
- Prefer services over utility dumping.
- Write maintainable code over clever code.

---

# API Design Principles

Routes should remain stable.

Examples:

GET /api/inverter

GET /api/plant

GET /api/charts/daily

GET /api/charts/monthly

GET /api/charts/yearly

GET /api/weather

GET /api/logger

Avoid breaking frontend API contracts.

---

# Security

Never commit:

- .env
- token.txt
- API keys
- Passwords
- JWT secrets

Use environment variables for all credentials.

---

# Future Features

- Multiple plants
- User accounts
- Shared dashboards
- Push notifications
- Historical analytics
- AI insights
- Automatic fault detection
- Email reports
- Telegram notifications
- WhatsApp notifications
- Device comparison

---

# Git Workflow

main

- Stable
- Deployable

development

- New features

feature/*

- Individual features

Never develop directly on main.

---

# Deployment

Frontend:

Vercel

Backend:

Render

Database:

Turso

Domain:

Custom domain later

HTTPS required.

---

# AI Assistant Instructions

Before modifying code:

1. Read this document.
2. Understand the architecture.
3. Do not change the architecture without justification.
4. Preserve API contracts whenever possible.
5. Avoid introducing unnecessary dependencies.
6. Prefer incremental refactoring.
7. Keep frontend independent of external providers.
8. Keep backend as the single source of truth.
9. Explain significant architectural changes before implementing them.
10. Prioritize maintainability, readability, and long-term scalability over short-term convenience.

This document is the project's architectural source of truth.