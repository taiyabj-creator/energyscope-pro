# ☀️ EnergyScope

EnergyScope is a modern, mobile-first solar monitoring dashboard for UTL Solar inverter systems.

The goal of this project is to build a faster, cleaner, and more feature-rich alternative to the official UTL monitoring application while maintaining compatibility with the official UTL backend API.

---

# Features

Current Features

- Live inverter monitoring
- Live generation charts
- Daily, Monthly, Yearly and Total production
- Responsive dashboard
- Dark / Light theme
- Modern UI built with shadcn/ui
- Mobile-first design
- React Query data fetching
- Professional charts using Recharts

Planned Features

- Progressive Web App (PWA)
- Logger Health dashboard
- Weather integration
- Maintenance history
- Excel export
- CSV export
- Push notifications
- Multi-user support
- AI-powered analytics
- Seasonal comparisons
- Historical uptime analysis

---

# Technology Stack

## Frontend

- React 19
- TypeScript
- Vite
- Tailwind CSS
- shadcn/ui
- Radix UI
- TanStack Query
- Recharts
- Framer Motion

Hosting

- Vercel

---

## Backend

Current

- Express (temporary)

Final

- FastAPI
- SQLAlchemy
- Alembic
- Pydantic
- httpx

Hosting

- Render

---

## Database

Final Database

- Turso (Cloud SQLite)

---

# Architecture

```
Browser / PWA
        │
        ▼
React Frontend
        │
        ▼
FastAPI Backend
        │
        ├────────► UTL Solar API
        ├────────► Weather Provider
        └────────► Turso Database
```

The frontend never communicates directly with external providers.

The backend acts as the single source of truth.

---

# Project Structure

```
backend/
    Express backend (temporary)

src/
    React frontend

public/
    Static assets

ARCHITECTURE.md
    Technical architecture

PROJECT_ROADMAP.md
    Development roadmap

CONTRIBUTING.md
    Development guidelines
```

---

# Development Status

Current Stage

Prototype / Active Development

Completed

- Reverse engineered UTL authentication
- Reverse engineered Plant Status endpoint
- Reverse engineered InverterDevice endpoint
- Reverse engineered generation chart endpoints
- Live backend prototype
- Responsive dashboard
- Live chart integration

In Progress

- Replace remaining mock data
- Backend migration to FastAPI
- Turso integration

Upcoming

- PWA
- Logger Health
- Weather
- Maintenance module
- Export system
- Deployment

---

# Running the Project

## Frontend

Install dependencies

```bash
npm install
```

Run

```bash
npm run dev
```

---

## Backend

```bash
cd backend
npm install
npm run dev
```

---

# Environment Variables

Do NOT commit:

- .env
- token.txt
- API keys
- Passwords

All credentials must be stored using environment variables.

---

# Documentation

Read these files before contributing:

- ARCHITECTURE.md
- PROJECT_ROADMAP.md
- CONTRIBUTING.md

These documents define the project's architecture, roadmap, and coding standards.

---

# Project Goals

EnergyScope is designed to be:

- Modern
- Mobile-first
- Installable as a Progressive Web App
- Secure
- Easy to maintain
- Scalable
- Free to host
- Better than the official UTL dashboard

---

# Disclaimer

EnergyScope is an independent project developed for educational and personal use.

It is not affiliated with, endorsed by, or sponsored by UTL Solar or any related company.

Users are responsible for complying with the terms of service and applicable laws when interacting with third-party services.

---

# License

This project is currently under active development.

A license will be selected before the first public release.

---

# Version

Current Version

v0.1.0 (Development)

Status

🚧 Work in Progress