pub mod bank_statement;
pub mod detect_format;
pub mod normalize;
pub mod upi_export;
pub mod validate;

pub use detect_format::{detect_format, DetectedSignature};
pub use normalize::{
    AnalysisSummary, CounterpartyStat, DailyStat, DateRange, Direction, DirectionCounts,
    ImportFormat, ImportPreview, NormalizedTransaction, PersonalAnalysis, PersonalAnomaly,
    StatementMetadata, TimestampPrecision,
};

use crate::types::ApiError;

pub fn parse_and_preview(content: &str) -> Result<ImportPreview, ApiError> {
    let sig = detect_format(content)?;
    let total_lines = content.lines().count();

    match sig.format {
        ImportFormat::BankStatement => {
            let (txs, meta) = bank_statement::parse_bank_statement(content, sig.header_line_index)?;
            Ok(validate::generate_preview(
                sig.format,
                sig.header_line_index + 1,
                total_lines,
                &txs,
                Some(meta),
            ))
        }
        ImportFormat::UpiExport => {
            let txs = upi_export::parse_upi_export(content, sig.header_line_index)?;
            Ok(validate::generate_preview(
                sig.format,
                sig.header_line_index + 1,
                total_lines,
                &txs,
                None,
            ))
        }
    }
}

pub fn parse_and_analyze(content: &str) -> Result<PersonalAnalysis, ApiError> {
    let sig = detect_format(content)?;

    match sig.format {
        ImportFormat::BankStatement => {
            let (txs, _) = bank_statement::parse_bank_statement(content, sig.header_line_index)?;
            Ok(validate::analyze_transactions(sig.format, &txs))
        }
        ImportFormat::UpiExport => {
            let txs = upi_export::parse_upi_export(content, sig.header_line_index)?;
            Ok(validate::analyze_transactions(sig.format, &txs))
        }
    }
}
