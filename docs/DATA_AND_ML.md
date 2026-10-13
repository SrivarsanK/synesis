# DATA_AND_ML.md — Synthetic data, evaluation design and optional ML

**P0 source:** deterministic synthetic multi-account transaction fixtures. **ML is not required for P0**. This document ensures reproducibility and guards against label leakage and inflated metrics.

## 1. Why a synthetic multi-account stream is the right MVP

The challenge explicitly permits evaluating on synthetic data. Bank-side graph detection needs authorized multi-account relationships and counterparty histories; an ordinary consumer-linked account cannot reveal all of those. Synthetic scenarios give us complete transaction topology, independent ground-truth labels and repeatable timing under a six-hour deadline.

Each scenario has two separate artifacts:

1. **Events file** (`fixtures/<scenario>.jsonl`): input DTO only, in chronological event order. These travel through `/api/transactions` or `/api/demo/next`.
2. **Label file** (`fixtures/labels/<scenario>.json`): benchmark-only truth, hidden from detector and UI inference components.

### Example fixture event

```json
{"transaction_id":"mule-001","timestamp":"2026-10-13T10:00:00Z","source_account_id":"demo:A","destination_account_id":"demo:M","amount_minor":3000000,"currency":"INR","channel":"synthetic_stream","scenario_id":"mule-fan-in-01"}
```

### Example separate label

```json
{
  "scenario_id":"mule-fan-in-01",
  "label":"suspicious",
  "expected_account_ids":["demo:M"],
  "earliest_detectable_event_id":"mule-004"
}
```

**`scenario_id` is provenance only.** No prediction branch may access it, the fixture filename, `label`, expected IDs or `earliest_detectable_event_id`.

## 2. Canonical P0 scenario library

| ID | Truth | Narrative | Expected behavior |
|---|---|---|---|
| S1 Ordinary | benign | A few ordinary transfers among established accounts | No escalation |
| S2 Large legitimate payment | benign | One unusually large but plausible transfer | Never escalate solely because amount is large |
| S3 Merchant settlement | benign | Customer fan-in followed by settlement to an **historically established** destination | No automatic high-risk escalation; cite contextual mitigation |
| S4 Mule pass-through | suspicious | 3+ separate senders to M, then rapid substantial outward transfer to new D | One explainable high-risk case after the outgoing trigger |
| S5 Varied suspicious episode | suspicious | Staggered incoming amounts/times and multiple outward events | Case without dependence on identical values |
| S6 New merchant, little history | benign/uncertain | High-volume account with insufficient profile/history | Monitoring/verification rather than confident safe/criminal claim |
| S7 Fan-in without pass-through | benign/ambiguous | 3+ sources but no outgoing causal event | No completed-pass-through high-risk case |
| S8 Wrong temporal order | invalid | Incoming recorded after outgoing in replay | Reject out-of-order rather than infer impossible flow |
| S9 Duplicate event | invalid | Same transaction ID repeated | No doubled volume or duplicate case |

**IMPORTANT:** At least one fixture must contain *baseline* or historical transactions preceding the evaluated episode. Merchant settlement history should be evident from prior transactions and a previously observed settlement recipient, not an injected `is_merchant_safe` boolean. A case may contain other mitigating information, but don't make an account type alone equal innocent.

## 3. Example suspicious episode structure

```text
10:00 A -> M  ₹30,000
10:02 B -> M  ₹30,000
10:04 C -> M  ₹30,000
10:07 M -> D  ₹87,000     # first qualifying onward transfer
```

At 10:04 there is **fan-in**, but not yet the completed pass-through. The event at 10:07 must be the earliest allowed candidate trigger in this toy example. When a valid result is produced, its case evidence references *all four real transaction IDs*, not a fake prewritten case.

Create a comparable benign merchant example with similar fan-in amounts and timing but demonstrated *prior* recurring settlements to a known destination. Use different account IDs, not the same fixture with a changed hidden label.

## 4. Seed, timestamp and partition policy

- Set a deterministic fixture seed and version (`synthetic_v1`). Hardcode the **random seed**, not outcome labels in detector.
- Keep all JSONL records sorted `(timestamp, sequence)` and replay through one ingest function.
- Build evaluation at **scenario / connected-network level**, not random transaction row splits.
- Split generator templates/parameter ranges as well as account IDs when possible, so held-out test isn't a re-labeling of copied training flows.
- All features at time `t` must depend only on events/profiles known at or before `t` (with pre-event historical baselines frozen appropriately).
- Keep labels exclusively in evaluation runner; don't serialize them into case reasoning.
- Track event-time `timestamp`, backend receive time and processed time separately.

### Practical dataset sizes

