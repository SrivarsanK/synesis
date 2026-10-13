use super::normalize::{Direction, ImportFormat, NormalizedTransaction, TimestampPrecision};
use crate::types::ApiError;
use chrono::{NaiveDate, NaiveTime};

pub fn parse_upi_export(
    content: &str,
    header_line_index: usize,
) -> Result<Vec<NormalizedTransaction>, ApiError> {
    let lines: Vec<&str> = content.lines().collect();
    if header_line_index >= lines.len() {
        return Err(ApiError::bad(
            "INVALID_UPI_EXPORT",
            "Header line index out of bounds",
        ));
    }

    let table_content = lines[header_line_index..].join("\n");
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(table_content.as_bytes());

    let headers = rdr.headers().map_err(|e| {
        ApiError::bad(
            "INVALID_CSV_HEADERS",
            &format!("Failed to parse UPI export headers: {e}"),
        )
    })?;

    // Map column names
    let mut date_col = None;
    let mut time_col = None;
    let mut type_col = None;
    let mut counterparty_col = None;
    let mut desc_col = None;
    let mut account_col = None;
    let mut amount_col = None;
    let mut upi_id_col = None;
    let mut _note_col = None;

    for (i, h) in headers.iter().enumerate() {
        let lower = h.trim().to_ascii_lowercase();
        if lower == "date" {
            date_col = Some(i);
        } else if lower == "time" {
            time_col = Some(i);
        } else if lower.contains("type") || lower.contains("transaction_type") {
            type_col = Some(i);
        } else if lower.contains("counterparty") {
            counterparty_col = Some(i);
        } else if lower.contains("description") {
            desc_col = Some(i);
        } else if lower == "account" {
            account_col = Some(i);
        } else if lower.contains("amount") {
            amount_col = Some(i);
        } else if lower.contains("upi")
            || lower.contains("transaction_id")
            || lower.contains("reference")
        {
            upi_id_col = Some(i);
        } else if lower.contains("note") {
            _note_col = Some(i);
        }
    }

    let date_idx = date_col
        .ok_or_else(|| ApiError::bad("MISSING_COLUMN", "UPI export missing 'date' column"))?;
    let amount_idx = amount_col
        .ok_or_else(|| ApiError::bad("MISSING_COLUMN", "UPI export missing 'amount' column"))?;

    let mut transactions = Vec::new();
    let mut row_num = header_line_index + 1;

    for result in rdr.records() {
        row_num += 1;
        let record = match result {
            Ok(rec) => rec,
            Err(_) => continue,
        };

        let date_raw = record.get(date_idx).unwrap_or("").trim();
        if date_raw.is_empty() {
            continue;
        }

        let parsed_date = match parse_upi_date(date_raw) {
            Some(d) => d,
            None => continue,
        };

        let time_raw = time_col.and_then(|i| record.get(i)).unwrap_or("").trim();
        let (timestamp, precision) = if !time_raw.is_empty() {
            if let Some(t) = parse_upi_time(time_raw) {
                (
                    format!(
                        "{}T{}Z",
                        parsed_date.format("%Y-%m-%d"),
                        t.format("%H:%M:%S")
                    ),
                    TimestampPrecision::Minute,
                )
            } else {
                (
                    format!("{}T00:00:00Z", parsed_date.format("%Y-%m-%d")),
                    TimestampPrecision::Date,
                )
            }
        } else {
            (
                format!("{}T00:00:00Z", parsed_date.format("%Y-%m-%d")),
                TimestampPrecision::Date,
            )
        };

        let type_raw = type_col
            .and_then(|i| record.get(i))
            .unwrap_or("debit")
            .trim()
            .to_ascii_lowercase();
        let direction = match type_raw.as_str() {
            "credit" => Direction::Credit,
            "self" | "self_transfer" | "self transfer" => Direction::SelfTransfer,
            _ => Direction::Debit,
        };

        let amount_raw = record.get(amount_idx).unwrap_or("").trim();
        let amount_minor = match parse_amount_minor(amount_raw) {
            Some(a) if a > 0 => a,
            _ => continue,
        };

        let counterparty = counterparty_col
            .and_then(|i| record.get(i))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let description = desc_col
            .and_then(|i| record.get(i))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| {
                counterparty
                    .clone()
                    .unwrap_or_else(|| "UPI Transfer".to_string())
            });

        let account_id = account_col
            .and_then(|i| record.get(i))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let upi_id = upi_id_col
            .and_then(|i| record.get(i))
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| format!("upi-{:04}", row_num));

        transactions.push(NormalizedTransaction {
            transaction_id: upi_id,
            timestamp,
            direction,
            amount_minor,
            amount_inr: amount_minor as f64 / 100.0,
            description,
            counterparty,
            balance_after_minor: None,
            balance_after_inr: None,
            account_id,
            source_format: ImportFormat::UpiExport,
            timestamp_precision: precision,
            source_row: row_num,
            raw_particulars: None,
        });
    }

    Ok(transactions)
}

fn parse_upi_date(s: &str) -> Option<NaiveDate> {
    let s = s.trim();
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(d);
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d-%m-%Y") {
        return Some(d);
    }
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d/%m/%Y") {
        return Some(d);
    }
    None
}

fn parse_upi_time(s: &str) -> Option<NaiveTime> {
    let s = s.trim();
    if let Ok(t) = NaiveTime::parse_from_str(s, "%H:%M:%S") {
        return Some(t);
    }
    if let Ok(t) = NaiveTime::parse_from_str(s, "%H:%M") {
        return Some(t);
    }
    if let Ok(t) = NaiveTime::parse_from_str(s, "%I:%M %p") {
        return Some(t);
    }
    if let Ok(t) = NaiveTime::parse_from_str(s, "%I:%M:%S %p") {
        return Some(t);
    }
    None
}

fn parse_amount_minor(s: &str) -> Option<i64> {
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    if cleaned.is_empty() {
        return None;
    }
    let parts: Vec<&str> = cleaned.split('.').collect();
    let integer: i64 = parts[0].parse().ok()?;
    let cents: i64 = match parts.get(1) {
        Some(fraction) => {
            let padded = format!("{:0<2}", fraction);
            padded[..2].parse().ok()?
        }
        None => 0,
    };
    Some(integer * 100 + cents)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_upi_export() {
        let csv = r#"date,time,transaction_type,counterparty,description,account,amount_inr,upi_transaction_id,note
2025-10-12,14:32:00,debit,Swiggy,Lunch,HDFC A/c 1234,450.00,UPI52341234,Food
2025-10-12,,credit,Refund,Swiggy Refund,HDFC A/c 1234,50.00,UPI52341235,Refund
2025-10-13,09:15:00,self_transfer,Own Account,Savings Transfer,SBI A/c 9999,5000.00,UPI52341236,Transfer
"#;
        let txs = parse_upi_export(csv, 0).unwrap();
        assert_eq!(txs.len(), 3);
        assert_eq!(txs[0].direction, Direction::Debit);
        assert_eq!(txs[0].amount_minor, 45000);
        assert_eq!(txs[0].timestamp_precision, TimestampPrecision::Minute);
        assert_eq!(txs[0].timestamp, "2025-10-12T14:32:00Z");
        assert_eq!(txs[1].direction, Direction::Credit);
        assert_eq!(txs[1].timestamp_precision, TimestampPrecision::Date);
        assert_eq!(txs[1].timestamp, "2025-10-12T00:00:00Z");
        assert_eq!(txs[2].direction, Direction::SelfTransfer);
        assert_eq!(txs[2].amount_minor, 500000);
    }
}
