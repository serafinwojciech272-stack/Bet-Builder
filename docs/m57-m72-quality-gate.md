# M57-M72 Quality Gate

This gate is intentionally conservative. A release candidate must pass TypeScript compilation, lint, the complete Vitest suite, backend health smoke, API contract smoke, production build, and persistence E2E.

Prediction quality is evaluated separately from execution safety:
- calibration and Brier/log-loss are first-class metrics;
- CLV is a benchmark signal, not proof of profitability;
- small samples are not promoted into model rankings;
- model versions remain explicit and auditable;
- a single-model fallback is labeled as such and never presented as ensemble agreement;
- closing-line claims require a declared reference source and timestamp;
- losing outcomes remain in the ledger;
- OBSERVATIONAL_ONLY remains authoritative until explicit execution gates permit otherwise.

Cockpit integration must use the canonical prediction path. M64-M72 engines are enrichment of the existing prediction lifecycle, not a second prediction or execution pipeline.
