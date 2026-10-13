import { useState, useEffect, useMemo, useRef } from 'react';
import type {
  ImportPreview,
  PersonalAnalysis,
  ImportSampleItem,
  NormalizedTransaction,
} from './types';
import { inr } from './format';

const SAMPLES: ImportSampleItem[] = [
  {
    id: 'bank_statement_period1',
    title: 'Kaaviya — Last year',
    format: 'bank_statement',
    period: 'Jul 2025 – Mar 2026',
    valid_transactions: 505,
    description: 'Savings bank statement with metadata on rows 1–19, table header starting on row 20, DR/CR columns, and balance tracking.',
  },
  {
    id: 'bank_statement_period2',
    title: 'Kaaviya — Recent transactions',
    format: 'bank_statement',
    period: 'Apr 2026 – Oct 12, 2026',
    valid_transactions: 817,
    description: 'Consecutive follow-up bank statement period with identical column structure and zero date overlap with Period 1.',
  },
  {
    id: 'bank_statement_combined',
    title: 'Kaaviya — Combined history (P1 + P2)',
    format: 'bank_statement',
    period: 'Jul 2025 – Oct 12, 2026',
    valid_transactions: 1322,
    description: 'Unified account history combining consecutive Period 1 (505 txs) and Period 2 (817 txs) under verified account reference XXXX-XXXX-5610.',
  },
  {
    id: 'upi_transactions',
    title: 'Srivarsan transactions',
    format: 'upi_export',
    period: 'Oct 2025 – Oct 12, 2026',
    valid_transactions: 373,
    description: 'Clean UPI payment export with 9 columns, counterparty VPAs, debit/credit/self-transfer tags, and 8 date-only records.',
  },
];

