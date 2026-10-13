use blindspot::imports::{self, ImportFormat, TimestampPrecision};
use std::fs;
use std::path::PathBuf;

fn fixtures_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap()
        .join("fixtures")
        .join("imports")
}

#[test]
fn test_bank_statement_period1_kaaviya() {
    let path = fixtures_dir().join("bank_statement_period1.csv");
    let content = fs::read_to_string(&path).expect("read bank_statement_period1.csv");

    let sig = imports::detect_format(&content).expect("detect format");
    assert_eq!(sig.format, ImportFormat::BankStatement);
    assert_eq!(sig.header_line_index, 19); // 0-indexed line 19 is line 20

    let preview = imports::parse_and_preview(&content).expect("parse preview");
    assert_eq!(preview.format, ImportFormat::BankStatement);
    assert_eq!(preview.valid_transactions, 505);

    let meta = preview.metadata.expect("metadata extracted");
    assert_eq!(meta.account_holder.as_deref(), Some("Kaaviya R"));
    assert_eq!(
        meta.account_number_masked.as_deref(),
        Some("XXXX-XXXX-5610")
    );

    let range = preview.date_range.expect("date range");
    assert!(range.start.starts_with("2025-07"));
    assert!(range.end.starts_with("2026-03"));

    let analysis = imports::parse_and_analyze(&content).expect("parse analysis");
    assert_eq!(analysis.valid_transactions, 505);
    assert!(analysis.summary.debit_count > 450);
    assert!(analysis.summary.credit_count > 0);
    assert!(!analysis.top_counterparties.is_empty());
}

#[test]
fn test_bank_statement_period2_kaaviya() {
    let path = fixtures_dir().join("bank_statement_period2.csv");
    let content = fs::read_to_string(&path).expect("read bank_statement_period2.csv");

    let sig = imports::detect_format(&content).expect("detect format");
    assert_eq!(sig.format, ImportFormat::BankStatement);
    assert_eq!(sig.header_line_index, 19);

    let preview = imports::parse_and_preview(&content).expect("parse preview");
    assert_eq!(preview.valid_transactions, 817);

    let range = preview.date_range.expect("date range");
    assert!(range.start.starts_with("2026-04"));
    assert!(range.end.starts_with("2026-10"));
}

#[test]
fn test_upi_export_srivarsan() {
    let path = fixtures_dir().join("upi_transactions.csv");
    let content = fs::read_to_string(&path).expect("read upi_transactions.csv");

    let sig = imports::detect_format(&content).expect("detect format");
    assert_eq!(sig.format, ImportFormat::UpiExport);
    assert_eq!(sig.header_line_index, 0);

    let preview = imports::parse_and_preview(&content).expect("parse preview");
    assert_eq!(preview.valid_transactions, 373);
    assert_eq!(preview.direction_counts.debit, 357);
    assert_eq!(preview.direction_counts.credit, 10);
    assert_eq!(preview.direction_counts.self_transfer, 6);

    // Missing time summary should mention 8 rows
    assert!(preview
        .missing_fields_summary
        .iter()
        .any(|s| s.contains("8 transaction(s)")));

    let (txs, _) = (
        imports::upi_export::parse_upi_export(&content, 0).expect("parse txs"),
        (),
    );
    let date_only_count = txs
        .iter()
        .filter(|t| t.timestamp_precision == TimestampPrecision::Date)
        .count();
    let minute_count = txs
        .iter()
        .filter(|t| t.timestamp_precision == TimestampPrecision::Minute)
        .count();
    assert_eq!(date_only_count, 8);
    assert_eq!(minute_count, 365);

    let analysis = imports::parse_and_analyze(&content).expect("analyze upi");
    assert_eq!(analysis.valid_transactions, 373);
    assert_eq!(analysis.summary.debit_count, 357);
    assert_eq!(analysis.summary.credit_count, 10);
    assert_eq!(analysis.summary.self_transfer_count, 6);
    assert!(!analysis.anomalies.is_empty());
}
