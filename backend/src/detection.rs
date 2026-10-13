use crate::{
    config::DetectorConfig,
    types::{ApiError, Case, Transaction},
};
use serde_json::json;
use std::collections::{BTreeSet, HashMap, VecDeque};

#[derive(Clone, Default)]
pub struct Account {
    recent: VecDeque<(i64, Transaction)>,
    history_count: u64,
    history_sum: i128,
    recipients: HashMap<String, Vec<(String, i64)>>,
}
#[derive(Clone, Default)]
pub struct Detection {
    pub config: DetectorConfig,
    accounts: HashMap<String, Account>,
    pub cases: Vec<Case>,
    pub last_time: Option<i64>,
}
impl Account {
    // Only events strictly older than the complete candidate window enter the
    // reference history. The current burst cannot normalize its own baseline.
    fn expire(&mut self, cutoff: i64, account: &str) {
        while self.recent.front().is_some_and(|(t, _)| *t < cutoff) {
            if let Some((_, tx)) = self.recent.pop_front() {
                self.history_count += 1;
                self.history_sum += i128::from(tx.amount_minor);
                if tx.source_account_id == account {
                    self.recipients
                        .entry(tx.destination_account_id)
                        .or_default()
                        .push((tx.transaction_id, tx.amount_minor));
                }
            }
        }
    }
}
impl Detection {
    pub fn apply(&mut self, tx: &Transaction, now: i64) -> Result<Vec<String>, ApiError> {
        let cfg = &self.config;
        for id in [&tx.source_account_id, &tx.destination_account_id] {
            self.accounts
                .entry(id.clone())
                .or_default()
                .expire(now - cfg.inflow_window_seconds * 1000, id);
        }
        let sender = self
            .accounts
            .get(&tx.source_account_id)
            .expect("inserted sender");
        let incoming: Vec<_> = sender
            .recent
            .iter()
            .filter(|(_, e)| e.destination_account_id == tx.source_account_id)
            .collect();
        let sources: BTreeSet<_> = incoming.iter().map(|(_, e)| &e.source_account_id).collect();
        let eligible: Vec<_> = incoming
            .iter()
            .copied()
            .filter(|(t, _)| *t >= now - cfg.pass_through_window_seconds * 1000)
            .collect();
        let mut changed = vec![];
        if sources.len() >= cfg.distinct_sources_min && !eligible.is_empty() {
            let start = eligible[0].0;
            let mut outward: Vec<_> = sender
                .recent
                .iter()
                .skip_while(|(_, e)| e.transaction_id != eligible[0].1.transaction_id)
                .filter(|(_, e)| e.source_account_id == tx.source_account_id)
                .map(|(_, e)| e)
                .collect();
            outward.push(tx);
            let in_sum: i128 = eligible
                .iter()
                .map(|(_, e)| i128::from(e.amount_minor))
                .sum();
            let out_sum: i128 = outward.iter().map(|e| i128::from(e.amount_minor)).sum();
            let ratio = (out_sum as f64 / in_sum as f64).clamp(0.0, 1.0);
            if ratio >= cfg.flow_ratio_min {
                let enough = sender.history_count >= cfg.baseline_min_history_events;
                let prior = sender.recipients.get(&tx.destination_account_id);
                let novelty = enough
                    && prior.is_none()
                    && !sender.recent.iter().any(|(_, e)| {
                        e.source_account_id == tx.source_account_id
                            && e.destination_account_id == tx.destination_account_id
                    });
                let historic_mean = if enough {
                    sender.history_sum as f64 / sender.history_count as f64
                } else {
                    0.0
                };
                let recent_mean = in_sum as f64 / eligible.len() as f64;
                // Validation-frozen volume deviation: twice prior mean saturates.
                let history = if enough {
                    ((recent_mean / historic_mean) - 1.0).clamp(0.0, 1.0)
                } else {
                    0.0
                };
                let repeat = prior
                    .map(|events| {
                        events
                            .iter()
                            .filter(|(_, amount)| {
                                let relative = tx.amount_minor as f64 / *amount as f64;
                                (0.5..=1.5).contains(&relative)
                            })
                            .collect::<Vec<_>>()
                    })
                    .unwrap_or_default();
                let settlement = enough && repeat.len() >= cfg.settlement_min_repeats;
                let mitigation = if settlement {
                    cfg.settlement_mitigation_points
                } else {
                    0.0
                };
                let raw = 100.0
                    * (0.35
                        + 0.30 * (ratio / cfg.flow_ratio_min).min(1.0)
                        + 0.20 * history
                        + 0.15 * f64::from(novelty));
                let score = (raw - mitigation).round().clamp(0.0, 100.0) as u8;
                let inflow_ids: Vec<_> = incoming
                    .iter()
                    .map(|(_, e)| e.transaction_id.clone())
                    .collect();
                let mut evidence: Vec<String> = incoming
                    .iter()
                    .map(|(_, e)| e.transaction_id.clone())
                    .collect();
                evidence.extend(outward.iter().map(|e| e.transaction_id.clone()));
                let mut reasons = vec![
                    json!({"code":"MULTI_SOURCE_INFLOW","observed":sources.len(),"threshold":cfg.distinct_sources_min,"window_seconds":cfg.inflow_window_seconds,"transaction_ids":inflow_ids}),
                    json!({"code":"RAPID_OUTFLOW","observed_seconds":(now-start) as f64 /1000.0,"threshold_seconds":cfg.pass_through_window_seconds,"transaction_ids":[eligible[0].1.transaction_id,tx.transaction_id]}),
                    json!({"code":"HIGH_FLOW_THROUGH","observed_ratio":ratio,"threshold_ratio":cfg.flow_ratio_min,"transaction_ids":eligible.iter().map(|(_,e)|e.transaction_id.clone()).chain(outward.iter().map(|e|e.transaction_id.clone())).collect::<Vec<_>>()}),
                ];
                if !enough {
                    reasons.push(json!({"code":"INSUFFICIENT_HISTORY","observed":sender.history_count,"threshold":cfg.baseline_min_history_events,"transaction_ids":[tx.transaction_id]}));
                    reasons.push(json!({"code":"UNKNOWN_RECIPIENT_HISTORY","transaction_ids":[tx.transaction_id]}));
                } else if novelty {
                    reasons.push(json!({"code":"NEW_DESTINATION","observed":true,"transaction_ids":[tx.transaction_id]}));
                }
                if enough {
                    reasons.push(json!({"code":"HISTORICAL_VOLUME_DEVIATION","observed":history,"prior_mean_amount_minor":historic_mean,"recent_mean_amount_minor":recent_mean,"transaction_ids":eligible.iter().map(|(_,e)|e.transaction_id.clone()).collect::<Vec<_>>()}));
                }
                if settlement {
                    let ids: Vec<_> = repeat.iter().map(|(id, _)| id.clone()).collect();
                    evidence.extend(ids.clone());
                    reasons.push(json!({"code":"ESTABLISHED_SETTLEMENT","observed":repeat.len(),"mitigation_points":mitigation,"transaction_ids":ids}));
                    reasons.push(json!({"code":"REPEATED_PAYMENT_PATTERN","observed":repeat.len(),"transaction_ids":ids}));
                }
                if out_sum > in_sum {
                    reasons.push(json!({"code":"FLOW_RATIO_CLAMPED","observed":true,"transaction_ids":outward.iter().map(|e|e.transaction_id.clone()).collect::<Vec<_>>()}));
                }
                if score >= cfg.risk_verify_threshold {
                    let existing = self.cases.iter().rposition(|c| {
                        c.subject_account_id == tx.source_account_id
                            && chrono::DateTime::parse_from_rfc3339(&c.updated_at).is_ok_and(|t| {
                                now - t.timestamp_millis() <= cfg.case_cooldown_seconds * 1000
                            })
                    });
                    let index = existing.unwrap_or_else(|| {
                        self.cases.push(Case {
                            case_id: format!("case-{:06}", self.cases.len() + 1),
                            subject_account_id: tx.source_account_id.clone(),
                            title: "Potential rapid pass-through network".into(),
                            status: "open".into(),
                            risk_score: score,
                            severity: String::new(),
                            recommended_action: String::new(),
                            reason_codes: vec![],
                            transaction_ids: vec![],
                            account_ids: vec![],
                            created_at: tx.timestamp.clone(),
                            updated_at: tx.timestamp.clone(),
                            data_source: "synthetic".into(),
                        });
                        self.cases.len() - 1
                    });
                    let case = &mut self.cases[index];
                    for id in evidence {
                        if !case.transaction_ids.contains(&id) {
                            case.transaction_ids.push(id);
                        }
                    }
                    case.risk_score = score;
                    case.severity = if score >= cfg.risk_escalate_threshold {
                        "high"
                    } else {
                        "medium"
                    }
                    .into();
                    case.recommended_action = if score >= cfg.risk_escalate_threshold {
                        "escalate_for_review"
                    } else {
                        "monitor_or_verify"
                    }
                    .into();
                    case.reason_codes = reasons;
                    case.updated_at = tx.timestamp.clone();
                    changed.push(case.case_id.clone());
                }
            }
        }
        for id in [&tx.source_account_id, &tx.destination_account_id] {
            self.accounts
                .get_mut(id)
                .expect("inserted account")
                .recent
                .push_back((now, tx.clone()));
        }
        self.last_time = Some(now);
        Ok(changed)
    }
}
