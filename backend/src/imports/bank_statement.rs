use super::normalize::{
    Direction, ImportFormat, NormalizedTransaction, StatementMetadata, TimestampPrecision,
};
use crate::types::ApiError;
use chrono::NaiveDate;

pub fn parse_bank_statement(
    content: &str,
    header_line_index: usize,
) -> Result<(Vec<NormalizedTransaction>, StatementMetadata), ApiError> {
    let lines: Vec<&str> = content.lines().collect();
    if header_line_index >= lines.len() {
        return Err(ApiError::bad(
            "INVALID_STATEMENT",
            "Header line index out of bounds",
        ));
    }

    // 1. Extract metadata before header
    let mut metadata = StatementMetadata::default();
    for line in &lines[..header_line_index] {
        let l = line.to_ascii_lowercase();
        if l.contains("account no") || l.contains("account number") || l.contains("a/c no") {
            let parts: Vec<&str> = line.split(&[':', ','][..]).collect();
            if let Some(val) = parts.get(1) {
                let digits: String = val.chars().filter(|c| c.is_ascii_digit()).collect();
                if digits.len() >= 4 {
                    let masked = format!("XXXX-XXXX-{}", &digits[digits.len() - 4..]);
                    metadata.account_number_masked = Some(masked);
                }
            }
        }
        if l.contains("customer name") || l.contains("account holder") || l.contains("name:") {
            let parts: Vec<&str> = line.split(&[':', ','][..]).collect();
            if let Some(val) = parts.get(1) {
                let name = val.trim();
                if !name.is_empty() {
                    metadata.account_holder = Some(name.to_string());
                }
            }
        }
        if l.contains("statement period") || l.contains("period:") {
            let parts: Vec<&str> = line.split(&[':', ','][..]).collect();
            if let Some(val) = parts.get(1) {
                let period = val.trim();
                if !period.is_empty() {
                    metadata.statement_period = Some(period.to_string());
                }
            }
        }
    }

    // 2. Parse table starting from header_line_index
    let table_content = lines[header_line_index..].join("\n");
    let mut rdr = csv::ReaderBuilder::new()
        .has_headers(true)
        .flexible(true)
        .trim(csv::Trim::All)
        .from_reader(table_content.as_bytes());

    let headers = rdr.headers().map_err(|e| {
        ApiError::bad(
            "INVALID_CSV_HEADERS",
            &format!("Failed to parse bank statement headers: {e}"),
        )
    })?;

    // Map column names to indices
    let mut tran_date_col = None;
    let mut _chqno_col = None;
    let mut particulars_col = None;
    let mut dr_col = None;
    let mut cr_col = None;
    let mut bal_col = None;
    let mut _sol_col = None;

    for (i, h) in headers.iter().enumerate() {
        let lower = h.trim().to_ascii_lowercase();
        if lower.contains("tran date") || lower.contains("date") {
            tran_date_col = Some(i);
        } else if lower.contains("chq") {
            _chqno_col = Some(i);
        } else if lower.contains("particular") || lower.contains("description") || lower.contains("narration") {
            particulars_col = Some(i);
        } else if lower == "dr" || lower.contains("debit") || lower.contains("withdrawal") {
            dr_col = Some(i);
        } else if lower == "cr" || lower.contains("credit") || lower.contains("deposit") {
            cr_col = Some(i);
        } else if lower.contains("bal") {
            bal_col = Some(i);
        } else if lower.contains("sol") || lower.contains("branch") {
            _sol_col = Some(i);
        }
    }

    let tran_date_idx = tran_date_col.ok_or_else(|| {
        ApiError::bad("MISSING_COLUMN", "Bank statement missing 'Tran Date' column")
    })?;
    let particulars_idx = particulars_col.ok_or_else(|| {
        ApiError::bad("MISSING_COLUMN", "Bank statement missing 'PARTICULARS' column")
    })?;

    let mut transactions = Vec::new();
    let mut row_num = header_line_index + 1; // 1-indexed

    for result in rdr.records() {
        row_num += 1;
        let record = match result {
            Ok(rec) => rec,
            Err(_) => continue,
        };

        let date_raw = record.get(tran_date_idx).unwrap_or("").trim();
        // Check for empty date or summary/footer markers
        let lower_date = date_raw.to_ascii_lowercase();
        if date_raw.is_empty()
            || lower_date.contains("total")
            || lower_date.contains("summary")
            || lower_date.contains("***")
            || lower_date.contains("closing")
            || lower_date.contains("opening")
            || lower_date.contains("generated")
        {
            continue;
        }

        let parsed_iso_date = match parse_bank_date(date_raw) {
            Some(d) => d,
            None => continue, // skip malformed date or footer text
        };

        let particulars = record.get(particulars_idx).unwrap_or("").trim();
        let dr_str = dr_col.and_then(|i| record.get(i)).unwrap_or("").trim();
        let cr_str = cr_col.and_then(|i| record.get(i)).unwrap_or("").trim();
        let bal_str = bal_col.and_then(|i| record.get(i)).unwrap_or("").trim();

        let dr_amount = parse_amount_minor(dr_str);
        let cr_amount = parse_amount_minor(cr_str);

        let (direction, amount_minor) = if let Some(amt) = dr_amount {
            if amt > 0 {
                (Direction::Debit, amt)
            } else if let Some(cr) = cr_amount {
                (Direction::Credit, cr)
            } else {
                continue;
            }
        } else if let Some(amt) = cr_amount {
            if amt > 0 {
                (Direction::Credit, amt)
            } else {
                continue;
            }
        } else {
            // Neither DR nor CR has an amount
            continue;
        };

        let bal_minor = parse_amount_minor(bal_str);
        let counterparty = extract_counterparty(particulars);
        let tx_id = format!("stmt-{:04}", row_num);

        transactions.push(NormalizedTransaction {
            transaction_id: tx_id,
            timestamp: parsed_iso_date,
            direction,
            amount_minor,
            amount_inr: amount_minor as f64 / 100.0,
            description: particulars.to_string(),
            counterparty,
            balance_after_minor: bal_minor,
            balance_after_inr: bal_minor.map(|b| b as f64 / 100.0),
            account_id: metadata.account_number_masked.clone(),
            source_format: ImportFormat::BankStatement,
            timestamp_precision: TimestampPrecision::Date,
            source_row: row_num,
            raw_particulars: Some(particulars.to_string()),
        });
    }

    Ok((transactions, metadata))
}