export default function StatementImportPanel() {
  const [selectedSample, setSelectedSample] = useState<string>('bank_statement_period1');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [analysis, setAnalysis] = useState<PersonalAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Filters for transactions table
  const [directionFilter, setDirectionFilter] = useState<'all' | 'debit' | 'credit' | 'self_transfer'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightAnomalyTxIds, setHighlightAnomalyTxIds] = useState<string[]>([]);
  const [selectedAnomalyIndex, setSelectedAnomalyIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableSectionRef = useRef<HTMLDivElement | null>(null);

  const loadSample = async (id: string) => {
    setSelectedSample(id);
    setLoading(true);
    setError(null);
    setHighlightAnomalyTxIds([]);
    setSelectedAnomalyIndex(null);
    try {
      const res = await fetch(`/api/imports/samples/${id}/analyze`, {
        method: 'POST',
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Failed to analyze sample (${res.status})`);
      }
      const data = await res.json();
      setPreview(data.preview);
      setAnalysis(data.analysis);
    } catch (e: any) {
      setError(e.message || 'Error parsing statement');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSample('bank_statement_period1');
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedSample('custom_upload');
    setLoading(true);
    setError(null);
    setHighlightAnomalyTxIds([]);
    setSelectedAnomalyIndex(null);

    try {
      const text = await file.text();
      // First preview
      const prevRes = await fetch('/api/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, filename: file.name }),
      });
      if (!prevRes.ok) {
        const errJson = await prevRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Failed to parse CSV preview (${prevRes.status})`);
      }
      const previewData: ImportPreview = await prevRes.json();
      setPreview(previewData);

      // Then analyze
      const anRes = await fetch('/api/imports/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text, filename: file.name }),
      });
      if (!anRes.ok) {
        const errJson = await anRes.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Failed to analyze transactions (${anRes.status})`);
      }
      const analysisData: PersonalAnalysis = await anRes.json();
      setAnalysis(analysisData);
    } catch (err: any) {
      setError(err.message || 'Failed to read uploaded CSV');
    } finally {
      setLoading(false);
    }
  };

  const inspectAnomaly = (idx: number, txIds: string[]) => {
    setSelectedAnomalyIndex(idx);
    setHighlightAnomalyTxIds(txIds);
    setDirectionFilter('all');
    setSearchQuery('');
    setTimeout(() => {
      tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const clearAnomalyFilter = () => {
    setHighlightAnomalyTxIds([]);
    setSelectedAnomalyIndex(null);
  };

  // Filtered transactions
  const displayedTransactions = useMemo(() => {
    if (!preview) return [];
    let list: NormalizedTransaction[] = preview.preview_rows;

    if (highlightAnomalyTxIds.length > 0) {
      list = list.filter((t) => highlightAnomalyTxIds.includes(t.transaction_id));
    }

    if (directionFilter !== 'all') {
      list = list.filter((t) => t.direction === directionFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          (t.counterparty && t.counterparty.toLowerCase().includes(q)) ||
          t.transaction_id.toLowerCase().includes(q) ||
          t.amount_inr.toString().includes(q) ||
          t.timestamp.includes(q)
      );
    }

    return list;
  }, [preview, directionFilter, searchQuery, highlightAnomalyTxIds]);

  return (
    <div className="import-workspace-layout">
      {/* Top Header Card */}
      <section className="panel import-header-panel">
        <div className="import-header-top">
          <div>
            <div className="import-title-row">
              <h2>Statement &amp; Export Ingestion</h2>
              <span className="source-pill live">Personal Behavioral Analysis</span>
            </div>
            <p className="import-subtitle">
              Dual-parser engine for Indian Bank Statements (dynamic table offset &amp; DR/CR balances) and UPI Payment History exports.
            </p>
          </div>
          <div className="import-actions">
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              className="primary"
              onClick={() => fileInputRef.current?.click()}
              title="Upload your own CSV export"
            >
              Upload Custom CSV
            </button>
          </div>
        </div>

        {/* Scope and Architecture Distinction Notice */}
        <div className="import-scope-notice">
          <div className="scope-icon">ℹ</div>
          <div className="scope-text">
            <strong>Architecture &amp; Scope Boundary:</strong> Single-account personal statement analysis detects behavioral
            anomalies (velocity spikes, unusually large debits, burst repetitions) within an isolated account. Coordinated
            money-mule detection requires multi-party network data, which is demonstrated in the <strong>Live Monitor</strong> tab.
          </div>
        </div>

        {/* Reference Samples Selector */}
        <div className="sample-selector-row">
          <span className="sample-label">Reference files:</span>
          <div className="sample-buttons">
            {SAMPLES.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`sample-pill-btn ${selectedSample === s.id ? 'active' : ''}`}
                onClick={() => loadSample(s.id)}
              >
                <strong>{s.title}</strong>
                <small>({s.valid_transactions} records · {s.period})</small>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Account Grouping Confirmation Callout */}
      {(selectedSample === 'bank_statement_period1' || selectedSample === 'bank_statement_period2') && (
        <section className="panel grouping-callout-panel">
          <div className="grouping-callout-content">
            <div className="grouping-callout-text">
              <span className="grouping-badge">Consecutive Periods Available</span>
              <strong>Combine Kaaviya Period 1 &amp; Period 2</strong>
              <p>
                Both statements share verified account reference <code>XXXX-XXXX-5610</code> and represent consecutive,
                non-overlapping date ranges (Jul 2025 – Mar 2026 and Apr 2026 – Oct 2026). Combine them into a single 1,322-transaction account baseline.
              </p>
            </div>
            <button
              type="button"
              className="primary grouping-action-btn"
              onClick={() => loadSample('bank_statement_combined')}
            >
              Combine statements (1,322 records) →
            </button>
          </div>
        </section>
      )}

      {error && (
        <section className="panel empty" role="alert">
          <h2>Import Error</h2>
          <p>{error}</p>
        </section>
      )}

      {loading && (
        <section className="panel empty" aria-busy="true">
          Parsing and analyzing statement records…
        </section>
      )}

      {preview && analysis && !loading && (
        <>
          {/* Format Signature & Quality Verification */}
          <section className="panel import-summary-panel">
            <div className="section-heading">
              <div>
                <h2>Detected format &amp; structural signature</h2>
                <p>Verified through automatic column header mapping and metadata detection</p>
              </div>
              <span className={`format-badge ${preview.format}`}>
                {preview.format === 'bank_statement' ? 'Bank Statement (Format A)' : 'UPI Export (Format B)'}
              </span>
            </div>

            <div className="import-signature-grid">
              <div className="signature-stat-box">
                <span className="sig-label">Header Location</span>
                <strong>Row {preview.header_line}</strong>
                <small>{preview.format === 'bank_statement' ? 'Dynamic header detection' : 'Standard row 1 header'}</small>
              </div>

              <div className="signature-stat-box">
                <span className="sig-label">Valid Records</span>
                <strong className="accent-text">{preview.valid_transactions}</strong>
                <small>All records normalized and searchable</small>
              </div>

              <div className="signature-stat-box">
                <span className="sig-label">Date Range</span>
                <strong>
                  {preview.date_range ? `${preview.date_range.start} – ${preview.date_range.end}` : 'Unknown'}
                </strong>
                <small>Chronological statement coverage</small>
              </div>

              <div className="signature-stat-box">
                <span className="sig-label">Direction Counts</span>
                <strong>
                  {preview.direction_counts.debit} DR / {preview.direction_counts.credit} CR
                </strong>
                <small>{preview.direction_counts.self_transfer > 0 ? `${preview.direction_counts.self_transfer} self-transfers` : 'Standard direction split'}</small>
              </div>
            </div>

            {/* Extracted Metadata (for Bank Statements) */}
            {preview.metadata && (
              <div className="statement-metadata-strip">
                {preview.metadata.account_holder && (
                  <div>
                    <span className="meta-label">Account Holder:</span>
                    <strong>{preview.metadata.account_holder}</strong>
                  </div>
                )}
                {preview.metadata.account_number_masked && (
                  <div>
                    <span className="meta-label">Verified Account Reference:</span>
                    <code>{preview.metadata.account_number_masked}</code>
                  </div>
                )}
                {preview.metadata.statement_period && (
                  <div>
                    <span className="meta-label">Statement Period:</span>
                    <span>{preview.metadata.statement_period}</span>
                  </div>
                )}
              </div>
            )}

            {/* Missing Fields / Quality Callout */}
            {preview.missing_fields_summary.length > 0 && (
              <div className="missing-fields-callout">
                <strong>Source Data Observations:</strong>
                <ul>
                  {preview.missing_fields_summary.map((msg, i) => (
                    <li key={i}>{msg}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Personal Financial Baseline Metrics */}
          <section className="panel personal-metrics-panel">
            <div className="section-heading">
              <div>
                <h2>Cash flow baseline &amp; volume summary</h2>
                <p>Calculated historical distribution used as baseline for anomaly thresholds</p>
              </div>
            </div>

            <div className="personal-kpi-grid">
              <div className="kpi-card">
                <span className="kpi-label">Total Debits</span>
                <strong className="kpi-val danger">{inr(Math.round(analysis.summary.total_debit_inr * 100))}</strong>
                <small>{analysis.summary.debit_count} outward transfers</small>
              </div>

              <div className="kpi-card">
                <span className="kpi-label">Total Credits</span>
                <strong className="kpi-val success">{inr(Math.round(analysis.summary.total_credit_inr * 100))}</strong>
                <small>{analysis.summary.credit_count} inward transfers</small>
              </div>

              <div className="kpi-card">
                <span className="kpi-label">Net Cash Flow</span>
                <strong className={`kpi-val ${analysis.summary.net_flow_inr >= 0 ? 'success' : 'danger'}`}>
                  {analysis.summary.net_flow_inr >= 0 ? '+' : ''}
                  {inr(Math.round(analysis.summary.net_flow_inr * 100))}
                </strong>
                <small>Credits minus debits</small>
              </div>

              <div className="kpi-card">
                <span className="kpi-label">Average Outward Transfer</span>
                <strong className="kpi-val">{inr(Math.round(analysis.summary.average_debit_inr * 100))}</strong>
                <small>Historical debit mean</small>
              </div>

              <div className="kpi-card">
                <span className="kpi-label">Largest Single Debit</span>
                <strong className="kpi-val accent">{inr(Math.round(analysis.summary.max_debit_inr * 100))}</strong>
                <small>Peak outflow event</small>
              </div>

              {analysis.summary.min_balance_inr !== null && analysis.summary.min_balance_inr !== undefined && (
                <div className="kpi-card">
                  <span className="kpi-label">Balance Range (Min / Max)</span>
                  <strong className="kpi-val">
                    {inr(Math.round((analysis.summary.min_balance_inr || 0) * 100))} / {inr(Math.round((analysis.summary.max_balance_inr || 0) * 100))}
                  </strong>
                  <small>Recorded closing balance range</small>
                </div>
              )}
            </div>
          </section>

          {/* Behavioral Anomaly Intelligence */}
          <section className="panel personal-anomalies-panel">
            <div className="section-heading">
              <div>
                <h2>Behavioral anomaly findings ({analysis.anomalies.length})</h2>
                <p>Identified deviations against rolling account baseline</p>
              </div>
              {highlightAnomalyTxIds.length > 0 && (
                <button className="secondary" onClick={clearAnomalyFilter}>
                  ✕ Clear transaction filter
                </button>
              )}
            </div>

            {analysis.anomalies.length === 0 ? (
              <div className="empty-anomalies">
                <p>No high-severity personal anomalies identified for this period. Spending follows regular distribution.</p>
              </div>
            ) : (
              <div className="anomalies-list-grid">
                {analysis.anomalies.map((an, idx) => {
                  const isSelected = selectedAnomalyIndex === idx;
                  return (
                    <div
                      key={idx}
                      className={`anomaly-card severity-${an.severity} ${isSelected ? 'selected-anomaly' : ''}`}
                    >
                      <div className="anomaly-card-top">
                        <span className={`anomaly-badge ${an.severity}`}>{an.severity.toUpperCase()}</span>
                        <span className="anomaly-type-code">{an.anomaly_type}</span>
                        {an.date && <span className="anomaly-date">{an.date.slice(0, 10)}</span>}
                      </div>

                      <h4 className="anomaly-title">{an.title}</h4>
                      <p className="anomaly-description">{an.description}</p>

                      <div className="anomaly-metrics-strip">
                        <div>
                          <span>Observed:</span>
                          <strong>{an.metric_observed}</strong>
                        </div>
                        <div>
                          <span>Threshold:</span>
                          <strong>{an.threshold}</strong>
                        </div>
                      </div>

                      <div className="anomaly-card-footer">
                        <button
                          type="button"
                          className={`filter-tx-btn ${isSelected ? 'active' : ''}`}
                          onClick={() => inspectAnomaly(idx, an.transaction_ids)}
                        >
                          {isSelected
                            ? `✓ Viewing ${an.transaction_ids.length} supporting transaction(s) below ↓`
                            : `Inspect ${an.transaction_ids.length} supporting transaction(s) →`}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Top Counterparties / Beneficiaries */}
          {analysis.top_counterparties.length > 0 && (
            <section className="panel counterparties-panel">
              <div className="section-heading">
                <div>
                  <h2>Top counterparties &amp; merchants</h2>
                  <p>Highest frequency and volume beneficiaries extracted from narration/tags</p>
                </div>
              </div>

              <div className="counterparties-grid">
                {analysis.top_counterparties.slice(0, 8).map((cp, idx) => (
                  <div key={idx} className="counterparty-card">
                    <div className="cp-header">
                      <strong className="cp-name">{cp.counterparty}</strong>
                      <span className="cp-count">{cp.transaction_count} txs</span>
                    </div>
                    <div className="cp-amount">{inr(Math.round(cp.total_amount_inr * 100))}</div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Normalized Transactions Explorer */}
          <section
            ref={tableSectionRef}
            id="statement-transactions-section"
            className="panel statement-transactions-panel"
          >
            <div className="section-heading">
              <div>
                <h2>
                  Normalized transaction records ({displayedTransactions.length} of {preview.valid_transactions})
                </h2>
                <p>Standardized schema mapping with preserved date-precision and original source rows</p>
              </div>

              <div className="table-controls-row">
                <input
                  type="search"
                  placeholder="Filter by counterparty, description, amount…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="table-search-input"
                />

                <div className="direction-pills">
                  {(['all', 'debit', 'credit', 'self_transfer'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      className={`dir-pill-btn ${directionFilter === dir ? 'active' : ''}`}
                      onClick={() => setDirectionFilter(dir)}
                    >
                      {dir === 'all' ? 'All' : dir.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active Anomaly Filter Banner */}
            {selectedAnomalyIndex !== null && analysis.anomalies[selectedAnomalyIndex] && (
              <div className="active-anomaly-filter-banner">
                <div className="filter-banner-info">
                  <span className={`anomaly-badge ${analysis.anomalies[selectedAnomalyIndex].severity}`}>
                    {analysis.anomalies[selectedAnomalyIndex].severity.toUpperCase()}
                  </span>
                  <div>
                    <strong>Filtering by anomaly: {analysis.anomalies[selectedAnomalyIndex].title}</strong>
                    <span className="filter-count-text">
                      Showing all {displayedTransactions.length} supporting transaction records
                    </span>
                  </div>
                </div>
                <button type="button" className="clear-anomaly-btn" onClick={clearAnomalyFilter}>
                  ✕ Clear filter &amp; show all ({preview.valid_transactions})
                </button>
              </div>
            )}

            {displayedTransactions.length === 0 ? (
              <div className="table-empty-state">
                <p>No transactions match the active filter criteria.</p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    clearAnomalyFilter();
                    setDirectionFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Reset search &amp; filters
                </button>
              </div>
            ) : (
              <div className="statement-table-wrapper">
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th>Tx ID</th>
                      <th>Date / Timestamp</th>
                      <th>Type</th>
                      <th>Particulars / Counterparty</th>
                      <th className="num-col">Amount (INR)</th>
                      {preview.format === 'bank_statement' && <th className="num-col">Balance After</th>}
                      <th>Precision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTransactions.map((tx) => (
                      <tr
                        key={tx.transaction_id}
                        className={highlightAnomalyTxIds.includes(tx.transaction_id) ? 'highlight-row' : ''}
                      >
                        <td>
                          <code>{tx.transaction_id}</code>
                        </td>
                        <td>
                          <span className="tx-time-text">
                            {tx.timestamp_precision === 'minute'
                              ? tx.timestamp.replace('T', ' ').replace('Z', '')
                              : tx.timestamp.slice(0, 10)}
                          </span>
                        </td>
                        <td>
                          <span className={`direction-tag ${tx.direction}`}>{tx.direction}</span>
                        </td>
                        <td>
                          <div className="particulars-cell">
                            {tx.counterparty ? (
                              <>
                                <strong className="counterparty-name">{tx.counterparty}</strong>
                                <small className="raw-particulars-text">{tx.description}</small>
                              </>
                            ) : (
                              <span>{tx.description}</span>
                            )}
                          </div>
                        </td>
                        <td className="num-col">
                          <strong className={`tx-amount-val ${tx.direction === 'credit' ? 'credit-val' : ''}`}>
                            {tx.direction === 'credit' ? '+' : '-'}{inr(tx.amount_minor)}
                          </strong>
                        </td>
                        {preview.format === 'bank_statement' && (
                          <td className="num-col">
                            <span className="balance-val">
                              {tx.balance_after_minor !== null && tx.balance_after_minor !== undefined
                                ? inr(tx.balance_after_minor)
                                : '—'}
                            </span>
                          </td>
                        )}
                        <td>
                          <span className={`precision-tag ${tx.timestamp_precision}`}>
                            {tx.timestamp_precision === 'minute' ? 'hh:mm' : 'date only'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
