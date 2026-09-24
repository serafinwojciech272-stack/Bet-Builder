# Bet Builder — UI Engineering Contract

## Product intent
Bet Builder is a premium sports intelligence and decision product. The interface must communicate:
DATA → INTELLIGENCE → DECISION → HUMAN GATE → MISSION → MEASUREMENT → LEARNING.

## Visual system
- Preserve the private-intelligence-club aesthetic: graphite/ink foundations, restrained violet, cyan, gold, positive green and warning red.
- Prefer depth, hierarchy, optical alignment and purposeful motion over decorative neon.
- Use cinematic gradients, layered shadows, crisp translucent borders and controlled glass surfaces.
- Treat typography as part of the product identity. Keep display typography expressive and data typography highly legible.
- Never introduce generic stock imagery or gratuitous 3D/WebGL decoration.
- New visual effects must degrade gracefully on mid-range mobile hardware.

## Interaction contract
- Every important action has a visible state: idle, loading, success, blocked, error.
- Never imply LIVE data when the provider is unavailable; explicitly show DEMO/degraded state.
- Human approval remains the execution boundary.
- Keyboard navigation, visible focus, semantic controls and accessible names are mandatory.
- Respect prefers-reduced-motion.
- Prefer CSS transforms/opacity for animation. Avoid layout-affecting animation.
- Mobile hit targets should be at least 44px.
- Inputs on mobile should use at least 16px text.
- Empty, sparse, dense and error states must be designed rather than left to browser defaults.

## Performance contract
- Keep the first screen fast and stable.
- Avoid unnecessary dependencies and heavy animation libraries for simple effects.
- Preserve layout stability; reserve media space and avoid hydration-driven shifts.
- Prefer intrinsic CSS layout over measuring DOM geometry in JavaScript.
- Large lists should use virtualization or content-visibility where justified.
- Do not sacrifice Core Web Vitals for visual spectacle.

## Live provider notes
- The default live provider (`sportscore`) commonly returns `mode: LIVE_DATA_NO_ODDS` with real events and `snapshots: []`. This is a valid production state, not an error: events must stay visible with an explicit no-odds label, and no price/edge/EV may be fabricated.
- Canonicalize sport keys tolerantly: providers send bare keys (`basketball`, `tennis`, `cricket`) as well as prefixed ones (`basketball_nba`). A prefix-only matcher silently collapses everything to `soccer`.
- `buildEventIntel` in `src/state/selectors.ts` is the single pre-compute for dashboard/explorer/analysis. It must retain every normalized event (`market: null` when no odds) — never filter events out of existence.
- Verify UI changes against the real feed (`/api/odds`) as well as fixtures; the no-odds path is the default live path.
- Frontend routing is hash-based (`HashRouter`); deep links need `#/analysis/<url-encoded-event-id>`.
- The API server (`server.ts`) exposes only JSON routes; the SPA is served by Vite. For local browser verification, proxy `/api` to the API server.

## Engineering contract
- TypeScript strictness and existing domain contracts must remain intact.
- Do not weaken tests to make a UI change pass.
- Run lint, tests, backend health smoke and production build before declaring a production-quality change.
- Do not claim browser E2E verification unless an actual browser automation run was executed.
- Keep product copy in Polish first unless the existing surface is explicitly multilingual.
- Never push directly to `main`; use a feature branch and a pull request.
