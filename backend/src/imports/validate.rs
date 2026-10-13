use super::normalize::{
    AnalysisSummary, CounterpartyStat, DailyStat, DateRange, Direction, DirectionCounts,
    ImportFormat, ImportPreview, NormalizedTransaction, PersonalAnalysis, PersonalAnomaly,
    StatementMetadata, TimestampPrecision,
};
use std::collections::HashMap;

pub fn generate_preview(
    format: ImportFormat,
    header_line: usize,
    total_lines: usize,
    transactions: &[NormalizedTransaction],
    metadata: Option<StatementMetadata>,
) -> ImportPreview {
    let mut dir_counts = DirectionCounts::default();
    let mut total_debit = 0.0;
    let mut total_credit = 0.0;
    let mut missing_time_count = 0;
    let mut missing_counterparty_count = 0;

    let mut min_date: Option<&str> = None;
    let mut max_date: Option<&str> = None;

    for tx in transactions {
        match tx.direction {
            Direction::Debit => {
                dir_counts.debit += 1;
                total_debit += tx.amount_inr;
            }
            Direction::Credit => {
                dir_counts.credit += 1;
                total_credit += tx.amount_inr;
            }
            Direction::SelfTransfer => {
                dir_counts.self_transfer += 1;
            }
        }

        if tx.timestamp_precision == TimestampPrecision::Date {
            missing_time_count += 1;
        }
        if tx.counterparty.is_none() {
            missing_counterparty_count += 1;
        }

        let date_part = tx.timestamp.split('T').next().unwrap_or(&tx.timestamp);
        min_date = Some(match min_date {
            Some(cur) => cur.min(date_part),
            None => date_part,
        });
        max_date = Some(match max_date {
            Some(cur) => cur.max(date_part),
            None => date_part,
        });
    }

    let mut missing_fields = Vec::new();
    if missing_time_count > 0 {
        missing_fields.push(format!(
            "{} transaction(s) have date-only timestamp precision without time-of-day component",
            missing_time_count
        ));
    }
    if missing_counterparty_count > 0 {
        missing_fields.push(format!(
            "{} transaction(s) have unparsed or missing counterparty entity",
            missing_counterparty_count
        ));
    }

    let date_range = match (min_date, max_date) {
        (Some(start), Some(end)) => Some(DateRange {
            start: start.to_string(),
            end: end.to_string(),
        }),
        _ => None,
    };

    let preview_rows: Vec<NormalizedTransaction> = transactions.iter().take(10).cloned().collect();

    ImportPreview {
        format,
        header_line,
        total_rows: total_lines.saturating_sub(header_line),
        valid_transactions: transactions.len(),
        date_range,
        direction_counts: dir_counts,
        total_debit_inr: (total_debit * 100.0).round() / 100.0,
        total_credit_inr: (total_credit * 100.0).round() / 100.0,
        missing_fields_summary: missing_fields,
        metadata,
        preview_rows,
    }
}

