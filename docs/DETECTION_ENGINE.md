# DETECTION_ENGINE.md — Temporal money-mule detector

**Canonical detector specification.** Read [`../PRODUCT.md`](../PRODUCT.md) §6 first. **Priority:** correctness and explainable temporal causality; no statistical model required for P0.

## 1. One precise detection objective

Identify **potential coordinated money-mule activity** where an intermediary account receives transfers from **multiple distinct source accounts within 15 minutes** and **subsequently forwards most of the recent inflow within 10 minutes**. Evaluate historical behavior and prior recipient relationships to avoid automatically escalating legitimate merchant settlements with similar geometry.

**Not in scope:** definitively attributing criminal intent, recovering exact fungible funds, live bank control, all laundering typologies, full GNNs or static untimed cycles.

## 2. Input and event-time contract

One immutable transaction contains `transaction_id`, `timestamp` (UTC), `source_account_id`, `destination_account_id`, `amount_minor` (>0), `currency`, `channel` and optional provenance `scenario_id`. Only use real transaction attributes and *past-known* account profile/history; **no labels, fixture names or `scenario_id` in detection**.

Sort fixture streams by `(timestamp, sequence)` before replay. For the MVP enforce nondecreasing event time. Reject a late event (HTTP 422), log it, and do not mutate feature state. Deduplicate by ID **before** updating any account window. Use UTC and `i64` minor units; protect integer sums against overflow.

## 3. Default config — hypotheses, not financial compliance rules

| Constant | Initial value | Usage |
|---|---:|---|
| `inflow_window_seconds` | 900 | Count unique incoming senders |
| `pass_through_window_seconds` | 600 | Eligible onward transfers following inbound activity |
| `distinct_sources_min` | 3 | Fan-in candidate cutoff |
| `flow_ratio_min` | 0.80 | Forwarded/recently received value proxy |
| `baseline_min_history_events` | 10 | Minimum history before using reliable baseline |
| `case_cooldown_seconds` | 900 | Merge repeated findings per subject episode |
| `risk_verify_threshold` | 35 | Monitoring/verification recommendation |
| `risk_escalate_threshold` | 70 | Analyst escalation recommendation |

Store these in **one Rust `DetectorConfig`**. Tune on validation scenarios, freeze before evaluating held-out cases.

## 4. Incremental state, by account

```rust
struct TransferSummary {
    id: String,
    counterparty_id: String,
    amount_minor: i64,
    timestamp_epoch_ms: i64,
}

struct AccountState {
    incoming_recent: VecDeque<TransferSummary>,
    outgoing_recent: VecDeque<TransferSummary>,
    // historical statistics updated AFTER scoring the current event
    historical_transaction_count: u64,
    historical_amount_sum_minor: i128,
    historical_recipient_counts: HashMap<String, u64>,
    last_seen_epoch_ms: Option<i64>,
    // optional profiles known before the evaluated episode:
    established_settlement_recipients: HashSet<String>,
    account_category: Option<AccountCategory>,
}
```

Use `HashMap<AccountId, AccountState>` for local state and an event ID index to avoid scanning history. Expire from front of each `VecDeque` while `event_timestamp < now - window` (inclusive boundary rules must be tested). Only update accounts touched by the accepted event. If you retain graph edges, each transaction is a distinct edge with its ID, amount and timestamp; do not overwrite earlier transfers with the same endpoints.

### Ordering principle

For a received transaction, gather **prior state**, update current windows, evaluate an onward candidate when its sender has *prior* incoming events, and only afterward update historical baselines/recipients. A new recipient must still count as new on the first transfer to it. Never use any later transaction when scoring the current event.

## 5. Pattern candidate: temporal fan-in + rapid pass-through

For an outgoing event `e=(M -> D, amount=a, time=t)`:

