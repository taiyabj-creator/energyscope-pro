# EnergyScope Contribution Guide

This document defines the development standards for the EnergyScope project.

All contributors, including AI coding assistants, must follow these guidelines.

---

# Project Philosophy

EnergyScope prioritizes:

- Readability
- Maintainability
- Scalability
- Performance
- Security

Avoid quick fixes that introduce long-term technical debt.

---

# Before Writing Code

Always:

1. Read ARCHITECTURE.md.
2. Read PROJECT_ROADMAP.md.
3. Understand the existing implementation.
4. Preserve architecture.
5. Avoid unnecessary refactoring.

Never change architecture without strong technical justification.

---

# Development Workflow

Every new feature should follow this order:

1. Understand the requirement.
2. Design the solution.
3. Review existing code.
4. Implement.
5. Test.
6. Refactor if needed.
7. Update documentation.

---

# Git Branch Strategy

main

Production-ready code only.

development

Current development branch.

feature/<feature-name>

One feature per branch.

Examples

feature/logger-health

feature/weather

feature/pwa

feature/export

Never develop directly on main.

---

# Commit Message Format

Examples

feat: add logger uptime tracking

fix: correct inverter power calculation

refactor: migrate chart service to FastAPI

docs: update architecture

style: improve dashboard spacing

test: add API tests

Avoid generic commit messages such as:

update

changes

fix

done

---

# Folder Structure

Frontend

src/

components/

hooks/

services/

api/

routes/

context/

types/

utils/

Backend

app/

routers/

services/

models/

schemas/

database/

core/

utils/

---

# Component Guidelines

Keep components small.

One responsibility per component.

Avoid files larger than ~300 lines unless justified.

Split reusable UI into separate components.

Prefer composition over inheritance.

---

# React Guidelines

Use:

Functional components

Hooks

Strict TypeScript

React Query

Avoid:

Class components

Prop drilling

Large global state

Unnecessary re-renders

Business logic inside UI

---

# Backend Guidelines

FastAPI is the single source of truth.

Business logic belongs inside services.

Routers should remain thin.

Database access belongs in repositories/services.

Never duplicate API logic.

---

# Database Rules

Database stores only application-owned data.

Never store:

Live inverter power

Daily production

Monthly production

Live plant status

Always fetch live production data from the UTL API.

---

# API Design

Keep endpoints RESTful.

Examples

GET /api/inverter

GET /api/plant

GET /api/weather

GET /api/logger

POST /api/maintenance

PUT /api/settings

DELETE /api/maintenance/{id}

Avoid breaking API compatibility.

---

# Error Handling

Never silently ignore exceptions.

Return meaningful HTTP responses.

Log unexpected failures.

Display user-friendly frontend messages.

---

# Security

Never commit:

.env

token.txt

Passwords

API keys

JWT secrets

Private credentials

Always use environment variables.

Never expose UTL credentials to the frontend.

---

# Styling

Use Tailwind utilities.

Use shadcn/ui components whenever possible.

Avoid inline styles unless necessary.

Maintain consistent spacing.

Prefer responsive layouts first.

---

# Responsive Design

The project is mobile-first.

Every new page must work on:

360px

390px

430px

768px

1024px

Desktop

Never design desktop first.

---

# PWA

Every feature should work inside the installed PWA.

Avoid browser-only assumptions.

Support offline shell.

Support future push notifications.

---

# Performance

Prefer lazy loading.

Minimize bundle size.

Avoid unnecessary dependencies.

Use caching where appropriate.

Optimize API requests.

---

# Testing

Every significant feature should be tested.

Backend

API tests

Service tests

Frontend

Component rendering

Responsive behavior

Data loading

---

# Documentation

Whenever architecture changes:

Update ARCHITECTURE.md

Whenever milestones change:

Update PROJECT_ROADMAP.md

Whenever development workflow changes:

Update CONTRIBUTING.md

Documentation is part of the project.

---

# AI Assistant Rules

Before generating code:

Read ARCHITECTURE.md

Read PROJECT_ROADMAP.md

Read CONTRIBUTING.md

Never invent architecture.

Never replace existing libraries without justification.

Do not introduce new dependencies unless necessary.

Explain significant design decisions.

Prefer incremental improvements over rewrites.

If unsure, inspect the project before modifying files.

---

# Code Quality Checklist

Before submitting changes:

✓ TypeScript passes

✓ Linter passes

✓ Build passes

✓ No mock data introduced

✓ Responsive layout verified

✓ No secrets committed

✓ API contracts preserved

✓ Documentation updated if necessary

---

# Long-Term Goal

EnergyScope should become a professional-grade solar monitoring platform that is:

- Modern
- Fast
- Secure
- Installable
- Scalable
- Easy to maintain
- Better than the official UTL application

Every contribution should move the project closer to this goal.