use crate::{
    evaluation, imports,
    store::Engine,
    types::{ApiError, Transaction},
};
use axum::{
    extract::{rejection::JsonRejection, Path, Query, State},
    http::{header, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;
pub type Shared = Arc<Mutex<Engine>>;
impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        tracing::warn!(code=self.code,error=%self.message,"request failed");
        (
            StatusCode::from_u16(self.status).unwrap_or(StatusCode::INTERNAL_SERVER_ERROR),
            Json(json!({"error":{"code":self.code,"message":self.message}})),
        )
            .into_response()
    }
}
fn lock(state: &Shared) -> Result<std::sync::MutexGuard<'_, Engine>, ApiError> {
    state
        .lock()
        .map_err(|_| ApiError::internal("State lock poisoned"))
}
fn body<T>(body: Result<Json<T>, JsonRejection>) -> Result<T, ApiError> {
    body.map(|Json(v)| v)
        .map_err(|e| ApiError::bad("INVALID_JSON", &e.body_text()))
}
#[derive(Deserialize)]
struct Limit {
    limit: Option<String>,
}
impl Limit {
    fn value(&self) -> Result<usize, ApiError> {
        match self.limit.as_deref().unwrap_or("50").parse::<usize>() {
            Ok(n) if (1..=200).contains(&n) => Ok(n),
            _ => Err(ApiError::bad(
                "INVALID_LIMIT",
                "limit must be an integer in 1..200",
            )),
        }
    }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Reset {
    scenario: String,
}
pub fn router(engine: Engine) -> Router {
    let state = Arc::new(Mutex::new(engine));
    Router::new()
        .route(
            "/api/health",
            get(|| async {
                Json(json!({"status":"ok","source_mode":"synthetic","version":"mvp-1"}))
            }),
        )
        .route("/api/transactions", get(transactions).post(ingest))
        .route("/api/cases", get(cases))
        .route("/api/cases/{id}", get(detail))
        .route("/api/cases/{id}/graph", get(graph))
        .route("/api/demo/reset", post(reset))
        .route("/api/demo/next", post(next))
        .route("/api/demo/status", get(status))
        .route("/api/metrics", get(metrics))
        .route("/api/evaluate", post(evaluate))
        .route("/api/imports/preview", post(import_preview))
        .route("/api/imports/analyze", post(import_analyze))
        .route("/api/imports/samples", get(import_samples))
        .route(
            "/api/imports/samples/{id}/analyze",
            post(import_sample_analyze),
        )
        .fallback(|| async {
            (
                StatusCode::NOT_FOUND,
                Json(json!({"error":{"code":"NOT_FOUND","message":"Unknown API route"}})),
            )
        })
        .layer(
            CorsLayer::new()
                .allow_origin([
                    "http://127.0.0.1:5173".parse().expect("static origin"),
                    "http://localhost:5173".parse().expect("static origin"),
                ])
                .allow_methods([axum::http::Method::GET, axum::http::Method::POST])
                .allow_headers([header::CONTENT_TYPE]),
        )
        .with_state(state)
}
async fn ingest(
    State(s): State<Shared>,
    b: Result<Json<Transaction>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let tx = body(b)?;
    Ok(Json(serde_json::to_value(
        lock(&s)?.ingest_transaction(tx)?,
    )?))
}
async fn transactions(
    State(s): State<Shared>,
    Query(q): Query<Limit>,
) -> Result<Json<Value>, ApiError> {
    let n = q.value()?;
    let e = lock(&s)?;
    Ok(Json(
        json!({"items":e.events.iter().rev().take(n).collect::<Vec<_>>(),"count":e.events.len()}),
    ))
}
async fn cases(State(s): State<Shared>, Query(q): Query<Limit>) -> Result<Json<Value>, ApiError> {
    let n = q.value()?;
    let e = lock(&s)?;
    let mut cases = e.detection.cases.iter().collect::<Vec<_>>();
    cases.sort_by(|a, b| {
        chrono::DateTime::parse_from_rfc3339(&b.updated_at)
            .ok()
            .cmp(&chrono::DateTime::parse_from_rfc3339(&a.updated_at).ok())
            .then_with(|| b.case_id.cmp(&a.case_id))
    });
    Ok(Json(
        json!({"items":cases.iter().take(n).map(|c|c.summary()).collect::<Vec<_>>(),"count":cases.len()}),
    ))
}
async fn detail(State(s): State<Shared>, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    Ok(Json(serde_json::to_value(lock(&s)?.case(&id)?)?))
}
async fn graph(State(s): State<Shared>, Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    Ok(Json(lock(&s)?.graph(&id)?))
}
async fn reset(
    State(s): State<Shared>,
    b: Result<Json<Reset>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    Ok(Json(lock(&s)?.reset(&body(b)?.scenario)?))
}
async fn next(State(s): State<Shared>) -> Result<Json<Value>, ApiError> {
    Ok(Json(lock(&s)?.next()?))
}
async fn status(State(s): State<Shared>) -> Result<Json<Value>, ApiError> {
    Ok(Json(lock(&s)?.status()))
}
async fn metrics(State(s): State<Shared>) -> Result<Json<Value>, ApiError> {
    Ok(Json(lock(&s)?.metrics()?))
}
async fn evaluate(State(s): State<Shared>) -> Result<Json<Value>, ApiError> {
    let value = tokio::task::spawn_blocking(evaluation::evaluate)
        .await
        .map_err(ApiError::internal)??;
    lock(&s)?.save_metrics(&value)?;
    Ok(Json(value))
}

#[derive(Deserialize)]
struct ImportPayload {
    content: String,
    #[serde(default)]
    _filename: Option<String>,
}

async fn import_preview(
    b: Result<Json<ImportPayload>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let payload = body(b)?;
    let preview = imports::parse_and_preview(&payload.content)?;
    Ok(Json(serde_json::to_value(preview)?))
}

async fn import_analyze(
    b: Result<Json<ImportPayload>, JsonRejection>,
) -> Result<Json<Value>, ApiError> {
    let payload = body(b)?;
    let analysis = imports::parse_and_analyze(&payload.content)?;
    Ok(Json(serde_json::to_value(analysis)?))
}

async fn import_samples() -> Result<Json<Value>, ApiError> {
    Ok(Json(json!({
        "items": [
            {
                "id": "bank_statement_period1",
                "title": "Kaaviya — Last year",
                "format": "bank_statement",
                "period": "Jul 2025 – Mar 2026",
                "valid_transactions": 505,
                "description": "Savings account bank statement with metadata on rows 1–19, headers starting on row 20, DR/CR columns, and balance tracking."
            },
            {
                "id": "bank_statement_period2",
                "title": "Kaaviya — Recent transactions",
                "format": "bank_statement",
                "period": "Apr 2026 – Oct 12, 2026",
                "valid_transactions": 817,
                "description": "Consecutive follow-up bank statement period with identical column structure and zero date overlap."
            },
            {
                "id": "upi_transactions",
                "title": "Srivarsan transactions",
                "format": "upi_export",
                "period": "Oct 2025 – Oct 12, 2026",
                "valid_transactions": 373,
                "description": "UPI payment export with 9 columns, counterparty VPAs, debit/credit/self-transfer tags, and 8 date-only records."
            },
            {
                "id": "bank_statement_combined",
                "title": "Kaaviya — Combined history (P1 + P2)",
                "format": "bank_statement",
                "period": "Jul 2025 – Oct 12, 2026",
                "valid_transactions": 1322,
                "description": "Unified account history combining consecutive Period 1 (505 txs) and Period 2 (817 txs) under verified account reference XXXX-XXXX-5610."
            }
        ]
    })))
}

async fn import_sample_analyze(Path(id): Path<String>) -> Result<Json<Value>, ApiError> {
    let dir = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("fixtures")
        .join("imports");

    if id == "bank_statement_combined" {
        let content1 = std::fs::read_to_string(dir.join("bank_statement_period1.csv"))
            .map_err(ApiError::internal)?;
        let content2 = std::fs::read_to_string(dir.join("bank_statement_period2.csv"))
            .map_err(ApiError::internal)?;

        let sig1 = imports::detect_format(&content1)?;
        let sig2 = imports::detect_format(&content2)?;

        let (mut txs1, meta1) =
            imports::bank_statement::parse_bank_statement(&content1, sig1.header_line_index)?;
        let (txs2, meta2) =
            imports::bank_statement::parse_bank_statement(&content2, sig2.header_line_index)?;

        if meta1.account_number_masked != meta2.account_number_masked {
            return Err(ApiError::bad(
                "ACCOUNT_MISMATCH",
                "Cannot combine statements from different accounts",
            ));
        }

        txs1.extend(txs2);
        txs1.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));

        let preview = imports::validate::generate_preview(
            imports::ImportFormat::BankStatement,
            sig1.header_line_index + 1,
            content1.lines().count() + content2.lines().count(),
            &txs1,
            Some(meta1),
        );
        let analysis =
            imports::validate::analyze_transactions(imports::ImportFormat::BankStatement, &txs1);
        return Ok(Json(json!({
            "preview": preview,
            "analysis": analysis,
        })));
    }

    let filename = match id.as_str() {
        "bank_statement_period1" => "bank_statement_period1.csv",
        "bank_statement_period2" => "bank_statement_period2.csv",
        "upi_transactions" => "upi_transactions.csv",
        _ => return Err(ApiError::bad("UNKNOWN_SAMPLE", "Sample not found")),
    };
    let path = dir.join(filename);
    let content = std::fs::read_to_string(path).map_err(ApiError::internal)?;
    let preview = imports::parse_and_preview(&content)?;
    let analysis = imports::parse_and_analyze(&content)?;
    Ok(Json(json!({
        "preview": preview,
        "analysis": analysis,
    })))
}
