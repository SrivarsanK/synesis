# API_AND_DATABASE.md — Canonical HTTP and persistence contracts

**Version:** MVP v1 · **Authoritative interface contract:** Changes here require matching Rust DTOs, TypeScript types, tests and docs.

## 1. General API conventions

- Base URL during development: `http://127.0.0.1:3001`; route prefix `/api`.
- JSON UTF-8; ISO 8601 UTC (`Z` suffix); UTF-8 account IDs, no real PII.
- Monetary amounts in **integer minor units** (`i64`, positive). INR 3,000,000 paise = ₹30,000.
- JSON enum strings are **snake_case**. Where no data exists, respond `null` or an empty array, never invented positive values.
- All demo and benchmark data are **synthetic**. P0 endpoints run on localhost. CORS restricted to Vite local dev origin.
- Normal accepted request returns `200` or `201`; malformed `400`; timestamp ordering validation `422`; unknown case `404`; internal/storage failure `500` with no false success.
- **Idempotency rule:** exact duplicate `transaction_id` returns HTTP `200` and `duplicate:true`, with no mutation. A duplicate ID with different content must return `409` (conflicting ID) rather than silently accepting a changed record.
- Errors return `{"error":{"code":"INVALID_AMOUNT","message":"amount_minor must be > 0"}}`.

## 2. Transaction DTO (canonical input)

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

| Field | Type | Required | Constraint |
|---|---|---|---|
| `transaction_id` | string | yes | 1–128 chars, stable unique ID |
| `timestamp` | RFC3339 UTC string | yes | Valid time; nondecreasing stream event order |
| `source_account_id` | string | yes | 1–128 chars; distinct from destination |
| `destination_account_id` | string | yes | 1–128 chars |
| `amount_minor` | i64 | yes | `1..=i64::MAX` subject to overflow checks |
| `currency` | string | yes | `INR` for primary MVP fixtures; reject unsupported currency or isolate by currency |
| `channel` | string | yes | `synthetic_stream` for P0 |
| `scenario_id` | string or null | optional | Provenance only; **not an input to detector** |

No fraud label, `is_laundering`, `expected_account_ids`, or case decision can appear in detector input. Labels live in separate benchmark-only files.

## 3. Read DTOs

### 3.1 Transaction ingest result

`POST /api/transactions`

```json
{
  "transaction_id": "tx-10029",
  "accepted": true,
  "duplicate": false,
  "processing_latency_ms": 0.81,
  "updated_account_ids": ["bankA:acct-009", "bankA:acct-055"],
  "case_ids_updated": ["case-000001"]
}
```

**All numbers in example payloads are fictitious contract examples.** Populate latency from `Instant`, not a constant. The duplicate response has `accepted:true`, `duplicate:true`, `case_ids_updated:[]` and no new case.

### 3.2 Case summary and detail

Case summary fields for `GET /api/cases`: `case_id`, `subject_account_id`, `title`, `status`, `risk_score`, `severity`, `recommended_action`, `created_at`, `updated_at`, `transaction_count`, `data_source`.

```json
{
  "case_id": "case-000001",
  "status": "open",
  "subject_account_id": "bankA:acct-009",
  "title": "Potential rapid pass-through network",
  "risk_score": 84,
  "severity": "high",
  "recommended_action": "escalate_for_review",
  "reason_codes": [
    {
      "code": "MULTI_SOURCE_INFLOW",
      "observed": 3,
      "threshold": 3,
      "window_seconds": 900,
      "transaction_ids": ["tx-10023", "tx-10024", "tx-10025"]
    }
  ],
  "transaction_ids": ["tx-10023", "tx-10024", "tx-10025", "tx-10029"],
  "account_ids": ["bankA:acct-001", "bankA:acct-002", "bankA:acct-003", "bankA:acct-009", "bankA:acct-055"],
  "created_at": "2026-10-13T10:24:00Z",
  "updated_at": "2026-10-13T10:24:00Z",
  "data_source": "synthetic"
}
```

