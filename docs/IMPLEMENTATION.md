# IMPLEMENTATION.md — Six-hour executable build plan

**Operating principle:** Deliver a vertical, measurable money-mule detection workflow; never prioritize decorative breadth over the working core. Adapted from the uploaded Hackathon Playbook's “Build the Working Core”, clarity, validation, incremental testing and last-mile demo readiness.

## 1. Definition of the product we are building

> **Blindspot** is a Rust-based synthetic transaction monitor that recognizes **multiple incoming senders followed by rapid outward forwarding**, considers earlier account context to reduce misleading merchant alerts, generates a traceable case with recommended action, and shows honest comparative benchmark results.

The judging demo must be executable offline after setup. No real bank link, live payments, Web3, GNN, ONNX, LLMs, separate mobile application, auth, or landing page is needed in P0.

## 2. Hour-by-hour timebox and stop rules

| Time | Task | Exit gate | Fallback |
|---|---|---|---|
| **00:00–00:45** | Scaffold Rust Axum API, Vite React UI, SQLite schema, first JSONL fixture; define DTOs | `/api/health` and valid POST transaction work | Keep an in-memory event index initially; don't change stack |
| **00:45–01:40** | Validation, deduplication, nondecreasing timestamps, account `VecDeque`s and prior-history state | Distinct sender counting, duplicate and ordering unit tests pass | Process events sequentially; no concurrency optimization |
| **01:40–02:45** | Implement complete fan-in→later-pass-through candidate, 0–100 score, historical context mitigation and reason codes | S4 triggers on outbound, S3 is lower-risk, no early alert | Drop optional score nuance; preserve causal detection and evidence |
| **02:45–03:35** | Case grouping, SQLite persistence, GET cases/detail/subgraph; demo reset/next | Curl demonstrates actual linked case with real transaction IDs | Case graph from SQL evidence join if Petgraph serialization slow |
| **03:35–04:50** | Live Monitor, Case Queue, Cytoscape graph, reason panel, visual replay | User goes from Step → case → investigation in one page | Directed flow table if Cytoscape integration blocks |
| **04:50–05:30** | Run held-out scenario evaluator and rules-only baseline; expose measured metrics | TP/FP/FN/TN and latency computed, labeled with dataset/count | Export CLI JSON results and render them; don't invent UI numbers |
| **05:30–06:00** | Fix critical errors, clean build, cold-start trial twice, freeze | Whole story reproducible and stable | Hide unfinished P1 and use Step-only demo |

### Hard stop rules

- **By 01:00:** Don't keep debugging database scaffolding at the expense of an accepting ingest endpoint.
- **By 02:45:** If correct temporal detection is not passing unit tests, **stop UI design** and repair S4/S3 logic.
- **By 03:45:** If graph UI remains broken, ship a truthful case-directed evidence timeline/table instead.
- **At 04:50:** No new technology or features. Freeze feature set.
- **At 05:30:** Only bug fixes, demo dry runs and submission packaging. No major refactors.

## 3. First 15 minutes — interface agreement

1. Read root [`AGENTS.md`](../AGENTS.md), [`PRODUCT.md`](../PRODUCT.md), [`API_AND_DATABASE.md`](API_AND_DATABASE.md), [`DETECTION_ENGINE.md`](DETECTION_ENGINE.md).
2. Lock server `127.0.0.1:3001`, frontend Vite `127.0.0.1:5173`.
3. Agree on transaction JSON, `amount_minor`, risk and case enums, graph edge IDs, error policy and event timestamps.
4. Freeze initial config: 900s inflow, 600s pass-through, 3 sources, 0.80 ratio, 35 monitor, 70 review, 900s case cooldown.
5. Put a single synthetic warning badge into base UI; don't make actual bank connection a goal.

## 4. Technical tasks in execution order

### Vertical slice 1: Accept one real synthetic transfer

- [ ] Create backend crate and Axum router.
- [ ] Add Serde `Transaction` type and validation.
- [ ] Make SQLite `transactions` table and unique transaction ID.
- [ ] `GET /api/health` and `POST /api/transactions` tested with curl.
- [ ] Start frontend shell with API-connected/failed status.

**No extra endpoints until this works.**

### Vertical slice 2: Causal graph/context state

- [ ] Create per-account inbound/outbound rolling deques and distinct senders.
- [ ] Enforce time ordering and idempotence.
- [ ] Store prior historical mean and recipient sightings; seed legitimate baseline via **prior events**.
- [ ] Build an account-graph projection preserving each transaction's directed edge.
- [ ] Verify `3 sources`, `outbound after inflows`, `80% ratio` as separate tests.

### Vertical slice 3: One explainable intervention

- [ ] Score only complete pattern candidates; attach individual observed signal values.
- [ ] Apply corroborated settlement-context mitigation (not `merchant` label alone).
- [ ] Create/update one `InvestigationCase` with evidence IDs.
- [ ] Return `high`/`medium` and recommendation (`escalate_for_review`/`monitor_or_verify`).
- [ ] Ensure SQLite case and evidence writes agree with transactions.
- [ ] Test S4 and S3 with deliberately similar shapes.

### Vertical slice 4: Working investigator interface

