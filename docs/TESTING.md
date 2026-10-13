# TESTING.md — Correctness, end-to-end acceptance and benchmarks

**Purpose:** Prove Blindspot detects the causal pattern, preserves evidence, reduces unnecessary escalation in contextual lookalikes, and reports honest metrics on synthetic data. No test result may be invented or inferred from literature.

## 1. Test pyramid for six hours

1. **Rust unit tests** (highest value): validation, rolling windows, temporal causality, distinct senders, scoring/mitigation, case dedupe.
2. **Rust API/integration tests**: normal ingest, duplicate/conflicting IDs, case creation, graph evidence, fixture reset/step.
3. **Scenario-level benchmark**: baseline versus Blindspot on the **same held-out synthetic scenarios** with separate labels.
4. **UI smoke test**: desktop journey from empty view through ingestion, case evidence replay and metrics.

Do not build a heavy E2E test framework unless time permits. One deterministic `scripts/demo.sh` plus unit/integration tests is sufficient for P0.

## 2. Unit test matrix

| ID | Test | Expected result |
|---|---|---|
| U01 | Valid event with unique ID | Accepted once; durable transaction exists |
| U02 | Repeated identical ID | `duplicate:true`; no updated score/count/edges |
| U03 | Same ID different amount | HTTP 409; original event unchanged |
| U04 | Zero or negative amount, blank or equal accounts | Rejected before state change |
| U05 | Multiple A→B transfers with unique IDs | Multiple distinct graph edges, not overwritten |
| U06 | Window boundary at 900s | Defined inclusive cutoff handled consistently |
| U07 | 3 transfers from only one source | Exactly 1 distinct sender; not sufficient fan-in |
| U08 | 3 distinct senders, no afterward outgoing | No completed rapid pass-through high-risk case |
| U09 | Outgoing before fan-in | Never matches later inflow, no negative/absolute time shortcut |
| U10 | 3 incoming then 80%+ outgoing within 600s | Candidate produced at **outgoing** event, not earlier |
| U11 | Outgoing < 80% of eligible inflow | No complete candidate under initial config |
| U12 | Multiple outgoings in same episode | No double-counted outgoing amount |
| U13 | Thin history | `INSUFFICIENT_HISTORY` evidence; no invented certainty |
| U14 | Established settlement recipient + recurring prior pattern | Visible contextual mitigation; lower/non-high severity |
| U15 | New recipient, abnormal pass-through | Risk score and reasons reflect prior history only |
| U16 | Score bounds | Always integer `[0,100]`; no NaN/division by zero |
| U17 | Two qualifying signals same subject within cooldown | One case updated, `created_at` retained |
| U18 | Synthetic label or scenario ID changes | Detector output unchanged for identical actual transaction history |
| U19 | Late/out-of-order event | 422, no partial DB/graph mutation |
| U20 | Reset/replay twice | Identical case count, IDs/evidence, risk scores under fixed seed |
| U21 | Persistence write fails | No success response or inconsistent in-memory case |

For selected tests, inspect **exact `transaction_ids`** in reason-code evidence. A generic explanation string is not sufficient.

## 3. Scenario-level acceptance tests

### Scenario S4 — genuine fan-in → rapid pass-through

**Given** historical state and three distinct incoming source accounts A/B/C to intermediary M, **when** M forwards >=80% of eligible inflows to destination D within 600s, **then**:

- No completed-pass-through case is created after the incoming transfers alone.
- The final onward event triggers a candidate and — if contextual risk meets 35+ — one case.
- The case references actual A/B/C→M and M→D transaction IDs, amounts and chronological timestamps.
- Recommended action follows **measured computed risk**, not fixture name.
- Case graph has unique edge IDs for each transfer and correct direction.

### Scenario S3 — merchant-settlement lookalike

**Given** a recipient M with established prior settlement behavior to D, **when** M receives customer payments and settles most of them in a superficially similar pattern, **then**:

- The same temporal motif may appear, but prior recipient/history evidence **mitigates** risk under documented policy.
- The outcome is not automatically high-severity solely due to the pattern.
- Mitigation is visible in assessment/case reasons (if a case is created), and it is not based exclusively on a supplied `merchant` flag.

### S7 — incomplete suspicious-looking activity

Multiple sources → M without later outward forwarding must not create a **completed pass-through** case. Monitoring for fan-in alone is optional separate functionality, not the primary S4 detection.

### S8 and S9 — operational correctness

Out-of-order events must be rejected with no impossible time relationships; duplicate IDs must not inflate volumes or create extra cases.

## 4. API test examples

Assume server is on `127.0.0.1:3001`.

```bash
curl -fsS http://127.0.0.1:3001/api/health
curl -fsS -X POST http://127.0.0.1:3001/api/demo/reset \
  -H 'Content-Type: application/json' \
  -d '{"scenario":"mule_fan_in_pass_through"}'
curl -fsS -X POST http://127.0.0.1:3001/api/demo/next \
  -H 'Content-Type: application/json' -d '{}'
curl -fsS http://127.0.0.1:3001/api/demo/status
curl -fsS http://127.0.0.1:3001/api/transactions?limit=50
curl -fsS http://127.0.0.1:3001/api/cases
```