`reason_codes` are typed with common fields (`code`, `transaction_ids`) and code-specific values (`observed`, `observed_ratio`, `observed_seconds`, `threshold`, `threshold_ratio`, `threshold_seconds`, `window_seconds`, `mitigation_points`). It's acceptable to use `serde_json::Value` for code-specific metadata in P0 as long as actual evidence values are deterministic and tested.

Allowed enums:

```text
CaseStatus: open
Severity: low | medium | high
RecommendedAction: allow_and_monitor | monitor_or_verify | escalate_for_review
DataSource: synthetic
```

Cases created only for completed temporal candidates scoring >=35; medium and high cases appear in queue. Cases always mean potential suspicion, not confirmed financial crime.

### 3.3 Directed case graph

`GET /api/cases/{case_id}/graph`

```json
{
  "case_id": "case-000001",
  "nodes": [
    {"id":"bankA:acct-009","label":"Account •009","role":"intermediary","risk_level":"high"},
    {"id":"bankA:acct-001","label":"Account •001","role":"source","risk_level":"unknown"},
    {"id":"bankA:acct-055","label":"Account •055","role":"destination","risk_level":"unknown"}
  ],
  "edges": [
    {"id":"tx-10023","source":"bankA:acct-001","target":"bankA:acct-009","amount_minor":3000000,"currency":"INR","timestamp":"2026-10-13T10:20:00Z"}
  ]
}
```

**Edges use transaction IDs**; case graph retains multiple transfers between the same account pair. Roles describe observed graph topology, not crime attribution. Real case data must be loaded from accepted backend transactions.

## 4. Required route table

| Method | Path | Request | Response and behavior |
|---|---|---|---|
| GET | `/api/health` | none | `{"status":"ok","source_mode":"synthetic","version":"mvp-1"}` |
| POST | `/api/transactions` | Transaction DTO | IngestResult; idempotent |
| GET | `/api/transactions?limit=50` | integer `1..200` | `{"items":[Transaction],"count":n}` newest first |
| GET | `/api/cases` | optional `?limit=50` | `{"items":[CaseSummary],"count":n}` newest/most recently updated first |
| GET | `/api/cases/{id}` | path ID | CaseDetail with reason codes, IDs, evidence metadata |
| GET | `/api/cases/{id}/graph` | path ID | Graph response as above |
| POST | `/api/demo/reset` | `{"scenario":"mule_fan_in_pass_through"}` | Clears demo state, selects fixture, restores deterministic seeded history and resets cursor |
| POST | `/api/demo/next` | `{}` | Passes **next** fixture event to same ingest logic; returns `{"ingestion": IngestResult, "next_index": n, "complete": false}`; when finished `ingestion:null`, `complete:true` |
| GET | `/api/demo/status` | none | `{"scenario":"mule_fan_in_pass_through","source_mode":"synthetic","next_index":n,"total_events":m,"complete":false,"running":false}` |
| GET | `/api/metrics` | none | `{"available":false,"reason":"Not yet measured"}` OR evaluated metric payload |

**Optional:** POST `/api/demo/start`, POST `/api/demo/pause`, POST `/api/evaluate` if time remains. Do not block P0 waiting on timed streaming; manual step is sufficient for real incremental processing. Benchmark may be run by CLI and persisted/read via `/api/metrics`.

### Measured benchmark response

```json
{
  "available": true,
  "dataset": "held_out_synthetic_v1",
  "evaluation_unit": "scenario",
  "scenario_count": 24,
  "evaluated_at": "2026-10-13T12:00:00Z",
  "baseline": {
    "tp": 5, "fp": 6, "fn": 3, "tn": 10,
    "precision": 0.4545, "recall": 0.625, "false_positive_rate": 0.375,
    "sampled_event_count": 1200, "latency_p50_ms": 0.3, "latency_p95_ms": 1.2
  },
  "blindspot": {
    "tp": 7, "fp": 2, "fn": 1, "tn": 14,
    "precision": 0.7778, "recall": 0.875, "false_positive_rate": 0.125,
    "sampled_event_count": 1200, "latency_p50_ms": 0.7, "latency_p95_ms": 2.1
  }
}
```

**These numbers are deliberately illustrative schema examples, not project results. Do not display or commit them as measured output.** For P0, implement the same shape using actual evaluation counts and durations; denominators of zero yield `null`, not NaN/Infinity.