1. Let `I15(M,t)` be previously observed **incoming transfers to M** with `t-900s <= incoming.timestamp <= t` (not same-event outgoing). Count distinct `source_account_id`.
2. Require **at least 3 distinct sources**. Three transfers from only one sender do *not* qualify.
3. Let `I10(M,t)` be eligible inbound transfers in `[t-600s,t]`, with timestamp `<=t`. Ensure at least one preceding incoming transfer and total inflow `>0`.
4. Let `O10(M,t)` be **outgoing transfers after the start of the eligible inflow episode and no later than t**, within 600 seconds of corresponding preceding inflow. Include the current outbound event, but do not count it twice. For strict MVP fixtures, a single candidate outward transfer is sufficient. Prevent counting an unrelated outbound transfer made before any eligible inflow.
5. `flow_ratio = clamp(sum(out_amounts) / max(sum(in_amounts),1), 0, 1)` for this *bounded episode*. Require `flow_ratio >= 0.80`.
6. Compute `forward_delay_seconds = t_out - t_in` only where `t_out >= t_in`. Prefer earliest eligible inbound for the overall episode delay and record the exact chosen pair(s). There is no meaningful absolute negative hold time.
7. This is a **candidate**, not proof of laundering. Continue to contextual scoring.

**Important limitations:** This ratio is an account-flow proxy, not forensic proof that the same rupees were forwarded. If cumulative outgoing amount exceeds inflow, clamp and label; do not assert perfect matching. P0 can limit windows to one candidate episode and use one triggering outward event; document such limitations.

## 6. Context features computed using past-known information

| Signal | Computation | Interpretation / safeguards |
|---|---|---|
| `S_structure` | Bounded [0,1] score for `>=3` distinct incoming sources *and* qualifying later outward event | A graph motif exists; not enough to allege fraud |
| `S_velocity` | Normalized `flow_ratio` and verified forwarding delay | Rapid flow warrants closer examination |
| `S_history` | Deviation in recent frequency/volume from baseline computed on **prior** events | If fewer than 10 historical events, mark **insufficient_history** and avoid unsupported certainty |
| `S_novelty` | Is outbound recipient new relative to prior observed history? | Established counterparties often reduce surprise, but cannot automatically clear |
| `settlement_context` | Consistent repeated historic settlement behavior to a preexisting known recipient | Mitigating evidence, not unconditional merchant allowlist |

**Avoid** relying on `account_category == Merchant` alone, outgoing counterparties' entropy as a reliable legitimacy indicator, or inferred balance-retention without real balances. Merchant processors can settle to one destination and suspicious actors may imitate expected patterns.

## 7. Transparent initial risk policy

All components constrained to `[0,1]`. Initial formula:

```text
risk_raw = 100 * (
    0.35 * S_structure
  + 0.30 * S_velocity
  + 0.20 * S_history
  + 0.15 * S_novelty
)
risk_score = clamp(round(risk_raw - contextual_mitigation_points), 0, 100)
```

**Implementation choice for first fixtures:**

- `S_structure = 1` on complete candidate, else no candidate/case.
- `S_velocity = min(1.0, flow_ratio / 0.80)` on complete candidate; store actual delay as an independent reason/eligibility condition.
- `S_history`: 0–1 normalized deviation against prior profile with enough history; return 0.0 plus `INSUFFICIENT_HISTORY` code if not enough prior data (do not claim negative evidence).
- `S_novelty`: 1 for a genuinely never-seen prior destination with adequate history; 0 for established recipient; if history insufficient, 0 with `UNKNOWN_RECIPIENT_HISTORY` explanation rather than manufacturing novelty.
- `contextual_mitigation_points`: e.g. 25–35 only when **prior repeat settlement pattern and established recipient are corroborated**. Do not blindly subtract for self-declared merchant status. Tuning of this value belongs in validation.

Scores are **hand-authored severity rankings, not model probabilities**, not calibrated confidence and not guaranteed financial risk estimates. Actual validation may warrant changes; update docs/tests/config together.

| Risk interval | `severity` | `recommended_action` | Meaning |
|---|---|---|---|
| 0–34 | `low` | `allow_and_monitor` | No automatic case escalation |
| 35–69 | `medium` | `monitor_or_verify` | Monitor or request additional verification |
| 70–100 | `high` | `escalate_for_review` | Prompt human analyst review |

**Case policy:** only create/update a case when a complete Phase-A candidate exists **and score >=35**; high-risk case threshold is 70. If complete pattern scores <35, log an assessment but do not create an escalated case. The UI can show mitigations on an assessment detail for a merchant, even when no case is raised. No action may directly block real payments.

## 8. Explainability payloads

Every emitted case must contain real event evidence:

