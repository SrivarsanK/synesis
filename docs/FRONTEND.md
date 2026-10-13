# FRONTEND.md — Blindspot investigator console

**Status:** P0 UI specification · **Audience:** React/TypeScript coding agent · **Source:** [`../PRODUCT.md`](../PRODUCT.md) §9

## 1. UX principle

**Desktop-first for fraud analysts, not a consumer banking app.** Aim for a premium black/champagne/gold financial risk command center, based on the user's visual reference. Optimize for ~1440px; remain usable at ~1024px; mobile gracefully stacks but is not a separate P0 workflow.

Users need to answer four questions **in under 15 seconds** when a case opens: *what pattern was detected, which transactions prove the trigger, why is it risky or mitigated, and what response is recommended?*

**Non-negotiable honesty:** Mark the product `SYNTHETIC STREAM / DEMO` at all times. Never display fake bank integrations, artificial 'live' animations without accepted backend transactions, illustrative percentages as measured stats, or a 'payment blocked' action.

## 2. Visual system

```css
:root {
  --bg: #141210;
  --surface: #25221f;
  --surface-raised: #302b26;
  --accent: #d6a16b;
  --text: #f5f1e9;
  --muted: #b8aea3;
  --border: #39332d;
  --danger: #d95c59;
  --success: #2fa27f;
  --warning: #d6a16b;
}
```

- Typography: modern sans (system font or bundled web-safe font). Hierarchy through weight/size, not glow effects.
- Layout: ~20–24px spacing in the main canvas; 12–16px for dense evidence and tabular data.
- High-priority alert: red accent border/marker with explicit `high` label; not a giant alarming full-screen animation.
- Warning: amber; normal/processed: muted; successful low-risk state: green.
- High text contrast and keyboard focus rings. Tables and exact timestamps should remain legible.
- Keep premium brand `blindspot.` visible but **do not build a full marketing homepage** during P0.

## 3. Information architecture — one shell, three modes

```text
Header: blindspot. | Live Monitor | Investigation | Benchmarks | SYNTHETIC | API state
Metrics: Processed events | Open cases | High risk cases | Measured p95 processing
Main:  66% graph canvas + 34% case/alert queue
Bottom: replay controls + chronological/recent transaction feed
Investigation drawer: risk, context, time-ordered evidence, action
Benchmarks: baseline vs Blindspot with actual scenario metrics and sample size
```

### Mode A: Live monitor (`/` or client tab)

- Header: product, tabs, `SYNTHETIC` tag and backend connection status.
- Four metric cards: processed events; open cases; high-risk count; processing p95 if measured (otherwise `Not measured`).
- Dominant Cytoscape network canvas: direction arrows, distinct transfer edges, highlighted case evidence. Before a case is selected, build the recent network from `GET /api/transactions?limit=50` (do not invent a separate graph API); when a case is selected, use `GET /api/cases/{id}/graph`. Render accepted events only.
- Right sidebar: cases by `updated_at`, severity, subject, score, `Investigate` action.
- Bottom panel: recent transfers: time, source masked ID, destination masked ID, INR amount, optional associated case.
- Controls: **Step next transaction** and **Reset** mandatory. Start/Pause and speed are optional only once Step is reliable.

### Mode B: Investigation (drawer or tab)

- Shows case ID and `Potential rapid pass-through network` (no guilt assertion).
- Risk score **/100**, `severity`, recommended action and meaning of recommendation.
- Actual case-centered directed graph with intermediary highlighted; clicking node shows account label, clicking edge shows timestamp and amount.
- Chronological causal transfer timeline; **Replay step** increments selected evidence event and highlights its edge (replay is visual-only, not a new bank transfer).
- Exact reason codes with observed values and thresholds: distinct senders, flow ratio, delay, historical deviation, new/familiar beneficiary; also show *mitigating* factors.
- Timestamp of alert creation and latest update. Group related transfers into one case; no five duplicate banners.
- Explicit disclaimer: `Synthetic demonstration. Risk indicator, not proof of financial crime.`

### Mode C: Benchmarks (tab or collapsible content)

- Render measured rows for baseline and Blindspot (and optional pattern-only comparator).
- Show `TP, FP, FN, TN`, precision, recall, FPR, scenario count, and sampled processing p50/p95 (p99 only if adequate samples).
- Label metric **unit = scenario** and dataset name/version; show run date.
- Before a benchmark exists: `Not yet measured — run evaluation to populate`; **no example metrics as defaults**.
- If performance is worse than baseline, display it without hiding or adjusting presentation.

## 4. Component-level contract

