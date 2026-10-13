use crate::types::{ApiError, Transaction};
use std::{fs, path::PathBuf};
pub const DEMO_SCENARIOS: &[&str] = &[
    "mule_fan_in_pass_through",
    "merchant_legitimate",
    "ordinary",
    "large_legitimate",
    "insufficient_history",
    "incomplete_fan_in",
    "mule_staggered",
];
pub fn root() -> PathBuf {
    std::env::var_os("BLINDSPOT_FIXTURES_PATH")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../fixtures"))
}
pub fn read_events(path: impl AsRef<std::path::Path>) -> Result<Vec<Transaction>, ApiError> {
    let text = fs::read_to_string(path).map_err(ApiError::internal)?;
    text.lines()
        .filter(|s| !s.trim().is_empty())
        .map(|s| serde_json::from_str(s).map_err(ApiError::from))
        .collect()
}
pub fn load_demo(name: &str) -> Result<(Vec<Transaction>, Vec<Transaction>), ApiError> {
    if !DEMO_SCENARIOS.contains(&name) {
        return Err(ApiError::bad(
            "UNKNOWN_SCENARIO",
            "Select a documented synthetic scenario",
        ));
    }
    let history_path = root().join(format!("{name}.history.jsonl"));
    let history = if history_path.exists() {
        read_events(history_path)?
    } else {
        vec![]
    };
    Ok((history, read_events(root().join(format!("{name}.jsonl")))?))
}
