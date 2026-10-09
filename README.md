# Bet Builder

Sports odds intelligence and coupon-building workspace (React 19 + Vite, Node API on Render, preview on Vercel).
AI reasoning is routed exclusively through Core Engine; a human approval gate is the execution boundary.

## Run locally

```bash
cp .env.example .env      # fill provider keys you have; app degrades to free sources without them
npm ci
npm run dev               # frontend
npm start                 # full-stack server (API + built frontend) on :10000
```

## Quality gate (same as CI)

```bash
npm run lint && npm test && npm run test:health && npm run test:api-contract && npm run build
```

## Layout

- `src/` — frontend, domain services, decision core
- `api/` — HTTP handlers (served by `server.ts` on Render; a subset also as Vercel functions, see `.vercelignore`)
- `scripts/` — smoke and E2E scripts used by CI

See `docs/AUDIT-2026-10.md` for the current audit, architecture blueprint and roadmap.
