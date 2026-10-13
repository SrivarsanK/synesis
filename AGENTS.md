# AGENTS.md — Blindspot build-agent operating contract

> **Read first.** This file tells coding agents how to work. `PRODUCT.md` is the canonical product definition. The `docs/` files specify implementation details. The assignment is a **six-hour, synthetic-data hackathon MVP**, not a production AML system.

## Mission, in one sentence

Build **Blindspot**, a Rust-powered, desktop-first investigation console that incrementally detects **fan-in followed by rapid onward pass-through**, distinguishes an established merchant-settlement lookalike using prior account context, generates an evidence-backed investigation case with a proportionate *recommended* response, and measures itself against a simple baseline on held-out synthetic scenarios.

**Brand:** `blindspot.` — *Fraud hides in plain sight.* `TRACE` may name the internal detection module only.

## Instruction priority and source of truth

1. `PRODUCT.md`: challenge interpretation, fixed MVP scope, ethics, success criteria.
2. `AGENTS.md`: sequencing, constraints, quality gates, change control.
3. `docs/API_AND_DATABASE.md`: **canonical wire schemas, endpoints and persistence**.
4. `docs/DETECTION_ENGINE.md`: **canonical detector semantics, thresholds, feature definitions and scoring**.
5. `docs/ARCHITECTURE.md`: module boundaries, concurrency, startup and state.
6. `docs/DATA_AND_ML.md`: scenario inputs/labels and optional model requirements.
7. `docs/FRONTEND.md`: UI state, components and design tokens.
8. `docs/TESTING.md`: verification and evaluation.
9. `docs/IMPLEMENTATION.md`: sequence, handoffs, blockers and stop rules.

If two specifications conflict, **do not silently choose**. Preserve `PRODUCT.md` intent, prefer the more precise contract document for the relevant area, update conflicting docs and tests together, and record the decision in a short code comment or commit description. Build only what's requested; avoid speculative features.

## Hard invariants

- **P0 is the only mandatory scope.** No bank linking, actual transfer blocking, Web3, complex GNNs, ONNX, LLM agents, auth, onboarding, separate mobile app or microservices.
- The exact same backend `ingest_transaction()` logic handles UI-step replay, optional auto-replay, API ingestion and evaluation. No special-case fraud fixture IDs or scenario labels inside the detector.
- All synthetic data is clearly identified as **SIMULATED / SYNTHETIC** in the UI. Do not claim actual bank connectivity.
- Use **minor currency units as signed 64-bit positive integers** (e.g. paise). Convert to decimal display only in the UI.
- Transaction identifiers are idempotent. Duplicate replay cannot change balances, features, graph or cases.
- Timestamps on input are ISO-8601 UTC **event time**. Keep ingestion/processing time separate. Process chronological events; reject significantly late events in MVP rather than infer impossible causal sequences.
- Preserve the direction and multiplicity of account transfers. An edge is a **transaction**, keyed by `transaction_id`; never collapse repeated A→B transfers.
- Never use `scenario_id`, a fraud label, target account list or benchmark-only metadata as a detection feature.
- A suspicious case is **potential risk**, not proof of money laundering. Automatic irreversible enforcement is out of scope.
- Risk is a **hand-engineered 0–100 relative score**, not a calibrated ML probability.
- Do not fabricate latency, precision, recall, customer savings, accuracy, or real-world performance.

## Locked MVP stack

| Boundary | Use | Avoid |
|---|---|---|
| Core API | Rust, Axum, Tokio, Serde | Separate Python prediction service for P0 |
| Detection state | Single logical writer + `HashMap`/`VecDeque` | `DashMap`/fine-grained shared graph locking |
| Graph | Petgraph *or* case graph projection from persisted events | Graph DB / full graph scan on every event |
| Persistence | SQLite using `rusqlite` | PostgreSQL, Redis, Kafka |
| Frontend | Vite, React, TypeScript, Cytoscape.js | Full-stack Rust frontend or 3D graph |
| Updates | HTTP polling every ~1–2 s and explicit replay controls | Required WebSocket/SSE |
| Evaluation | Deterministic fixtures, separate labels, benchmark CLI/API | Fixed invented dashboard percentages |

