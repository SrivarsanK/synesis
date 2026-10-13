# blindspot.

Fraud hides in plain sight. Synthetic investigation MVP: Rust/Axum/Tokio, SQLite, React/Vite and directed transaction evidence. No bank connectivity or real payment blocking. Risk scores are hand-engineered rankings, not probabilities.

## Run locally

Prerequisites: Rust/Cargo with a native C build toolchain (bundled SQLite), and Node.js/npm. Install dependencies once while online. Run these commands in two visible terminals from the repository root:

```powershell
cd backend
cargo run
```

```powershell
cd frontend
npm ci
npm run dev
```

Open http://127.0.0.1:5173. The API listens only on http://127.0.0.1:3001. Vite proxies `/api`. Stop either process with Ctrl+C. On first startup, the backend seeds prior history and selects `mule_fan_in_pass_through`; subsequent starts reconstruct accepted state and replay cursor from SQLite.

From another PowerShell terminal:

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/health
Invoke-RestMethod -Method Post http://127.0.0.1:3001/api/demo/reset -ContentType application/json -Body '{"scenario":"mule_fan_in_pass_through"}'
1..4 | ForEach-Object { Invoke-RestMethod -Method Post http://127.0.0.1:3001/api/demo/next -ContentType application/json -Body '{}' }
Invoke-RestMethod http://127.0.0.1:3001/api/cases
Invoke-RestMethod http://127.0.0.1:3001/api/cases/case-000001/graph
```

The first three steps produce no case; the fourth outward transfer produces a high-risk recommendation. Repeat reset and the four steps to reproduce the same case/evidence. Reset with `merchant_legitimate` and repeat four steps for a medium monitoring case with corroborated historical settlement reasons. Reset is a destructive simulation operation; it preserves benchmark results.

Other fixture keys: `ordinary`, `large_legitimate`, `insufficient_history`, `incomplete_fan_in`, `mule_staggered`. Restored historical transactions are included in transaction counts; the demo cursor counts only stepped events. Graph edges are accepted transaction IDs and preserve repeated transfers.

## Benchmark and checks

```powershell
cd backend
cargo fmt --check
cargo test
cargo build
cargo run -- --evaluate
```

Evaluation prints actual results and persists them in `backend/blindspot.sqlite3` when run from `backend/`. The running API reads them at `GET /api/metrics`; before evaluation it returns `available:false`. Alternatively, `POST /api/evaluate` runs isolated evaluation and stores its result. Evaluation does not reset or ingest into the live demo.

On Windows, stop the running backend with Ctrl+C before rebuilding its executable. To keep it running during checks, use a separate output directory: `$env:CARGO_TARGET_DIR='target/verification'` before the Cargo commands. Restart the visible API after code changes so browser QA uses the latest binary. To evaluate an already-built unchanged server without compiling, run `.\target\debug\blindspot.exe --evaluate` from `backend/`.

```powershell
Invoke-RestMethod http://127.0.0.1:3001/api/metrics
```

Frontend build: `cd frontend` then `npm run build`. See [frontend integration notes](frontend/INTEGRATION.md).

`BLINDSPOT_DB_PATH` optionally selects a database file; the default is `blindspot.sqlite3` relative to the backend process working directory. Run server and evaluator with the same path. `BLINDSPOT_FIXTURES_PATH` optionally overrides the fixture directory; otherwise the source checkout's `fixtures/` is used.

## Scope and measurement limits

The backend implements validation, idempotency, strict nondecreasing UTC event time, transactional events/cases, startup reconstruction, grouped causal cases, evidence graphs, deterministic replay and all P0 API routes. Amount aggregation uses i128 internally to safely sum positive i64 transaction amounts. No balances are inferred.

Detector configuration is centralized in `backend/src/config.rs`. Historical references exclude the current 900-second window. Prior repeated similar payments to an established recipient mitigate by 30 points; a matching merchant episode scores 35 and remains inspectable as monitoring. The 24 held-out networks contain eight suspicious and sixteen benign scenarios; labels never enter detector code. See [fixture methodology](fixtures/README.md) and [measured backend results](backend/VALIDATION.md).

This is a small, hand-designed synthetic benchmark with related templates. Latency measures in-memory SQLite ingestion/decision/commit, not disk flush, network or UI response. Detection uses an account-flow proxy, not proof that identical funds moved onward. Scratch-state cloning provides atomic recovery and is suitable for this small MVP, not a demonstrated large-stream throughput design. Timed auto-replay and production enforcement are outside this implementation.
