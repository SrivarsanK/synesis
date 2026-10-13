# Blindspot Independent QA Verification Report

**Date / Timestamp:** 2026-10-13T11:29:00+05:30
**Evaluator:** Independent QA Agent (`qa/**` ownership)
**Target:** Blindspot P0 MVP (Rust Axum Backend + Vite React Cytoscape Frontend)
**Status:** Executed checks passed.

---

## 1. Executive Summary

| Verification Category | Status | Details |
|---|---|---|
| **Tooling & Platform Auth** | **PASS** | Telemetry hook command fixed; tool execution fully functional |
| **Backend Quality Gates** | **PASS** | `cargo test` (15/15 unit/contract tests passed in 0.08s); `cargo build` clean |
| **Rust Formatting** | **PASS** | Orchestrator independently ran `cargo fmt --check` successfully before committing |
| **Frontend Quality Gates** | **PASS** | `npm run build` (`tsc -b && vite build`) produced 0 errors in 1.67s |
| **Independent Wire Harness** | **PASS** | `qa/harness.mjs` executed 57/57 contract & behavioral tests passed |
| **Playwright UI & Accessibility** | **PASS** | `tests/console.spec.ts` (2/2 passed), `tests/live.spec.ts` (1/1 passed) |
| **Causal Alert Emergence** | **PASS** | 0 alerts on 3 fan-in transfers; 1 alert triggered on outward transfer |
| **Merchant Mitigation** | **PASS** | Established settlement mitigates risk to `medium` / `monitor_or_verify` |
| **Benchmark & Held-Out Tests** | **PASS** | 24 held-out scenarios evaluated; honest measured latencies & counts |
| **Determinism (Reset Twice)** | **PASS** | Deterministic outputs across multiple resets |

---

## 2. Gate Verification Evidence

### 2.1 Backend Contract & Unit Tests (`cargo test`)
**Command:** `cargo test` in `backend/`
**Result:** 15 passed; 0 failed; 0 ignored; 0.08s runtime.

```text
running 15 tests
test db_failure_does_not_publish_scratch_state ... ok
test i64_max_aggregate_does_not_overflow ... ok
test duplicate_conflict_late_and_validation_are_atomic ... ok
test http_contract_status_and_envelopes ... ok
test cumulative_outflow_grouping_and_multiedges ... ok
test failed_case_write_rolls_back_transaction_and_cursor ... ok
test inflow_window_boundary_and_insufficient_ratio ... ok
test provenance_does_not_change_detection ... ok
test boundaries_and_preceding_outgoing ... ok
test http_demo_twice_and_complete_are_deterministic ... ok
test causal_reset_twice_and_merchant_context ... ok
test incomplete_and_single_source_do_not_trigger ... ok
test empty_selected_demo_survives_restart_and_submillisecond_order_is_strict ... ok
test restart_preserves_cases_cursor_and_equal_time_sequence ... ok
test metrics_are_measured_isolated_and_survive_reset ... ok

test result: ok. 15 passed; 0 failed; 0 ignored; finished in 0.08s
```

### 2.2 Frontend Build (`npm run build`)
**Command:** `npm run build` in `frontend/`
**Result:** Clean compilation (`tsc -b && vite build`), 0 TypeScript or bundle errors.
- Output chunks: `index.html` (0.50 kB), CSS (11.58 kB), JS (245.13 kB), Cytoscape chunk (443.83 kB).

### 2.3 Independent QA Test Harness (`qa/harness.mjs`)
**Command:** `node qa/harness.mjs`
**Result:** 57 PASSED, 0 FAILED, 0 SKIPPED.

Coverage matrix verified against `docs/API_AND_DATABASE.md` and `docs/DETECTION_ENGINE.md`:
1. **Canonical Wire Endpoints & Status Codes:**
   - `GET /api/health` -> 200 `{ status: "ok", source_mode: "synthetic", version: "mvp-1" }`
   - `POST /api/transactions` validation:
     * `amount_minor <= 0` -> 400 `INVALID_AMOUNT`
     * `source == destination` -> 400 `SELF_TRANSFER`
     * Blank IDs / >128 chars -> 400 `INVALID_ID`
     * Non-UTC / non-Z timestamp -> 400 `INVALID_TIMESTAMP`
     * Non-INR currency -> 400 `UNSUPPORTED_CURRENCY`
     * Invalid channel -> 400 `INVALID_CHANNEL`
   - Bounds checks on pagination queries:
     * `limit=0` -> 400 `INVALID_LIMIT`
     * `limit=201` -> 400 `INVALID_LIMIT`
     * `limit=non-integer` -> 400 `INVALID_LIMIT`
   - Not found handling:
     * Nonexistent case ID -> 404 `CASE_NOT_FOUND`
     * Nonexistent case graph -> 404 `CASE_NOT_FOUND`
   - Unknown scenario reset -> 400 `UNKNOWN_SCENARIO`

2. **Idempotency, Deduplication & Atomic Integrity:**
   - Replaying identical transaction ID + payload -> 200 `{ duplicate: true, accepted: true }` without mutating case count or transaction history.
   - Replaying identical transaction ID with modified amount/recipient -> 409 `CONFLICTING_TRANSACTION_ID`.
   - Submitting out-of-order timestamp (`timestamp < last_event_time`) -> 422 `OUT_OF_ORDER_EVENT`.