- [ ] `GET /api/cases`, `/api/cases/{id}`, `/api/cases/{id}/graph`.
- [ ] `POST /api/demo/reset`, `/api/demo/next`, `GET /api/demo/status`.
- [ ] `GET /api/transactions?limit=50`.
- [ ] Build case feed + transaction list + Cytoscape graph and a selected-case panel.
- [ ] Add replay highlight of existing case edges in chronological order.
- [ ] Confirm end-to-end demo works without hardcoded graph state.

### Vertical slice 5: Honest benchmark

- [ ] Build small labeled scenario set with a separate labels folder.
- [ ] Implement baseline amount/frequency detector.
- [ ] Evaluate both policies on same chronological streams with independent state.
- [ ] Count TP/FP/FN/TN **per scenario**, positive iff high-risk escalate.
- [ ] Measure processing latency with `Instant`; persist results and expose `/api/metrics`.
- [ ] Clearly show synthetic source, sample count, timestamp, undefined denominators as null.

## 5. Team execution modes

### One-person or one coding agent

Build exactly in sequence; keep `cargo test` running after each slice. Do not attempt UI + ML training + blockchain in parallel. A connected manual-step demo is the target.

### Two developers/agents

| Owner A — backend/logic | Owner B — UI/integration |
|---|---|
| Lock DTO/config, ingestion, account state | Set up Vite, design tokens and shell |
| Detection and scenario tests | Graph component against **temporary** typed mocked graph DTO |
| Cases/read endpoints/demo controls | Wire live case queue / transaction feed to real endpoints |
| Evaluator, baseline, latency | Investigation replay and benchmarks view |
| API integration tests | Browser smoke test and responsive layout |

Merge early (~hour 3). **Remove mocked case/metric data before demo.** Shared changes to DTOs require explicit communication and a build check.

## 6. Runnable command plan

### Backend bootstrap

```bash
cargo new backend
cd backend
cargo add axum
cargo add tokio --features full
cargo add serde --features derive
cargo add serde_json
cargo add chrono --features serde
cargo add petgraph
cargo add rusqlite --features bundled
cargo add csv tracing tracing-subscriber
cargo add tower-http --features cors
cargo run
```

### Frontend bootstrap

```bash
npm create vite@latest frontend -- --template react-ts
cd frontend
npm install
npm install cytoscape recharts lucide-react
npm run dev
```

Tailwind is recommended when familiar, but plain CSS variables and a few components are acceptable under time pressure. Actual Cargo and npm dependencies should be pinned by lock files after successful install.

### Checks

```bash
cd backend && cargo fmt --check && cargo test && cargo build
cd ../frontend && npm run build
```

## 7. Feature cut matrix

| Priority | Keep or cut | Rationale |
|---|---|---|
| P0 | Temporal fan-in + later pass-through | Only central fraud typology |
| P0 | Merchant context and lower-risk decision | Demonstrates reduced false alarms |
| P0 | Real case evidence, graph and replay | Translates detection into an investigation |
| P0 | Baseline/held-out metrics | Required challenge evaluation |
| P0 | Synthetic incremental replay | Real stream processing without bank permissions |
| P1 | CSV import of arbitrary external files | Only if robust ingestion already works |
| P1 | XGBoost trained on graph features | Only if results justify complexity |
| P1 | Timed replay, SSE or export report | Adds polish, not essential |
| P2 | ONNX Runtime, Web3, personal bank linking | Integration risk and not needed |
| P2 | FraudGT/GNN, autonomous agents | Overly large for 6 hours |
| P2 | Marketing landing, mobile app, accounts/login | Distracts from actual fraud investigation |

## 8. Project-level milestones

- **M1: Event pipeline**: health/ingest/query, SQLite and idempotency work.
- **M2: Research-backed detector**: S4/S3/late/duplicate tests pass.
- **M3: Investigator workflow**: case queue/detail/graph/replay from real data.
- **M4: Validated prototype**: benchmark with raw counts and measured latency.
- **M5: Demonstration ready**: cold start, reset, 90-second dry run twice, no fake metrics.

## 9. Recovery and failure handling

**If Rust compile dependencies are slow:** Eliminate nonessential crates; keep Axum/Serde/Tokio/SQLite and compute graph edges from accepted transactions; don't switch frameworks mid-build.

**If database consistency is causing failure:** Temporarily use in-memory event storage while completing logic, but mark persistence incomplete and prioritize fixing before final demo. Never return success before an attempted durable write without documenting the limitation.

**If the model is unfinished:** Remove ML/ONNX. A deterministic explainable detector is a valid prototype.

**If the React graph fails:** Render a chronological edge table with direction arrows; preserve evidence and recommended action rather than hiding the entire investigation.

**If benchmark sample is small:** Report sample counts, raw confusion matrix and caveats. Never substitute previously published model numbers as Blindspot results.

## 10. End-of-build deliverables from the coding agent

1. Run/start instructions for backend and frontend.
2. Check results: `cargo test`, `cargo build`, `npm run build`.
3. A reproducible S4 suspicious and S3 merchant comparison.
4. Case evidence retrieval and graph edge replay.
5. Measured baseline/Blindspot metrics or explicit statement why unavailable.
6. Remaining known limitations; no blanket security/performance claims.

**Finish line:** The complete stream → temporal detector → contextual risk → case → investigation replay → honest comparison works locally in one uninterrupted demonstration.
