# Backend P0 validation

Completed implementation: localhost Axum/Tokio API, serialized writer, positive i64 amount validation and i128 aggregates, duplicate/conflict handling, strict event ordering, recoverable SQLite transactions, startup reconstruction including replay cursor, causal fan-in/pass-through detection, prior-history contextual scoring, grouped evidence-backed cases, multiedge graph projection, deterministic reset/step, isolated evaluation, and persisted measured metrics. No detector branch reads provenance or benchmark labels.

## Gates and integration

- `cargo fmt --check`: passed.
- `cargo test`: 15 passed, 0 failed.
- `cargo build`: passed.
- Final expanded checks initially used `CARGO_TARGET_DIR=target/verification` because the visible running server locked the normal Windows executable. This changes only build output location.
- After that server stopped, the exact default-target commands `cargo fmt --check`, `cargo test` (15/15), and `cargo build` passed again. `backend/target/debug/blindspot.exe` now contains the final implementation.
- HTTP readiness observed: `GET http://127.0.0.1:3001/api/health` returned 200 with `status:ok`, `source_mode:synthetic`, `version:mvp-1`.
- Router integration tests replay reset/next/cases/graph twice; no case after steps 1–3, one case after step 4, identical IDs/evidence on repeat, and no extra mutation on completion.
- Suspicious demo score: 100/high. Established merchant score: 35/medium with six prior similarly sized settlement transfers as mitigating evidence. Insufficient-history score: 65/medium with explicit uncertainty.
- Tests include integer extremes, 600/900-second boundaries, same-timestamp preceding outbound exclusion, cumulative outflows, multiple graph edges, idempotency/conflicts/late events, malformed JSON, persistence restart, transaction and case write failures, provenance independence, and isolated benchmark persistence across reset.

## Actual measured run

Recorded at `2026-10-13T05:48:17.231Z`, debug build on this Windows workspace. Dataset: `held_out_synthetic_v1`, 24 scenario/networks (8 suspicious, 16 benign), 358 accepted events per method. Frozen configuration was used; held-out outcomes were not used to tune thresholds.

| Measure | Amount/activity baseline | Blindspot |
|---|---:|---:|
| TP | 6 | 8 |
| FP | 10 | 0 |
| FN | 2 | 0 |
| TN | 6 | 16 |
| Precision | 0.375 | 1.0 |
| Recall | 0.75 | 1.0 |
| False-positive rate | 0.625 | 0.0 |
| Latency p50, ms | 0.0414 | 0.0375 |
| Latency p95, ms | 0.0874 | 0.1094 |
| Medium-monitoring scenarios | 0 | 7 |

Primary positive is any high-severity analyst escalation during the observation horizon, associated with an expected subject for a suspicious scenario. Medium monitoring is not counted as a positive. Every ratio uses actual counts; undefined ratios serialize as null. Per-scenario outcomes are included in persisted `/api/metrics` output.

Both paths use isolated in-memory SQLite stores, the same validated ingestion/persistence path, identical events/order, and monotonic measured durations. The baseline disables temporal case creation and applies an amount >=8,000,000 minor units OR account activity >=6 within 900 seconds. Timings include ingestion/decision/commit and logging overhead; they exclude file loading, network, disk flush, and UI time. Timing varies between runs; do not infer a reliable performance advantage from this small sample.

## Handoff and limits

Run commands and health/demo requests are in the root README. The final binary must replace/restart any previously running binary before final browser QA. A later metrics HTTP probe found the visible server stopped; no hidden service was started by this worker.

The frontend's merchant key must be `merchant_legitimate`. The historical transactions are real synthetic source events in transaction counts and graph evidence, not new stepped suspicious activity. `count` in list responses is the total available backend count; `items` obeys the requested limit.

SQLite uses JSON payload columns for immutable DTOs/cases and a normalized `case_transactions` linkage, plus sequence, receipt time, evaluation records and replay metadata. This is a compact implementation of the contract's recommended persistence schema, preserving transactional durability and stable equal-timestamp sequence.

Limitations: only hand-authored synthetic networks from related templates; no external validation or real-world accuracy claim. Flow ratio is a bounded account-flow proxy. Detector windows use millisecond resolution while admission ordering compares full RFC3339 precision. Scratch state is cloned for recoverability, so throughput on large histories is not established. No automatic streaming, real financial enforcement, authentication or bank connectivity. Independent frontend/browser QA is outside this ownership.
