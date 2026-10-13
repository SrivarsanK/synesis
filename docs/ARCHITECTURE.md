# ARCHITECTURE.md — Rust-first MVP architecture

**Status:** Implementation specification · **Scope:** P0 only · **Source:** [`../PRODUCT.md`](../PRODUCT.md)

## 1. Architectural thesis

Build **one Rust service, one React client, one embedded database and one synthetic event source**. The primary path is incremental and deterministic; external services are unnecessary for the judged MVP.

```text
synthetic fixture / UI Step / optional timed replay
         |   (same normalized transaction JSON)
         v
  POST /api/transactions           POST /api/demo/next
         |                                  |
         +--------------+-------------------+
                        v
            Rust Axum ingest service
              validate -> dedupe ->
              enforce event-time policy
                        |
                        v
              single logical writer
             AccountState per account
             VecDeque incoming/outgoing
            graph + evidence references
                        |
                        v
       pattern candidate + contextual risk
              -> case update/creation
                        |
                        v
              SQLite event/case store
                        |
             JSON queries / polling
                        v
      React live monitor + investigation
         Cytoscape case-centered graph
              + evaluation panel
```

### Nonfunctional objectives

- Predictable correctness and debuggability > unmeasured throughput.
- No transaction scan over all prior history during each event; update only impacted account windows.
- Time-respecting causality, stable idempotence, reproducible reset.
- Readable investigative evidence, not an opaque classifier result.
- Local development must run offline once dependencies are installed.

## 2. Suggested repository structure

```text
blindspot/
  PRODUCT.md
  AGENTS.md
  docs/*.md
  backend/
    Cargo.toml
    src/
      main.rs                 # server start, env/config, state initialization
      config.rs               # thresholds + validation of config
      types.rs                # Transaction, ReasonCode, Case, DTOs
      api.rs                  # Axum handlers and errors
      ingest.rs               # validation, dedupe, event-time policy
      windows.rs              # per-account rolling state and history
      detection.rs            # phase A candidate detection
      scoring.rs              # phase B context, mitigation and actions
      cases.rs                # grouping, case updates, evidence
      store.rs                # SQLite schema, transactions, case persistence
      graph.rs                # build directed case graph preserving multiedges
      demo.rs                 # reproducible fixture replay and reset
      evaluation.rs           # isolated fixture-runner + baseline metrics
    tests/
      pipeline.rs
  frontend/
    package.json
    index.html
    src/
      main.tsx
      App.tsx
      api.ts
      types.ts
      components/
        Header.tsx
        LiveMonitor.tsx
        CaseQueue.tsx
        TransactionFeed.tsx
        CaseInvestigation.tsx
        TransactionGraph.tsx
        BenchmarkPanel.tsx
        DemoControls.tsx
      styles.css
  fixtures/
    ordinary.jsonl
    mule_fan_in_pass_through.jsonl
    merchant_legitimate.jsonl
    held_out/...
    labels/...
  scripts/
    demo.sh
```

Merge files when faster. Do not create modules with only placeholders to satisfy this diagram.

## 3. Process model and concurrency

**Default simple model:** An `AppState` contains an `Arc<Mutex<Engine>>` holding mutable account windows, a case index and a DB connection (or a separate tightly owned store). For modest demo traffic, lock during the bounded ingest operation and return only after persistence succeeds. Keep `GET` handlers short; avoid holding a mutex while doing slow frontend data serialization. If easy, replace Mutex ingest ownership with **one Tokio `mpsc` actor** and oneshot responses; both are acceptable P0 approaches.

Never run concurrent graph mutations from multiple request handlers without serialization. Do not add DashMap by default: it adds complexity and does not magically make the global graph lock-free.

Recommended state objects:

```rust
struct Engine {
    config: DetectorConfig,
    accounts: HashMap<String, AccountState>,
    seen_ids: HashSet<String>,
    last_event_time: Option<DateTime<Utc>>,
    cases: HashMap<String, InvestigationCase>,
    case_by_subject: HashMap<String, String>,
    // optional graph / transaction index; SQLite remains the durable source
}
```

