import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  ImportPreview,
  PersonalAnalysis,
  ImportSampleItem,
  NormalizedTransaction,
  Graph,
} from './types';
import { inr, money } from './format';
import TransactionGraph from './TransactionGraph';

interface BankOption {
  id: string;
  name: string;
  sampleId: string;
  tag: string;
  color: string;
  accountHolder: string;
  maskedAccount: string;
  phone: string;
  recordCount: number;
  period: string;
  type: 'bank' | 'upi';
}

const BANKS: BankOption[] = [
  {
    id: 'hdfc',
    name: 'HDFC Bank',
    sampleId: 'bank_statement_period1',
    tag: 'Savings A/c',
    color: '#004c8f',
    accountHolder: 'Kaaviya R',
    maskedAccount: 'XXXX-XXXX-5610',
    phone: '+91 98765 43210',
    recordCount: 505,
    period: 'Jul 2025 – Mar 2026',
    type: 'bank',
  },
  {
    id: 'icici',
    name: 'ICICI Bank',
    sampleId: 'bank_statement_period2',
    tag: 'Salary A/c',
    color: '#b02a30',
    accountHolder: 'Kaaviya R',
    maskedAccount: 'XXXX-XXXX-5610',
    phone: '+91 98765 43210',
    recordCount: 817,
    period: 'Apr 2026 – Oct 2026',
    type: 'bank',
  },
  {
    id: 'sbi',
    name: 'State Bank of India',
    sampleId: 'bank_statement_combined',
    tag: 'Unified History',
    color: '#1a5276',
    accountHolder: 'Kaaviya R',
    maskedAccount: 'XXXX-XXXX-5610',
    phone: '+91 98765 43210',
    recordCount: 1322,
    period: 'Jul 2025 – Oct 2026',
    type: 'bank',
  },
  {
    id: 'upi',
    name: 'UPI Payments (BHIM/GPay)',
    sampleId: 'upi_transactions',
    tag: 'UPI Export',
    color: '#5b21b6',
    accountHolder: 'Srivarsan K',
    maskedAccount: 'UPI: srivarsan@okaxis',
    phone: '+91 98401 23456',
    recordCount: 373,
    period: 'Oct 2025 – Oct 2026',
    type: 'upi',
  },
];

