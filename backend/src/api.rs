use crate::{
    evaluation,
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