```json
{
  "reason_codes": [
    {"code":"MULTI_SOURCE_INFLOW","observed":3,"window_seconds":900,"threshold":3,"transaction_ids":["tx-in1","tx-in2","tx-in3"]},
    {"code":"RAPID_OUTFLOW","observed_seconds":240,"threshold_seconds":600,"transaction_ids":["tx-in1","tx-out"]},
    {"code":"HIGH_FLOW_THROUGH","observed_ratio":0.94,"threshold_ratio":0.80,"transaction_ids":["tx-in1","tx-in2","tx-in3","tx-out"]},
    {"code":"NEW_DESTINATION","observed":true,"transaction_ids":["tx-out"]}
  ]
}
```

An array of reason objects must be serialized consistently; `observed` may be different JSON scalar types by code. Include `ESTABLISHED_SETTLEMENT` / `REPEATED_PAYMENT_PATTERN` for true *prior* mitigations, and `INSUFFICIENT_HISTORY` when needed. Include exact transaction IDs, event timestamps and amounts on the case itself. Explanations must be a deterministic projection of the signal computation, **never fabricated by an LLM**.

## 9. Episode and case grouping

- Case identity centered on `subject_account_id` and an activity interval; **same subject within 900s of a related alert → update existing open case**.
- Append new causal transaction IDs, source/destination accounts and evidence edges. Preserve `created_at`; update `updated_at` and risk if severity changes.
- Stable case IDs (e.g., `case-000001`) should be generated by store/engine, not fixture ID.
- Keep case status `open` for P0; later analyst status transitions are optional.
- Case evidence is an observable *subgraph* and chronological timeline. A case shows an `intermediary` topology role; never encode `fraudster` as node role.

## 10. Pseudocode — event handler

```text
ingest(tx):
  validate(tx); if seen(tx.id) return duplicate_without_mutation
  check_nondecreasing_time(tx.timestamp)
  snapshot_prior_history(for tx.sender, tx.recipient)
  evict_windows(cutoffs at tx.timestamp)
  append tx into sender.outgoing and recipient.incoming
  if sender has qualifying recent fan-in:
    episode = collect_time_respecting_inflows_and_outflows(sender, tx)
    if episode.flow_ratio >= config.flow_ratio_min:
      signals = assess_from_prior_history(sender, tx, episode)
      risk, reason_codes = score_and_explain(signals)
      if risk >= config.risk_verify_threshold:
         create_or_update_case(subject=tx.sender, evidence=episode, risk, reasons)
  commit transaction + cases atomically
  update historical account statistics AFTER evaluating current tx
  return processing result measured with Instant
```

To keep historical **pre-episode** comparisons valid, reserve a pre-episode baseline or snapshot it before first qualifying inflows; don't let the current suspicious burst normalize itself into the account baseline. An easy P0 approach is to seed profiles/baselines from separate earlier fixture events or explicit preknown attributes, then hold those historical references constant during the candidate episode.

## 11. Algorithmic complexity — honest description

- Account lookup: expected O(1) hash lookup, not worst-case guaranteed.
- Window append/pop: amortized O(1) per event **plus** the number of expired entries.
- Counting distinct recent senders naively: O(W) for a bounded window; maintain frequency maps for incremental expected O(1) updates when needed.
- Case graph expansion: O(E_case + V_case), returned only on case selection.
- SQLite writes, locking, scheduling and frontend update add end-to-end overhead. No general claim of <3ms p99 until benchmarked on actual hardware.

## 12. Fail-safe behavior

- Unknown/insufficient history: surface uncertainty; never infer guilt.
- Fan-in without later outward transfer: **no completed-pass-through case**.
- Outgoing before incoming: no causal match; reject late events or ignore unmatched outgoing as per event ordering.
- Amount=0, negative or overflow: reject.
- Duplicate ID: harmless duplicate response, no feature changes.
- Multiple outward transfers: each event unique; avoid double-counting episode amounts.
- Same-account transfer: reject or document explicit handling; for P0 reject as invalid for directed multi-account analysis.

## 13. Minimum verification hooks

Tests should inspect `candidate_triggered`, `unique_source_count`, `flow_ratio`, `delay_seconds`, raw/mitigated score, reason IDs and case grouping. See [`TESTING.md`](TESTING.md). At least one replay must show a legitimate merchant settlement with similar graph shape but different corroborated history and **lower or non-escalated** response.