- Track two timestamps: event time (`Transaction.timestamp`) and wall-clock receive/process timing (`Instant`).
- Maintain multiple separate transaction edges between the same account pair; using one `DiGraph` edge per pair loses transfer multiplicity.
- Do not require Petgraph for *every* feature. Time-window account indexes do the fast detection. Use Petgraph to preserve/calculate relationships and produce case-centered visual subgraphs.

## 4. Transaction lifecycle and atomicity

1. Parse JSON into typed request; reject missing/invalid amounts or IDs.
2. Check duplicate `transaction_id`. **Choose HTTP 200 with `duplicate=true`** for valid duplicates; no state or DB modification.
3. Reject out-of-order event timestamps (`422`) in P0; replay fixtures in ascending order. Within equal timestamps, preserve fixture order by event sequence/ID.
4. Determine processing start time using `Instant`.
5. Write validated transaction and necessary case updates inside a SQLite transaction **or** create all state changes on a recoverable cloned/scratch state and commit only when SQLite succeeds. Failure must not leave in-memory graphs ahead of durable records.
6. Update account windows and candidate/score/cases via deterministic functions.
7. Return result with actual computed processing duration. On startup after crash, replay persisted event records in chronological order to reconstruct derived indexes if needed.
8. Frontend pulls live feed, alerts and selected case data via JSON.

**Implementation shortcut:** For P0, store transaction first in a DB transaction, derive scoring/update within a single guarded service, save case, then commit. If any stage fails, roll back the DB transaction and rebuild/rollback mutated in-memory indexes; don't return success and leave inconsistencies. A small in-memory-only initial slice is acceptable under the hour-1 fallback, but final P0 must support reproducible reset and non-fake case/evidence persistence.

## 5. Configuration and source identity

Single `DetectorConfig` struct, with defaults in `docs/DETECTION_ENGINE.md`. Expose source mode as `synthetic`; no environment flag that pretends a bank is connected. Recommended environment values:

```text
BLINDSPOT_HOST=127.0.0.1
BLINDSPOT_PORT=3001
BLINDSPOT_DB_PATH=./blindspot.sqlite3
BLINDSPOT_FIXTURE_DIR=../fixtures
VITE_API_BASE_URL=http://127.0.0.1:3001
```

Enable local dev CORS only for `http://localhost:5173` and `http://127.0.0.1:5173` (or use the Vite dev proxy). Do not expose an unauthenticated demo reset endpoint on a public production service.

## 6. Persistence/read-model boundaries

See [`API_AND_DATABASE.md`](API_AND_DATABASE.md) for authoritative schema. At minimum persist immutable transactions, cases and case-to-transaction evidence IDs. Track case creation/update times. Derived state such as rolling counters can be rebuilt on restart. UI graph projections must come from persisted, accepted transactions, **not separate hardcoded fixture drawings**.

## 7. Failure/fallback matrix

| Failure | Safe fallback | Must remain truthful |
|---|---|---|
| SQLite setup blocked in hour 1 | In-memory store, then save to SQLite when core works | Declare non-durable status until fixed |
| Petgraph layout/serialization slow | Build graph JSON from stored related transaction edges | It's still a genuine directed evidence graph |
| Cytoscape failing | Render a chronological directed flow table in investigation detail | Do not claim the graph interaction is complete |
| Automatic timed replay unstable | Keep deterministic `POST /api/demo/next` | No fabricated background events |
| Optional XGBoost/ONNX fails | Run rules + temporal-graph scoring | Don't claim model inference exists |
| Large benchmark dataset slow | Run small, documented held-out scenarios | State the actual sample size |

## 8. Scalability note (not a P0 build task)

A production architecture would require formal late-event handling/watermarks, concurrent partitioning by account, secured connectors, DB migrations, durable queues, monitoring, privacy controls, and validated model governance. These are post-hackathon enhancements, not requirements for the six-hour MVP.

## 9. Interface agreement

All names, enum values and errors crossing frontend/backend come from [`API_AND_DATABASE.md`](API_AND_DATABASE.md). A change to any DTO requires updates to Rust Serde types, TypeScript types, API tests, demo fixtures and docs. `scenario_id` may travel with the simulated ingestion event for provenance, but **must never be passed into detection/scoring features**.
