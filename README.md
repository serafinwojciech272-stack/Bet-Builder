# BADBUILDER — AI Sports Intelligence (Frontend Foundation)

BADBUILDER is the frontend foundation of a future AI Sports Intelligence platform.
This repository contains the UI, domain model, deterministic calculations, mock
services, and clean integration contracts — **not** a fake autonomous AI backend.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS v4
- React Router
- Vitest (unit tests for analytics + services)
- Lucide-ready, framer-motion-ready

## Architecture

Provider Layer
→ Raw Data
→ Normalization
→ Canonical Sports Domain
→ Odds Snapshots
→ Odds Movement
→ Data Quality
→ Sports Intelligence
→ Core Engine
→ Mission
→ Approval
→ Execution
→ Measurement
→ Learning

```
src/
  domain/        Canonical domain types (Event, Market, Selection, OddsSnapshot, ...)
  analytics/     Pure deterministic calculations (EV, implied probability, value, ...)
  core/          Core Engine contracts + deterministic mock (CoreEngineClient, types, mockCoreEngine)
  services/      Service boundaries (sports data, odds, analysis, optimization, correlation)
  data/          Deterministic seed data + demo data factories
  hooks/         React state (builder state, builder stats)
  components/    Reusable UI (TopNav, BottomNav, EventCard, SelectionRow, BuilderPanel, ui badges)
  pages/         Route pages (Dashboard, Sports, Live, Builder, EventMarkets, Analysis, History, Missions)
```

## Key design rules

- **No AI logic in React components.** All math lives in `src/analytics/calcs.ts`
  (pure functions). Analysis requests go through the `CoreEngineClient` contract.
- **No second Core Engine.** `src/core/` defines the contract; the deterministic
  mock (`mockCoreEngine.ts`) is a drop-in replacement for a future real engine.
- **Mock data is demo data.** Every screen shows a `DEMO DATA` / `MOCK ANALYSIS`
  indicator. Nothing is presented as real bookmaker or provider data.

## Calculations (pure, deterministic)

```
impliedProbability = 1 / odds
EV                = modelProbability * odds - 1
value             = modelProbability - impliedProbability
combinedOdds      = product(odds)
potentialReturn   = stake * combinedOdds
```

## Core Engine integration

To connect the real engine later, implement the `CoreEngineClient` interface in
`src/core/CoreEngineClient.ts` over HTTP and swap it in where the mock client is
created. The frontend will not change.

## Commands

```
npm install
npm run dev       # local dev server
npm run build     # type-check + production build
npm run test      # vitest unit tests
```

## Responsive

- 360px / 390px / 430px: single column, bottom nav, sticky builder summary, bottom-sheet builder
- 768px: two-column event grids
- 1024px+: desktop nav + right-hand builder panel
- No horizontal overflow (`overflow-x: clip` on root)
