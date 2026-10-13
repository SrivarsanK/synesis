import type { Metrics, MetricsRow } from './types';
import { milliseconds, utc } from './format';

function BarChart({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="bar-chart-row">
      <span className="bar-label">{label}</span>
      <div className="bar-track">
        <div className="bar-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="bar-value">{(value * 100).toFixed(1)}%</span>
    </div>
  );
}

function MetricCard({ label, baseline, blindspot, higherIsBetter, format }: {
  label: string;
  baseline: number | null;
  blindspot: number | null;
  higherIsBetter: boolean;
  format: (n: number | null) => string;
}) {
  const blind = blindspot ?? 0;
  const base = baseline ?? 0;
  const diff = blind - base;
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  const diffStr = diff >= 0 ? `+${(diff * 100).toFixed(1)}pp` : `${(diff * 100).toFixed(1)}pp`;
  return (
    <div className="metric-card">
      <span className="metric-card-label">{label}</span>
      <div className="metric-card-values">
        <div className="metric-card-val muted">
          <small>Rules-only</small>
          <strong>{format(baseline)}</strong>
        </div>
        <div className="metric-card-val accent">
          <small>Blindspot</small>
          <strong>{format(blindspot)}</strong>
        </div>
        {baseline !== null && blindspot !== null && (
          <div className={`metric-card-delta ${improved ? 'positive' : 'negative'}`}>
            {diffStr}
          </div>
        )}
      </div>
    </div>
  );
}