pub fn analyze_transactions(
    format: ImportFormat,
    transactions: &[NormalizedTransaction],
) -> PersonalAnalysis {
    let mut debit_count = 0;
    let mut credit_count = 0;
    let mut self_transfer_count = 0;
    let mut total_debit = 0.0;
    let mut total_credit = 0.0;
    let mut max_debit = 0.0;
    let mut min_balance: Option<f64> = None;
    let mut max_balance: Option<f64> = None;

    let mut min_date: Option<&str> = None;
    let mut max_date: Option<&str> = None;

    // Daily grouping
    let mut daily_map: HashMap<String, (usize, f64, f64)> = HashMap::new();
    // Counterparty grouping
    let mut counterparty_map: HashMap<String, (usize, f64)> = HashMap::new();

    for tx in transactions {
        let date_part = tx.timestamp.split('T').next().unwrap_or(&tx.timestamp);
        min_date = Some(match min_date {
            Some(cur) => cur.min(date_part),
            None => date_part,
        });
        max_date = Some(match max_date {
            Some(cur) => cur.max(date_part),
            None => date_part,
        });

        let day_entry = daily_map.entry(date_part.to_string()).or_insert((0, 0.0, 0.0));
        day_entry.0 += 1;

        match tx.direction {
            Direction::Debit => {
                debit_count += 1;
                total_debit += tx.amount_inr;
                day_entry.1 += tx.amount_inr;
                if tx.amount_inr > max_debit {
                    max_debit = tx.amount_inr;
                }
            }
            Direction::Credit => {
                credit_count += 1;
                total_credit += tx.amount_inr;
                day_entry.2 += tx.amount_inr;
            }
            Direction::SelfTransfer => {
                self_transfer_count += 1;
            }
        }

        if let Some(bal) = tx.balance_after_inr {
            min_balance = Some(min_balance.map_or(bal, |b| b.min(bal)));
            max_balance = Some(max_balance.map_or(bal, |b| b.max(bal)));
        }

        if let Some(cp) = &tx.counterparty {
            let cp_entry = counterparty_map.entry(cp.clone()).or_insert((0, 0.0));
            cp_entry.0 += 1;
            cp_entry.1 += tx.amount_inr;
        }
    }

    let avg_debit = if debit_count > 0 {
        total_debit / debit_count as f64
    } else {
        0.0
    };

    // Build anomalies
    let mut anomalies = Vec::new();

    // 1. Unusually large debits (> 3.0x historical debit average or > Rs. 5,000)
    let large_cutoff = (avg_debit * 3.0).max(1200.0);
    for tx in transactions {
        if tx.direction == Direction::Debit && tx.amount_inr >= large_cutoff {
            anomalies.push(PersonalAnomaly {
                anomaly_type: "UNUSUALLY_LARGE_TRANSACTION".to_string(),
                severity: if tx.amount_inr >= 25000.0 {
                    "high"
                } else if tx.amount_inr >= 5000.0 {
                    "medium"
                } else {
                    "low"
                }
                .to_string(),
                title: format!("Unusually large debit: ₹{:.2}", tx.amount_inr),
                description: format!(
                    "Debit of ₹{:.2} to '{}' exceeds account historical average (₹{:.2}) by {:.1}x",
                    tx.amount_inr,
                    tx.counterparty.as_deref().unwrap_or(&tx.description),
                    avg_debit,
                    tx.amount_inr / avg_debit.max(1.0)
                ),
                transaction_ids: vec![tx.transaction_id.clone()],
                metric_observed: format!("₹{:.2}", tx.amount_inr),
                threshold: format!("₹{:.2} (3.0x mean)", large_cutoff),
                date: Some(tx.timestamp.clone()),
            });
        }
    }

    // 2. Daily velocity spikes (>= 4 txs or daily debit >= 2.5x mean daily volume)
    let avg_daily_vol = if !daily_map.is_empty() {
        total_debit / daily_map.len() as f64
    } else {
        0.0
    };
    for (day, (count, debit_vol, _)) in &daily_map {
        if *count >= 4 || (*debit_vol >= avg_daily_vol * 2.5 && *debit_vol >= 2000.0) {
            let matching_ids: Vec<String> = transactions
                .iter()
                .filter(|t| t.timestamp.starts_with(day))
                .map(|t| t.transaction_id.clone())
                .take(6)
                .collect();

            anomalies.push(PersonalAnomaly {
                anomaly_type: "DAILY_VELOCITY_SPIKE".to_string(),
                severity: if *count >= 8 { "high" } else { "medium" }.to_string(),
                title: format!("Activity spike on {}", day),
                description: format!(
                    "{} transactions totaling ₹{:.2} on {} (baseline daily average is {:.1} txs / ₹{:.2})",
                    count,
                    debit_vol,
                    day,
                    transactions.len() as f64 / daily_map.len().max(1) as f64,
                    avg_daily_vol
                ),
                transaction_ids: matching_ids,
                metric_observed: format!("{} txs / ₹{:.2}", count, debit_vol),
                threshold: format!("4 txs or ₹{:.2}", avg_daily_vol * 2.5),
                date: Some(day.clone()),
            });
        }
    }

    // 3. Repeated payments to same counterparty (>= 3 on same date or high volume)
    let mut cp_daily: HashMap<(String, String), Vec<String>> = HashMap::new();
    for tx in transactions {
        if let Some(cp) = &tx.counterparty {
            let day = tx.timestamp.split('T').next().unwrap_or("").to_string();
            cp_daily
                .entry((cp.clone(), day))
                .or_default()
                .push(tx.transaction_id.clone());
        }
    }
    for ((cp, day), ids) in cp_daily {
        if ids.len() >= 3 {
            anomalies.push(PersonalAnomaly {
                anomaly_type: "REPEATED_COUNTERPARTY_BURST".to_string(),
                severity: "medium".to_string(),
                title: format!("{} transfers to {} on {}", ids.len(), cp, day),
                description: format!(
                    "Observed rapid clustering of {} transfers to beneficiary '{}' within a single day",
                    ids.len(),
                    cp
                ),
                transaction_ids: ids,
                metric_observed: "Repeated intraday burst".to_string(),
                threshold: ">= 3 transfers/day".to_string(),
                date: Some(day),
            });
        }
    }

    // 4. Balance-related anomalies (for Bank Statements)
    if format == ImportFormat::BankStatement {
        // Look for balance drops below minimum or rapid drain
        for window in transactions.windows(2) {
            let t1 = &window[0];
            let t2 = &window[1];
            if t1.direction == Direction::Credit
                && t2.direction == Direction::Debit
                && t1.amount_inr >= 15000.0
            {
                let ratio = t2.amount_inr / t1.amount_inr;
                if ratio >= 0.80 {
                    anomalies.push(PersonalAnomaly {
                        anomaly_type: "RAPID_BALANCE_DRAIN".to_string(),
                        severity: "medium".to_string(),
                        title: format!("Rapid deposit drain ({:.0}%)", ratio * 100.0),
                        description: format!(
                            "Credit of ₹{:.2} on {} was followed by outward debit of ₹{:.2} ({:.0}% flow-through)",
                            t1.amount_inr,
                            t1.timestamp.split('T').next().unwrap_or(""),
                            t2.amount_inr,
                            ratio * 100.0
                        ),
                        transaction_ids: vec![t1.transaction_id.clone(), t2.transaction_id.clone()],
                        metric_observed: format!("{:.1}% flow-through", ratio * 100.0),
                        threshold: ">= 80% drain".to_string(),
                        date: Some(t2.timestamp.clone()),
                    });
                }
            }
        }
    }

    // Sort counterparties by volume
    let mut top_cps: Vec<CounterpartyStat> = counterparty_map
        .into_iter()
        .map(|(cp, (count, amount))| CounterpartyStat {
            counterparty: cp,
            transaction_count: count,
            total_amount_inr: (amount * 100.0).round() / 100.0,
        })
        .collect();
    top_cps.sort_by(|a, b| b.total_amount_inr.total_cmp(&a.total_amount_inr));
    top_cps.truncate(15);

    // Sort daily stats chronologically
    let mut daily_stats: Vec<DailyStat> = daily_map
        .into_iter()
        .map(|(date, (count, debit, credit))| DailyStat {
            date,
            transaction_count: count,
            total_debit_inr: (debit * 100.0).round() / 100.0,
            total_credit_inr: (credit * 100.0).round() / 100.0,
        })
        .collect();
    daily_stats.sort_by(|a, b| a.date.cmp(&b.date));

    let date_range = match (min_date, max_date) {
        (Some(start), Some(end)) => Some(DateRange {
            start: start.to_string(),
            end: end.to_string(),
        }),
        _ => None,
    };

    PersonalAnalysis {
        format,
        valid_transactions: transactions.len(),
        date_range,
        summary: AnalysisSummary {
            total_transactions: transactions.len(),
            debit_count,
            credit_count,
            self_transfer_count,
            total_debit_inr: (total_debit * 100.0).round() / 100.0,
            total_credit_inr: (total_credit * 100.0).round() / 100.0,
            net_flow_inr: ((total_credit - total_debit) * 100.0).round() / 100.0,
            average_debit_inr: (avg_debit * 100.0).round() / 100.0,
            max_debit_inr: (max_debit * 100.0).round() / 100.0,
            min_balance_inr: min_balance.map(|b| (b * 100.0).round() / 100.0),
            max_balance_inr: max_balance.map(|b| (b * 100.0).round() / 100.0),
        },
        anomalies,
        top_counterparties: top_cps,
        daily_activity: daily_stats,
        limitations: "Personal Statement Analysis: Analyzes individual account statement exports for behavioral deviations and velocity spikes. This single-account view does not provide inter-bank network topology. Multi-account money-mule detection requires institutional multi-party transaction streams.".to_string(),
    }
}