Run `demo/next` until `complete=true`. Ensure case appears **only** after a qualifying onward transfer. Inspect `GET /api/cases/{id}` and `/graph` using the actual case ID from the list; never assume `case-000001` is the only future ID.

## 5. Scientific benchmark protocol

### Freeze the comparison

- Dataset: versioned held-out synthetic scenarios (with a stable seed and separate labels).
- Unit of analysis: **scenario**; positive = `high` **escalate_for_review** on a suspicious network within observation horizon.
- Same events, order and observation horizon for both baseline and Blindspot.
- Baseline: fixed amount and/or activity-count thresholds only, no temporal graph correlation.
- Blindspot: temporal fan-in + later pass-through + historical context + evidence.
- All tuning uses training/validation scenarios, not final held-out scenarios.
- If scenario expected subject IDs are available, an alert must be associated with the expected network/account to qualify as TP; unrelated high-risk alert is not success.

### Confusion matrix

| | Truly suspicious | Truly benign |
|---|---:|---:|
| Escalated high risk | TP | FP |
| Not escalated high risk | FN | TN |

```text
precision = TP / (TP + FP)
recall    = TP / (TP + FN)
FPR       = FP / (FP + TN)
```

If denominator is zero, result is `null` / undefined (not 0% or 100%). Include raw counts and scenario count beside percentages. Low/medium monitoring is **not** a positive in the primary binary evaluation; count it separately so judges can see the operational tradeoff.

### Timing

- Backend processing latency for an event: monotonically measured `Instant::now()` at accepted ingest start to completion of decision/persistence; report milliseconds.
- Alert latency: triggering event's receipt to alert creation/update. Keep separate from replay sleep interval and event timestamps.
- Report `sampled_event_count`, p50 and p95; p99 only if adequate sample count. Keep baseline and Blindspot on the same hardware, run configuration and event stream.
- Don't quote research-paper `<3ms` targets as measured outputs. It's okay if the measured output is slower.

### Baseline output format

The API shape in [`API_AND_DATABASE.md`](API_AND_DATABASE.md) §4 is the contract. Benchmark pipeline must write real values into an evaluation run record. `GET /api/metrics` is `available:false` before any evaluation. Contract example metrics are **not** a sample of actual performance.

## 6. UI smoke test: one uninterrupted path

1. Start Rust backend + Vite frontend from cold state; both respond.
2. `blindspot.` shell loads on desktop; clearly visible `SYNTHETIC` label.
3. `Reset` selects the suspected-mule fixture; step through ordinary activity and source inflows.
4. No high-risk case appears before onward transfer.
5. Step the onward event; live feed updates and one alert appears from backend.
6. Select case; correct graph nodes/edges appear with arrows, amounts and timestamps.
7. Run **investigation replay**; only graph highlight changes, no new transfer inserted.
8. Switch to merchant fixture; verify lower-risk/mitigated outcome with explanation.
9. Open benchmarks and show real comparison or a clearly labeled unavailable state.
10. Reset and repeat; identical output and no ghost transactions/cases. Disconnect backend to verify explicit error state.

## 7. Quality commands

```bash
cd backend
cargo fmt --check
cargo test
cargo build

cd ../frontend
npm run build
```

Add `cargo clippy` if time allows; fix critical warnings. Console should not show uncaught runtime errors. Avoid tests that rely on wall clock unless intentionally measuring latency; fixture timestamps should be fixed.

## 8. Demo risk checklist

- [ ] Fresh reset before recording/judging.
- [ ] Fixture and labels remain separate.
- [ ] All outcomes derive from backend processing, not UI fixtures.
- [ ] One stable S4 alert, one contextual S3 difference, one evaluation view.
- [ ] Zero hardcoded percentages or fabricated fraud probabilities.
- [ ] If metrics are weak or ambiguous, show them and state limitations honestly.
- [ ] Offline path and failure fallback are known; no mandatory external API token.
- [ ] The product never claims actual bank transactions or real payment enforcement.

## 9. Common failure diagnosis

| Symptom | First place to inspect |
|---|---|
| Case appears before outward event | `detection.rs` candidate sequencing and test U08/U10 |
| Merchant escalates as mule | Historical feature window, established-recipient evidence, mitigation threshold |
| Replayed duplicate changes score | `ingest.rs` seen-id and DB unique index |
| Graph omits repeated transfers | Graph projection must use transaction IDs for edge keys |
| Negative/false hold delay | Time-respecting predecessor selection; no `abs()` |
| Better-than-perfect evaluation | Label leakage, fixture memorization, inconsistent baseline splits |
| Dashboard numbers change with no events | Remove demo timers/hardcoded placeholder state |
| Reset causes ghost case | Clean case mapping/index, transaction evidence links, local UI selected state |
