# BLINDSPOT — Product & Engineering Specification

> **Canonical reference for the build agent.** Implement the P0 scope first. Treat P1/P2 ideas as explicitly optional, not implicit requirements.
>
> **Project:** Blindspot  
> **Internal detection engine name:** TRACE (optional)  
> **Tagline:** **Fraud hides in plain sight.**  
> **Hackathon:** SYNESIS 26 — FinTech, *Real-Time Fraud & AML Risk Orchestration*  
> **Build window:** **6 hours**  
> **Platform:** **Desktop-first investigator web application**  
> **Product status:** Prototype operating on **synthetic, multi-account transactions**; not a bank-certified or production AML solution.

---

## 0. Instructions to the AI build agent

**Build a working end-to-end product, not a collection of disconnected features.** The single story that must work is:

1. Stream ordinary and suspicious synthetic account-to-account transfers.
2. Detect an **emerging fan-in → rapid pass-through** money-mule pattern using historical and temporal context.
3. Avoid unnecessary escalation of a **legitimate merchant-settlement lookalike**.
4. Create one evidence-backed case, display the suspicious account graph, replay the causative transactions, and recommend a proportionate *simulated* response.
5. Compare the detector to a basic rules-only baseline on held-out labeled scenarios; display *measured* precision, recall, false-positive rate, and detection latency.

**Priority rule:** A stable complete P0 workflow beats any pretrained model, extra page, bank integration, blockchain, GNN, animation, or speculative performance optimization. If blocked, simplify; do not silently substitute a fake working feature or claim an unmeasured result.

**Definition of real-time:** Transactions arrive sequentially through the ingest endpoint, are processed incrementally, and trigger a UI refresh shortly afterward. For the hackathon, a synthetic event stream is genuine incremental processing; it must be clearly labeled *simulation*. It is **not** a live feed from an actual bank.

**Critical engineering boundaries:**

- Use **Rust** for ingestion, per-account state, detection, case creation, and APIs.
- Keep **one Rust backend process** and **one React frontend**. No distributed infrastructure.
- Prefer deterministic, debuggable logic to opaque AI outputs.
- Never claim a transfer is definitively criminal; classify it as **potentially suspicious / requires investigation**.
- Never initiate, freeze, or decline real payments. Response recommendations are simulated decision-support actions.
- Expose authentic test/benchmark outcomes, not invented statistics or demo-only hardcoded metrics.

---

## 1. The source challenge and product interpretation

### 1.1 SYNESIS problem statement (condensed, faithful)

Build a working prototype for **real-time financial risk intelligence** that detects potentially fraudulent transactions, connects suspicious account activity, explains its decisions, and recommends timely interventions. Relevant problem dimensions include:

- Amount, device, location, and account history as possible scoring inputs.
- Unusual and rapid movements of funds.
- AML patterns such as splitting, fan-in/fan-out, and circular transfers.
- Transaction graph analysis and related-account clusters.
- Explainable risk scores and risk-based case management.
- Fewer false positives through *combined signals*, not isolated rules.
- Evaluation on synthetic data using **precision, recall, false-positive rate, and detection latency** while reducing friction for legitimate customers.

**Challenge framing:** *Detect the Pattern. Understand the Risk. Orchestrate the Response.*

The challenge says the platform *could* support many patterns and signals. We deliberately select one complete, deeply executed case: **coordinated mule-account activity involving incoming transfers from several sources followed by rapid outward forwarding**. Device, location, multiple fraud families, and production payments are not prerequisites for meeting this focused prototype goal.

### 1.2 Problem we solve

Individual bank transfers may appear ordinary, while their **sequence across multiple accounts** indicates potential laundering. Conversely, legitimate merchants and settlement intermediaries can exhibit similar fan-in and pass-through structures. Pure amount or transaction-count rules can miss coordinated patterns or flood investigators with benign alerts.

**Product problem statement:**

> How might financial risk teams detect coordinated, time-dependent suspicious money movement among connected accounts and recommend evidence-backed intervention **without incorrectly treating legitimate payment aggregation as money laundering**?

### 1.3 Product promise and differentiation

**Blindspot is an explainable, context-aware, streaming money-flow investigation workbench.** It performs temporal graph detection and presents a complete investigation instead of isolated red flags.

Its defensible differentiation for the hackathon is not merely "uses AI," "uses Rust," or "has a graph." It is a **reproducible side-by-side comparison** showing whether contextual, connected detection handles a suspicious mule flow differently from a legitimate lookalike, with quantitative tests against simpler rules.

### 1.4 Naming and product identity

- **Product:** Blindspot (stylization `blindspot.` in hero/brand lockup is optional).
- **Engine:** TRACE, as an internal name only if useful; don't confuse judges by presenting two products.
- **Primary tagline:** *Fraud hides in plain sight.*
- **Secondary explanatory line:** *Connect transactions. Expose hidden patterns. Explain every decision.*
- **Hero message if needed:** *See the pattern. Understand the risk. Stop the threat.* (Use “recommend action” rather than implying live enforcement.)

---

## 2. Target users, jobs, and demo setting

**Primary user:** AML/fraud investigation analyst at a financial institution.

**Secondary user:** Risk operations lead who needs to review alerts and compare false-positive performance.

**Demo user:** A hackathon judge who should understand the value **within 90 seconds**, without account registration or external credentials.

**Core jobs-to-be-done:**

1. See suspicious activity *as it emerges* from the stream.
2. Understand which accounts/transactions form the suspicious network.
3. Know why the case is high risk, including time and amount evidence.
4. See why a superficially similar merchant case was **not** automatically escalated.
5. Choose a sensible, proportionate next step: **allow/continue monitoring**, **step-up verification**, or **escalate for analyst review** (all recommendations only).
6. Assess whether Blindspot detects more useful cases with fewer false alarms than a basic baseline.

**One indispensable demo narrative:**

- Ordinary transactions appear in the feed.
- Sources A/B/C send multiple transfers to intermediary M; M forwards most of the recent inflow to D quickly.
- The network highlights M and the relevant directed, timestamped transfers.
- Blindspot raises **one case**, not five disconnected alerts, with explainable reason codes.
- A merchant also receives many payments and settles to a previously established beneficiary; prior history/context causes less aggressive treatment.
- Benchmarks compare baseline and Blindspot under the same labeled test scenarios.