export default function BenchmarkPanel({ metrics, error, retry }: { metrics: Metrics | null; error: string; retry: () => void }) {
  if (error) return (
    <section className="panel empty" role="alert">
      <h2>Evaluation unavailable</h2>
      <p>{error}</p>
      <button onClick={retry}>Retry metrics</button>
    </section>
  );

  if (!metrics) return (
    <section className="panel empty" aria-busy="true">Loading evaluation…</section>
  );

  if (!metrics.available) return (
    <section className="panel empty">
      <h2>Not yet measured</h2>
      <p>Run the backend evaluation to populate this comparison.</p>
      <p className="muted">No estimated or fabricated results are shown here.</p>
      <button onClick={retry}>Refresh metrics</button>
    </section>
  );

  const percent = (n: number | null) => n === null ? 'N/A' : `${(n * 100).toFixed(1)}%`;
  const latency = (n: number) => milliseconds(n);
  const rows: [string, MetricsRow][] = [['Rules-only baseline', metrics.baseline], ['Blindspot', metrics.blindspot]];

  // For bar chart: use max of both detectors per metric
  const prec = [metrics.baseline.precision ?? 0, metrics.blindspot.precision ?? 0];
  const rec = [metrics.baseline.recall ?? 0, metrics.blindspot.recall ?? 0];
  const fpr = [metrics.baseline.false_positive_rate ?? 0, metrics.blindspot.false_positive_rate ?? 0];
  const maxPrec = Math.max(...prec, 0.0001);
  const maxRec = Math.max(...rec, 0.0001);
  const maxFpr = Math.max(...fpr, 0.0001);

  return (
    <div className="benchmark-layout">
      {/* Summary cards */}
      <section className="panel benchmark-cards">
        <div className="section-heading">
          <div>
            <h2>Detection performance</h2>
            <p>{metrics.dataset} · {metrics.scenario_count} scenarios · {utc(metrics.evaluated_at)}</p>
          </div>
          <button onClick={retry}>Refresh</button>
        </div>
        <div className="metric-cards-grid">
          <MetricCard label="Precision" baseline={metrics.baseline.precision} blindspot={metrics.blindspot.precision} higherIsBetter format={percent} />
          <MetricCard label="Recall" baseline={metrics.baseline.recall} blindspot={metrics.blindspot.recall} higherIsBetter format={percent} />
          <MetricCard label="False positive rate" baseline={metrics.baseline.false_positive_rate} blindspot={metrics.blindspot.false_positive_rate} higherIsBetter={false} format={percent} />
          <MetricCard label="Processing p95" baseline={metrics.baseline.latency_p95_ms} blindspot={metrics.blindspot.latency_p95_ms} higherIsBetter={false} format={n => n === null ? 'N/A' : latency(n)} />
        </div>
      </section>

      {/* Visual bar comparison */}
      <section className="panel benchmark-bars">
        <div className="section-heading">
          <div>
            <h2>Visual comparison</h2>
            <p>Rules-only baseline vs. Blindspot contextual detection</p>
          </div>
        </div>
        <div className="bar-charts-panel">
          <div className="bar-group">
            <h4>Precision (higher is better)</h4>
            <BarChart label="Rules-only" value={metrics.baseline.precision ?? 0} max={maxPrec} color="var(--border-strong)" />
            <BarChart label="Blindspot" value={metrics.blindspot.precision ?? 0} max={maxPrec} color="var(--accent)" />
          </div>
          <div className="bar-group">
            <h4>Recall (higher is better)</h4>
            <BarChart label="Rules-only" value={metrics.baseline.recall ?? 0} max={maxRec} color="var(--border-strong)" />
            <BarChart label="Blindspot" value={metrics.blindspot.recall ?? 0} max={maxRec} color="var(--accent)" />
          </div>
          <div className="bar-group">
            <h4>False positive rate (lower is better)</h4>
            <BarChart label="Rules-only" value={metrics.baseline.false_positive_rate ?? 0} max={maxFpr} color="var(--warning)" />
            <BarChart label="Blindspot" value={metrics.blindspot.false_positive_rate ?? 0} max={maxFpr} color="var(--success)" />
          </div>
        </div>
      </section>

      {/* Confusion matrices */}
      <section className="panel benchmark-matrices">
        <div className="section-heading">
          <div><h2>Confusion matrix</h2><p>Scenario-level counts on held-out synthetic data</p></div>
        </div>
        <div className="matrices-row">
          {rows.map(([name, row]) => (
            <div key={name} className="confusion-matrix">
              <h4>{name}</h4>
              <div className="matrix-grid">
                <div className="matrix-cell tp">
                  <span>TP</span>
                  <strong>{row.tp}</strong>
                  <small>True positive</small>
                </div>
                <div className="matrix-cell fp">
                  <span>FP</span>
                  <strong>{row.fp}</strong>
                  <small>False positive</small>
                </div>
                <div className="matrix-cell fn">
                  <span>FN</span>
                  <strong>{row.fn}</strong>
                  <small>False negative</small>
                </div>
                <div className="matrix-cell tn">
                  <span>TN</span>
                  <strong>{row.tn}</strong>
                  <small>True negative</small>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Methodology note */}
      <section className="panel benchmark-methodology">
        <div className="section-heading"><div><h2>Methodology</h2></div></div>
        <div className="methodology-body">
          <p>
            <strong>Evaluation unit:</strong> {metrics.evaluation_unit}. Each scenario is a self-contained synthetic event sequence.
            A positive prediction is a <em>high-severity</em> case raised by the detector before the final event in the sequence.
            Latencies measure backend event-processing time, not network time.
          </p>
          <p>
            <strong>Baseline:</strong> threshold-only rules (fan-in count + amount). No prior account context.
            <strong> Blindspot:</strong> same detection logic plus contextual scoring using prior account history and velocity windows.
          </p>
          <p className="muted">
            Results are from {metrics.scenario_count} held-out synthetic scenarios ({metrics.dataset}).
            Synthetic results do not establish real-world performance. No real transactions were used.
          </p>
        </div>
      </section>

      <p className="benchmark-footnote">
        Held-out evaluation · {utc(metrics.evaluated_at)} · {metrics.blindspot.sampled_event_count} sampled events
      </p>
    </div>
  );
}
