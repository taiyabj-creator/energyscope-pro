# Solara Vista

IMPORTANT

This project is NOT a generic solar dashboard.

This is a production-grade web application for monitoring a UTL Solar inverter.

The frontend must be built in React + TypeScript + Vite + Tailwind CSS.

Do NOT build any backend.

Do NOT invent API endpoints.

Do NOT invent fake business logic.

Only build the frontend with reusable components and mock data placeholders that can later be replaced by API responses.

==================================================

PROJECT

Name

UTL Solar Dashboard

Purpose

A modern premium solar monitoring dashboard inspired by:

• Tesla Energy

• Huawei FusionSolar

• SolarEdge

• Victron VRM

The application must look like commercial software.

Avoid anything that looks like an admin template.

==================================================

DESIGN PHILOSOPHY

The UI should feel:

Premium

Minimal

Elegant

Fast

Responsive

Modern

High information density without clutter.

Lots of spacing.

Rounded cards.

Subtle glassmorphism.

Beautiful gradients.

Smooth animations.

Dark mode first.

Light mode supported.

Use modern typography.

Use Lucide icons.

Avoid Bootstrap appearance.

Avoid Material Design appearance.

==================================================

TARGET USERS

Solar system owners

Installers

Engineers

Users checking production daily

==================================================

CURRENT SYSTEM

Current installation

4.305 kW

On-grid system

NO BATTERY INSTALLED

The application MUST support batteries in the future.

If no battery exists

Do NOT display fake battery percentage.

Instead show

"No Battery Installed"

or automatically hide battery widgets.

==================================================

TECH STACK

React

TypeScript

Vite

TailwindCSS

React Router

React Query

Axios

Recharts

Framer Motion

Lucide React

==================================================

DESKTOP LAYOUT

Sidebar

Header

Dashboard

Analytics

Devices

History

Weather

Maintenance

Settings

Profile

==================================================

HEADER

Display

Dashboard

Welcome, <User Name> 👋

UTL Solar Dashboard

Real-time Monitoring System

On the right

Current Time

Current Date

Plant Status

Connection Status

Dark / Light toggle

Notification icon

User avatar

==================================================

SIDEBAR

Collapsible

Icons

Labels

Modern hover animations

Sections

Dashboard

Analytics

Energy

History

Weather

Maintenance

Devices

Settings

==================================================

DASHBOARD

Top cards

Current Solar Power

Current Load

Grid Import / Export

Today's Generation

Month Generation

Year Generation

Total Generation

Plant Status

Cards should contain

Title

Value

Unit

Small icon

Trend indicator

Last updated

==================================================

POWER FLOW

This is the centerpiece.

NOT emojis.

Create a beautiful SVG power flow.

Example

           Solar

             │

             ▼

       Inverter

        ▲     ▼

      Grid   Load

Battery should appear ONLY if installed.

Animate power flow.

Moving dots.

Flow direction changes.

==================================================

CHARTS

Use Recharts.

Day

Month

Year

Total

Hover tooltips.

Smooth animations.

==================================================

ANALYTICS PAGE

Production trends

Performance comparison

Best production day

Worst production day

Monthly heatmap

==================================================

DEVICE PAGE

Plant information

Inverter model

Serial number

Firmware

Logger

WiFi status

RSSI

Last communication

==================================================

HISTORY PAGE

Daily history

Monthly history

Yearly history

Export CSV

==================================================

WEATHER PAGE

Current weather

Forecast

Solar irradiance

Cloud cover

Rain probability

Temperature

Wind

==================================================

MAINTENANCE PAGE

Plant age

Last cleaning

Last inspection

Maintenance timeline

Plant Health Score

==================================================

NOTIFICATIONS

Performance anomaly

Cleaning reminder

Inspection reminder

Offline warning

==================================================

RESPONSIVE

Desktop

Tablet

Mobile

No horizontal scrolling.

Cards rearrange automatically.

Sidebar becomes drawer.

==================================================

ANIMATIONS

Framer Motion

Page transitions

Hover animations

Card animations

Loading skeletons

Animated charts

Animated power flow

==================================================

THEME

Dark theme default.

Support light theme.

Modern color palette.

Avoid bright saturated colors.

==================================================

ACCESSIBILITY

Keyboard navigation

Good contrast

Readable typography

Responsive touch targets

==================================================

PROJECT STRUCTURE

Use scalable architecture.

components/

pages/

hooks/

services/

types/

context/

utils/

==================================================

IMPORTANT

Do NOT generate backend.

Do NOT generate fake authentication.

Do NOT generate fake login.

Do NOT invent APIs.

Only create reusable frontend components.

Use mock services so the backend can later replace them without changing the UI.

==================================================

FINAL GOAL

The finished application should look like software developed by Tesla, Huawei or SolarEdge rather than a student project.

Every screen should feel premium, clean and production ready.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://energyscope-pro.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/2ffd0cbd-5741-4333-b4a9-ccea932cbae7).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