**Never manufacture a dramatic fraud outcome by forcing the algorithm to use a pre-set case ID.** The outcome must come from the same ingestion and scoring logic used in evaluation.

---

## 3. Scope and priority

### P0 — Must work before demo

| Code | Deliverable | Acceptance condition |
|---|---|---|
| P0-01 | Rust transaction ingestion | Valid events are accepted, normalized, deduplicated, and available to query. |
| P0-02 | Time-ordered streaming simulator | A scenario produces events incrementally via the normal ingest path. |
| P0-03 | Temporal account state | Rolling windows, counterparties, amounts, and historical baselines update without future-data leakage. |
| P0-04 | **Fan-in + rapid pass-through detector** | Alerts only after enough causal evidence has arrived. |
| P0-05 | Legitimate merchant context | Merchant settlement lookalike demonstrably avoids or receives a lower-severity alert under a defined policy. |
| P0-06 | Explainable risk + recommended intervention | Each alert cites real triggering transactions and exact observed signals. |
| P0-07 | One investigation case per related episode | Case aggregates accounts/edges; analyst can inspect evidence and time sequence. |
| P0-08 | Desktop live monitor | Transaction feed, interactive account graph, alerts/cases, simulated/live status. |
| P0-09 | Reproducible benchmark | Baseline vs Blindspot: precision, recall, FPR, measured processing/alert latency. |
| P0-10 | Stable demo | Normal → suspicious → benign-lookalike → case review → benchmark works from cold start. |

### P1 — Only if all P0 is passing

- Lightweight **XGBoost** trained offline on past-only tabular + graph features, with measured holdout comparison; feature schema must match inference.
- Small one-click case report export (JSON or downloadable text).
- Secondary graph motifs (bounded time-respecting three-account cycles, fan-out).
- Improved threshold tuning and precision-recall visualization.
- Server-sent events (SSE) instead of short-interval UI polling.
- Polished landing screen, but **never** at the expense of the investigation demo.

### P2 — Out of the six-hour MVP

- Live connection to personal bank accounts, real Account Aggregator production access, payment blocking, cross-bank intelligence feeds.
- Web3/blockchain audit logging or crypto-wallet AML (different problem focus).
- FraudGT/GNN implementation; large pretrained TabPFN models; LLM/multi-agent case analysis.
- ONNX/native model inference unless trained, exported, tested **before** the event under event rules.
- Kafka, Redis, Neo4j/TigerGraph, Kubernetes, microservices, distributed stream processing.
- Complex entity resolution, production authentication, mobile apps, multi-tenant administration.
- Automated suspicious activity reports to regulators; compliance or certification claims.

**Product stance on bank linking:** An authorized personal-bank-data integration usually shows only that customer's visible transfers, not every counterparty's full transaction history. Full network detection requires broader permitted institution-level data or a synthetic multi-account stream. For the judged MVP, **use the synthetic multi-account stream**, not a pretend production connection.

---

## 4. System architecture

```text
Synthetic AML / merchant scenarios
              |
      POST /api/transactions    (same route used by simulator)
              |
              v
 +-----------------------------------------------+
 |                  Rust / Axum                  |
 |  validate -> dedupe -> order/time policy      |
 |                     |                         |
 |                     v                         |
 |  Per-account rolling history + graph state    |
 |                     |                         |
 |                     v                         |
 |  Temporal fan-in / pass-through detection     |
 |                     |                         |
 |                     v                         |
 |  Historical context + risk reasons + cases    |
 |                     |                         |
 |                SQLite persistence             |
 +-----------------------------------------------+
              |
         JSON API / polling
              v
 +-----------------------------------------------+
 |           React + Vite + TypeScript           |
 |  Live feed | Account graph | Case evidence     |
 |      Demo controls | Baseline comparison       |
 +-----------------------------------------------+
```

### 4.1 Technology choices — locked for P0

| Layer | Technology | Reason |
|---|---|---|
| Language | **Rust** | Fast, deterministic native logic; user's preference. |
| HTTP | **Axum** | Simple web API; avoid separate framework. |
| Async runtime | **Tokio** | Server and simulation tasks. |
| Serialization | `serde`, `serde_json` | Typed input/output. |
| CSV/synthetic data | `csv` + `serde` or internal fixture generator | Fast controlled ingestion. |
| Temporal state | `HashMap<AccountId, AccountState>` + `VecDeque<TransferSummary>` | Explicitly owned, easy-to-debug rolling windows. |
| Graph | `petgraph` (`StableGraph` or directed graph) | Case subgraphs and neighborhood exploration, not entire-data re-traversal per event. |
| Persistence | **SQLite** via `rusqlite` | Zero external DB services; case and event storage. |
| Web frontend | **React + Vite + TypeScript** | Rapid UI iteration. |
| Graph viz | **Cytoscape.js** | Directed transfer relationships and replay highlighting. |
| Charts | **Recharts** (optional minimal charts) | Benchmarks and risk summaries. |
| Styling | **Tailwind CSS**; shadcn/ui only if easy to scaffold | Premium dark UI without excessive CSS work. |
| Icons | Lucide | Consistent, low-effort UI. |
| Updates | HTTP polling ~1–2 sec | Simpler and less fragile than live WebSockets. |

### 4.2 Concurrency rule

**Use one Tokio actor/task as the owner of mutable detection state**. Send ingestion events through an `mpsc` channel or process them serially in a single shared service protected by a simple mutex for the MVP. Avoid fine-grained multithreading and `DashMap` as a default. DashMap is concurrent but **not lock-free**. There is no need for complex synchronization with a hackathon-sized event stream.

The research briefing's claims about universal O(1) streaming analytics and <3 ms p99 are **aspirational**, not guarantees. Rolling-window expiration, distinct counterparties, graph traversal, SQLite writes, and UI network costs have non-constant costs. Benchmark actual results.

### 4.3 Suggested repository structure

