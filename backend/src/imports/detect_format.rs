use super::normalize::ImportFormat;
use crate::types::ApiError;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DetectedSignature {
    pub format: ImportFormat,
    pub header_line_index: usize, // 0-based line index where table headers begin
}

pub fn detect_format(content: &str) -> Result<DetectedSignature, ApiError> {
    let lines: Vec<&str> = content.lines().take(80).collect();

    for (idx, line) in lines.iter().enumerate() {
        let lower = line.to_ascii_lowercase();

        // Check for Format B (UPI export): "upi_transaction_id" or ("date" and "amount_inr" and "counterparty")
        if lower.contains("upi_transaction_id")
            || (lower.contains("counterparty") && lower.contains("amount_inr"))
        {
            return Ok(DetectedSignature {
                format: ImportFormat::UpiExport,
                header_line_index: idx,
            });
        }

        // Check for Format A (Bank statement): "tran date" and ("particulars" or "chqno" or ("dr" and "cr" and "bal"))
        if lower.contains("tran date")
            && (lower.contains("particulars")
                || lower.contains("chqno")
                || (lower.contains("dr") && lower.contains("cr")))
        {
            return Ok(DetectedSignature {
                format: ImportFormat::BankStatement,
                header_line_index: idx,
            });
        }
    }

    Err(ApiError::bad(
        "UNKNOWN_IMPORT_FORMAT",
        "Could not detect supported statement format. Expected Bank Statement (Tran Date, PARTICULARS, DR/CR, BAL) or UPI Export (date, counterparty, amount_inr, upi_transaction_id).",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_detect_upi() {
        let csv = "date,time,transaction_type,counterparty,description,account,amount_inr,upi_transaction_id,note\n2025-10-12,14:20:00,debit,Swiggy,Food,A/c 1234,450.00,UPI12345678,Dinner";
        let res = detect_format(csv).unwrap();
        assert_eq!(res.format, ImportFormat::UpiExport);
        assert_eq!(res.header_line_index, 0);
    }

    #[test]
    fn test_detect_bank_statement_with_metadata() {
        let csv = "Account Holder: Kaaviya\nAccount Number: 123456789012\nBranch: T. Nagar\n\n\nTran Date,CHQNO,PARTICULARS,DR,CR,BAL,SOL\n15-07-2025,,UPI/P2P/123/Swiggy,450.00,,45200.00,001";
        let res = detect_format(csv).unwrap();
        assert_eq!(res.format, ImportFormat::BankStatement);
        assert_eq!(res.header_line_index, 5);
    }
}
