import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from './api';
import type { CaseDetail, CaseSummary, DemoStatus, Graph, List, Metrics, Transaction } from './types';
import { account, milliseconds, money, utc } from './format';
import TransactionGraph from './TransactionGraph';
import BenchmarkPanel from './BenchmarkPanel';

type Mode = 'monitor' | 'investigation' | 'benchmarks';
type Snapshot = { transactions: List<Transaction>; cases: List<CaseSummary>; status: DemoStatus };
type CaseAction = 'escalate_for_review' | 'monitor_or_verify' | 'close_as_benign' | 'download_evidence';

const actions = {
  allow_and_monitor: 'Allow and monitor',
  monitor_or_verify: 'Monitor or request verification',
  escalate_for_review: 'Escalate for human review',
};
const errorText = (error: unknown) => error instanceof Error ? error.message : 'The request failed. Please retry.';
const emptyGraph: Graph = { nodes: [], edges: [] };

/* Fund-flow helpers */
function computeFundFlow(detail: CaseDetail, caseGraph: Graph | null) {
  if (!caseGraph) return null;
  const subject = detail.subject_account_id;

  let inflow = 0;
  let outflow = 0;
  let inSources = new Set<string>();
  let outTargets = new Set<string>();

  for (const edge of caseGraph.edges) {
    if (edge.target === subject) {
      inflow += edge.amount_minor;
      inSources.add(edge.source);
    } else if (edge.source === subject) {
      outflow += edge.amount_minor;
      outTargets.add(edge.target);
    }
  }

  const passThrough = inflow > 0 ? Math.round((outflow / inflow) * 1000) / 10 : null;
  return { inflow, outflow, retained: inflow - outflow, inSources: inSources.size, outTargets: outTargets.size, passThrough };
}

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
  // Playback state
  const [playing, setPlaying] = useState(false);
  const [playSpeed, setPlaySpeed] = useState<1 | 2 | 4>(1);
  // Audit trail for case actions
  const [auditTrail, setAuditTrail] = useState<{ action: string; timestamp: string; note?: string }[]>([]);
  const [actionNote, setActionNote] = useState('');
  const [showActionInput, setShowActionInput] = useState<CaseAction | null>(null);

  const generation = useRef(0);
  const fetching = useRef(false);
  const mutating = useRef(false);
  const mounted = useRef(true);
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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

  useEffect(() => {
    mounted.current = true;
    void refresh();
    void refreshMetrics();
    const timer = setInterval(() => void refresh(), 1500);
    return () => { mounted.current = false; clearInterval(timer); };
  }, [refresh, refreshMetrics]);

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

  // Auto-playback for evidence replay
  useEffect(() => {
    if (!playing) { if (playTimer.current) clearInterval(playTimer.current); return; }
    const delay = Math.round(1200 / playSpeed);
    playTimer.current = setInterval(() => {
      setEvidenceIndex(n => {
        const next = n + 1;
        if (next >= (evidence?.length ?? 0)) { setPlaying(false); return n; }
        return next;
      });
    }, delay);
    return () => { if (playTimer.current) clearInterval(playTimer.current); };
  }, [playing, playSpeed]);

  function openCase(id: string) {
    if (id !== selected) { setDetail(null); setCaseGraph(null); setEvidenceIndex(-1); setAuditTrail([]); }
    setSelected(id);
    setMode('investigation');
    setPlaying(false);
  }

  async function mutate(kind: 'step' | 'reset') {
    if (mutating.current) return;
    mutating.current = true; generation.current++; setBusy(true); setOperationError(''); setNotice('');
    try {
      if (kind === 'reset') {
        await api.reset(scenario.trim());
        setSelected(null); setEvidenceIndex(-1); setSnapshot(null); setMode('monitor'); setPlaying(false);
        setNotice('Synthetic demo reset. Prior account history may be restored by the server.');
      } else {
        const result = await api.next();
        setNotice(result.ingestion
          ? `Accepted ${result.ingestion.transaction_id}${result.ingestion.duplicate ? ' (duplicate; no new event)' : ''}.`
          : 'All scenario events have been processed.');
      }
    } catch (error) { setOperationError(`${errorText(error)} Refresh state before retrying; a timed-out request may have reached the server.`); }
    finally { mutating.current = false; setBusy(false); void refresh(); }
  }

  function handleCaseAction(action: CaseAction) {
    if (action === 'download_evidence') {
      if (!detail || !caseGraph) return;
      const payload = { case: detail, graph: caseGraph, auditTrail, exported_at: new Date().toISOString() };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `${detail.case_id}-evidence.json`; a.click();
      URL.revokeObjectURL(url);
      return;
    }
    setShowActionInput(action);
  }

  function submitAction(action: CaseAction) {
    const labels: Record<CaseAction, string> = {
      escalate_for_review: 'Escalated for human review',
      monitor_or_verify: 'Flagged for monitoring / verification',
      close_as_benign: 'Closed as benign',
      download_evidence: 'Evidence downloaded',
    };
    setAuditTrail(prev => [...prev, { action: labels[action], timestamp: new Date().toISOString(), note: actionNote || undefined }]);
    setActionNote(''); setShowActionInput(null);
    setNotice(`Action recorded: ${labels[action]}`);
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
  const fundFlow = useMemo(() => detail ? computeFundFlow(detail, caseGraph) : null, [detail, caseGraph]);
  const cases = snapshot?.cases.items ?? [];
  const investigating = mode === 'investigation';
  const graph = investigating ? caseGraph ?? emptyGraph : recentGraph;
  const status = snapshot?.status;

  return <>
    <a className="skip-link" href="#main">Skip to investigation console</a>
    <header className="app-header">
      <a className="brand" href="#main" onClick={() => setMode('monitor')}>blindspot<span>.</span></a>
      <nav aria-label="Main navigation">
        {(['monitor', 'investigation', 'benchmarks'] as const).map(tab =>
          <button key={tab} aria-current={mode === tab ? 'page' : undefined} onClick={() => setMode(tab)}>
            {tab === 'monitor' ? 'Live monitor' : tab === 'investigation' ? 'Investigation' : 'Benchmarks'}
          </button>
        )}
      </nav>
      <div className="header-status">
        <span className="synthetic-badge">SYNTHETIC / DEMO</span>
        <span className={loadError ? 'connection disconnected' : 'connection'}>
          {loadError ? 'API disconnected' : snapshot ? 'API connected' : 'Connecting…'}
        </span>
      </div>
    </header>

    <main id="main">
      <div className="page-heading">
        <div>
          <h1>{mode === 'monitor' ? 'Follow the money. Find the context.' : investigating ? 'Every signal needs evidence.' : 'Measure the difference.'}</h1>
          <p>{mode === 'monitor' ? 'Incremental account activity and evidence-backed investigation.' : investigating ? 'Potential risk, explained through real synthetic transfers.' : 'Rules-only baseline and contextual detection on held-out synthetic scenarios.'}</p>
        </div>
        <span className="workspace-label">INVESTIGATION WORKSPACE</span>
      </div>

      {loadError && <div className="error-banner" role="alert">
        <span>Unable to refresh API state. {loadError} {snapshot ? 'Showing the last successful snapshot.' : ''}</span>
        <button onClick={() => void refresh()}>Retry connection</button>
      </div>}

      <section className="metrics-strip" aria-label="Backend metrics">
        <div>
          <span>Scenario events processed</span>
          <strong>{status?.next_index ?? '—'}</strong>
          <small>Current scenario · excludes seeded history</small>
        </div>
        <div>
          <span>Total transactions loaded</span>
          <strong>{snapshot?.transactions.items.length ?? '—'}</strong>
          <small>Including seeded prior account history</small>
        </div>
        <div>
          <span>Open cases</span>
          <strong>{snapshot?.cases.count ?? '—'}</strong>
          <small>{snapshot && cases.filter(c => c.severity === 'high').length > 0 ? `${cases.filter(c => c.severity === 'high').length} high-severity` : 'Potential risk requiring investigation'}</small>
        </div>
        <div>
          <span>Processing p95</span>
          <strong className="latency">{metrics?.available ? milliseconds(metrics.blindspot.latency_p95_ms) : '—'}</strong>
          <small>{metrics?.available ? `${metrics.dataset} · ${metrics.blindspot.sampled_event_count} events` : 'Run benchmarks to measure'}</small>
        </div>
      </section>

      {mode === 'benchmarks' ? <BenchmarkPanel metrics={metrics} error={metricsError} retry={() => void refreshMetrics()} /> : <>
        {/* Scenario Controls */}
        <section className="demo-controls" aria-label="Synthetic scenario controls">
          <div className="scenario-input">
            <label htmlFor="scenario">Synthetic scenario</label>
            <input id="scenario" list="scenarios" value={scenario} onChange={event => setScenario(event.target.value)} disabled={busy} />
            <datalist id="scenarios">
              <option value="mule_fan_in_pass_through" />
              <option value="merchant_legitimate" />
            </datalist>
          </div>
          <div className="scenario-tags">
            <button
              className={scenario === 'mule_fan_in_pass_through' ? 'tag-btn active' : 'tag-btn'}
              onClick={() => setScenario('mule_fan_in_pass_through')}
              disabled={busy}
              title="Fan-in + rapid pass-through — should generate high-risk case"
            >
              Money mule
            </button>
            <button
              className={scenario === 'merchant_legitimate' ? 'tag-btn active green' : 'tag-btn'}
              onClick={() => setScenario('merchant_legitimate')}
              disabled={busy}
              title="Merchant settlement lookalike — should NOT trigger false positive"
            >
              Legitimate merchant
            </button>
          </div>
          <div className="scenario-progress">
            <span>{status ? `${status.next_index} / ${status.total_events}` : '— / —'}</span>
            <small>{status?.scenario ?? 'Load a scenario to begin'}</small>
          </div>
          <button disabled={busy || !scenario.trim()} onClick={() => void mutate('reset')}>
            {busy ? 'Working…' : 'Reset & load'}
          </button>
          <button className="primary" disabled={busy || !status || status.complete || !!loadError} onClick={() => void mutate('step')}>
            {busy ? 'Processing…' : status?.complete ? 'Complete' : 'Step →'}
          </button>
        </section>
        <div className="operation-status" aria-live="polite">
          {notice || (status?.complete ? 'Scenario complete. Reset to repeat or load another scenario.' : 'Step ingests one event. Reset clears the current demo.')}
        </div>
        {operationError && <div className="error-banner" role="alert">{operationError}<button onClick={() => void refresh()}>Refresh state</button></div>}

        {/* Workbench */}
        <div className="workbench">
          {/* Graph + Evidence graph */}
          <section className="panel graph-panel">
            <div className="section-heading">
              <div>
                <h2>{investigating ? 'Case evidence network' : 'Transaction network'}</h2>
                <p>{investigating ? (selected ?? 'Select a case to begin') : 'Recent accepted activity · up to 50 accounts'}</p>
              </div>
              {investigating && selected && <button onClick={() => { setSelected(null); setMode('monitor'); }}>Close investigation</button>}
            </div>
            {caseLoading && investigating && <p className="inline-status" role="status">Loading case evidence…</p>}
            {caseError && investigating && <div className="error-banner" role="alert">
              Unable to load case evidence. {caseError}
              <button onClick={() => setCaseRetry(n => n + 1)}>Retry evidence</button>
            </div>}
            <TransactionGraph graph={graph} active={investigating ? evidence[evidenceIndex]?.id : undefined} identity={investigating ? (selected ?? 'unselected') : 'recent'} />
          </section>

          {/* Case queue */}
          <aside className="panel case-queue">
            <div className="section-heading">
              <div>
                <h2>Case queue</h2>
                <p>{snapshot ? `${snapshot.cases.count} open · latest activity first` : 'Loading cases…'}</p>
              </div>
            </div>
            {!cases.length
              ? <div className="empty">
                  <h3>{snapshot ? 'No suspicious network cases yet.' : 'Waiting for API state'}</h3>
                  <p>A case appears only when the backend finds sufficient causal evidence. An empty queue does not establish activity is safe.</p>
                </div>
              : <ul>
                  {cases.map(item => <li key={item.case_id} className={selected === item.case_id ? 'selected-case' : ''}>
                    <div className="case-top">
                      <span className={`severity ${item.severity}`}>{item.severity}</span>
                      <strong>{item.risk_score}<small>/100</small></strong>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{account(item.subject_account_id)} · {item.transaction_count} transfers</p>
                    <small>{item.case_id} · updated {utc(item.updated_at)}</small>
                    <button className="investigate" onClick={() => openCase(item.case_id)} aria-label={`Investigate ${item.case_id}`}>
                      Investigate case <span aria-hidden="true">→</span>
                    </button>
                  </li>)}
                </ul>
            }
          </aside>
        </div>

        {/* Investigation Detail */}
        {investigating && detail && <section className="investigation-detail panel">
          <div className="section-heading">
            <div>
              <h2>{detail.title}</h2>
              <p>{detail.case_id} · {account(detail.subject_account_id)}</p>
            </div>
            <span className={`severity ${detail.severity}`}>{detail.severity} · {detail.risk_score}/100</span>
          </div>

          {/* Fund Movement Summary */}
          {fundFlow && <div className="fund-flow-bar" aria-label="Fund movement summary">
            <div className="fund-flow-node inflow">
              <span className="flow-label">Inflow sources</span>
              <strong className="flow-amount">{money(fundFlow.inflow)}</strong>
              <small>{fundFlow.inSources} sender{fundFlow.inSources !== 1 ? 's' : ''}</small>
            </div>
            <div className="fund-flow-arrow">
              <div className="flow-line">
                <div className="flow-fill" style={{ width: `${Math.min(100, fundFlow.passThrough ?? 0)}%` }} />
              </div>
              <span className="flow-pct">{fundFlow.passThrough !== null ? `${fundFlow.passThrough}% passed through` : 'Pass-through unknown'}</span>
            </div>
            <div className={`fund-flow-node subject ${detail.severity}`}>
              <span className="flow-label">Subject account</span>
              <strong className="flow-amount">{account(detail.subject_account_id)}</strong>
              <small>{detail.severity} risk · {detail.risk_score}/100</small>
            </div>
            <div className="fund-flow-arrow">
              <div className="flow-line">
                <div className="flow-fill outflow" style={{ width: `${Math.min(100, fundFlow.passThrough ?? 0)}%` }} />
              </div>
              <span className="flow-pct">{money(fundFlow.outflow)} forwarded</span>
            </div>
            <div className="fund-flow-node outflow">
              <span className="flow-label">Outflow destinations</span>
              <strong className="flow-amount">{money(fundFlow.outflow)}</strong>
              <small>{fundFlow.outTargets} recipient{fundFlow.outTargets !== 1 ? 's' : ''}</small>
            </div>
            {fundFlow.retained !== 0 && <div className="fund-flow-retained">
              <span>Retained: {money(Math.abs(fundFlow.retained))}</span>
            </div>}
          </div>}

          <div className="detail-columns">
            {/* Left column: recommendation + reason codes */}
            <div>
              <h3>Recommended simulated response</h3>
              <p className="recommendation">{actions[detail.recommended_action]}</p>
              <p className="muted">Hand-engineered relative risk score, not a calibrated probability. No payment is blocked.</p>
              <dl className="dates">
                <dt>Case created</dt><dd>{utc(detail.created_at)}</dd>
                <dt>Last updated</dt><dd>{utc(detail.updated_at)}</dd>
              </dl>

              <h3>Context & reason codes</h3>
              <ul className="reasons">
                {detail.reason_codes.map((reason, index) => <li key={`${reason.code}-${index}`}>
                  <strong>{reason.code.replaceAll('_', ' ')}</strong>
                  <dl>
                    {Object.entries(reason).filter(([key]) => !['code', 'transaction_ids'].includes(key)).map(([key, value]) =>
                      <div key={key}><dt>{key.replaceAll('_', ' ')}</dt><dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd></div>
                    )}
                  </dl>
                  <small>Evidence: {reason.transaction_ids.join(', ') || 'Prior account context'}</small>
                </li>)}
              </ul>

              {/* Case management actions */}
              <div className="case-actions">
                <h3>Case management</h3>
                <p className="muted">Simulated response decisions. Actions are logged to a local audit trail.</p>
                <div className="action-buttons">
                  <button
                    className="action-btn escalate"
                    onClick={() => handleCaseAction('escalate_for_review')}
                    disabled={!!showActionInput}
                  >
                    Escalate for review
                  </button>
                  <button
                    className="action-btn monitor"
                    onClick={() => handleCaseAction('monitor_or_verify')}
                    disabled={!!showActionInput}
                  >
                    Request verification
                  </button>
                  <button
                    className="action-btn benign"
                    onClick={() => handleCaseAction('close_as_benign')}
                    disabled={!!showActionInput}
                  >
                    Close as benign
                  </button>
                  <button
                    className="action-btn download"
                    onClick={() => handleCaseAction('download_evidence')}
                    title="Download full case evidence as JSON"
                  >
                    Download evidence
                  </button>
                </div>
                {showActionInput && <div className="action-input-row">
                  <label htmlFor="action-note" className="sr-only">Optional note</label>
                  <input
                    id="action-note"
                    type="text"
                    placeholder="Optional analyst note…"
                    value={actionNote}
                    onChange={e => setActionNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') submitAction(showActionInput); if (e.key === 'Escape') setShowActionInput(null); }}
                    autoFocus
                  />
                  <button className="primary" onClick={() => submitAction(showActionInput)}>Confirm</button>
                  <button onClick={() => { setShowActionInput(null); setActionNote(''); }}>Cancel</button>
                </div>}
                {auditTrail.length > 0 && <div className="audit-trail">
                  <h4>Audit trail</h4>
                  <ol>
                    {auditTrail.map((entry, i) => <li key={i}>
                      <span className="audit-time">{utc(entry.timestamp)}</span>
                      <span className="audit-action">{entry.action}</span>
                      {entry.note && <span className="audit-note">{entry.note}</span>}
                    </li>)}
                  </ol>
                </div>}
              </div>
            </div>

            {/* Right column: chronological evidence */}
            <div>
              <div className="evidence-heading">
                <h3>Chronological evidence</h3>
                <span>{evidenceIndex < 0 ? 'Ready' : `${evidenceIndex + 1} / ${evidence.length}`}</span>
              </div>
              <p className="muted">Visual replay highlights accepted transfers without re-ingesting them.</p>

              <div className="replay-controls">
                <button
                  disabled={!evidence.length || evidenceIndex < 0}
                  onClick={() => { setEvidenceIndex(-1); setPlaying(false); }}
                  title="Reset to start"
                >↩ Reset</button>
                <button
                  className={playing ? 'primary' : ''}
                  disabled={!evidence.length || evidenceIndex >= evidence.length - 1}
                  onClick={() => setPlaying(p => !p)}
                  title={playing ? 'Pause playback' : 'Auto-play evidence'}
                >
                  {playing ? '⏸ Pause' : '▶ Play'}
                </button>
                <button
                  className="primary"
                  disabled={!evidence.length || evidenceIndex >= evidence.length - 1}
                  onClick={() => { setPlaying(false); setEvidenceIndex(n => n + 1); }}
                >Next →</button>
                <div className="speed-group" role="group" aria-label="Playback speed">
                  {([1, 2, 4] as const).map(s => <button
                    key={s}
                    className={playSpeed === s ? 'speed-btn active' : 'speed-btn'}
                    onClick={() => setPlaySpeed(s)}
                    aria-pressed={playSpeed === s}
                  >{s}×</button>)}
                </div>
              </div>

              {!evidence.length
                ? <p>Graph evidence is unavailable. Case transaction IDs: {detail.transaction_ids.join(', ')}</p>
                : <ol className="timeline">
                    {evidence.map((edge, index) => <li key={edge.id}>
                      <button
                        aria-pressed={evidenceIndex === index}
                        onClick={() => { setPlaying(false); setEvidenceIndex(index); }}
                      >
                        <span className="timeline-time">{utc(edge.timestamp)}</span>
                        <strong>{account(edge.source)} → {account(edge.target)}</strong>
                        <span>{money(edge.amount_minor)} <small>· {edge.id}</small></span>
                      </button>
                    </li>)}
                  </ol>
              }
            </div>
          </div>
        </section>}

        {/* Transaction Feed */}
        <section className="panel transaction-feed">
          <div className="section-heading">
            <div>
              <h2>Accepted transaction feed</h2>
              <p>Newest first · exact event time in UTC · latest 50 events, including seeded history</p>
            </div>
            <span>{snapshot?.transactions.items.length ?? 0} loaded</span>
          </div>
          {!snapshot?.transactions.items.length
            ? <div className="empty">{snapshot ? 'Start the synthetic stream to see activity.' : 'Loading transactions…'}</div>
            : <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Event time (UTC)</th>
                      <th>Transaction</th>
                      <th>From</th>
                      <th>To</th>
                      <th className="numeric">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.transactions.items.map(tx => <tr key={tx.transaction_id}>
                      <td>{utc(tx.timestamp).replace(' UTC', '')}</td>
                      <td>{tx.transaction_id}</td>
                      <td title={tx.source_account_id}>{account(tx.source_account_id)}</td>
                      <td title={tx.destination_account_id}>{account(tx.destination_account_id)}</td>
                      <td className="numeric">{money(tx.amount_minor)}</td>
                    </tr>)}
                  </tbody>
                </table>
              </div>
          }
        </section>
      </>}

      <footer>
        <span>blindspot. <span className="muted">Fraud hides in plain sight.</span></span>
        <span>Synthetic demonstration. Risk indicator, not proof of financial crime.</span>
      </footer>
    </main>
  </>;
}
