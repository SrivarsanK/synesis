import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { CaseDetail, CaseSummary, DemoStatus, Graph, List, Metrics, Transaction } from './types';
import { account, milliseconds, money, utc } from './format';
import TransactionGraph from './TransactionGraph';
import BenchmarkPanel from './BenchmarkPanel';

type Mode = 'monitor' | 'investigation' | 'benchmarks';
type Snapshot = { transactions: List<Transaction>; cases: List<CaseSummary>; status: DemoStatus };
const actions = { allow_and_monitor: 'Allow and monitor', monitor_or_verify: 'Monitor or request verification', escalate_for_review: 'Escalate for human review' };
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request failed. Please retry.';
const emptyGraph: Graph = { nodes: [], edges: [] };

export default function App() {
  const [mode, setMode] = useState<Mode>('monitor');
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loadError, setLoadError] = useState('');
  const [operationError, setOperationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [scenario, setScenario] = useState('mule_fan_in_pass_through');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [caseGraph, setCaseGraph] = useState<Graph | null>(null);
  const [caseError, setCaseError] = useState('');
  const [caseLoading, setCaseLoading] = useState(false);
  const [caseRetry, setCaseRetry] = useState(0);
  const [evidenceIndex, setEvidenceIndex] = useState(-1);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [metricsError, setMetricsError] = useState('');
  const generation = useRef(0);
  const fetching = useRef(false);
  const mutating = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (fetching.current || mutating.current) return;
    fetching.current = true;
    const epoch = generation.current;
    try {
      const [transactions, cases, status] = await Promise.all([api.transactions(), api.cases(), api.status()]);
      if (mounted.current && epoch === generation.current) { setSnapshot({ transactions, cases, status }); setLoadError(''); }
    } catch (error) { if (mounted.current && epoch === generation.current) setLoadError(errorText(error)); }
    finally { fetching.current = false; }
  }, []);
  const refreshMetrics = useCallback(async () => {
    try { const result = await api.metrics(); if (mounted.current) { setMetrics(result); setMetricsError(''); } }
    catch (error) { if (mounted.current) setMetricsError(errorText(error)); }
  }, []);
  useEffect(() => { mounted.current = true; void refresh(); void refreshMetrics(); const timer = setInterval(() => void refresh(), 1500); return () => { mounted.current = false; clearInterval(timer); }; }, [refresh, refreshMetrics]);
  useEffect(() => { if (mode === 'benchmarks') void refreshMetrics(); }, [mode, refreshMetrics]);
  const selectedVersion = snapshot?.cases.items.find(c => c.case_id === selected)?.updated_at;
  useEffect(() => {
    if (!selected) { setDetail(null); setCaseGraph(null); setCaseLoading(false); return; }
    const controller = new AbortController();
    setCaseLoading(true); setCaseError('');
    Promise.allSettled([api.detail(selected, controller.signal), api.graph(selected, controller.signal)]).then(([d, g]) => {
      if (controller.signal.aborted) return;
      if (d.status === 'fulfilled') setDetail(d.value);
      if (g.status === 'fulfilled') setCaseGraph(g.value);
      const errors = [d, g].filter(result => result.status === 'rejected').map(result => errorText((result as PromiseRejectedResult).reason));
      setCaseError(errors.join(' ')); setCaseLoading(false);
    });
    return () => controller.abort();
  }, [selected, selectedVersion, caseRetry]);
  function openCase(id: string) { if (id !== selected) { setDetail(null); setCaseGraph(null); setEvidenceIndex(-1); } setSelected(id); setMode('investigation'); }
  async function mutate(kind: 'step' | 'reset') {
    if (mutating.current) return;
    mutating.current = true; generation.current++; setBusy(true); setOperationError(''); setNotice('');
    try {
      if (kind === 'reset') { await api.reset(scenario.trim()); setSelected(null); setEvidenceIndex(-1); setSnapshot(null); setMode('monitor'); setNotice('Synthetic demo reset. Prior account history may be restored by the server.'); }
      else { const result = await api.next(); setNotice(result.ingestion ? `Accepted ${result.ingestion.transaction_id}${result.ingestion.duplicate ? ' (duplicate; no new event)' : ''}.` : 'All scenario events have been processed.'); }
    } catch (error) { setOperationError(`${errorText(error)} Refresh state before retrying; a timed-out request may have reached the server.`); }
    finally { mutating.current = false; setBusy(false); void refresh(); }
  }
  const recentGraph = useMemo<Graph>(() => {
    const nodes = new Map<string, Graph['nodes'][number]>();
    const edges: Graph['edges'] = [];
    for (const tx of snapshot?.transactions.items ?? []) {
      const ids = [tx.source_account_id, tx.destination_account_id];
      if (nodes.size + ids.filter(id => !nodes.has(id)).length > 50) continue;
      for (const id of ids) if (!nodes.has(id)) nodes.set(id, { id, label: account(id), role: id === tx.source_account_id ? 'source' : 'destination', risk_level: 'unknown' });
      edges.push({ id: tx.transaction_id, source: tx.source_account_id, target: tx.destination_account_id, amount_minor: tx.amount_minor, currency: tx.currency, timestamp: tx.timestamp });
    }
    return { nodes: [...nodes.values()], edges };
  }, [snapshot?.transactions]);
  const evidence = useMemo(() => [...(caseGraph?.edges ?? [])].sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp) || a.id.localeCompare(b.id)), [caseGraph]);
  const cases = snapshot?.cases.items ?? [];
  const investigating = mode === 'investigation';
  const graph = investigating ? caseGraph ?? emptyGraph : recentGraph;
  const status = snapshot?.status;
  return <><a className="skip-link" href="#main">Skip to investigation console</a><header className="app-header"><a className="brand" href="#main" onClick={() => setMode('monitor')}>blindspot<span>.</span></a><nav aria-label="Main navigation">{(['monitor', 'investigation', 'benchmarks'] as const).map(tab => <button key={tab} aria-current={mode === tab ? 'page' : undefined} onClick={() => setMode(tab)}>{tab === 'monitor' ? 'Live monitor' : tab === 'investigation' ? 'Investigation' : 'Benchmarks'}</button>)}</nav><div className="header-status"><span className="synthetic-badge">SYNTHETIC STREAM / DEMO</span><span className={loadError ? 'connection disconnected' : 'connection'}>{loadError ? 'API disconnected' : snapshot ? 'API connected' : 'Connecting…'}</span></div></header>
  <main id="main"><div className="page-heading"><div><h1>{mode === 'monitor' ? 'Follow the money. Find the context.' : investigating ? 'Every signal needs evidence.' : 'Measure the difference.'}</h1><p>{mode === 'monitor' ? 'Incremental account activity and evidence-backed investigation.' : investigating ? 'Potential risk, explained through real synthetic transfers.' : 'Rules-only baseline and contextual detection on held-out synthetic scenarios.'}</p></div><span className="workspace-label">INVESTIGATION WORKSPACE</span></div>
  {loadError && <div className="error-banner" role="alert"><span>Unable to refresh API state. {loadError} {snapshot ? 'Showing the last successful snapshot.' : ''}</span><button onClick={() => void refresh()}>Retry connection</button></div>}
  <section className="metrics-strip" aria-label="Backend metrics"><div><span>Processed demo events</span><strong>{status?.next_index ?? '—'}</strong><small>Current scenario · excludes seeded history</small></div><div><span>Open cases</span><strong>{snapshot?.cases.count ?? '—'}</strong><small>Potential risk requiring investigation</small></div><div><span>{snapshot && snapshot.cases.count > cases.length ? 'High risk in loaded cases' : 'High risk cases'}</span><strong>{snapshot ? cases.filter(c => c.severity === 'high').length : '—'}</strong><small>Recommended human review</small></div><div><span>Measured processing p95</span><strong className="latency">{metrics?.available ? milliseconds(metrics.blindspot.latency_p95_ms) : 'Not measured'}</strong><small>{metrics?.available ? `${metrics.dataset} · ${metrics.blindspot.sampled_event_count} sampled events` : 'Available after backend evaluation'}</small></div></section>
  {mode === 'benchmarks' ? <BenchmarkPanel metrics={metrics} error={metricsError} retry={() => void refreshMetrics()} /> : <>
    <section className="demo-controls" aria-label="Synthetic scenario controls"><div className="scenario-input"><label htmlFor="scenario">Synthetic scenario</label><input id="scenario" list="scenarios" value={scenario} onChange={event => setScenario(event.target.value)} disabled={busy}/><datalist id="scenarios"><option value="mule_fan_in_pass_through"/><option value="merchant_legitimate"/></datalist></div><button disabled={busy || !scenario.trim()} onClick={() => void mutate('reset')}>{busy ? 'Working…' : 'Reset & load scenario'}</button><div className="scenario-progress"><span>{status ? `${status.next_index} / ${status.total_events} events` : 'Awaiting backend'}</span><small>{status?.scenario ?? 'Load a scenario to begin'}</small></div><button className="primary" disabled={busy || !status || status.complete || !!loadError} onClick={() => void mutate('step')}>{busy ? 'Processing…' : status?.complete ? 'Scenario complete' : 'Step next transaction'}</button></section>
    <div className="operation-status" aria-live="polite">{notice || (status?.complete ? 'Scenario complete. Reset to repeat or load another synthetic scenario.' : 'Step persists one event. Reset clears the current synthetic demo.')}</div>{operationError && <div className="error-banner" role="alert">{operationError}<button onClick={() => void refresh()}>Refresh state</button></div>}
    <div className="workbench"><section className="panel graph-panel"><div className="section-heading"><div><h2>{investigating ? 'Case evidence network' : 'Transaction network'}</h2><p>{investigating ? selected ?? 'Select a case to begin' : 'Recent accepted activity · up to 50 accounts'}</p></div>{investigating && selected && <button onClick={() => { setSelected(null); setMode('monitor'); }}>Close investigation</button>}</div>{caseLoading && investigating && <p className="inline-status" role="status">Loading case evidence…</p>}{caseError && investigating && <div className="error-banner" role="alert">Unable to load case evidence. {caseError}<button onClick={() => setCaseRetry(n => n + 1)}>Retry evidence</button></div>}<TransactionGraph graph={graph} active={investigating ? evidence[evidenceIndex]?.id : undefined} identity={investigating ? selected ?? 'unselected' : 'recent'} /></section>
    <aside className="panel case-queue"><div className="section-heading"><div><h2>Case queue</h2><p>{snapshot ? `${snapshot.cases.count} open · latest activity first` : 'Loading cases…'}</p></div></div>{!cases.length ? <div className="empty"><h3>{snapshot ? 'No suspicious network cases yet.' : 'Waiting for API state'}</h3><p>A case appears only when the backend finds sufficient causal evidence. An empty queue does not establish that activity is safe.</p></div> : <ul>{cases.map(item => <li key={item.case_id} className={selected === item.case_id ? 'selected-case' : ''}><div className="case-top"><span className={`severity ${item.severity}`}>{item.severity}</span><strong>{item.risk_score}<small>/100</small></strong></div><h3>{item.title}</h3><p>{account(item.subject_account_id)} · {item.transaction_count} transfers</p><small>{item.case_id} · updated {utc(item.updated_at)}</small><button className="investigate" onClick={() => openCase(item.case_id)} aria-label={`Investigate ${item.case_id}`}>Investigate case <span aria-hidden="true">→</span></button></li>)}</ul>}</aside></div>
    {investigating && detail && <section className="investigation-detail panel"><div className="section-heading"><div><h2>{detail.title}</h2><p>{detail.case_id} · {account(detail.subject_account_id)}</p></div><span className={`severity ${detail.severity}`}>{detail.severity} · {detail.risk_score}/100</span></div><div className="detail-columns"><div><h3>Recommended simulated response</h3><p className="recommendation">{actions[detail.recommended_action]}</p><p className="muted">A hand-engineered relative risk score, not a calibrated probability. No payment is blocked.</p><dl className="dates"><dt>Case created</dt><dd>{utc(detail.created_at)}</dd><dt>Last updated</dt><dd>{utc(detail.updated_at)}</dd></dl><h3>Context & reason codes</h3><ul className="reasons">{detail.reason_codes.map((reason, index) => <li key={`${reason.code}-${index}`}><strong>{reason.code.replaceAll('_', ' ')}</strong><dl>{Object.entries(reason).filter(([key]) => !['code', 'transaction_ids'].includes(key)).map(([key, value]) => <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>)}</dl><small>Evidence: {reason.transaction_ids.join(', ') || 'Prior account context'}</small></li>)}</ul></div><div><div className="evidence-heading"><h3>Chronological evidence</h3><span>{evidenceIndex < 0 ? 'Ready' : `${evidenceIndex + 1} / ${evidence.length}`}</span></div><p className="muted">Visual replay only. Highlights accepted transfers without ingesting them again.</p><div className="replay-buttons"><button disabled={evidenceIndex < 0} onClick={() => setEvidenceIndex(-1)}>Restart evidence</button><button className="primary" disabled={!evidence.length || evidenceIndex >= evidence.length - 1} onClick={() => setEvidenceIndex(n => n + 1)}>Next evidence</button></div>{!evidence.length ? <p>Graph evidence is unavailable. Case transaction IDs: {detail.transaction_ids.join(', ')}</p> : <ol className="timeline">{evidence.map((edge, index) => <li key={edge.id}><button aria-pressed={evidenceIndex === index} onClick={() => setEvidenceIndex(index)}><span className="timeline-time">{utc(edge.timestamp)}</span><strong>{account(edge.source)} → {account(edge.target)}</strong><span>{money(edge.amount_minor)} <small>· {edge.id}</small></span></button></li>)}</ol>}</div></div></section>}
    <section className="panel transaction-feed"><div className="section-heading"><div><h2>Accepted transaction feed</h2><p>Newest first · exact event time in UTC · latest 50 events, including any seeded history</p></div><span>{snapshot?.transactions.items.length ?? 0} loaded</span></div>{!snapshot?.transactions.items.length ? <div className="empty">{snapshot ? 'Start the synthetic stream to see activity.' : 'Loading transactions…'}</div> : <div className="table-scroll"><table><thead><tr><th>Event time (UTC)</th><th>Transaction</th><th>From</th><th>To</th><th className="numeric">Amount</th></tr></thead><tbody>{snapshot.transactions.items.map(tx => <tr key={tx.transaction_id}><td>{utc(tx.timestamp).replace(' UTC', '')}</td><td>{tx.transaction_id}</td><td title={tx.source_account_id}>{account(tx.source_account_id)}</td><td title={tx.destination_account_id}>{account(tx.destination_account_id)}</td><td className="numeric">{money(tx.amount_minor)}</td></tr>)}</tbody></table></div>}</section>
  </>}
  <footer><span>blindspot. <span className="muted">Fraud hides in plain sight.</span></span><span>Synthetic demonstration. Risk indicator, not proof of financial crime.</span></footer></main></>;
}
