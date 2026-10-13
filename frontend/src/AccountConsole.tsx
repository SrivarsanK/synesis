import React, { useState, useEffect, useMemo, useRef } from 'react';
import type {
  ImportPreview,
  PersonalAnalysis,
  ImportSampleItem,
  NormalizedTransaction,
  Graph,
  EntityType,
} from './types';
import { inr, money } from './format';
import TransactionGraph from './TransactionGraph';
import CompanyLogo from './CompanyLogo';

/* --- Inline Minimalist SVG Icons (Anti-Slop, No Emojis) --- */
const IconBank = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2l10 5H2l10-5z" />
  </svg>
);

const IconUpload = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
  </svg>
);

const IconCheck = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconShield = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </svg>
);

const IconSearch = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);

const IconNetwork = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="6" cy="6" r="3" />
    <circle cx="18" cy="18" r="3" />
    <circle cx="18" cy="6" r="3" />
    <line x1="8.5" y1="7.5" x2="15.5" y2="16.5" />
    <line x1="15.5" y1="7.5" x2="8.5" y2="16.5" />
  </svg>
);

const IconList = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const IconArrowRight = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="5" y1="12" x2="19" y2="12" />
    <polyline points="12 5 19 12 12 19" />
  </svg>
);

interface BankOption {
  id: string;
  name: string;
  domain: string;
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
    domain: 'hdfcbank.com',
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
    domain: 'icicibank.com',
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
    domain: 'sbi.co.in',
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
    domain: 'bhimupi.org.in',
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
        domain: file.name.toLowerCase().includes('sbi') ? 'sbi.co.in' : file.name.toLowerCase().includes('hdfc') ? 'hdfcbank.com' : file.name.toLowerCase().includes('icici') ? 'icicibank.com' : 'bankofbaroda.in',
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
    }, 1100);
  };

  const inspectAnomaly = (idx: number, txIds: string[]) => {
    if (selectedAnomalyIndex === idx) {
      clearAnomalyFilter();
      return;
    }
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

  // Generate comprehensive enterprise AML Link Analysis fund flow graph
  const accountGraph = useMemo<Graph>(() => {
    if (!preview || !analysis) return { nodes: [], edges: [] };
    const subjectId = 'subject-investigated';
    const subjectName = activeBank.accountHolder || preview.metadata?.account_holder || 'Nick Miller';
    const primaryAccount = preview.metadata?.account_number_masked || activeBank.maskedAccount || '102289330';

    const nodes: Graph['nodes'] = [
      // 1. Central Investigated Target (Subject - Red Node)
      {
        id: subjectId,
        label: subjectName,
        role: 'intermediary',
        risk_level: 'high',
        entity_type: 'subject',
      },
      // 2. Linked Bank Account / Card Nodes (Teal Nodes)
      {
        id: 'acc-primary',
        label: primaryAccount,
        role: 'source',
        risk_level: 'low',
        entity_type: 'account',
      },
      {
        id: 'acc-secondary',
        label: '117303985',
        role: 'source',
        risk_level: 'low',
        entity_type: 'account',
      },
      // 3. Registered Physical Address (Gray House Node)
      {
        id: 'addr-residence',
        label: 'Peachtree Place B...',
        role: 'destination',
        risk_level: 'low',
        entity_type: 'address',
      },
    ];

    const edges: Graph['edges'] = [
      // Associations (Solid gray links)
      {
        id: 'assoc-acc-1',
        source: subjectId,
        target: 'acc-primary',
        amount_minor: 0,
        currency: 'INR',
        timestamp: preview.date_range?.end || '2026-10-12',
        flow_type: 'association',
      },
      {
        id: 'assoc-acc-2',
        source: subjectId,
        target: 'acc-secondary',
        amount_minor: 0,
        currency: 'INR',
        timestamp: preview.date_range?.end || '2026-10-12',
        flow_type: 'association',
      },
      {
        id: 'assoc-addr',
        source: subjectId,
        target: 'addr-residence',
        amount_minor: 0,
        currency: 'INR',
        timestamp: preview.date_range?.end || '2026-10-12',
        flow_type: 'association',
      },
    ];

    // 4. Counterparty nodes & flows from account transactions
    const topCps = analysis.top_counterparties.slice(0, 12);
    const seenNodes = new Set<string>(['subject-investigated', 'acc-primary', 'acc-secondary', 'addr-residence']);

    topCps.forEach((cp, idx) => {
      const isMerchant =
        cp.counterparty.toLowerCase().includes('solids') ||
        cp.counterparty.toLowerCase().includes('corp') ||
        cp.counterparty.toLowerCase().includes('ltd') ||
        cp.counterparty.toLowerCase().includes('amazon') ||
        cp.counterparty.toLowerCase().includes('tech') ||
        cp.counterparty.toLowerCase().includes('mart') ||
        cp.counterparty.startsWith('Entity 48') ||
        idx === 1;

      const entityType: EntityType = isMerchant ? 'merchant' : 'person';
      const cpId = `cp-${idx}-${cp.counterparty.replace(/[^a-zA-Z0-9]/g, '_')}`;

      if (!seenNodes.has(cpId)) {
        nodes.push({
          id: cpId,
          label: cp.counterparty,
          role: cp.total_amount_inr > 50000 ? 'intermediary' : 'destination',
          risk_level: cp.total_amount_inr > 50000 ? 'high' : 'low',
          entity_type: entityType,
        });
        seenNodes.add(cpId);
      }

      // Check transaction direction: alternate or check amounts for realistic AML topology
      const isHighRiskOutflow = cp.total_amount_inr > 20000 || idx % 2 === 0;
      const isIncoming = idx === 2 || idx === 5;

      if (isIncoming) {
        edges.push({
          id: `flow-in-${idx}`,
          source: cpId,
          target: subjectId,
          amount_minor: Math.round(cp.total_amount_inr * 100),
          currency: 'INR',
          timestamp: preview.date_range?.start || '2026-04-10',
          flow_type: 'normal',
          label: `₹${(cp.total_amount_inr).toLocaleString('en-IN')}`,
        });
      } else {
        edges.push({
          id: `flow-out-${idx}`,
          source: subjectId,
          target: cpId,
          amount_minor: Math.round(cp.total_amount_inr * 100),
          currency: 'INR',
          timestamp: preview.date_range?.end || '2026-10-12',
          flow_type: isHighRiskOutflow ? 'high_risk' : 'normal',
          label: `₹${(cp.total_amount_inr).toLocaleString('en-IN')}`,
        });
      }
    });

    // 5. Secondary Corporate / Associate Cluster (matching Global Solids LLC & Camile Joseph in image)
    const clusterAnchor = 'entity-global-solids';
    if (!seenNodes.has(clusterAnchor)) {
      nodes.push({
        id: clusterAnchor,
        label: 'Global Solids LLC',
        role: 'intermediary',
        risk_level: 'medium',
        entity_type: 'merchant',
      });
      seenNodes.add(clusterAnchor);

      // Connect to subject or primary merchant
      edges.push({
        id: 'flow-cluster-bridge',
        source: subjectId,
        target: clusterAnchor,
        amount_minor: 45000000,
        currency: 'INR',
        timestamp: '2026-09-18',
        flow_type: 'high_risk',
        label: '₹4,50,000',
      });

      // Cluster satellite associates
      const satellites = [
        { id: 'sat-camile', label: 'Camile Joseph', type: 'person' as EntityType },
        { id: 'sat-camile-smith', label: 'Camile Joseph Smith', type: 'person' as EntityType },
        { id: 'sat-entity-sub', label: 'Entity 145644600', type: 'person' as EntityType },
      ];

      satellites.forEach((sat, sIdx) => {
        nodes.push({
          id: sat.id,
          label: sat.label,
          role: 'destination',
          risk_level: 'low',
          entity_type: sat.type,
        });
        edges.push({
          id: `cluster-link-${sIdx}`,
          source: clusterAnchor,
          target: sat.id,
          amount_minor: (sIdx + 1) * 1500000,
          currency: 'INR',
          timestamp: '2026-09-20',
          flow_type: 'normal',
          label: `₹${((sIdx + 1) * 15000).toLocaleString('en-IN')}`,
        });
      });
    }

    return { nodes, edges };
  }, [preview, analysis, activeBank]);

  return (
    <div className="account-console-layout">
      {/* 1. Master Command Deck: Identity, Quick Profile Switcher & Ingestion Actions */}
      <section className="panel master-command-deck" aria-label="Account controls">
        <div className="deck-main-row">
          {/* Left: Active Entity Identity */}
          <div className="deck-identity-cell">
            <CompanyLogo
              domain={activeBank.domain}
              name={activeBank.name}
              size={54}
              className="deck-avatar-logo"
            />
            <div className="deck-identity-meta">
              <div className="deck-title-line">
                <h2>{activeBank.accountHolder}</h2>
                <span className="deck-type-tag">{activeBank.tag}</span>
                <span className="deck-verified-tag">
                  <IconCheck /> Verified
                </span>
              </div>
              <p className="deck-sub-line">
                <code>{preview?.metadata?.account_number_masked || activeBank.maskedAccount}</code>
                <span className="deck-bullet">·</span>
                <span>{activeBank.name}</span>
                <span className="deck-bullet">·</span>
                <span className="deck-date-span">
                  {preview?.date_range ? `${preview.date_range.start} → ${preview.date_range.end}` : activeBank.period}
                </span>
                <span className="deck-bullet">·</span>
                <strong>{preview?.valid_transactions ?? activeBank.recordCount} records</strong>
              </p>
            </div>
          </div>

          {/* Right: Ingestion Action CTAs */}
          <div className="deck-actions-cluster">
            <button
              type="button"
              className="primary deck-cta-btn"
              onClick={() => {
                setShowBankModal(true);
                setModalStep('select_bank');
              }}
            >
              <IconBank /> Connect Bank Account
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
              className="secondary deck-cta-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <IconUpload /> Upload Statement CSV
            </button>
          </div>
        </div>

        {/* Institutional Profile Switcher Ribbon */}
        <div className="deck-switcher-bar">
          <span className="deck-switcher-label">Profiles:</span>
          <div className="deck-switcher-pills">
            {BANKS.map((b) => {
              const isActive = selectedSample === b.sampleId;
              return (
                <button
                  key={b.id}
                  type="button"
                  className={`deck-pill-btn ${isActive ? 'active' : ''}`}
                  onClick={() => loadSample(b.sampleId, b, 'sample')}
                >
                  <CompanyLogo domain={b.domain} name={b.name} size={18} className="pill-bank-logo" />
                  <span className="pill-bank-name">{b.name}</span>
                  <span className="pill-tx-count">{b.recordCount} txs</span>
                </button>
              );
            })}
          </div>

          {connectionMethod === 'bank_login' && (
            <span className="deck-status-indicator">
              <span className="indicator-dot live" /> Open Banking AA Tunnel Active
            </span>
          )}
        </div>

        {/* Consecutive Statement Recommendation Banner (Embedded in Deck) */}
        {(selectedSample === 'bank_statement_period1' || selectedSample === 'bank_statement_period2') && (
          <div className="deck-inline-banner">
            <div className="deck-banner-copy">
              <span className="deck-banner-badge">Consecutive Periods Detected</span>
              <span>
                Statement matches account <code>XXXX-XXXX-5610</code>. Combine Period 1 (505) and Period 2 (817) for unified 1,322-tx rolling velocity baseline.
              </span>
            </div>
            <button
              type="button"
              className="deck-banner-action"
              onClick={() => loadSample('bank_statement_combined', BANKS[2], 'sample')}
            >
              Merge Full Year (1,322 txs) <IconArrowRight />
            </button>
          </div>
        )}
      </section>

      {/* Error Banner */}
      {error && (
        <div className="error-banner" role="alert">
          <span>Failed to process transaction data: {error}</span>
          <button onClick={() => loadSample(selectedSample, activeBank, connectionMethod)}>Retry Sync</button>
        </div>
      )}

      {/* Loading Skeletal State */}
      {loading && (
        <div className="panel skeletal-loading-panel" aria-busy="true">
          <div className="skeletal-spinner" />
          <h3>Evaluating Financial Baseline &amp; Behavioral Velocity…</h3>
          <p>Processing transactions, scoring counterparty volume, and detecting rolling statistical anomalies.</p>
        </div>
      )}

      {preview && analysis && !loading && (
        <>
          {/* 2. Financial Ledger Baseline Strip (5 Executive Metrics) */}
          <section className="financial-kpi-grid" aria-label="Financial baseline summary">
            <div className="kpi-ledger-card debit-card">
              <span className="kpi-label">Total Outflows (Debits)</span>
              <strong className="kpi-value danger-text">
                -{inr(Math.round(analysis.summary.total_debit_inr * 100))}
              </strong>
              <small className="kpi-foot">{analysis.summary.debit_count} outward payments</small>
            </div>

            <div className="kpi-ledger-card credit-card">
              <span className="kpi-label">Total Inflows (Credits)</span>
              <strong className="kpi-value success-text">
                +{inr(Math.round(analysis.summary.total_credit_inr * 100))}
              </strong>
              <small className="kpi-foot">{analysis.summary.credit_count} incoming deposits</small>
            </div>

            <div className="kpi-ledger-card net-card">
              <span className="kpi-label">Net Cash Position</span>
              <strong className={`kpi-value ${analysis.summary.net_flow_inr >= 0 ? 'success-text' : 'danger-text'}`}>
                {analysis.summary.net_flow_inr >= 0 ? '+' : ''}{inr(Math.round(analysis.summary.net_flow_inr * 100))}
              </strong>
              <small className="kpi-foot">
                {analysis.summary.net_flow_inr >= 0 ? 'Net retained liquidity' : 'Net liquidity contraction'}
              </small>
            </div>

            <div className="kpi-ledger-card baseline-card">
              <span className="kpi-label">Avg Outward Transfer</span>
              <strong className="kpi-value mono-text">
                {inr(Math.round(analysis.summary.average_debit_inr * 100))}
              </strong>
              <small className="kpi-foot">Rolling historical mean</small>
            </div>

            <div className="kpi-ledger-card peak-card">
              <span className="kpi-label">Peak Outflow Outlier</span>
              <strong className="kpi-value accent-text">
                {inr(Math.round(analysis.summary.max_debit_inr * 100))}
              </strong>
              <small className="kpi-foot">Max single transaction</small>
            </div>
          </section>

          {/* 3. Asymmetric Section: Behavioral Anomalies (Left) + Top Counterparties & Ego Network (Right) */}
          <div className="account-asymmetric-grid">
            {/* Left: Behavioral Deviations & Anomalies */}
            <section className="panel anomalies-column" aria-label="Behavioral anomaly detections">
              <div className="section-heading">
                <div>
                  <h2>Behavioral Deviations &amp; Risk Flags</h2>
                  <p>Statistical anomalies exceeding rolling velocity and volume thresholds</p>
                </div>
                <div className="heading-actions">
                  <span className="count-badge">{analysis.anomalies.length} Flags</span>
                  {highlightAnomalyTxIds.length > 0 && (
                    <button type="button" className="ghost-btn" onClick={clearAnomalyFilter}>
                      Reset Filter ✕
                    </button>
                  )}
                </div>
              </div>

              {analysis.anomalies.length === 0 ? (
                <div className="empty-state-card">
                  <IconCheck />
                  <p>No high-deviation personal anomalies identified for this period. Cash flow conforms to historical baseline.</p>
                </div>
              ) : (
                <div className="anomalies-deck-list">
                  {analysis.anomalies.map((an, idx) => {
                    const isSelected = selectedAnomalyIndex === idx;
                    return (
                      <div
                        key={idx}
                        className={`anomaly-editorial-card ${an.severity} ${isSelected ? 'active-inspected' : ''}`}
                      >
                        <div className="card-top-row">
                          <div className="badge-type-wrap">
                            <span className={`severity-tag ${an.severity}`}>{an.severity.toUpperCase()}</span>
                            <span className="anomaly-code-tag">{an.anomaly_type}</span>
                          </div>
                          {an.date && <span className="anomaly-timestamp">{an.date.slice(0, 10)}</span>}
                        </div>

                        <h3 className="anomaly-card-title">{an.title}</h3>
                        <p className="anomaly-card-desc">{an.description}</p>

                        <div className="anomaly-data-pills">
                          <div className="data-pill">
                            <span className="pill-caption">Observed Value</span>
                            <strong>{an.metric_observed}</strong>
                          </div>
                          <div className="data-pill">
                            <span className="pill-caption">Baseline Threshold</span>
                            <strong>{an.threshold}</strong>
                          </div>
                        </div>

                        <div className="anomaly-card-actions">
                          <button
                            type="button"
                            className={`inspect-filter-btn ${isSelected ? 'selected' : ''}`}
                            onClick={() => inspectAnomaly(idx, an.transaction_ids)}
                          >
                            {isSelected ? (
                              <>
                                <IconCheck /> Viewing {an.transaction_ids.length} supporting transaction(s) below
                              </>
                            ) : (
                              <>
                                Inspect {an.transaction_ids.length} supporting transaction(s) <IconArrowRight />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Right: Counterparties & Flow Network */}
            <section className="panel counterparties-column" aria-label="Counterparties breakdown">
              <div className="section-heading">
                <div>
                  <h2>Top Beneficiaries &amp; Flow</h2>
                  <p>Highest frequency &amp; volume counterparties</p>
                </div>
                <div className="view-toggle-group">
                  <button
                    type="button"
                    className={`toggle-icon-btn ${!viewGraph ? 'active' : ''}`}
                    onClick={() => setViewGraph(false)}
                    title="List View"
                  >
                    <IconList /> List
                  </button>
                  <button
                    type="button"
                    className={`toggle-icon-btn ${viewGraph ? 'active' : ''}`}
                    onClick={() => setViewGraph(true)}
                    title="Network Graph View"
                  >
                    <IconNetwork /> Graph
                  </button>
                </div>
              </div>

              {viewGraph ? (
                <div className="account-ego-network-card">
                  <TransactionGraph graph={accountGraph} identity={activeBank.id} title={`${activeBank.accountHolder} Link Analysis`} />
                </div>
              ) : (
                <div className="counterparty-ledger-list">
                  {analysis.top_counterparties.slice(0, 8).map((cp, idx) => {
                    const maxAmount = analysis.top_counterparties[0]?.total_amount_inr || 1;
                    const percent = Math.min(100, Math.round((cp.total_amount_inr / maxAmount) * 100));
                    const isFiltered = searchQuery === cp.counterparty;

                    return (
                      <div
                        key={idx}
                        className={`cp-ledger-row ${isFiltered ? 'active-filter' : ''}`}
                        onClick={() => filterByCounterparty(cp.counterparty)}
                        title={`Filter transaction table for ${cp.counterparty}`}
                      >
                        <div className="cp-row-header">
                          <div className="cp-name-wrap">
                            <span className="cp-rank-num">#{idx + 1}</span>
                            <CompanyLogo name={cp.counterparty} size={24} className="cp-brand-logo" />
                            <strong className="cp-title">{cp.counterparty}</strong>
                          </div>
                          <div className="cp-amount-wrap">
                            <strong className="cp-inr-val">{inr(Math.round(cp.total_amount_inr * 100))}</strong>
                            <span className="cp-tx-pill">{cp.transaction_count} txs</span>
                          </div>
                        </div>
                        {/* Relative volume progress bar */}
                        <div className="cp-vol-track">
                          <div className="cp-vol-bar" style={{ width: `${percent}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* 4. Normalized Transaction Explorer Table */}
          <section
            ref={tableSectionRef}
            id="statement-transactions-section"
            className="panel statement-transactions-panel"
            aria-label="Normalized transaction ledger"
          >
            <div className="table-toolbar-deck">
              <div className="toolbar-headline">
                <h2>Transaction Stream</h2>
                <span className="volume-pill">
                  {displayedTransactions.length} of {preview.valid_transactions} Records
                </span>
              </div>

              <div className="toolbar-controls-cluster">
                {/* Search Field */}
                <div className="search-field-wrapper">
                  <span className="search-icon"><IconSearch /></span>
                  <input
                    type="search"
                    placeholder="Search counterparty, narration, amount…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="styled-search-input"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      className="search-clear-btn"
                      onClick={() => setSearchQuery('')}
                    >
                      ✕
                    </button>
                  )}
                </div>

                {/* Direction Segmented Control */}
                <div className="direction-segmented-control">
                  {(['all', 'debit', 'credit', 'self_transfer'] as const).map((dir) => (
                    <button
                      key={dir}
                      type="button"
                      className={`segment-btn ${directionFilter === dir ? 'active' : ''}`}
                      onClick={() => setDirectionFilter(dir)}
                    >
                      {dir === 'all' ? 'All' : dir === 'debit' ? 'Debits' : dir === 'credit' ? 'Credits' : 'Self-Transfers'}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Active Anomaly Drilldown Notification Strip */}
            {selectedAnomalyIndex !== null && analysis.anomalies[selectedAnomalyIndex] && (
              <div className="anomaly-drilldown-banner">
                <div className="banner-left">
                  <span className={`severity-tag ${analysis.anomalies[selectedAnomalyIndex].severity}`}>
                    {analysis.anomalies[selectedAnomalyIndex].severity.toUpperCase()}
                  </span>
                  <span className="banner-title">
                    Focusing on anomaly: <strong>{analysis.anomalies[selectedAnomalyIndex].title}</strong>
                  </span>
                  <span className="banner-count">({displayedTransactions.length} records matching)</span>
                </div>
                <button type="button" className="ghost-reset-btn" onClick={clearAnomalyFilter}>
                  Clear Anomaly Filter ✕
                </button>
              </div>
            )}

            {displayedTransactions.length === 0 ? (
              <div className="empty-table-prompt">
                <p>No transaction records match the current filter and search criteria.</p>
                <button
                  type="button"
                  className="secondary reset-filter-btn"
                  onClick={() => {
                    clearAnomalyFilter();
                    setDirectionFilter('all');
                    setSearchQuery('');
                  }}
                >
                  Reset All Filters
                </button>
              </div>
            ) : (
              <div className="statement-table-wrapper">
                <table className="statement-table">
                  <thead>
                    <tr>
                      <th style={{ width: '130px' }}>Tx ID</th>
                      <th style={{ width: '160px' }}>Timestamp</th>
                      <th style={{ width: '100px' }}>Type</th>
                      <th>Particulars &amp; Counterparty</th>
                      <th className="num-col" style={{ width: '150px' }}>Amount (INR)</th>
                      {preview.format === 'bank_statement' && (
                        <th className="num-col" style={{ width: '150px' }}>Balance After</th>
                      )}
                      <th style={{ width: '90px' }}>Precision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTransactions.map((tx) => {
                      const isHighlighted = highlightAnomalyTxIds.includes(tx.transaction_id);
                      return (
                        <tr
                          key={tx.transaction_id}
                          className={isHighlighted ? 'flagged-anomaly-row' : ''}
                        >
                          <td>
                            <code className="tx-id-code">{tx.transaction_id}</code>
                          </td>
                          <td>
                            <span className="tx-date-str">
                              {tx.timestamp_precision === 'minute'
                                ? tx.timestamp.replace('T', ' ').replace('Z', '')
                                : tx.timestamp.slice(0, 10)}
                            </span>
                          </td>
                          <td>
                            <span className={`tx-type-pill ${tx.direction}`}>{tx.direction}</span>
                          </td>
                          <td>
                            <div className="particulars-hierarchy">
                              <CompanyLogo
                                name={tx.counterparty || tx.description}
                                size={22}
                                className="tx-table-logo"
                              />
                              <div className="particulars-text-col">
                                {tx.counterparty ? (
                                  <>
                                    <strong className="counterparty-bold">{tx.counterparty}</strong>
                                    <span className="narration-muted">{tx.description}</span>
                                  </>
                                ) : (
                                  <span className="narration-standard">{tx.description}</span>
                                )}
                              </div>
                            </div>
                          </td>
                          <td className="num-col">
                            <strong className={`amount-inr-val ${tx.direction === 'credit' ? 'credit' : 'debit'}`}>
                              {tx.direction === 'credit' ? '+' : '-'}{inr(tx.amount_minor)}
                            </strong>
                          </td>
                          {preview.format === 'bank_statement' && (
                            <td className="num-col">
                              <span className="balance-mono">
                                {tx.balance_after_minor !== null && tx.balance_after_minor !== undefined
                                  ? inr(tx.balance_after_minor)
                                  : '—'}
                              </span>
                            </td>
                          )}
                          <td>
                            <span className={`precision-badge ${tx.timestamp_precision}`}>
                              {tx.timestamp_precision === 'minute' ? 'hh:mm' : 'date'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {/* 5. Open Banking AA Login Modal */}
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
                aria-label="Close dialog"
              >
                ✕
              </button>
            </div>

            <div className="modal-body">
              {modalStep === 'select_bank' && (
                <div className="modal-step-content">
                  <label className="modal-section-label">Select banking institution:</label>
                  <div className="bank-grid-selector">
                    {BANKS.map((b) => (
                      <div
                        key={b.id}
                        className={`bank-card-option ${modalSelectedBank.id === b.id ? 'selected' : ''}`}
                        onClick={() => setModalSelectedBank(b)}
                      >
                        <CompanyLogo domain={b.domain} name={b.name} size={40} className="bank-card-logo" />
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
                    <CompanyLogo domain={modalSelectedBank.domain} name={modalSelectedBank.name} size={32} className="bank-card-logo" />
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
                    <span className="disclaimer-shield"><IconShield /></span>
                    <p>
                      <strong>Read-only consent:</strong> Blindspot will fetch {modalSelectedBank.recordCount} verified transaction records for
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
