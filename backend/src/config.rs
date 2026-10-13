#[derive(Clone, Debug)]
pub struct DetectorConfig {
    pub inflow_window_seconds: i64,
    pub pass_through_window_seconds: i64,
    pub distinct_sources_min: usize,
    pub flow_ratio_min: f64,
    pub baseline_min_history_events: u64,
    pub case_cooldown_seconds: i64,
    pub risk_verify_threshold: u8,
    pub risk_escalate_threshold: u8,
    pub settlement_min_repeats: usize,
    pub settlement_mitigation_points: f64,
    pub baseline_amount_minor: i64,
    pub baseline_activity_count: usize,
}
impl Default for DetectorConfig {
    fn default() -> Self {
        Self {
            inflow_window_seconds: 900,
            pass_through_window_seconds: 600,
            distinct_sources_min: 3,
            flow_ratio_min: 0.8,
            baseline_min_history_events: 10,
            case_cooldown_seconds: 900,
            risk_verify_threshold: 35,
            risk_escalate_threshold: 70,
            settlement_min_repeats: 3,
            settlement_mitigation_points: 30.0,
            baseline_amount_minor: 8_000_000,
            baseline_activity_count: 6,
        }
    }
}
