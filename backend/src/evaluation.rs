use crate::{config::DetectorConfig, fixtures, store::Engine, types::ApiError};
use serde::Deserialize;
use serde_json::{json, Value};
use std::{
    collections::{HashMap, HashSet, VecDeque},
    fs,
    time::Instant,
};

#[derive(Deserialize)]
struct Label {
    label: String,
    expected_account_ids: Vec<String>,
}
#[derive(Default)]
struct Counts {
    tp: usize,
    fp: usize,
    fn_: usize,
    tn: usize,
    latencies: Vec<f64>,
    monitor_scenarios: usize,
}
impl Counts {
    fn record(&mut self, truth: bool, predicted: bool) {
        match (truth, predicted) {
            (true, true) => self.tp += 1,
            (false, true) => self.fp += 1,
            (true, false) => self.fn_ += 1,
            (false, false) => self.tn += 1,
        }
    }
    fn value(&mut self) -> Value {
        self.latencies.sort_by(f64::total_cmp);
        let rate = |a: usize, b: usize| {
            if b == 0 {
                None
            } else {
                Some(a as f64 / b as f64)
            }
        };
        let percentile = |p: f64| {
            self.latencies
                .get(((self.latencies.len() as f64 * p).ceil() as usize).saturating_sub(1))
                .copied()
        };
        json!({"tp":self.tp,"fp":self.fp,"fn":self.fn_,"tn":self.tn,"precision":rate(self.tp,self.tp+self.fp),"recall":rate(self.tp,self.tp+self.fn_),"false_positive_rate":rate(self.fp,self.fp+self.tn),"sampled_event_count":self.latencies.len(),"latency_p50_ms":percentile(0.5),"latency_p95_ms":percentile(0.95),"monitor_scenario_count":self.monitor_scenarios})
    }
}
pub fn evaluate() -> Result<Value, ApiError> {
    let mut paths = fs::read_dir(fixtures::root().join("held_out"))
        .map_err(ApiError::internal)?
        .map(|e| e.map(|v| v.path()))
        .collect::<Result<Vec<_>, _>>()
        .map_err(ApiError::internal)?;
    paths.retain(|p| p.extension().is_some_and(|x| x == "jsonl"));
    paths.sort();
    if paths.is_empty() {
        return Err(ApiError::internal("No held-out fixtures"));
    }
    let cfg = DetectorConfig::default();
    let mut baseline = Counts::default();
    let mut blindspot = Counts::default();
    let mut reports = vec![];
    for path in &paths {
        let name = path
            .file_stem()
            .and_then(|s| s.to_str())
            .ok_or_else(|| ApiError::internal("Invalid fixture name"))?;
        let label: Label = serde_json::from_str(
            &fs::read_to_string(
                fixtures::root()
                    .join("labels/held_out")
                    .join(format!("{name}.json")),
            )
            .map_err(ApiError::internal)?,
        )?;
        let events = fixtures::read_events(path)?;
        let mut model = Engine::memory()?;
        let mut simple = Engine::memory()?;
        // Same validation/idempotency/order/persistence pipeline; disable only
        // graph candidate creation for the fixed independent baseline.
        simple.detection.config.distinct_sources_min = usize::MAX;
        let mut activity: HashMap<String, VecDeque<i64>> = HashMap::new();
        let mut baseline_high = HashSet::new();
        let mut model_high = HashSet::new();
        let mut monitored = false;
        for event in events {
            let timer = Instant::now();
            let accepted = simple.ingest_transaction(event.clone())?;
            if !accepted.duplicate {
                let now = event.epoch()?;
                for id in [&event.source_account_id, &event.destination_account_id] {
                    let queue = activity.entry(id.clone()).or_default();
                    while queue
                        .front()
                        .is_some_and(|t| *t < now - cfg.inflow_window_seconds * 1000)
                    {
                        queue.pop_front();
                    }
                    queue.push_back(now);
                    if event.amount_minor >= cfg.baseline_amount_minor
                        || queue.len() >= cfg.baseline_activity_count
                    {
                        baseline_high.insert(id.clone());
                    }
                }
                baseline
                    .latencies
                    .push(timer.elapsed().as_secs_f64() * 1000.0);
            }
            let timer = Instant::now();
            let result = model.ingest_transaction(event)?;
            if !result.duplicate {
                blindspot
                    .latencies
                    .push(timer.elapsed().as_secs_f64() * 1000.0);
                // Count any escalation in the observation horizon, including a
                // case whose recommendation later changes as evidence arrives.
                for case in model
                    .detection
                    .cases
                    .iter()
                    .filter(|c| result.case_ids_updated.contains(&c.case_id))
                {
                    if case.risk_score >= cfg.risk_escalate_threshold {
                        model_high.insert(case.subject_account_id.clone());
                    }
                    monitored |= case.severity == "medium";
                }
            }
        }
        let suspicious = label.label == "suspicious";
        let b = baseline_high
            .iter()
            .any(|id| !suspicious || label.expected_account_ids.contains(id));
        let m = model_high
            .iter()
            .any(|id| !suspicious || label.expected_account_ids.contains(id));
        if monitored {
            blindspot.monitor_scenarios += 1;
        }
        baseline.record(suspicious, b);
        blindspot.record(suspicious, m);
        reports.push(json!({"scenario":name,"label":label.label,"baseline_escalated":b,"blindspot_escalated":m,"case_count":model.detection.cases.len(),"monitor_or_verify":monitored}));
    }
    Ok(
        json!({"available":true,"dataset":"held_out_synthetic_v1","evaluation_unit":"scenario","scenario_count":paths.len(),"evaluated_at":chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis,true),"baseline":baseline.value(),"blindspot":blindspot.value(),"scenarios":reports,"timing_scope":"accepted event validation, decision and in-memory SQLite commit; excludes HTTP, UI and fixture loading","limitations":"24 hand-designed synthetic networks; related templates; no real-world accuracy claim"}),
    )
}