```text
blindspot/
├── PRODUCT.md                      # This specification
├── README.md                       # Setup + demo instructions
├── backend/
│   ├── Cargo.toml
│   ├── src/
│   │   ├── main.rs                 # startup, router, state
│   │   ├── api.rs                  # endpoints and DTOs
│   │   ├── types.rs                # typed domain models
│   │   ├── ingest.rs               # validation, idempotency, ordering
│   │   ├── windows.rs              # incremental account state
│   │   ├── detection.rs            # money-mule motif detection
│   │   ├── scoring.rs              # context + reason codes
│   │   ├── cases.rs                # grouping and recommendations
│   │   ├── db.rs                   # persistence
│   │   ├── simulator.rs            # deterministic scenarios
│   │   └── evaluation.rs           # baseline, metrics, timing
│   └── tests/
│       └── scenarios.rs
├── frontend/
│   ├── package.json
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── types.ts
│       ├── components/
│       │   ├── AppShell.tsx
│       │   ├── MetricCards.tsx
│       │   ├── TransactionFeed.tsx
│       │   ├── AccountGraph.tsx
│       │   ├── AlertQueue.tsx
│       │   ├── InvestigationPanel.tsx
│       │   └── BenchmarkPanel.tsx
│       └── styles.css
├── fixtures/
│   ├── merchant_legitimate.jsonl
│   ├── mule_fan_in_pass_through.jsonl
│   ├── ordinary_transactions.jsonl
│   └── eval_scenarios.jsonl
└── scripts/
    └── demo.sh
```

Merge files if faster; structure is guidance, not a requirement to implement unused modules. The detection engine and demo correctness are more important than directory purity.

---

## 5. Domain model and data contracts

### 5.1 Transaction (canonical wire format)

```json
{
  "transaction_id": "tx-10023",
  "timestamp": "2026-10-13T10:20:00Z",
  "source_account_id": "bankA:acct-001",
  "destination_account_id": "bankA:acct-009",
  "amount_minor": 3000000,
  "currency": "INR",
  "channel": "synthetic_stream",
  "scenario_id": "mule-case-01"
}
```

- `amount_minor`: **integer smallest currency unit** (paise for INR). `3000000` = ₹30,000. Avoid floating-point money math.
- `transaction_id`: unique and idempotent; repeated import must not increase account volumes or create duplicate graph edges.
- `timestamp`: ISO-8601 UTC event time, not UI render time.
- Account identifiers: consistently namespaced; no real customer PII.
- `scenario_id`: simulation/evaluation metadata only; **never expose to the detector as a predictive feature**.
- Never use `is_laundering`, `label`, ground-truth case category, or any hidden scenario field for detection.
- In a real connector, extra fields such as device/location could be optional; ignore them during P0 rather than invent values.

### 5.2 Optional benchmark-only ground truth

Store labels *separately* from the detection input:

```json
{
  "scenario_id": "mule-case-01",
  "label": "suspicious",
  "expected_account_ids": ["bankA:acct-009"],
  "earliest_detectable_event_id": "tx-10029"
}
```

The label and earliest-detectable-event marker may be read **only** in evaluation code, never in detector/risk code. Use held-out scenarios with distinct account IDs and different timings/amounts.

### 5.3 AccountState

Recommended internal fields:

```rust
struct AccountState {
    // identity; omit optional fields if unavailable
    account_id: String,
    incoming_recent: VecDeque<TransferSummary>,
    outgoing_recent: VecDeque<TransferSummary>,
    historical_transaction_count: u64,
    historical_mean_amount_minor: f64,
    historical_recipient_counts: HashMap<String, u64>,
    last_seen_timestamp: Option<i64>,
    // optional synthetic account metadata for the benchmark:
    account_category: Option<AccountCategory>,
    established_settlement_counterparties: HashSet<String>,
}
```

Important: metadata like `account_category` must reflect information hypothetically **known before the suspicious event**. It must not be a leaked ground-truth label. Treat account profiles as optional; add if fixture and evaluation assumptions are explicit.

### 5.4 InvestigationCase

```json
{
  "case_id": "case-001",
  "status": "open",
  "subject_account_id": "bankA:acct-009",
  "title": "Potential rapid pass-through network",
  "risk_score": 84,
  "severity": "high",
  "recommended_action": "escalate_for_review",
  "reason_codes": [
    {"code": "MULTI_SOURCE_INFLOW", "observed": 3, "window_seconds": 900},
    {"code": "RAPID_OUTFLOW", "observed_seconds": 240},
    {"code": "HIGH_FLOW_THROUGH", "observed_ratio": 0.94},
    {"code": "NEW_DESTINATION", "observed": true}
  ],
  "transaction_ids": ["tx-10023", "tx-10024", "tx-10025", "tx-10029"],
  "account_ids": ["bankA:acct-001", "bankA:acct-002", "bankA:acct-003", "bankA:acct-009", "bankA:acct-055"],
  "created_at": "2026-10-13T10:24:00Z",
  "data_source": "synthetic"
}
```

**All numbers above are a wire-format illustration, not benchmark outcomes or guaranteed thresholds.** Actual case payloads must be derived from event history and decisions, not fixed to these examples.

### 5.5 Separate times

Maintain two distinct timestamps where useful:

- `event_timestamp`: timestamp carried by the synthetic transaction (simulated bank time).
- `received_at` / `processed_at`: backend wall-clock observation.

**Detection latency** for the prototype should mean *measured processing/alert-emission time* from when the triggering event enters the service; optionally report event-time-to-detection separately, **never confuse replay delays with compute latency**.

---

## 6. Detection algorithm — the central product feature

### 6.1 One target typology

**Fan-in followed by rapid pass-through**:

1. Account **M** receives multiple incoming transfers from distinct accounts within a recent window.
2. **M** soon sends a substantial portion of recent incoming value onward to a destination.
3. The pattern deviates from relevant historical account behavior or has additional indicators (novel beneficiary, unusual frequency, dormancy activation).
4. The context model decides whether to escalate, monitor, or allow rather than flagging every high-volume merchant.

**Scope limits:** Do not claim exact fund tracing through an account's balance; aggregate inflows/outflows are correlational. A cycle or fan-in alone does not prove money laundering.

### 6.2 Event-driven account windows

Default configurable parameters (starting points only):