| Component | Inputs | Responsibility | Must not do |
|---|---|---|---|
| `AppShell` | API status, route/tab state | Layout, navigation, source badge | Call API in render |
| `MetricCards` | live summaries, measured latency | Show useful figures and null states | Invent computed percentages |
| `DemoControls` | `/api/demo/status` | Step/reset; show progress | Directly insert a case into UI |
| `TransactionFeed` | `GET /api/transactions` | Chronological visible events | Treat `scenario_id` as risk evidence |
| `CaseQueue` | `GET /api/cases` | Alerts, scores, selection | Assume `high` means guilt |
| `TransactionGraph` | `GET /api/cases/{id}/graph` | Directed multiedge visualization | Collapse duplicated A→B transfer edges |
| `CaseInvestigation` | case detail + graph | Evidence, context, recommended action, replay | Generate fake explanations with an LLM |
| `BenchmarkPanel` | `GET /api/metrics` | Actual baseline comparison | Display contract sample values |

## 5. TypeScript integration

Use `fetch` wrapper with `VITE_API_BASE_URL` and a typed `ApiError`. Keep actual DTOs synchronized with [`API_AND_DATABASE.md`](API_AND_DATABASE.md), including snake_case fields and action enums.

```ts
type Severity = 'low' | 'medium' | 'high';
type Action = 'allow_and_monitor' | 'monitor_or_verify' | 'escalate_for_review';

type Transaction = {
  transaction_id: string;
  timestamp: string;
  source_account_id: string;
  destination_account_id: string;
  amount_minor: number;
  currency: 'INR';
  channel: 'synthetic_stream';
  scenario_id?: string | null;
};
```

Use `setInterval`/react-query equivalent at 1–2s for `/api/transactions`, `/api/cases`, `/api/demo/status`; clear on unmount. Only refresh case detail/graph when selected case changes or its `updated_at` changes. Maintain Cytoscape node/edge identities so polling doesn't reset pan/zoom or replay state.

## 6. Graph visual encoding

- Nodes are accounts (`id` stable, masked UI label). **Intermediate topology**, not `criminal` node types.
- Edges are directed unique transactions keyed by `transaction_id` with timestamp and amount; arrows point from sender to receiver.
- Gold: selected path or active event; red: high-risk subject; muted grey: surrounding network; green: low-risk/benign assessment indicators.
- Avoid edge text overload; show details in tooltip/side panel on click.
- Layout: `cose` or breadthfirst for small case graph; max ~50 visible nodes and ~100 edges in MVP. Only send bounded case-centered graph over API.
- Graph focus/replay highlights existing edge rather than injecting new edge in-memory.

## 7. Replay and state machine

Two separate concepts must not be confused:

**Demo streaming:** clicking `Step next transaction` sends `POST /api/demo/next`, which **persists one new event** through normal backend ingest; feed, cases and graph update from API.

**Investigation replay:** clicking `Next evidence` in a case changes only the **highlighted transaction index** in the existing case graph/timeline. No backend transaction ingestion occurs.

Suggested client states:

```text
Demo: idle -> stepping -> ready -> complete | failed
Case: unselected -> loading -> inspecting -> replaying | failed
Evaluation: unavailable -> loading -> available | failed
```

Reset must clear selected case and replay index after a successful response. API disconnected -> show a visible error indicator and retry; don't keep showing fake live activity.

## 8. Empty/loading/error design

- No transactions: `Start the synthetic stream to see activity.`
- No cases: `No suspicious network cases yet.` Do not display dummy alerts.
- No benchmark: `Metrics not yet measured on held-out scenarios.`
- Network API failure: `Unable to load case evidence; retry` with retained text evidence if available.
- No historical baseline: `Insufficient prior account history`; avoid showing normal as confidently low-risk without evidence.
- Processing indicators should not flash repeatedly for ordinary background polling.

## 9. Accessibility and demo reliability

- Accessible labels for Step, Reset, Investigate, Close, Next evidence.
- Keyboard focus and button disabled/loading states.
- Never rely exclusively on color to communicate severity; include text labels.
- Decimal display: amount_minor / 100, formatted with `Intl.NumberFormat('en-IN',{style:'currency',currency:'INR'})`.
- Timestamp display local/UTC labeled consistently; backend remains UTC.
- Desktop screenshot-ready viewport without vertical scrolling to the key graph, queue and controls at 1440×900 if practical.
- Prefer a reliable 2D network over a decorative 3D effect.

## 10. UI acceptance checklist

- [ ] Opening at localhost displays `blindspot.` and a prominent synthetic-data source badge.
- [ ] Step generates exactly one accepted new transaction from the server.
- [ ] Feed and graph match backend events and never hardcode the suspicious scenario's final state.
- [ ] Case queue remains empty before causal pass-through conditions exist.
- [ ] Clicking `Investigate` opens a case with evidence, reason codes and action.
- [ ] Evidence replay highlights timestamps and real transfer edges sequentially.
- [ ] A merchant lookalike can be reviewed with lower-severity/mitigated context.
- [ ] Benchmark tab shows measured data or an honest not-measured state.
- [ ] Reset and repeat produces the same narrative without manual refresh.
- [ ] `npm run build` succeeds and no console errors occur during the demonstration.