3. **Causal Money Flow Detection Semantics:**
   - **Scenario S7 (Incomplete Fan-in):** 3 incoming sources without outward forwarding -> exactly 0 cases emitted.
   - **Scenario S4 (Suspicious Mule):**
     * Events 1–3 (fan-in inflows): 0 cases emitted.
     * Event 4 (rapid outward pass-through >= 80%): 1 case emitted at causal event.
     * Risk score >= 70, severity `high`, recommended action `escalate_for_review`.
     * Reason codes include `MULTI_SOURCE_INFLOW`, `RAPID_OUTFLOW`, `HIGH_FLOW_THROUGH` with exact transaction IDs.
     * Directed case graph nodes contain roles (`intermediary`, `source`, `destination`).
     * Directed case graph edges preserve real transaction IDs as edge IDs.
   - **Scenario S3 (Merchant Lookalike Mitigation):**
     * Superficially identical fan-in + outward pass-through, but recipient has established prior recurring settlement history.
     * Mitigated risk score = 35, severity `medium`, recommended action `monitor_or_verify` (NOT `high` / `escalate_for_review`).
     * Reason codes include `ESTABLISHED_SETTLEMENT` and `REPEATED_PAYMENT_PATTERN`.

4. **Determinism (Reset Twice):**
   - Running reset & replay of `mule_fan_in_pass_through` twice produced identical case counts (1), risk scores (100), severities (`high`), and graph edge topologies (4).

5. **Benchmark & Held-Out Scenarios:**
   - 24 held-out synthetic scenarios (`held-01` through `held-24`).
   - Confusion matrix integrity: `TP + FP + FN + TN == 24` for both Baseline and Blindspot.
   - Measured comparison (held_out_synthetic_v1):
     * Baseline (rules-only): TP=6, FP=10, FN=2, TN=6 | Precision: 37.5%, Recall: 75.0%, FPR: 62.5%
     * Blindspot: TP=8, FP=0, FN=0, TN=16 | Precision: 100.0%, Recall: 100.0%, FPR: 0.0%
   - Latencies recorded with `Instant::now()`:
     * Baseline p50: 0.04 ms, p95: 0.09 ms
     * Blindspot p50: 0.04 ms, p95: 0.11 ms
   - No fabricated percentages or probabilities.

### 2.4 Browser UI & Accessibility Verification (Playwright)
**Commands:**
- `npx playwright test tests/console.spec.ts` -> 2 passed (2.5s)
- `$env:BLINDSPOT_LIVE = "1"; npx playwright test tests/live.spec.ts` -> 1 passed (3.6s)

Verified browser behaviors:
- Live API connection indicator (`API connected` vs `API disconnected`).
- Disconnection UI gracefully displays error and disables the Step button.
- Replay step controls (`Step next transaction`, `Reset & load scenario`).
- Keyboard accessibility & ARIA landmarks verified in `tests/console.spec.ts`.
- Cytoscape canvas graph rendering and investigation timeline button toggles verified.
- Screenshots generated in `frontend/test-results/live-investigation.png` and `live-merchant.png`.

---

## 3. Discrepancy & Bug Audit

| Item | Severity | Location | Description & Finding | Resolution / Recommendation |
|---|---|---|---|---|
| **B1: Rust formatting** | Checked / None | `backend/src/*.rs` | Orchestrator reran `cargo fmt --check`; exit code 0. | Earlier formatting finding was not reproduced on the committed files. |
| **B2: SQLite Schema Column Projection** | Info | `backend/src/store.rs` | SQLite stores full transaction payload as JSON column `payload` rather than decomposing all columns into individual table columns. | This compact schema implementation is documented in `backend/VALIDATION.md`; persistence and restart tests pass. |
| **B3: Label Isolation** | Checked / None | `backend/src/detection.rs` | Verified: `detection.rs` never reads `scenario_id` or external ground-truth labels. Features strictly use event timestamps and account histories. | Compliant with AGENTS.md invariant. |

---

## 4. Final Verification Matrix

| Requirement | Spec Reference | Verified Method | Outcome |
|---|---|---|---|
| Single backend `ingest_transaction()` for all ingestion | AGENTS.md § Hard invariants | `store.rs`, `backend_contract.rs` | **PASSED** |
| Event minor currency units (paise integers) | AGENTS.md § Hard invariants | `types.rs`, `harness.mjs` | **PASSED** |
| Directional multi-edge transaction preservation | AGENTS.md § Hard invariants | `store.rs:graph`, `harness.mjs` | **PASSED** |
| 422 rejected on late/out-of-order events | docs/API_AND_DATABASE.md | `api.rs`, `harness.mjs` | **PASSED** |
| 409 rejected on duplicate ID with conflicting payload | docs/API_AND_DATABASE.md | `store.rs`, `harness.mjs` | **PASSED** |
| 200 idempotent on duplicate ID with identical payload | docs/API_AND_DATABASE.md | `store.rs`, `harness.mjs` | **PASSED** |
| No case before outward event (S4 fan-in) | docs/DETECTION_ENGINE.md | `harness.mjs`, `live.spec.ts` | **PASSED** |
| Case created at outward event with real reason codes | docs/DETECTION_ENGINE.md | `harness.mjs`, `live.spec.ts` | **PASSED** |
| Established merchant mitigation to medium/monitor | docs/DETECTION_ENGINE.md | `harness.mjs`, `live.spec.ts` | **PASSED** |
| Reset & replay deterministic twice | AGENTS.md § Quality gates | `harness.mjs`, `live.spec.ts` | **PASSED** |
| Zero fabricated benchmark metrics | AGENTS.md § Hard invariants | `evaluation.rs`, `harness.mjs` | **PASSED** |
| Desktop-first charcoal/gold UI with synthetic label | PRODUCT.md § 15 | `App.tsx`, `console.spec.ts` | **PASSED** |

The executed checks pass for the synthetic demo. The orchestrator also reran the wire harness: 57 passed, 0 failed, 0 skipped. Browser checks cover the listed interactions; they do not constitute a comprehensive accessibility audit. Benchmark results apply to the 24 hand-designed synthetic scenarios and do not establish real-world performance.