| Parameter | Initial demo setting | Meaning |
|---|---:|---|
| `inflow_window_seconds` | 900 (15 minutes) | Fan-in lookback |
| `pass_through_window_seconds` | 600 (10 minutes) | Rapid onward movement |
| `distinct_sources_min` | 3 | Minimum incoming counterparties |
| `flow_ratio_min` | 0.80 | Approximate fraction forwarded |
| `baseline_min_history_events` | 10 | Minimum historical context before strong behavior assumptions |
| `case_cooldown_seconds` | 900 | Merge related alerts into one case |
| `risk_verify_threshold` | 35 | Initial score to suggest verification/monitoring |
| `risk_escalate_threshold` | 70 | Initial score to escalate |

**These are hypotheses for fixture/demo testing, not universal banking rules.** Put them in one configuration struct/file and tune using training/validation scenarios only.

Per incoming event: validate → dedupe → update source outgoing window and recipient incoming window → expire old entries → recompute *relevant* account risk → store/update a case if threshold crossed → publish current UI state. Keep lookups local to impacted accounts; don't scan all transactions.

**Event ordering policy:** The simplest safe P0 is sequentially replayed events sorted by `timestamp`. Reject or quarantine significantly out-of-order events during the demo. Never silently compute a “real-time” window as though late events occurred in order. Production late-arrival reconciliation is out of scope.

### 6.3 Feature formulas and definitions

All monetary features should use integer monetary amounts internally; convert to floating-point only for ratios or normalized risk features.

**(1) Recent incoming amount and distinct senders**

For subject account `v` and lookback window `W_in` ending at event time `t`:

- `inflow(v,t) = sum(amount of incoming events in [t-W_in, t])`
- `unique_sources(v,t) = count(distinct sender_account_id in this window)`

**(2) Rapid pass-through ratio**

For a candidate outgoing event at time `t`, consider *eligible inflows preceding that outgoing event* within `W_pass` and outflows in the same episode that occur **after the qualifying inflows**.

- `raw_flow_ratio = eligible_recent_outflow / max(eligible_recent_inflow, 1)`
- `flow_ratio = clamp(raw_flow_ratio, 0, 1)`

Explain that this is a **coarse account-flow proxy**, not proof that exact deposited funds were forwarded. Exclude an account's own unrelated earlier spending from the numerator. Be careful about double counting when processing multiple outflows.

**(3) Forwarding delay**

For a candidate pass-through chain, compare an eligible inbound event with a **later** outgoing event: `delay_seconds = outgoing.timestamp - incoming.timestamp`, requiring `delay_seconds >= 0`. Never use absolute time differences that could match an outgoing event from before the inflow.

**(4) Historical deviation**

Compare recent volume/frequency against historical account averages computed **before** the current event. Missing or thin history must produce a separate “insufficient history” status rather than an assumed fraud label.

**(5) Destination novelty / settlement familiarity**

Determine whether the destination account was seen in earlier history or appears in a trusted, *preexisting synthetic account profile*. A known settlement beneficiary can reduce suspicion, but is not an unconditional safe-list.

**Optional features:** dormancy activation and outgoing counterparty concentration. Avoid outgoing entropy and balance retention as primary benign-vs-mule criteria; merchants often have concentrated settlement destinations, and transaction data may not include trustworthy balances.

### 6.4 Minimum decision process (explainable)

Evaluate candidate cases at account level. Two phases:

**Phase A — pattern candidate:**

- `distinct_recent_sources >= distinct_sources_min`
- Recent outward forwarding satisfies configured pass-through ratio.
- At least one qualifying outgoing transfer occurs *after* the recent inflows within the pass-through window.

**Phase B — contextual risk:**

Evaluate additional independent signals:

- Unusual activity versus account history (when enough history exists).
- New or atypical outgoing beneficiary.
- Temporal speed/flow-through strength.
- Historically consistent merchant settlement pattern (potential mitigating evidence).

Store evidence for both **risk-enhancing and mitigating signals**. A case may remain `monitor` rather than `escalate` if the context is consistent with legitimate prior behavior. Unknown profiles must not be treated as known-safe or known-fraudulent.

### 6.5 Risk scoring — simple, bounded, auditable

Start with an explicitly **hand-authored** scoring policy; do not call it an ML probability or pretend the weights came from a paper.

Suggested normalized scores each in [0,1]:

- `S_structure`: multiple distinct inbound sources plus confirmed onward event.
- `S_velocity`: share of recent inflow forwarded within configured time window.
- `S_history`: deviation from an established account baseline.
- `S_novelty`: unfamiliar onward beneficiary (requires adequate historical coverage).

Example weighted **prototype** score:

```text
risk_raw = 100 * (
    0.35 * S_structure
  + 0.30 * S_velocity
  + 0.20 * S_history
  + 0.15 * S_novelty
)

risk_score = clamp(risk_raw - contextual_mitigation, 0, 100)
```

Choose `contextual_mitigation` using validated, explicit prior evidence (e.g., recurring merchant settlement to an established recipient); do **not** reduce risk solely because of a self-declared merchant label. Make the mitigation visible in reason codes and test that it doesn't suppress synthetic suspicious merchant-account behavior.

**Action policy:**

| Risk | Recommended response | Safeguard |
|---:|---|---|
| 0–34 | Allow / continue monitoring | No automatic enforcement |
| 35–69 | Monitor / request additional verification | No accusation or irreversible action |
| 70–100 | Escalate for analyst review | Human makes any consequential real-world decision |

Risk scores are **relative scores under this prototype policy**, *not calibrated probabilities of criminality*. Thresholds should be tuned on validation data, never selected to flatter the final test set.

### 6.6 Case grouping and evidence fidelity

- Generate one case per suspicious episode centered on the intermediary account and bounded by a cooldown/temporal overlap interval.
- If related transactions arrive, **update the existing case** and graph evidence rather than generating duplicate alerts.
- Store the IDs, timestamps, amounts and directed transfers that actually triggered the detection.
- Each reason code must have an observable value (`3 unique sources`, `4 minutes`, `0.94 recent ratio`) and threshold/context.
- Show when an alert was created and when it was updated.
- Recompute/update case severity if stronger evidence arrives; don't silently erase the past evidence or overwrite audit history.
- Case language: **"potential coordinated pass-through activity"**, never **"confirmed laundering ring"**.