export default function AccountConsole({
  onSwitchToNetwork,
}: {
  onSwitchToNetwork?: () => void;
}) {
  const [selectedSample, setSelectedSample] = useState<string>('bank_statement_period1');
  const [activeBank, setActiveBank] = useState<BankOption>(BANKS[0]);
  const [connectionMethod, setConnectionMethod] = useState<'bank_login' | 'statement_upload' | 'sample'>('sample');

  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [analysis, setAnalysis] = useState<PersonalAnalysis | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Bank Login Modal State
  const [showBankModal, setShowBankModal] = useState<boolean>(false);
  const [modalStep, setModalStep] = useState<'select_bank' | 'enter_phone' | 'enter_otp' | 'connecting'>('select_bank');
  const [modalSelectedBank, setModalSelectedBank] = useState<BankOption>(BANKS[0]);
  const [modalPhone, setModalPhone] = useState<string>('98765 43210');
  const [modalOtp, setModalOtp] = useState<string>('482915');

  // Transactions Filter & Explorer State
  const [directionFilter, setDirectionFilter] = useState<'all' | 'debit' | 'credit' | 'self_transfer'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [highlightAnomalyTxIds, setHighlightAnomalyTxIds] = useState<string[]>([]);
  const [selectedAnomalyIndex, setSelectedAnomalyIndex] = useState<number | null>(null);
  const [viewGraph, setViewGraph] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const tableSectionRef = useRef<HTMLDivElement | null>(null);

  const loadSample = async (id: string, bank?: BankOption, method: 'bank_login' | 'statement_upload' | 'sample' = 'sample') => {
    setSelectedSample(id);
    if (bank) setActiveBank(bank);
    setConnectionMethod(method);
    setLoading(true);
    setError(null);
    setHighlightAnomalyTxIds([]);
    setSelectedAnomalyIndex(null);

    try {
      const res = await fetch(`/api/imports/samples/${id}/analyze`, { method: 'POST' });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error?.message || `Failed to analyze account data (${res.status})`);
      }
      const data = await res.json();
      setPreview(data.preview);
      setAnalysis(data.analysis);
    } catch (e: any) {
      setError(e.message || 'Error loading transaction records');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSample('bank_statement_period1', BANKS[0], 'bank_login');
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedSample('custom_upload');
    setConnectionMethod('statement_upload');
    setLoading(true);
    setError(null);
    setHighlightAnomalyTxIds([]);
    setSelectedAnomalyIndex(null);

    try {
      const text = await file.text();
      // 1. Preview
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

      // 2. Analyze
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

      setActiveBank({
        id: 'uploaded',
        name: file.name.replace('.csv', ''),
        sampleId: 'custom_upload',
        tag: previewData.format === 'bank_statement' ? 'Bank Statement' : 'UPI Export',
        color: '#0f766e',
        accountHolder: previewData.metadata?.account_holder || 'Uploaded Account',
        maskedAccount: previewData.metadata?.account_number_masked || 'File Upload',
        phone: '—',
        recordCount: previewData.valid_transactions,
        period: previewData.date_range ? `${previewData.date_range.start} – ${previewData.date_range.end}` : 'Detected',
        type: previewData.format === 'bank_statement' ? 'bank' : 'upi',
      });
    } catch (err: any) {
      setError(err.message || 'Failed to process statement CSV');
    } finally {
      setLoading(false);
    }
  };

  const executeBankLogin = () => {
    setModalStep('connecting');
    setTimeout(() => {
      loadSample(modalSelectedBank.sampleId, modalSelectedBank, 'bank_login');
      setShowBankModal(false);
      setModalStep('select_bank');
    }, 1200);
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

  const filterByCounterparty = (cpName: string) => {
    setSearchQuery(cpName);
    setHighlightAnomalyTxIds([]);
    setSelectedAnomalyIndex(null);
    setTimeout(() => {
      tableSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  // Filtered transactions for the table
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

  // Generate fund flow graph for account
  const accountGraph = useMemo<Graph>(() => {
    if (!preview || !analysis) return { nodes: [], edges: [] };
    const subjectId = preview.metadata?.account_number_masked || 'My Account';
    const nodes: Graph['nodes'] = [
      { id: subjectId, label: activeBank.accountHolder || subjectId, role: 'intermediary', risk_level: 'unknown' },
    ];
    const edges: Graph['edges'] = [];

    // Add top counterparties
    analysis.top_counterparties.slice(0, 8).forEach((cp) => {
      const cpId = `cp-${cp.counterparty}`;
      nodes.push({ id: cpId, label: cp.counterparty, role: 'destination', risk_level: 'unknown' });
      edges.push({
        id: `flow-${cp.counterparty}`,
        source: subjectId,
        target: cpId,
        amount_minor: Math.round(cp.total_amount_inr * 100),
        currency: 'INR',
        timestamp: preview.date_range?.end || '2026-10-12',
      });
    });

    return { nodes, edges };
  }, [preview, analysis, activeBank]);

  return (
    <div className="account-console-layout">
      {/* 1. Ingestion Hero Banner: Bank Login or Statement Upload */}
      <section className="panel account-hero-panel">
        <div className="account-hero-top">
          <div className="account-hero-titles">
            <div className="hero-badge-row">
              <span className="live-status-pill">
                <i className="status-dot-pulse" />
                {connectionMethod === 'bank_login'
                  ? 'Connected via Open Banking AA'
                  : connectionMethod === 'statement_upload'
                  ? 'Active Statement Ingestion'
                  : 'Account Risk Workspace'}
              </span>
              <span className="platform-tag">General Risk Intelligence</span>
            </div>
            <h1>Account Financial Risk &amp; Behavioral Console</h1>
            <p className="hero-subtext">
              Login directly to link your bank account, or upload your transaction statement history.
              Blindspot normalizes and analyzes cash flows, anomaly deviations, and counterparty risks.
            </p>
          </div>

          <div className="account-hero-actions">
            <button
              type="button"
              className="primary connect-bank-btn"
              onClick={() => {
                setShowBankModal(true);
                setModalStep('select_bank');
              }}
            >
              <span className="btn-icon">🏦</span> Connect Bank Account
            </button>
            <input
              type="file"
              ref={fileInputRef}
              accept=".csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
            <button
              type="button"
              className="secondary upload-csv-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <span className="btn-icon">📁</span> Upload Statement CSV
            </button>
          </div>
        </div>

        {/* Quick Account Switcher Ribbon */}
        <div className="account-switcher-ribbon">
          <span className="ribbon-label">Quick switch profile:</span>
          <div className="ribbon-banks-list">
            {BANKS.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`bank-pill-btn ${selectedSample === b.sampleId ? 'active' : ''}`}
                onClick={() => loadSample(b.sampleId, b, 'sample')}
              >
                <span className="bank-logo-chip" style={{ backgroundColor: b.color }}>
                  {b.name.slice(0, 2).toUpperCase()}
                </span>
                <span className="bank-pill-text">
                  <strong>{b.name}</strong>
                  <small>{b.accountHolder} · {b.recordCount} txs</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* 2. Account Grouping Notification (If consecutive statements available) */}
      {(selectedSample === 'bank_statement_period1' || selectedSample === 'bank_statement_period2') && (
        <section className="panel consecutive-grouping-banner">
          <div className="grouping-banner-left">
            <span className="grouping-tag">Consecutive Statement Available</span>
            <strong>Unified Timeline Recommendation</strong>
            <p>
              Both statements belong to verified account <code>XXXX-XXXX-5610</code> (Kaaviya R). You can merge
              Period 1 (505 txs) and Period 2 (817 txs) into a unified 1,322-transaction timeline for comprehensive rolling baseline analysis.
            </p>
          </div>
          <button
            type="button"
            className="primary combine-btn"
            onClick={() => loadSample('bank_statement_combined', BANKS[2], 'sample')}
          >
            Combine into Full Year (1,322 txs) →
          </button>
        </section>
      )}

      {/* Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span>Failed to load account data. {error}</span>
          <button onClick={() => loadSample(selectedSample, activeBank, connectionMethod)}>Retry</button>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="panel empty" aria-busy="true">
          <h3>Analyzing transaction history…</h3>
          <p>Extracting counterparties, evaluating rolling baseline velocity, and computing anomaly scores.</p>
        </div>
      )}

      {preview && analysis && !loading && (
        <>
          {/* 3. Active Account Status & Summary Header */}
          <section className="panel active-account-status-panel">
            <div className="account-badge-header">
              <div className="account-main-meta">
                <div className="account-institution-avatar" style={{ backgroundColor: activeBank.color }}>
                  {activeBank.name.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <div className="account-name-line">
                    <h2>{activeBank.accountHolder}</h2>
                    <span className="account-type-tag">{activeBank.tag}</span>
                    <span className="verified-badge">✓ Verified Entity</span>
                  </div>
                  <p className="account-number-sub">
                    {preview.metadata?.account_number_masked || activeBank.maskedAccount} · {activeBank.name}
                  </p>
                </div>
              </div>

              <div className="account-period-meta">
                <div className="period-box">
                  <span className="period-label">Analyzed Period</span>
                  <strong>{preview.date_range ? `${preview.date_range.start} → ${preview.date_range.end}` : activeBank.period}</strong>
                </div>
                <div className="records-box">
                  <span className="period-label">Total Volume</span>
                  <strong className="accent-color">{preview.valid_transactions} Records</strong>
                </div>
              </div>
            </div>

            {/* Architecture Scope Notice */}
            <div className="scope-explanation-strip">
              <span className="scope-info-icon">ℹ</span>
              <p>
                <strong>Personal Account Scope:</strong> Behavioral metrics evaluate historical deviations (spending bursts,
                unusual outflows, velocity spikes) within this account. For multi-account coordinated money-mule networks, visit the{' '}
                <button type="button" className="inline-link-btn" onClick={onSwitchToNetwork}>
                  AML Network Monitor
                </button>.
              </p>
            </div>
          </section>

          {/* 4. Financial Baseline Metrics Strip */}
          <section className="panel metrics-strip account-metrics-strip" aria-label="Account cash flow metrics">
            <div>
              <span>Total Outflows (Debits)</span>
              <strong className="danger">{inr(Math.round(analysis.summary.total_debit_inr * 100))}</strong>
              <small>{analysis.summary.debit_count} outward transfers</small>
            </div>
            <div>
              <span>Total Inflows (Credits)</span>
              <strong className="success">{inr(Math.round(analysis.summary.total_credit_inr * 100))}</strong>
              <small>{analysis.summary.credit_count} inward deposits</small>
            </div>
            <div>
              <span>Net Cash Flow</span>
              <strong className={analysis.summary.net_flow_inr >= 0 ? 'success' : 'danger'}>
                {analysis.summary.net_flow_inr >= 0 ? '+' : ''}{inr(Math.round(analysis.summary.net_flow_inr * 100))}
              </strong>
              <small>{analysis.summary.net_flow_inr >= 0 ? 'Positive retained flow' : 'Net negative drain'}</small>
            </div>
            <div>
              <span>Average Outward Payment</span>
              <strong>{inr(Math.round(analysis.summary.average_debit_inr * 100))}</strong>
              <small>Historical baseline mean</small>
            </div>
            <div>
              <span>Largest Single Outflow</span>
              <strong className="accent-color">{inr(Math.round(analysis.summary.max_debit_inr * 100))}</strong>
              <small>Peak outflow transaction</small>
            </div>
          </section>

          {/* 5. Behavioral Anomaly Intelligence Findings */}
          <section className="panel personal-anomalies-panel">
            <div className="section-heading">
              <div>
                <h2>Behavioral Anomaly Findings ({analysis.anomalies.length})</h2>
                <p>Identified deviations against rolling account baseline thresholds</p>
              </div>
              {highlightAnomalyTxIds.length > 0 && (
                <button type="button" className="secondary" onClick={clearAnomalyFilter}>
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

                      <h3 className="anomaly-title">{an.title}</h3>
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

          {/* 6. Fund Flow Graph vs Top Counterparties Grid */}
          <div className="account-split-row">
            {/* Top Counterparties / Merchants */}
            <section className="panel counterparties-panel flex-1">
              <div className="section-heading">
                <div>
                  <h2>Top Counterparties &amp; Merchants</h2>
                  <p>Highest frequency and volume beneficiaries</p>
                </div>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setViewGraph(!viewGraph)}
                >
                  {viewGraph ? 'Show Merchant List' : 'Show Flow Graph'}
                </button>
              </div>

              {viewGraph ? (
                <div className="account-graph-container">
                  <TransactionGraph graph={accountGraph} identity={activeBank.id} />
                </div>
              ) : (
                <div className="counterparties-grid">
                  {analysis.top_counterparties.slice(0, 8).map((cp, idx) => (
                    <div
                      key={idx}
                      className="counterparty-card clickable"
                      onClick={() => filterByCounterparty(cp.counterparty)}
                      title={`Filter table for ${cp.counterparty}`}
                    >
                      <div className="cp-header">
                        <strong className="cp-name">{cp.counterparty}</strong>
                        <span className="cp-count">{cp.transaction_count} txs</span>
                      </div>
                      <div className="cp-amount">{inr(Math.round(cp.total_amount_inr * 100))}</div>
                      <small className="filter-hint">Click to filter table →</small>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* 7. Normalized Transactions Explorer Table */}
          <section
            ref={tableSectionRef}
            id="statement-transactions-section"
            className="panel statement-transactions-panel"
          >
            <div className="section-heading">
              <div>
                <h2>
                  Normalized Transaction Stream ({displayedTransactions.length} of {preview.valid_transactions})
                </h2>
                <p>Standardized schema mapping with preserved date-precision and original source rows</p>
              </div>

              <div className="table-controls-row">
                <input
                  type="search"
                  placeholder="Filter by counterparty, narration, amount…"
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

      {/* 8. Bank Connection / Open Banking AA Modal */}
      {showBankModal && (
        <div className="modal-backdrop" onClick={() => setShowBankModal(false)}>
          <div className="bank-login-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3>Connect Bank Account via Open Banking</h3>
                <p>RBI-regulated Account Aggregator (AA) consent framework</p>
              </div>
              <button
                type="button"
                className="modal-close-btn"
                onClick={() => setShowBankModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {modalStep === 'select_bank' && (
                <div className="modal-step-content">
                  <label className="modal-section-label">Select your banking institution:</label>
                  <div className="bank-grid-selector">
                    {BANKS.map((b) => (
                      <div
                        key={b.id}
                        className={`bank-card-option ${modalSelectedBank.id === b.id ? 'selected' : ''}`}
                        onClick={() => setModalSelectedBank(b)}
                      >
                        <div className="bank-icon-square" style={{ backgroundColor: b.color }}>
                          {b.name.slice(0, 2).toUpperCase()}
                        </div>
                        <div className="bank-card-info">
                          <strong>{b.name}</strong>
                          <span>{b.accountHolder}</span>
                          <small>{b.maskedAccount}</small>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="modal-button-row">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setModalStep('enter_phone')}
                    >
                      Continue with {modalSelectedBank.name} →
                    </button>
                  </div>
                </div>
              )}

              {modalStep === 'enter_phone' && (
                <div className="modal-step-content">
                  <div className="selected-bank-summary">
                    <div className="bank-icon-square small" style={{ backgroundColor: modalSelectedBank.color }}>
                      {modalSelectedBank.name.slice(0, 2).toUpperCase()}
                    </div>
                    <strong>{modalSelectedBank.name}</strong>
                    <span className="muted-pill">{modalSelectedBank.tag}</span>
                  </div>

                  <div className="modal-form-group">
                    <label htmlFor="modal-mobile">Registered Mobile Number / NetBanking ID:</label>
                    <input
                      id="modal-mobile"
                      type="text"
                      value={modalPhone}
                      onChange={(e) => setModalPhone(e.target.value)}
                      placeholder="e.g. 98765 43210"
                    />
                    <small>Pre-filled for demonstration: linked to account {modalSelectedBank.maskedAccount}</small>
                  </div>

                  <div className="consent-disclaimer-box">
                    <span className="disclaimer-shield">🛡️</span>
                    <p>
                      <strong>Read-only consent:</strong> Blindspot will fetch up to {modalSelectedBank.recordCount} transaction records for
                      risk &amp; behavioral analysis. No fund movement or modification authority is granted.
                    </p>
                  </div>

                  <div className="modal-button-row">
                    <button type="button" className="secondary" onClick={() => setModalStep('select_bank')}>
                      ← Back
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={() => setModalStep('enter_otp')}
                    >
                      Request OTP →
                    </button>
                  </div>
                </div>
              )}

              {modalStep === 'enter_otp' && (
                <div className="modal-step-content">
                  <div className="otp-prompt-box">
                    <strong>Enter 6-digit verification code</strong>
                    <p>Sent to {modalPhone} for authorization with {modalSelectedBank.name}</p>
                  </div>

                  <div className="otp-inputs-display">
                    <input
                      type="text"
                      className="otp-code-input"
                      value={modalOtp}
                      onChange={(e) => setModalOtp(e.target.value)}
                      maxLength={6}
                      autoFocus
                    />
                  </div>
                  <small className="otp-hint">Demo code pre-filled. Click authorize below to complete sync.</small>

                  <div className="modal-button-row">
                    <button type="button" className="secondary" onClick={() => setModalStep('enter_phone')}>
                      ← Back
                    </button>
                    <button
                      type="button"
                      className="primary"
                      onClick={executeBankLogin}
                    >
                      Authorize &amp; Fetch Transactions ({modalSelectedBank.recordCount})
                    </button>
                  </div>
                </div>
              )}

              {modalStep === 'connecting' && (
                <div className="modal-connecting-state">
                  <div className="spinner-orbit" />
                  <h4>Authenticating with {modalSelectedBank.name}…</h4>
                  <p>Fetching {modalSelectedBank.recordCount} verified transactions via encrypted AA tunnel…</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
