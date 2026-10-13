use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Transaction {
    pub transaction_id: String,
    pub timestamp: String,
    pub source_account_id: String,
    pub destination_account_id: String,
    pub amount_minor: i64,
    pub currency: String,
    pub channel: String,
    #[serde(default)]
    pub scenario_id: Option<String>,
}
impl Transaction {
    pub fn epoch(&self) -> Result<i64, ApiError> {
        let parsed = chrono::DateTime::parse_from_rfc3339(&self.timestamp)
            .map_err(|_| ApiError::bad("INVALID_TIMESTAMP", "timestamp must be RFC3339 UTC"))?;
        if !self.timestamp.ends_with('Z') || parsed.offset().local_minus_utc() != 0 {
            return Err(ApiError::bad(
                "INVALID_TIMESTAMP",
                "timestamp must use UTC Z suffix",
            ));
        }
        Ok(parsed.timestamp_millis())
    }
    pub fn validate(&self) -> Result<i64, ApiError> {
        for id in [
            &self.transaction_id,
            &self.source_account_id,
            &self.destination_account_id,
        ] {
            if id.trim().is_empty() || id.chars().count() > 128 {
                return Err(ApiError::bad(
                    "INVALID_ID",
                    "IDs must contain 1–128 nonblank characters",
                ));
            }
        }
        if self.amount_minor <= 0 {
            return Err(ApiError::bad("INVALID_AMOUNT", "amount_minor must be > 0"));
        }
        if self.source_account_id == self.destination_account_id {
            return Err(ApiError::bad(
                "SELF_TRANSFER",
                "source and destination must differ",
            ));
        }
        if self.currency != "INR" {
            return Err(ApiError::bad(
                "UNSUPPORTED_CURRENCY",
                "Only INR is supported",
            ));
        }
        if self.channel != "synthetic_stream" {
            return Err(ApiError::bad(
                "INVALID_CHANNEL",
                "channel must be synthetic_stream",
            ));
        }
        self.epoch()
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IngestResult {
    pub transaction_id: String,
    pub accepted: bool,
    pub duplicate: bool,
    pub processing_latency_ms: f64,
    pub updated_account_ids: Vec<String>,
    pub case_ids_updated: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Case {
    pub case_id: String,
    pub subject_account_id: String,
    pub title: String,
    pub status: String,
    pub risk_score: u8,
    pub severity: String,
    pub recommended_action: String,
    pub reason_codes: Vec<Value>,
    pub transaction_ids: Vec<String>,
    pub account_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub data_source: String,
}
impl Case {
    pub fn summary(&self) -> Value {
        let mut value = serde_json::to_value(self).expect("Case serialization is infallible");
        let obj = value.as_object_mut().expect("Case serializes to object");
        obj.remove("reason_codes");
        obj.remove("transaction_ids");
        obj.remove("account_ids");
        obj.insert(
            "transaction_count".into(),
            self.transaction_ids.len().into(),
        );
        value
    }
}
#[derive(Debug)]
pub struct ApiError {
    pub status: u16,
    pub code: &'static str,
    pub message: String,
}
impl ApiError {
    pub fn bad(code: &'static str, message: &str) -> Self {
        Self {
            status: 400,
            code,
            message: message.into(),
        }
    }
    pub fn internal(message: impl ToString) -> Self {
        tracing::error!(error = %message.to_string(), "operation failed");
        Self {
            status: 500,
            code: "INTERNAL_ERROR",
            message: "Storage or processing failed; no event was acknowledged. Check backend logs."
                .into(),
        }
    }
}
impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}: {}", self.code, self.message)
    }
}
impl std::error::Error for ApiError {}
impl From<rusqlite::Error> for ApiError {
    fn from(e: rusqlite::Error) -> Self {
        Self::internal(e)
    }
}
impl From<serde_json::Error> for ApiError {
    fn from(e: serde_json::Error) -> Self {
        Self::internal(e)
    }
}