For P0, prioritize a handful of readable demo fixtures plus **at least a modest held-out scenario set** with meaningful benign and suspicious variety. Report the exact count. A five-million-row synthetic CSV is unnecessary for a six-hour functional proof.

## 5. External datasets (optional research inputs)

- [IBM AMLSim](https://github.com/IBM/AMLSim): synthetic banking transaction generation and laundering typologies.
- [IBM Multi-GNN dataset/benchmark](https://github.com/IBM/Multi-GNN): synthetic AML benchmark ecosystem including HI-Small.
- [TransXion](https://github.com/chaos-max/TransXion): investigate more challenging realistic customer profiles and non-trivial benign lookalikes.
- [FraudGT](https://github.com/junhongmit/FraudGT): directed multi-edge graph fraud research, **not** a six-hour dependency.

**Source caution:** Confirm license, file availability, column meaning and label granularity before using any external dataset. Public performance reported in research does **not** transfer automatically to Blindspot. For the minimum build, use fixtures designed and independently evaluated by the team.

## 6. Evaluation unit and label mapping

**Primary evaluation unit:** one **scenario/network**.

- `TP`: suspicious scenario with at least one correct risk escalation within the defined observation horizon (and linked to expected subject network/account where labels provide that).
- `FP`: benign scenario escalated at `high` severity.
- `FN`: suspicious scenario not escalated when enough causative evidence is present.
- `TN`: benign scenario not escalated as high risk.

Record monitor/verify outputs as secondary measures; state explicitly that the primary threshold for positive is **high-severity `escalate_for_review`**, so definitions don't drift between documents.

Report: `precision=TP/(TP+FP)`, `recall=TP/(TP+FN)`, `FPR=FP/(FP+TN)`; denominator 0 -> `null` / not defined. Also report case count per scenario, confusion counts, and whether merchant lookalikes were escalated. Benchmark `baseline` and `blindspot` on identical chronological inputs and the same scenario labels.

## 7. Baseline vs Blindspot

**Baseline A:** simple amount/transaction-frequency threshold, implemented as a separate deterministic algorithm; **no graph pass-through logic**. Select threshold on validation scenarios; freeze it for held-out testing.

**Blindspot B:** fan-in + causally later rapid forwarding, contextual historical features, mitigating evidence, and case-level decision. Optional `Pattern-only B0` can reveal how much merchant-context checks contribute independently of temporal topology.

No model is allowed to see future transfers or ground-truth labels at prediction time. Evaluate on held-out *scenarios*, not memorized transactions.

## 8. Measurement and performance

- Measure processing duration with Rust `Instant` starting when the ingest handler processes the accepted event, ending when detection + case persistence completes. Exclude intentional replay sleep from processing metric.
- Also optionally report `triggering_event_received_at -> case emitted at` and label it separately.
- Record event count, environment, sample size, p50, p95 and (only with adequate sample sizes) p99 latency; do not prefill values.
- Show `dataset`, `scenario_count`, `evaluation_unit`, `evaluated_at` on the UI.
- Tiny hand-constructed fixtures establish correctness, not financial institution-scale generalization. Report that limitation.

## 9. Optional P1 machine learning

Only after core demo works:

- Train XGBoost/LightGBM on **tabular + graph-derived historical features** prepared from labeled training scenarios; don't call this fine-tuning a pretrained model.
- Suggested features: recent distinct incoming senders, recent in/out volume ratio, valid forwarding delay, new recipient, prior activity mean/frequency, baseline deviation, recent distinct outgoing recipients.
- Partition by temporal scenario/network; fit train, tune on validation, test once on held-out. Evaluate against the **same** baseline/Blindspot scenario split.
- Save model, feature order, preprocessing parameters, threshold, training metadata and version.
- Integrate initially via a simple offline scoring experiment. **ONNX Runtime in Rust is P1/P2**, because conversion and matching inference are significant risks in six hours.
- If model cannot outperform a simpler baseline or introduces instability, **exclude it from demo and report honestly**.

## 10. Safeguards and reproducibility checklist

- [ ] Fixture label never arrives in `POST /api/transactions`.
- [ ] Risk engine does not branch on scenario names or known demo account IDs.
- [ ] Transactions and all relevant accounts are distinct per held-out scenario.
- [ ] Merchant and suspicious examples are deliberately similar in topology and timing.
- [ ] Historic references are truly prior to candidate event.
- [ ] Ingestion enforces ordering and idempotency.
- [ ] Same fixture + config + seed → same case/evidence outputs after reset.
- [ ] Evaluation unit and positive threshold are stated in every reported result.
- [ ] Latency is measured, not read from paper claims or invented.
- [ ] Limitations are explicit: synthetic world; no live bank feed; not evidence of guilt.
