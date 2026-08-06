# EnergyScope Development Roadmap

> Version: 1.0
> Status: Active Development

---

# Project Vision

EnergyScope aims to become the most modern and feature-rich monitoring dashboard for UTL Solar systems.

The project is designed as a Progressive Web App (PWA) that works seamlessly on desktop, tablet, and mobile while providing capabilities beyond the official UTL application.

---

# Current Development Status

## Phase

Prototype Complete

### Completed

- Reverse engineered UTL login API
- Reverse engineered Plant Status endpoint
- Reverse engineered InverterDevice endpoint
- Reverse engineered Daily chart endpoint
- Reverse engineered Monthly chart endpoint
- Reverse engineered Yearly chart endpoint
- Reverse engineered Total chart endpoint
- React dashboard
- Responsive layout
- Energy chart
- Sidebar
- Theme system
- Metric cards
- Backend prototype
- Live inverter integration
- Live chart integration

---

# Milestone 1

## Remove Remaining Mock Data

Status:

In Progress

Tasks

- Replace mock plant information
- Replace mock weather
- Replace mock analytics
- Replace mock maintenance
- Replace mock notifications
- Replace mock history
- Replace mock devices
- Replace mock logger information

Goal

Entire dashboard should display only live or database-backed data.

---

# Milestone 2

## FastAPI Migration

Status

Planned

Tasks

- Create FastAPI project
- Configure SQLAlchemy
- Configure Alembic
- Create service layer
- Create routers
- Create dependency injection
- Move UTL API integration
- Replace Express backend
- Preserve frontend API contracts

Goal

Remove Express completely.

---

# Milestone 3

## Database Integration

Status

Planned

Database

Turso

Tables

- Users
- Plants
- Preferences
- Maintenance
- Logger Events
- Notification Settings

Goal

Store only application-owned data.

---

# Milestone 4

## Plant Configuration

Status

Planned

Features

- Editable plant name
- Editable location
- Latitude
- Longitude
- Installation date
- Capacity
- Timezone

Goal

No hardcoded plant information.

---

# Milestone 5

## Logger Health

Status

Planned

Features

Live Status

- Online
- Offline
- Last Seen

History

- Online timestamps
- Offline timestamps
- Downtime
- Uptime

Statistics

- Daily uptime
- Monthly uptime
- Availability %
- Longest outage
- Average uptime

Charts

- Uptime chart
- Calendar view
- Timeline

Notifications

- Logger offline
- Logger online
- Recovery duration

Exports

- Excel
- CSV

Goal

Provide logger diagnostics beyond the official application.

---

# Milestone 6

## Weather Module

Status

Planned

Features

Current weather

Hourly forecast

Daily forecast

Cloud cover

Rain prediction

Temperature

Humidity

Wind speed

Solar irradiance (future)

Goal

Improve solar production insights.

---

# Milestone 7

## Maintenance Module

Status

Planned

Features

Cleaning history

Inspection history

Repair history

Maintenance reminders

Photo attachments

Notes

Goal

Track long-term plant maintenance.

---

# Milestone 8

## Export System

Status

Planned

Supported Formats

- Excel (.xlsx)
- CSV

Future

- PDF

Goal

Professional reporting.

---

# Milestone 9

## Progressive Web App

Status

Planned

Required

Installable

Offline shell

App icon

Splash screen

Auto updates

Full screen

Responsive

Desktop support

Android support

Future

Push notifications

Goal

Native app experience without an app store.

---

# Milestone 10

## Authentication

Status

Planned

Features

Secure login

Session management

User preferences

Password reset

Future

Multi-user support

Goal

Support multiple dashboard users securely.

---

# Milestone 11

## Notifications

Status

Planned

Types

Logger offline

Logger online

Maintenance reminder

Production alert

Fault alert

Weather alert

Future

Email

Telegram

WhatsApp

Push Notifications

Goal

Real-time awareness.

---

# Milestone 12

## Analytics

Status

Planned

Features

Daily analytics

Monthly analytics

Yearly analytics

Seasonal comparison

Weather correlation

Efficiency

Capacity factor

Best production day

Worst production day

Goal

Advanced production insights.

---

# Milestone 13

## Deployment

Status

Planned

Frontend

Vercel

Backend

Render

Database

Turso

Domain

Custom domain

HTTPS

Enabled

Goal

Production-ready deployment.

---

# Milestone 14

## Performance Optimization

Status

Planned

Tasks

Lazy loading

Route splitting

Image optimization

Caching

API optimization

Database optimization

Bundle optimization

Goal

Fast loading on all devices.

---

# Milestone 15

## Security Audit

Status

Planned

Tasks

Environment variables

Secret removal

Authentication review

Input validation

Rate limiting

HTTPS verification

Dependency audit

Goal

Production-grade security.

---

# Milestone 16

## Final Release

Status

Planned

Checklist

- No mock data
- Fully responsive
- FastAPI backend
- Turso database
- PWA complete
- Weather integrated
- Maintenance complete
- Logger Health complete
- Excel export
- Authentication
- Deployment
- Documentation
- GitHub cleanup

Goal

Version 1.0 Release

---

# Future Ideas

- Multiple plants
- Multi-inverter support
- AI production prediction
- AI fault detection
- AI maintenance suggestions
- Energy cost calculator
- Carbon savings
- Battery support
- Home Assistant integration
- MQTT integration
- Smart home integration
- Public sharing dashboard
- Installer dashboard
- Fleet management

---

# Development Principles

- Build production-quality software.
- Avoid technical debt whenever practical.
- Keep frontend presentation-focused.
- Keep backend as the single source of truth.
- Preserve API compatibility during refactoring.
- Prioritize maintainability over shortcuts.
- Every new feature should align with ARCHITECTURE.md.
- Complete one milestone before moving to the next whenever possible.

---

# Success Criteria

EnergyScope should become a modern, installable, secure, scalable, and maintainable solar monitoring platform that exceeds the capabilities of the official UTL application while remaining completely free to host within the constraints of the chosen architecture.