fn parse_bank_date(s: &str) -> Option<String> {
    let s = s.trim();
    // 1. DD-MM-YYYY
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d-%m-%Y") {
        return Some(format!("{}T00:00:00Z", d.format("%Y-%m-%d")));
    }
    // 2. DD/MM/YYYY
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d/%m/%Y") {
        return Some(format!("{}T00:00:00Z", d.format("%Y-%m-%d")));
    }
    // 3. DD-Mon-YYYY (e.g. 15-Jul-2025 or 15-JUL-2025)
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d-%b-%Y") {
        return Some(format!("{}T00:00:00Z", d.format("%Y-%m-%d")));
    }
    // 4. DD/Mon/YYYY
    if let Ok(d) = NaiveDate::parse_from_str(s, "%d/%b/%Y") {
        return Some(format!("{}T00:00:00Z", d.format("%Y-%m-%d")));
    }
    // 5. YYYY-MM-DD
    if let Ok(d) = NaiveDate::parse_from_str(s, "%Y-%m-%d") {
        return Some(format!("{}T00:00:00Z", d.format("%Y-%m-%d")));
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

fn extract_counterparty(particulars: &str) -> Option<String> {
    let upper = particulars.to_uppercase();
    if upper.contains("UPI/") || upper.contains("UPI-") {
        let parts: Vec<&str> = particulars.split(&['/', '-'][..]).collect();
        for part in parts.iter().rev() {
            let p = part.trim();
            if p.len() >= 3
                && !p.chars().all(|c| c.is_ascii_digit())
                && !["UPI", "P2P", "P2M", "CR", "DR", "REV", "REV-UPI"].contains(&p.to_uppercase().as_str())
            {
                return Some(p.to_string());
            }
        }
    } else if upper.contains("NEFT/") || upper.contains("IMPS/") {
        let parts: Vec<&str> = particulars.split('/').collect();
        for part in parts.iter().rev() {
            let p = part.trim();
            if p.len() >= 3 && !p.chars().all(|c| c.is_ascii_digit()) {
                return Some(p.to_string());
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_bank_statement() {
        let csv = r#"Statement of Account
Customer Name: Kaaviya
Account Number: 987654321098
Period: 01-Jul-2025 to 31-Mar-2026

Tran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL
15-07-2025,,UPI/P2P/512345/Swiggy,450.00,,45200.00,001
18-07-2025,,SALARY CREDIT,,75000.00,120200.00,001
20-07-2025,,NEFT/AXIS/1234/Rent,25000.00,,95200.00,001

Total Debits: 25450.00
Closing Balance: 95200.00
"#;
        let (txs, meta) = parse_bank_statement(csv, 5).unwrap();
        assert_eq!(txs.len(), 3);
        assert_eq!(txs[0].direction, Direction::Debit);
        assert_eq!(txs[0].amount_minor, 45000);
        assert_eq!(txs[0].timestamp, "2025-07-15T00:00:00Z");
        assert_eq!(txs[0].counterparty.as_deref(), Some("Swiggy"));
        assert_eq!(txs[1].direction, Direction::Credit);
        assert_eq!(txs[1].amount_minor, 7500000);
        assert_eq!(meta.account_holder.as_deref(), Some("Kaaviya"));
    }
}