## 5. SQLite schema (recommended)

Use `rusqlite` with bundled SQLite. Enable foreign keys. Build schema at startup (no complex migration system for P0).

```sql
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id TEXT PRIMARY KEY,
  event_timestamp TEXT NOT NULL,
  source_account_id TEXT NOT NULL,
  destination_account_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL CHECK (amount_minor > 0),
  currency TEXT NOT NULL,
  channel TEXT NOT NULL,
  scenario_id TEXT,
  received_at TEXT NOT NULL,
  CHECK (source_account_id <> destination_account_id)
);
CREATE INDEX IF NOT EXISTS idx_tx_event ON transactions(event_timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_source_time ON transactions(source_account_id, event_timestamp);
CREATE INDEX IF NOT EXISTS idx_tx_dest_time ON transactions(destination_account_id, event_timestamp);

CREATE TABLE IF NOT EXISTS cases (
  case_id TEXT PRIMARY KEY,
  subject_account_id TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  risk_score INTEGER NOT NULL CHECK (risk_score BETWEEN 0 AND 100),
  severity TEXT NOT NULL,
  recommended_action TEXT NOT NULL,
  reason_codes_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data_source TEXT NOT NULL DEFAULT 'synthetic'
);
CREATE INDEX IF NOT EXISTS idx_case_subject ON cases(subject_account_id, updated_at);

CREATE TABLE IF NOT EXISTS case_transactions (
  case_id TEXT NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
  transaction_id TEXT NOT NULL REFERENCES transactions(transaction_id),
  PRIMARY KEY(case_id, transaction_id)
);

CREATE TABLE IF NOT EXISTS evaluation_runs (
  run_id TEXT PRIMARY KEY,
  dataset_name TEXT NOT NULL,
  evaluated_at TEXT NOT NULL,
  metrics_json TEXT NOT NULL
);
```

The case's account list and graph can be derived from `case_transactions` + `transactions`. Keep `reason_codes_json` canonical and derived from the same evidence. Don't store duplicate account graph JSON with divergent data. Allow `DELETE FROM ...` only in **demo reset**.

## 6. Persistence safety and reset

- Persist transactions and case changes within a DB transaction for each event. If DB fails, don't acknowledge success. Roll back/rebuild mutable indices if necessary (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).
- `POST /api/demo/reset` is a **destructive localhost-only simulation operation**, clearing demo cases, case links and demo transactions and resetting processing state/counters. It must not delete evaluation outputs unless a fresh evaluation is requested. If seeded prior-history transactions are reloaded during reset, they are historical source events but not labeled as new suspicious live events.
- API `GET /api/transactions` should not expose hidden evaluation labels or private banking data.
- SQLite is authoritative for transactions/cases; account rolling windows may be reconstructed by event replay on startup.
- A replayed fixture event should produce the same deterministic case outcome after reset under the same config.

## 7. API contract test cases

1. Accept valid transaction; store it and query it back.
2. Duplicate ID with identical payload -> `duplicate:true`, no count change.
3. Same ID changed amount -> `409 CONFLICTING_TRANSACTION_ID`.
4. Invalid amount, blank sender, self-transfer -> `400`.
5. Out-of-order `timestamp` -> `422 OUT_OF_ORDER_EVENT` and unchanged state.
6. `POST /api/demo/next` advances cursor once and uses normal ingestion path.
7. `GET /api/cases/{id}/graph` edge IDs exactly match accepted transaction IDs; no invented edges.
8. Missing case -> `404 CASE_NOT_FOUND`.
9. `GET /api/metrics` before a benchmark -> `available:false`; no fabricated scores.
10. Reset twice yields identical replayed scenario behavior; no ghosts in case or graph indexes.

## 8. Frontend integration rules

Put all HTTP functions in `frontend/src/api.ts` and all types in `frontend/src/types.ts`. Handle loading, empty and error states. Poll only list endpoints every 1–2s; load case detail and graph on case selection. Render amounts with `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` from `amount_minor / 100` **only at display time**. Mask account IDs for UI readability without modifying underlying IDs.