## Branch-safe implementation order

1. Establish compileable backend (`GET /api/health`), frontend boot, fixture reader and `POST /api/transactions`.
2. Implement validation, single-writer state, chronological ordering, idempotency and SQLite persistence; make basic unit tests pass.
3. Implement temporal windows, **candidate fan-in + later pass-through**, contextual scoring and precise reason codes. Get suspicious + merchant-lookalike fixtures passing.
4. Expose and test case list/detail/graph API and demo step/reset API.
5. Build live monitor, click-through case detail, step-through transaction replay and graph; use real APIs, not hardcoded cases.
6. Implement baseline and held-out scenario-level evaluator; only show actual measured numbers.
7. Run cold-start integration, build, accessibility and demo rehearsal.

If work is parallelized, agree on DTOs in `docs/API_AND_DATABASE.md` before independently coding frontend/backend. Temporarily mocked UI endpoints must be replaced before completion.

## Quality gates (all P0)

```bash
# Backend
cd backend && cargo fmt --check && cargo test && cargo build

# Frontend
cd frontend && npm run build

# Health / demo
curl -fsS http://127.0.0.1:3001/api/health
```

The final project must run a deterministic demo after clean reset **twice**, with alerts absent before the causal outward transfer. All claimed metrics must come from `docs/TESTING.md` and be labeled by dataset/scenario count.

## Agent behavior and debugging

- Prefer small working vertical slices and frequent compile/test cycles; avoid generation of many untested modules at once.
- Keep domain types centralized. Never duplicate enums or thresholds across files; derive TS types from the contract or match them explicitly with a contract test.
- For a hard blocker, **fall back according to `docs/IMPLEMENTATION.md`** rather than expanding the stack. Never claim a stub is functional.
- Use config constants for tunable thresholds; changes require tests. Validation and held-out fixtures must be separate.
- Provide actionable errors; no silent panics, `unwrap()` of untrusted input, or success responses before a durable transaction write.
- Log transaction IDs, processing duration and errors; no real PII or secrets.
- Defer styling and README polish until the end-to-end pathway works.

## Definition of done

A cold-start user opens one desktop dashboard; steps synthetic events; sees graph/feed changes; observes a case emerge only after sufficient money-flow evidence; opens it to inspect the real transaction path, timestamps and contextual reason codes; views the recommended *simulated* response; tests a legitimate merchant lookalike; and opens a measured comparison against the rules-only baseline. Every visible count reflects backend state. No login, hidden external service or fake predetermined alert is required.

## Final output from a coding agent

Provide: (1) run commands, (2) completed features, (3) test/build summary, (4) real benchmark setup and results if run, (5) limitations, (6) next-step P1 suggestions **only after P0 is complete**. If a requirement is not built, state that clearly.

## Feature branching and atomic commit protocol

All coding agents working on new features, enhancements, or bug fixes MUST follow this branch-and-merge lifecycle:

1. **Branch creation for new tasks:**
   - Always create and switch to a dedicated branch from `main` before starting any work:
     ```bash
     git checkout -b feature/<task-name>
     # or fix/<issue-name>, refactor/<component-name>
     ```
   - Never make modifications directly on `main`.

2. **Atomic commits:**
   - Commit changes atomically. Each commit must represent a single, cohesive, working unit of work.
   - Run relevant unit/build checks before committing; do not commit broken states.
   - Use descriptive commit messages following conventional commits (`feat: ...`, `fix: ...`, `test: ...`).

3. **Verification and merge upon task completion:**
   - Once the task passes all quality gates (`cargo test`, `npm run build`, `qa/harness.mjs`):
     ```bash
     git checkout main
     git merge --no-ff feature/<task-name> -m "feat(<scope>): complete <task-name>"
     git branch -d feature/<task-name>
     ```
   - Delete the temporary feature branch after a successful merge to keep repository history clean and linear.

