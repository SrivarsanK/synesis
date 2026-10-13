use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ImportFormat {
    BankStatement,
    UpiExport,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    Debit,
    Credit,
    SelfTransfer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimestampPrecision {
    Date,
    Minute,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NormalizedTransaction {
    pub transaction_id: String,
    pub timestamp: String, // ISO-8601 UTC (e.g. "2025-07-15T00:00:00Z")
    pub direction: Direction,
    pub amount_minor: i64, // paise
    pub amount_inr: f64,
    pub description: String,
    pub counterparty: Option<String>,
    pub balance_after_minor: Option<i64>,
    pub balance_after_inr: Option<f64>,
    pub account_id: Option<String>,
    pub source_format: ImportFormat,
    pub timestamp_precision: TimestampPrecision,
    pub source_row: usize,
    pub raw_particulars: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start: String,
    pub end: String,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DirectionCounts {
    pub debit: usize,
    pub credit: usize,
    pub self_transfer: usize,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct StatementMetadata {
    pub account_holder: Option<String>,
    pub account_number_masked: Option<String>,
    pub bank_name: Option<String>,
    pub statement_period: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportPreview {
    pub format: ImportFormat,
    pub header_line: usize,
    pub total_rows: usize,
    pub valid_transactions: usize,
    pub date_range: Option<DateRange>,
    pub direction_counts: DirectionCounts,
    pub total_debit_inr: f64,
    pub total_credit_inr: f64,
    pub missing_fields_summary: Vec<String>,
    pub metadata: Option<StatementMetadata>,
    pub preview_rows: Vec<NormalizedTransaction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalAnomaly {
    pub anomaly_type: String,
    pub severity: String, // "low" | "medium" | "high"
    pub title: String,
    pub description: String,
    pub transaction_ids: Vec<String>,
    pub metric_observed: String,
    pub threshold: String,
    pub date: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CounterpartyStat {
    pub counterparty: String,
    pub transaction_count: usize,
    pub total_amount_inr: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DailyStat {
    pub date: String,
    pub transaction_count: usize,
    pub total_debit_inr: f64,
    pub total_credit_inr: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalysisSummary {
    pub total_transactions: usize,
    pub debit_count: usize,
    pub credit_count: usize,
    pub self_transfer_count: usize,
    pub total_debit_inr: f64,
    pub total_credit_inr: f64,
    pub net_flow_inr: f64,
    pub average_debit_inr: f64,
    pub max_debit_inr: f64,
    pub min_balance_inr: Option<f64>,
    pub max_balance_inr: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PersonalAnalysis {
    pub format: ImportFormat,
    pub valid_transactions: usize,
    pub date_range: Option<DateRange>,
    pub summary: AnalysisSummary,
    pub anomalies: Vec<PersonalAnomaly>,
    pub top_counterparties: Vec<CounterpartyStat>,
    pub daily_activity: Vec<DailyStat>,
    pub limitations: String,
}