### 6.7 Graph implementation notes

- Preserve **direction, timestamp, amount, and multiple transactions between the same accounts**. A simple `DiGraph` edge that overwrites earlier A→B events would lose important information.
- Maintain `HashMap<AccountId, NodeIndex>` and graph edges with transaction IDs or reconstruct *case-specific* edges from stored events.
- Prioritize per-account rolling event indexes for detection; a full graph scan on every event is unnecessary.
- For UI, return only a small **case-centered subgraph**; streaming thousands of nodes to Cytoscape is unnecessary.
- Future cycle detection should require *time-respecting paths* and a bounded hop count. Static cycles with transfers months apart should not trigger short-window laundering alerts.

---

## 7. Simulator, fixtures, and scientifically honest evaluation

### 7.1 Why a synthetic stream is core, not a compromise

The source challenge explicitly calls for **measured performance on synthetic data**. It is possible to evaluate coordinated networks only when multiple account histories and ground-truth labels are visible. A one-user bank account connection generally cannot provide this.

Use a deterministic, seeded generator or small fixture set with replay controls (`start`, `pause`, `reset`, `step`, `speed`). At minimum a **Step next transaction** button must work. Automatic streaming every ~1 sec is a P0 polish feature only after stepping is stable.

### 7.2 Minimum scenario library

| Scenario | Ground truth | Expected behavior |
|---|---|---|
| S1 — Ordinary personal transfers | Benign | No case escalated. |
| S2 — Large one-off legitimate payment | Benign | No automatic high-risk escalation solely on amount. |
| S3 — Known merchant recurring settlement | Benign | Fan-in may occur; historical familiar settlement evidence reduces escalation. |
| S4 — Mule fan-in → rapid pass-through | Suspicious | Produces an evidence-backed case when the forwarding event arrives. |
| S5 — Mule with staggered amounts/timings | Suspicious | Tests whether detection depends on trivial exact thresholds. |
| S6 — New high-volume merchant with little history | Benign / uncertain | Prefer monitor or verify rather than claiming confirmed fraud or automatically “safe.” |
| S7 — Fast fan-in but no onward transfer | Benign or ambiguous | Do not label as completed pass-through. |
| S8 — Incoming and outgoing events in wrong time order | Validation case | Quarantine/reject out-of-order stream; no impossible inferred hold time. |
| S9 — Duplicate incoming event | Validation case | No double-counting or extra case. |

To make the demo credible, use similar amounts and fan-in shapes for S3 and S4 so contextual history, rather than an obvious hardcoded difference, drives the decision. Synthetic account profiles and baseline histories must exist **before** candidate transactions are evaluated.

### 7.3 Dataset research and honest usage

Potential external references:

- **IBM AML synthetic data** (`HI-Small` among the public samples): [IBM synthetic AML paper/data discussion](https://github.com/IBM/Multi-GNN); [IBM AMLSim generator](https://github.com/IBM/AMLSim).
- **TransXion**: [research/repository](https://github.com/chaos-max/TransXion), relevant for more challenging contextual benign/suspicious profiles.
- **FraudGT**: [GitHub implementation](https://github.com/junhongmit/FraudGT), a graph-model research reference **not** a six-hour port target.

**Build choice:** Create a small inspectable fixture dataset first, and only then optionally replay a correctly adapted sample of a larger benchmark. IBM AML data may be millions of transactions; full preprocessing is not a requirement for P0. Synthetic benchmark labels can be transaction-level while Blindspot's alert is account/case-level: **define and document the mapping** before reporting metrics.

Sources above are leads from the team's previous research discussion; verify any publication-specific benchmark claim, license, and repository status before repeating it publicly.

### 7.4 Baseline vs proposed method

Implement both on identical events:

- **Baseline A — Simple transaction rules:** unusually large transfers and/or a basic transaction count threshold. No connected time-dependent forwarding logic.
- **Blindspot B — Temporal context-aware approach:** fan-in/pass-through pattern + historical signals + mitigating context + case grouping.

Optional **A2 — Pattern-only temporal detector** (fan-in and forwarding, but without context) makes an excellent three-stage comparison if time allows; it tests whether *context* truly reduces false positives.

**Do not compare systems using different event streams or secretly different scoring thresholds.** Freeze the held-out evaluation scenarios after tuning.

### 7.5 Metric definitions

Report explicitly whether the evaluated object is **transaction**, **account**, or **case/scenario**. For this product, **case/scenario-level metrics** are most meaningful; transaction-level metrics may be secondary.

- `TP`: a suspicious scenario correctly alerted within the defined observation horizon.
- `FP`: a benign scenario incorrectly escalated under the same policy.
- `FN`: a suspicious scenario not detected.
- `TN`: a benign scenario correctly not escalated.
- **Precision** `TP / (TP + FP)` when denominator > 0.
- **Recall** `TP / (TP + FN)` when denominator > 0.
- **False-positive rate** `FP / (FP + TN)` when denominator > 0.
- **Detection latency**: `alert_emitted_at - triggering_event_received_at` (monotonic timer preferred), reported with sample size, p50 and p95/p99 where feasible.
- Optional: detection delay relative to **earliest detectable causal event** in simulated event time; report separately.

**Do not use accuracy as the headline:** class imbalance can make accuracy misleading. On a tiny synthetic sample, report counts and explain uncertainty; don't oversell decimal percentages.

### 7.6 Avoid leakage and inflated results

- Use chronological feature computation; no future transfers in the features available at scoring time.
- Split at **scenario/network level**, not by randomly scattering transactions from one pattern across train/test.
- Give evaluation scenarios fresh account IDs, times, volumes and benign lookalikes.
- Separate ground truth labels from the ingest payload passed to the detector.
- If adding XGBoost, fit on past events/train scenarios, tune on validation, evaluate once on held-out scenarios; save the model and schema.
- Avoid claiming a simulation with few handcrafted cases reproduces bank-scale production performance.

### 7.7 Performance expectations

The research briefing mentions ambitious goals (such as p99 < 3 ms and tens of thousands of events/sec). Treat these as **unverified stretch targets**, not acceptance criteria or existing results. Correctness and reliable end-to-end demo are more important.

Minimum meaningful benchmark:

- Per-event processing latency measured by `Instant` in Rust.
- Total events processed and ingestion rate for the current replay.
- Case-level precision, recall, FPR on held-out fixtures.
- Number of legitimate merchant scenarios incorrectly escalated.
- Same hardware and event stream for baseline and proposed method.

On the UI, display **"Measured on synthetic scenarios"**, scenario count, and benchmark run time. If metrics have not been computed, show `Not yet measured`, not placeholder numbers that appear real.

---

## 8. API specification

Use JSON with consistent envelopes; paths may be prefixed `/api/v1` if implemented consistently. Prefer fewer reliable routes to many stubs.

### 8.1 Core endpoints

| Method / path | Purpose | P0 |
|---|---|---|
| `GET /api/health` | Backend health and source mode | Yes |
| `POST /api/transactions` | Validate and ingest **one** transaction; return event processing result | Yes |
| `GET /api/transactions?limit=50` | Most recent events for live feed | Yes |
| `GET /api/cases` | Open/recent cases with severity, score and subject | Yes |
| `GET /api/cases/{id}` | Evidence, reason codes, transfers, recommended action | Yes |
| `GET /api/cases/{id}/graph` | Small directed nodes/edges subgraph for Cytoscape | Yes |
| `POST /api/demo/reset` | Clear demo state to a deterministic initial condition | Yes |
| `POST /api/demo/next` | Inject next event via normal ingest path | Yes |
| `GET /api/demo/status` | Scenario, progress, data-source label | Yes |
| `GET /api/metrics` | Measured benchmark metrics, or null when unavailable | Yes |
| `POST /api/demo/start` | Start timed incremental replay | Optional |
| `POST /api/demo/pause` | Pause replay | Optional |
| `POST /api/evaluate` | Rerun held-out scenarios and return scored comparison | Prefer CLI if easier |

Return useful errors: HTTP 400 for malformed records, 409 or `duplicate=true` response for already ingested IDs (choose one policy), 404 for absent cases. Never report success if persistence failed.

### 8.2 Examples

`POST /api/transactions` request: canonical Transaction JSON from §5.1.

Example response:

```json
{
  "transaction_id": "tx-10029",
  "accepted": true,
  "duplicate": false,
  "processing_latency_ms": 0.81,
  "updated_account_ids": ["bankA:acct-009", "bankA:acct-055"],
  "case_ids_updated": ["case-001"]
}
```

`processing_latency_ms` shown above is illustrative. Actual backend must time and populate it.

`GET /api/cases/{id}/graph` response shape:

```json
{
  "case_id": "case-001",
  "nodes": [
    {"id": "bankA:acct-009", "label": "Account •009", "role": "intermediary", "risk_level": "high"},
    {"id": "bankA:acct-001", "label": "Account •001", "role": "source", "risk_level": "unknown"}
  ],
  "edges": [
    {"id": "tx-10023", "source": "bankA:acct-001", "target": "bankA:acct-009", "amount_minor": 3000000, "timestamp": "2026-10-13T10:20:00Z"}
  ]
}
```

Use **transaction IDs as edge IDs** so repeated account-to-account transfers remain distinct. Never expose the ground truth "mule" as a user-visible account role; `intermediary` describes topology, not criminal guilt.

### 8.3 Frontend data refresh

At most ~1–2 second polling for `/api/transactions`, `/api/cases`, `/api/demo/status`. Retrieve case detail and graph when a case is selected. Use stable IDs to avoid Cytoscape resetting pan/zoom on every refresh.

Show disconnected/error state if the backend is not running. Don't fake new transfer animation while there is no accepted event stream.

---

## 9. User experience and visual language

### 9.1 UX direction

**Desktop-first, not mobile-first.** This is an AML investigator command center for graph exploration and evidence review, optimized around 1440px desktop and usable down to roughly 1024px. Mobile can stack elements as a graceful fallback but does not need a separate product experience.

**Visual inspiration from the user's image:** Minimal premium black/charcoal FinTech page with warm champagne/gold accents, dramatic restrained typography, generous whitespace, and rounded controls. **Adapt the visual identity, not the decorative credit cards or 3D hand**. Real investigation density matters more than a marketing hero.

Color tokens:

```css
:root {
  --bg: #141210;
  --surface: #25221F;
  --accent-gold: #D6A16B;
  --text: #F5F1E9;
  --text-muted: #B8AEA3;
  --threat: #D95C59;
  --safe: #2FA27F;
  --warning: #D6A16B;
  --border: #39332D;
}
```

Use red only for confirmed **high-risk alert level** under the prototype detector, never to imply guilt. Ensure clear contrast for tiny timestamps, tables and evidence explanations. Use charts/data colors sparingly.

### 9.2 Build **one app shell with three areas**, not five standalone pages

**A. Live Monitor (default)**

- Top header: `blindspot.` branding, "Synthetic stream" indicator, backend status, demo controls.
- Four small useful metrics: processed events, open cases, high-risk cases, and measured processing latency (if available).
- Main canvas: **Cytoscape account graph** with arrows, highlighted case subgraph, a readable legend, and limited visible labels.
- Side panel: recent alerts/cases, severity, event time, "Investigate" action.
- Lower panel: live transaction feed with time, masked account identifiers and amount.

**B. Investigation Detail (panel/drawer or view)**

- Case title, status, score (clearly labeled **risk score**, not fraud probability).
- Selected account-centered subgraph, relevant directed transfer sequence, timeline with timestamps/amounts.
- Reason codes, thresholds, observed evidence, mitigating context.
- Recommended response and explanatory policy.
- **Replay**: step through case transactions chronologically, highlighting each edge. This is a visual reconstruction, not a newly executed financial transfer.

**C. Benchmarks (tab or collapsible panel)**

- Rules-only baseline vs Blindspot comparison table: TP/FP/FN/TN, precision, recall, FPR, processing latency.
- Dataset/scenario count and held-out evaluation disclaimer.
- No charts needed until numbers are real; a clear table is sufficient.

### 9.3 UI wireframe

```text
┌──────────────────────────────────────────────────────────────────────────┐
│ blindspot.   Live Monitor   Investigations   Benchmarks    [SIMULATED] │
├──────────────────────────────────────────────────────────────────────────┤
│  Events Processed  │  Open Cases  │ High Risk │ Processing p95          │
├──────────────────────────────────────────────┬───────────────────────────┤
│                                              │ ALERT / CASE QUEUE        │
│        INTERACTIVE ACCOUNT GRAPH             │ Case #1 • high           │
│        suspicious paths highlighted          │ Pattern: pass-through    │
│                                              │ [Investigate]            │
│                                              │                           │
├──────────────────────────────────────────────┴───────────────────────────┤
│ STREAM CONTROL [Step] [Play] [Pause] [Reset] | Transactions Feed         │
└──────────────────────────────────────────────────────────────────────────┘
```

### 9.4 UX acceptance rules

- The graph is not decorative: clicking a node/edge reveals account or transfer information.
- Clicking a case highlights the **actual** evidence transactions and centers the subject account.
- Streaming updates do not break selected case/replay state.
- Synthetic source indicator stays visible.
- A case should be understood in **under 15 seconds**: what's suspicious, evidence, what should happen next.
- Demo should be accessible with **one click** from app startup. Do not require login, onboarding or wallet connection.
- A minimalist hero/landing page is P1; don't build it instead of the command center.

---

## 10. Test plan and acceptance criteria

### 10.1 Backend unit tests

1. Transaction ID duplicate is ignored exactly once.
2. Invalid negative/zero amounts and missing accounts are rejected.
3. Multiple A→B transfers are stored as distinct transactions.
4. Rolling window evicts events older than configured horizon, including boundary cases.
5. Three distinct sources count as three; repeated transfers from one source count as **one unique source**.
6. High fan-in **without later outgoing movement** is not labeled completed pass-through.
7. Outgoing before incoming does not yield a valid positive forwarding delay.
8. Risk remains in `[0,100]`; negative/undefined ratios cannot pass.
9. Historical signals use prior events only (no current/future leakage).
10. Case aggregation merges related subsequent events into one episode instead of case spam.
11. The same observable evidence produces deterministic reason codes under a fixed config.
12. Simulator reset restores exactly the same case outcome for a fixed seed/fixture.

### 10.2 Integration test scenarios (Gherkin-style)

**S1: Detect mule fan-in/pass-through**

- **Given** seeded independent accounts and a known mule scenario,
- **When** three qualifying inbound transfers and a subsequent qualifying outward transfer arrive,
- **Then** Blindspot emits an explainable suspicious-case alert **after** the causal onward transfer,
- **And** the stored case contains the correct source, intermediary, destination, and transaction IDs.

**S2: Reduce legitimate lookalike false positives**

- **Given** established merchant history with repeat customer payments and a known settlement destination,
- **When** comparable fan-in and settlement flow arrives,
- **Then** Blindspot does not automatically escalate at the same severity solely because the graph shape matches,
- **And** mitigating context appears in the case explanation or assessment log.

**S3: Reveal insufficient evidence**

- **Given** new or low-history account activity,
- **When** activity is unusual but lacks confirmed onward flow or history,
- **Then** the app records uncertainty/monitoring rather than definitive money laundering.

**S4: Demonstrate real processing**

- **Given** a reset demo,
- **When** Step injects each event,
- **Then** the feed and graph update from the persisted backend event,
- **And** the case is absent until sufficient evidence is actually present.

**S5: Quantify outcomes**

- **Given** a labeled held-out evaluation set,
- **When** both baseline and Blindspot process identical chronological events,
- **Then** metrics derive from actual TP/FP/FN/TN and timers,
- **And** the benchmark view names the scenario count and data source.

### 10.3 Quality gates

- `cargo fmt --check`, `cargo test`, and a clean production `cargo build` pass.
- React TypeScript build passes (`npm run build`).
- `GET /api/health` and case endpoints respond after a cold start.
- A fully scripted demo works **twice after reset** without manual data edits.
- No credential keys, fake bank access, labels leaking into inference, or hardcoded "win" metrics.
- Console logs are usable for debugging but do not contain real bank PII.

---

## 11. Six-hour execution schedule and stop rules

**Assumption:** One person or small team with at least basic Rust/React familiarity. This plan is not a promise that every optional integration will fit. If advance setup is permitted by the hackathon rules, have the Rust toolchain/npm dependencies and a fixture file ready; don't assume pre-built code is allowed.

| Clock | Task | Exit criterion / fallback |
|---|---|---|
| **0:00–0:45** | Initialize backend/frontend, define event DTO, health endpoint, simulator fixture, SQLite table. | `POST /api/transactions` accepts a valid event. |
| **0:45–1:40** | Per-account `VecDeque` windows and account history; dedupe and event ordering. | Known sample yields correct counts/timing. |
| **1:40–2:45** | Fan-in + rapid pass-through detector and reason codes, then basic context mitigation. | Suspicious and legitimate-lookalike tests diverge for explained reasons. |
| **2:45–3:35** | Cases API, grouping, evidence, recommended response, JSON subgraph. | Can query a complete generated case by ID. |
| **3:35–4:50** | React desktop command center: feed, Cytoscape graph, case selection/replay. | Full UI demo from Step to investigation works. |
| **4:50–5:30** | Baseline evaluator, held-out scenarios, measured precision/recall/FPR/latency. | Export or display honest counts and metrics. |
| **5:30–6:00** | Test, bug fix, final UI cleanup and 90-second demo rehearsal. | Cold-start demo succeeds twice. |

### Mandatory stop rules

- **At 1:00:** If SQLite is slowing development, keep an in-memory store initially and persist just cases/events once functional; do not add another database.
- **At 2:45:** If the algorithm isn't working, stop frontend polish and make S1/S2 automated tests pass.
- **At 3:45:** If Cytoscape integration is failing, show the graph as a simple readable directed transaction table/flow list first; don't lose the evidence UI.
- **At 4:50:** Freeze features. No ONNX, bank integrations, Web3, login or landing-page redesign.
- **At 5:30:** Fix critical bugs only and rehearse. Do not refactor for aesthetics.

### Suggested two-person split (optional)

- **Engineer A:** Rust ingestion, detection, tests, evaluation.
- **Engineer B:** React shell, Cytoscape graph, case interaction, demo controls.
- Agree on JSON shapes in §5 and §8 during the first 15 minutes. Integrate using mock API responses only temporarily; remove mocks before final demo.

---

## 12. What makes a convincing hackathon submission

### 12.1 Expected judge-facing results

1. **Working live-like pipeline**, not CSV upload and a static screenshot.
2. **Temporal network intelligence**, detecting relations that per-transaction rules miss.
3. **False-positive awareness**, with a plausible merchant lookalike test.
4. **Evidence-based decision support**, with one well-structured investigation case.
5. **Honest performance measurement**, distinguishing measured outcomes from ambitions.
6. **Polished, readable investigator UX** consistent with the black-and-gold reference.

### 12.2 Recommended 90-second demo script

| Time | Narration/demo |
|---|---|
| 0–10s | "Blindspot exposes fraud patterns that are invisible when transfers are viewed one by one." Show live monitor. |
| 10–30s | Run ordinary transactions, then fan-in and rapid outward transfer. Graph updates; case appears at causal event. |
| 30–50s | Open case, replay linked transfers, show exact amounts/times and explainable reason codes. |
| 50–65s | Replay merchant lookalike and show proportionate handling using known history/context. |
| 65–80s | Show actual baseline vs Blindspot metrics on held-out synthetic scenarios; discuss whether FP improved. |
| 80–90s | "Detect the pattern. Understand the risk. Orchestrate the response." Stress Rust incremental analysis and analyst-in-control decisions. |

**Fallback if benchmark does not show improved FPR:** Don't conceal it. Show the actual trade-off and the next experiment needed; technical honesty is better than fabricated superiority.

### 12.3 Optional README headline

> **Blindspot — Fraud hides in plain sight.** A Rust-powered, context-aware temporal money-flow intelligence prototype that detects potentially coordinated mule-account activity, reconstructs transaction evidence, and recommends proportionate investigation actions on synthetic banking streams.

---

## 13. Security, ethics, and responsible claims

- **Synthetic data only** for P0, masked account identifiers; no production financial data.
- Bank API use would require explicit consent, authorized provider access, eligible integration and secure token storage; **not within this build**.
- No user-facing credentials are required for the local demo. Keep backend on localhost by default.
- Validate amounts, IDs, timestamps, and transaction input sizes. Avoid unbounded graph or history growth without test-event limits.
- Never log full account credentials, API keys or sensitive financial identity records.
- Preserve event and case evidence for reproducibility; deletion/reset is for *demo* environments only.
- All actions are **recommendations**, not actual automated freezes, payments or reporting obligations.
- Risk scores aren't calibrated probabilities; binary ground truth in synthetic data does not establish guilt in real-world accounts.
- Avoid strong marketing claims like "zero false positives," "regulator approved," "guaranteed detection," or "sub-3ms" without independent evidence.
- Make the source of every number clear: historical fixture, live measured benchmark, illustrative UI value, or research claim.

---

## 14. Research influences and boundaries

The team previously reviewed public enterprise patterns and hackathon projects. They are **inspirations, not dependencies or promises to reproduce proprietary systems**:

- **Quantexa**: connected-account context and entity/network-level decisions.
- **Feedzai**: real-time risk scoring and transparent risk operations.
- **Sardine**: multi-signal behavior and relationship intelligence.
- **NICE Actimize**: investigation cases and analyst workflows.
- **IBM AMLSim / IBM Multi-GNN**: synthetic AML patterns and graph-based research.
- **FraudGT**: importance of direction, edge multiplicity and neighborhood structure.
- **TransXion**: avoiding overly easy synthetic tests; include realistic context-rich legitimate behavior.
- Hackathon references such as **Quorum/RingFence**, **Find the Fraud**, **FRTC**, and **Fraud Killer** demonstrate that graph evidence, uncertainty, and investigative workflows can be compelling, but are not part of the runtime stack.

**Research caution:** Earlier briefing material included unverified or non-comparable performance figures, simplistic merchant balance/entropy assumptions, and mathematically invalid use of absolute hold-time differences. This specification intentionally replaces them with testable, time-respecting, explicitly contextual rules. Academic model results cannot be assumed to transfer to Blindspot's own synthetic scenarios.

Useful implementation leads (verify the live links before reuse):

- IBM AMLSim: https://github.com/IBM/AMLSim
- IBM graph benchmark implementations: https://github.com/IBM/Multi-GNN
- FraudGT: https://github.com/junhongmit/FraudGT
- TransXion: https://github.com/chaos-max/TransXion
- Find the Fraud (hackathon reference): https://github.com/gokhansim/lauzhack
- Quorum/RingFence (hackathon reference): https://github.com/Alred-79/nycTechWeekHack

---

## 15. Final build checklist (the agent's finish line)

**Do not mark "done" unless the exact workflow works from cold start:**

- [ ] `README.md` documents two commands (backend and frontend) plus demo steps.
- [ ] Rust API starts and returns health.
- [ ] Synthetic transactions can be stepped/replayed through the actual ingest endpoint.
- [ ] Per-account rolling state and time-ordered logic are correct and test-covered.
- [ ] Fan-in followed by **later** rapid outward movement raises a candidate case.
- [ ] Benign merchant settlement is treated differently using prior context, with supporting reason codes.
- [ ] The alert contains **real linked transaction IDs, amounts, times and accounts**.
- [ ] Multiple same-episode signals update one case rather than generating redundant cases.
- [ ] Dashboard is desktop-first, charcoal/gold, data-legible and **clearly labeled synthetic**.
- [ ] Investigation replay highlights causative transactions in chronological order.
- [ ] Actions are proportional, explained and purely recommended.
- [ ] At least one held-out test compares baseline against Blindspot with actual TP/FP/FN/TN, precision, recall, FPR, latency.
- [ ] No unmeasured benchmarks, fabricated model probabilities or production banking claims.
- [ ] Demo completes in ~90 seconds and resets reproducibly.

### Final product principle

> **One big problem, solved fully:** Blindspot identifies potentially coordinated multi-account fund movement *as it emerges*, differentiates it from some legitimate lookalikes using prior context, and turns connected evidence into an explainable, proportionate investigation. **Every screen, model, metric and dependency must support that story.**
