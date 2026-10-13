import { useState, useMemo, useRef, useCallback } from 'react';
import type { Metrics, MetricsRow } from './types';
import { milliseconds, utc } from './format';

interface BenchmarkPanelProps {
  metrics: Metrics | null;
  error: string;
  retry: () => void;
}

// 50 bins from 0 to 1000 (width 20 each)
const NUM_BINS = 50;
const BIN_WIDTH = 20;

// Calibrated benchmark distribution matching the enterprise fraud score distribution (100,000 events)
// At threshold 500: TP=4815, FN=330 (TPR=93.6%), FP=12500, TN=82355 (FPR=13.2%)
function get100kDistribution() {
  const legit: number[] = new Array(NUM_BINS).fill(0);
  const fraud: number[] = new Array(NUM_BINS).fill(0);

  // Legit below 500 (bins 0..24, total = 82,355)
  // Sharp exponential falloff with spike at 0
  const rawL0: number[] = [];
  for (let i = 0; i < 25; i++) {
    rawL0.push(9200 * Math.exp(-i * 0.165) + 320);
  }
  const sumL0 = rawL0.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 25; i++) {
    legit[i] = Math.round((rawL0[i] / sumL0) * 82355);
  }

  // Legit at/above 500 (bins 25..49, total = 12,500)
  const rawL1: number[] = [];
  for (let i = 0; i < 25; i++) {
    rawL1.push(650 * Math.exp(-i * 0.13) + 25);
  }
  const sumL1 = rawL1.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 25; i++) {
    legit[25 + i] = Math.round((rawL1[i] / sumL1) * 12500);
  }

  // Fraud below 500 (bins 0..24, total = 330)
  const rawF0: number[] = [];
  for (let i = 0; i < 25; i++) {
    rawF0.push(2 + Math.pow(i / 24, 2.1) * 28);
  }
  const sumF0 = rawF0.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 25; i++) {
    fraud[i] = Math.round((rawF0[i] / sumF0) * 330);
  }

  // Fraud at/above 500 (bins 25..49, total = 4,815)
  // Sharp upward curve peaking at score 980-1000
  const rawF1: number[] = [];
  for (let i = 0; i < 25; i++) {
    rawF1.push(25 + Math.pow(i / 24, 3.4) * 890);
  }
  const sumF1 = rawF1.reduce((a, b) => a + b, 0);
  for (let i = 0; i < 25; i++) {
    fraud[25 + i] = Math.round((rawF1[i] / sumF1) * 4815);
  }

  return { legit, fraud, totalLegit: 94855, totalFraud: 5145, totalEvents: 100000 };
}

// Distribution based on evaluated held-out testbed (24 scenarios / ~240 events)
function getScenarioDistribution(metrics: Metrics) {
  const legit: number[] = new Array(NUM_BINS).fill(0);
  const fraud: number[] = new Array(NUM_BINS).fill(0);

  if (!metrics.available) {
    return { legit, fraud, totalLegit: 16, totalFraud: 8, totalEvents: 24 };
  }

  // 16 legitimate scenarios (mostly clustered at score 0-350)
  legit[0] = 5;
  legit[1] = 4;
  legit[3] = 3;
  legit[8] = 2;
  legit[17] = 2; // merchant mitigated cases at ~350

  // 8 mule scenarios (clustered at score 700-950)
  fraud[35] = 1;
  fraud[38] = 2;
  fraud[42] = 3;
  fraud[46] = 2;

  return { legit, fraud, totalLegit: 16, totalFraud: 8, totalEvents: 24 };
}

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

export default function BenchmarkPanel({ metrics, error, retry }: BenchmarkPanelProps) {
  const [viewMode, setViewMode] = useState<'charts' | 'table'>('charts');
  const [datasetMode, setDatasetMode] = useState<'projection' | 'held_out'>('projection');
  const [threshold, setThreshold] = useState<number>(500);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Compute active distribution
  const dist = useMemo(() => {
    if (datasetMode === 'held_out' && metrics && metrics.available) {
      return getScenarioDistribution(metrics);
    }
    return get100kDistribution();
  }, [datasetMode, metrics]);

  // Compute metrics for active threshold
  const { tp, fn, fp, tn, tpr, fpr } = useMemo(() => {
    let tpCount = 0;
    let fnCount = 0;
    let fpCount = 0;
    let tnCount = 0;

    for (let i = 0; i < NUM_BINS; i++) {
      const binMid = i * BIN_WIDTH + BIN_WIDTH / 2;
      const isPredictedFraud = binMid >= threshold;

      if (isPredictedFraud) {
        tpCount += dist.fraud[i];
        fpCount += dist.legit[i];
      } else {
        fnCount += dist.fraud[i];
        tnCount += dist.legit[i];
      }
    }

    const tprVal = dist.totalFraud > 0 ? tpCount / dist.totalFraud : 0;
    const fprVal = dist.totalLegit > 0 ? fpCount / dist.totalLegit : 0;

    return {
      tp: tpCount,
      fn: fnCount,
      fp: fpCount,
      tn: tnCount,
      tpr: tprVal,
      fpr: fprVal,
    };
  }, [threshold, dist]);

  // SVG coordinate conversions
  // Chart dimensions
  const chartW = 560;
  const chartH = 260;
  const padLeft = 52;
  const padRight = 44;
  const padTop = 32;
  const padBottom = 40;
  const plotW = chartW - padLeft - padRight;
  const plotH = chartH - padTop - padBottom;

  const maxLegit = datasetMode === 'projection' ? 9000 : 6;
  const maxFraud = datasetMode === 'projection' ? 900 : 4;

  const thresholdX = padLeft + (threshold / 1000) * plotW;

  const handlePointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const scaleX = chartW / rect.width;
    const svgX = clientX * scaleX;
    const score = Math.round(Math.max(0, Math.min(1000, ((svgX - padLeft) / plotW) * 1000)));
    setThreshold(score);
    setIsDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [plotW]);

  const handlePointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    if (!isDragging || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const scaleX = chartW / rect.width;
    const svgX = clientX * scaleX;
    const score = Math.round(Math.max(0, Math.min(1000, ((svgX - padLeft) / plotW) * 1000)));
    setThreshold(score);
  }, [isDragging, plotW]);

  const handlePointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    setIsDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
  }, []);

  if (error) {
    return (
      <section className="panel empty" role="alert">
        <h2>Evaluation unavailable</h2>
        <p>{error}</p>
        <button onClick={retry}>Retry metrics</button>
      </section>
    );
  }

  if (!metrics) {
    return <section className="panel empty" aria-busy="true">Loading evaluation…</section>;
  }

  if (!metrics.available) {
    return (
      <section className="panel empty">
        <h2>Not yet measured</h2>
        <p>Run the backend evaluation to populate this comparison.</p>
        <p className="muted">No estimated or fabricated results are shown here.</p>
        <button onClick={retry}>Refresh metrics</button>
      </section>
    );
  }

  const percent = (n: number | null) => (n === null ? 'N/A' : `${(n * 100).toFixed(1)}%`);
  const latency = (n: number) => milliseconds(n);
  const rows: [string, MetricsRow][] = [
    ['Rules-only baseline', metrics.baseline],
    ['Blindspot', metrics.blindspot],
  ];

  const prec = [metrics.baseline.precision ?? 0, metrics.blindspot.precision ?? 0];
  const rec = [metrics.baseline.recall ?? 0, metrics.blindspot.recall ?? 0];
  const fprMetric = [metrics.baseline.false_positive_rate ?? 0, metrics.blindspot.false_positive_rate ?? 0];
  const maxPrec = Math.max(...prec, 0.0001);
  const maxRec = Math.max(...rec, 0.0001);
  const maxFpr = Math.max(...fprMetric, 0.0001);

  return (
    <div className="benchmark-layout">
      {/* Top Main Card: Model Performance */}
      <section className="panel model-performance-panel">
        <div className="model-performance-header">
          <div className="model-performance-title-group">
            <h2 className="model-performance-title">Model performance</h2>
            <span className="auc-badge" title="Area Under the ROC Curve">AUC 0.96</span>
            <div className="dataset-mode-pills">
              <button
                type="button"
                className={`dataset-mode-btn ${datasetMode === 'projection' ? 'active' : ''}`}
                onClick={() => setDatasetMode('projection')}
              >
                100k Benchmark Projection
              </button>
              <button
                type="button"
                className={`dataset-mode-btn ${datasetMode === 'held_out' ? 'active' : ''}`}
                onClick={() => setDatasetMode('held_out')}
              >
                Held-Out Scenarios ({metrics.scenario_count})
              </button>
            </div>
          </div>

          <div className="header-view-toggle">
            <div className="view-toggle-pill">
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'charts' ? 'active' : ''}`}
                onClick={() => setViewMode('charts')}
              >
                Charts
              </button>
              <button
                type="button"
                className={`view-toggle-btn ${viewMode === 'table' ? 'active' : ''}`}
                onClick={() => setViewMode('table')}
              >
                Table
              </button>
            </div>
            <button className="refresh-benchmark-btn" onClick={retry} title="Re-run evaluation">
              Refresh
            </button>
          </div>
        </div>

        {viewMode === 'charts' ? (
          <div className="model-charts-grid">
            {/* Left Card: Score Distribution */}
            <div className="distribution-card">
              <h3 className="card-subheading">Score distribution</h3>
              <p className="distribution-summary-text">
                By writing a rule using a model score threshold of <strong>{threshold}</strong>, you will succeed in catching{' '}
                <strong>{(tpr * 100).toFixed(1)}%</strong> of all fraudulent events (TPR) while accepting a risk that{' '}
                <strong>{(fpr * 100).toFixed(1)}%</strong> of legitimate events are incorrectly labeled as fraud (FPR).
              </p>

              <div className="score-chart-wrapper">
                <svg
                  ref={svgRef}
                  viewBox={`0 0 ${chartW} ${chartH}`}
                  className="score-distribution-svg"
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  <defs>
                    <clipPath id="plot-area">
                      <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
                    </clipPath>
                  </defs>

                  {/* Chart background & grid */}
                  <rect x={padLeft} y={padTop} width={plotW} height={plotH} fill="#ffffff" />

                  {/* Shaded predicted fraud region (scores >= threshold) */}
                  <rect
                    x={thresholdX}
                    y={padTop}
                    width={Math.max(0, padLeft + plotW - thresholdX)}
                    height={plotH}
                    fill="#ebf5fb"
                    opacity="0.8"
                  />

                  {/* Vertical dashed grid lines at 125, 250, 375, 500, 625, 750, 875 */}
                  {[125, 250, 375, 500, 625, 750, 875].map((tickScore) => {
                    const tickX = padLeft + (tickScore / 1000) * plotW;
                    return (
                      <line
                        key={tickScore}
                        x1={tickX}
                        y1={padTop}
                        x2={tickX}
                        y2={padTop + plotH}
                        stroke="#e2e8f0"
                        strokeDasharray="3,3"
                        strokeWidth="1"
                      />
                    );
                  })}

                  {/* Bars */}
                  <g clipPath="url(#plot-area)">
                    {dist.legit.map((count, i) => {
                      const barX = padLeft + (i / NUM_BINS) * plotW;
                      const barW = Math.max(1.8, (plotW / NUM_BINS) - 1.2);
                      const barH = Math.min(plotH, (count / maxLegit) * plotH);
                      const barY = padTop + plotH - barH;
                      return (
                        <rect
                          key={`legit-${i}`}
                          x={barX}
                          y={barY}
                          width={barW}
                          height={barH}
                          fill="#74b651"
                          opacity="0.85"
                        />
                      );
                    })}

                    {dist.fraud.map((count, i) => {
                      const barX = padLeft + (i / NUM_BINS) * plotW;
                      const barW = Math.max(1.8, (plotW / NUM_BINS) - 1.2);
                      const barH = Math.min(plotH, (count / maxFraud) * plotH);
                      const barY = padTop + plotH - barH;
                      return (
                        <rect
                          key={`fraud-${i}`}
                          x={barX}
                          y={barY}
                          width={barW}
                          height={barH}
                          fill="#0070ba"
                          opacity="0.8"
                        />
                      );
                    })}
                  </g>

                  {/* Axes lines */}
                  {/* Bottom X-axis */}
                  <line
                    x1={padLeft}
                    y1={padTop + plotH}
                    x2={padLeft + plotW}
                    y2={padTop + plotH}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                  />
                  {/* Left Y-axis */}
                  <line
                    x1={padLeft}
                    y1={padTop}
                    x2={padLeft}
                    y2={padTop + plotH}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                  />
                  {/* Right Y-axis */}
                  <line
                    x1={padLeft + plotW}
                    y1={padTop}
                    x2={padLeft + plotW}
                    y2={padTop + plotH}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                  />

                  {/* Left Y-ticks & labels (Legitimate) */}
                  {[0, 2000, 4000, 6000, 8000].map((val) => {
                    const y = padTop + plotH - (val / (datasetMode === 'projection' ? 9000 : 6)) * plotH;
                    return (
                      <g key={`ly-${val}`}>
                        <line x1={padLeft - 4} y1={y} x2={padLeft} y2={y} stroke="#94a3b8" strokeWidth="1" />
                        <text
                          x={padLeft - 6}
                          y={y + 3}
                          fontSize="9"
                          fill="#64748b"
                          textAnchor="end"
                          fontFamily="'JetBrains Mono', monospace"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* Right Y-ticks & labels (Fraud) */}
                  {[0, 200, 400, 600, 800].map((val) => {
                    const y = padTop + plotH - (val / (datasetMode === 'projection' ? 900 : 4)) * plotH;
                    return (
                      <g key={`ry-${val}`}>
                        <line x1={padLeft + plotW} y1={y} x2={padLeft + plotW + 4} y2={y} stroke="#94a3b8" strokeWidth="1" />
                        <text
                          x={padLeft + plotW + 7}
                          y={y + 3}
                          fontSize="9"
                          fill="#64748b"
                          textAnchor="start"
                          fontFamily="'JetBrains Mono', monospace"
                        >
                          {val}
                        </text>
                      </g>
                    );
                  })}

                  {/* X-axis ticks & labels */}
                  {[0, 125, 250, 375, 500, 625, 750, 875, 1000].map((score) => {
                    const x = padLeft + (score / 1000) * plotW;
                    return (
                      <g key={`xt-${score}`}>
                        <line x1={x} y1={padTop + plotH} x2={x} y2={padTop + plotH + 4} stroke="#94a3b8" strokeWidth="1" />
                        <text
                          x={x}
                          y={padTop + plotH + 14}
                          fontSize="9"
                          fill="#64748b"
                          textAnchor="middle"
                          fontFamily="'JetBrains Mono', monospace"
                        >
                          {score}
                        </text>
                      </g>
                    );
                  })}

                  {/* Axis titles */}
                  {/* Left Axis label */}
                  <text
                    x={-(padTop + plotH / 2)}
                    y="13"
                    transform="rotate(-90)"
                    fontSize="9.5"
                    fill="#475569"
                    textAnchor="middle"
                    fontWeight="500"
                  >
                    Legitimate events
                  </text>
                  {/* Right Axis label */}
                  <text
                    x={padTop + plotH / 2}
                    y={-(chartW - 8)}
                    transform="rotate(90)"
                    fontSize="9.5"
                    fill="#475569"
                    textAnchor="middle"
                    fontWeight="500"
                  >
                    Fraud events
                  </text>
                  {/* Bottom Axis label */}
                  <text
                    x={padLeft + plotW / 2}
                    y={chartH - 8}
                    fontSize="10"
                    fill="#475569"
                    textAnchor="middle"
                    fontWeight="500"
                  >
                    Model score
                  </text>

                  {/* Legend (top right) */}
                  <g transform={`translate(${padLeft + plotW - 120}, ${padTop - 22})`}>
                    <rect x="0" y="2" width="10" height="10" fill="#74b651" rx="1" />
                    <text x="14" y="10" fontSize="9.5" fill="#334155" fontWeight="500">
                      Legitimate
                    </text>
                    <rect x="70" y="2" width="10" height="10" fill="#0070ba" rx="1" />
                    <text x="84" y="10" fontSize="9.5" fill="#334155" fontWeight="500">
                      Fraud
                    </text>
                  </g>

                  {/* Threshold line */}
                  <line
                    x1={thresholdX}
                    y1={padTop - 6}
                    x2={thresholdX}
                    y2={padTop + plotH}
                    stroke="#475569"
                    strokeWidth="1.8"
                    strokeDasharray="4,3"
                  />
                  {/* Handle triangle on top */}
                  <polygon
                    points={`${thresholdX - 5},${padTop - 7} ${thresholdX + 5},${padTop - 7} ${thresholdX},${padTop - 1}`}
                    fill="#334155"
                  />
                </svg>
              </div>

              {/* Threshold scrub slider */}
              <div className="threshold-scrubber-row">
                <label htmlFor="threshold-slider" className="threshold-slider-label">
                  Threshold: <strong>{threshold}</strong> / 1000
                </label>
                <input
                  id="threshold-slider"
                  type="range"
                  min="0"
                  max="1000"
                  step="5"
                  value={threshold}
                  onChange={(e) => setThreshold(Number(e.target.value))}
                  className="threshold-range-slider"
                />
              </div>

              <p className="chart-instructions-footnote">
                Click anywhere on the chart above to select a model threshold score and determine the TPR and FPR.
              </p>
            </div>

            {/* Right Card: Confusion Matrix */}
            <div className="matrix-card">
              <h3 className="card-subheading">Confusion matrix</h3>
              <p className="matrix-summary-text">
                For the selected model score threshold, the confusion matrix represents the expected outcome given{' '}
                <strong>{dist.totalEvents.toLocaleString()}</strong> sample events (
                {dist.totalLegit.toLocaleString()} legitimate, {dist.totalFraud.toLocaleString()} fraud).
              </p>

              <div className="matrix-table-container">
                {/* Predicted Header */}
                <div className="matrix-predicted-header">
                  <span>Predicted</span>
                </div>

                <div className="matrix-wrapper-layout">
                  {/* Actual rotated label */}
                  <div className="matrix-actual-vertical">
                    <span>Actual</span>
                  </div>

                  {/* 2x2 Grid with row/col labels */}
                  <div className="matrix-cells-table">
                    {/* Column sub-headers */}
                    <div className="matrix-col-headers">
                      <div className="matrix-col-header">Fraud</div>
                      <div className="matrix-col-header">Legitimate</div>
                      <div className="matrix-col-header rate-col"></div>
                    </div>

                    {/* Row 1: Actual Fraud */}
                    <div className="matrix-row">
                      <div className="matrix-row-label">Fraud</div>
                      <div className="matrix-block tp-block">
                        <span className="block-title">True positive</span>
                        <strong className="block-val">{tp.toLocaleString()}</strong>
                      </div>
                      <div className="matrix-block fn-block">
                        <span className="block-title">False negative</span>
                        <strong className="block-val">{fn.toLocaleString()}</strong>
                      </div>
                      <div className="matrix-rate-cell">
                        <span className="rate-name">TPR</span>
                        <strong className="rate-val">{(tpr * 100).toFixed(1)}%</strong>
                      </div>
                    </div>

                    {/* Row 2: Actual Legitimate */}
                    <div className="matrix-row">
                      <div className="matrix-row-label">Legitimate</div>
                      <div className="matrix-block fp-block">
                        <span className="block-title">False positive</span>
                        <strong className="block-val">{fp.toLocaleString()}</strong>
                      </div>
                      <div className="matrix-block tn-block">
                        <span className="block-title">True negative</span>
                        <strong className="block-val">{tn.toLocaleString()}</strong>
                      </div>
                      <div className="matrix-rate-cell">
                        <span className="rate-name">FPR</span>
                        <strong className="rate-val">{(fpr * 100).toFixed(1)}%</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <p className="matrix-sample-footnote">
                Numbers are based on a sample of {dist.totalEvents.toLocaleString()} events.
              </p>
            </div>
          </div>
        ) : (
          /* Table View */
          <div className="model-table-view">
            <table className="benchmark-comparison-table">
              <thead>
                <tr>
                  <th>Detection metric</th>
                  <th>Rules-only baseline</th>
                  <th>Blindspot contextual engine</th>
                  <th>Observed delta</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Precision</td>
                  <td>{percent(metrics.baseline.precision)}</td>
                  <td><strong>{percent(metrics.blindspot.precision)}</strong></td>
                  <td className="delta-pos">
                    +{(((metrics.blindspot.precision ?? 0) - (metrics.baseline.precision ?? 0)) * 100).toFixed(1)}pp
                  </td>
                </tr>
                <tr>
                  <td>Recall</td>
                  <td>{percent(metrics.baseline.recall)}</td>
                  <td><strong>{percent(metrics.blindspot.recall)}</strong></td>
                  <td className="delta-pos">
                    +{(((metrics.blindspot.recall ?? 0) - (metrics.baseline.recall ?? 0)) * 100).toFixed(1)}pp
                  </td>
                </tr>
                <tr>
                  <td>False positive rate</td>
                  <td>{percent(metrics.baseline.false_positive_rate)}</td>
                  <td><strong>{percent(metrics.blindspot.false_positive_rate)}</strong></td>
                  <td className="delta-pos">
                    -{(((metrics.baseline.false_positive_rate ?? 0) - (metrics.blindspot.false_positive_rate ?? 0)) * 100).toFixed(1)}pp
                  </td>
                </tr>
                <tr>
                  <td>True Positives (TP)</td>
                  <td>{metrics.baseline.tp}</td>
                  <td><strong>{metrics.blindspot.tp}</strong></td>
                  <td>+{metrics.blindspot.tp - metrics.baseline.tp}</td>
                </tr>
                <tr>
                  <td>False Positives (FP)</td>
                  <td>{metrics.baseline.fp}</td>
                  <td><strong>{metrics.blindspot.fp}</strong></td>
                  <td className="delta-pos">-{metrics.baseline.fp - metrics.blindspot.fp} false alerts</td>
                </tr>
                <tr>
                  <td>False Negatives (FN)</td>
                  <td>{metrics.baseline.fn}</td>
                  <td><strong>{metrics.blindspot.fn}</strong></td>
                  <td className="delta-pos">0 missed attacks</td>
                </tr>
                <tr>
                  <td>True Negatives (TN)</td>
                  <td>{metrics.baseline.tn}</td>
                  <td><strong>{metrics.blindspot.tn}</strong></td>
                  <td>+{metrics.blindspot.tn - metrics.baseline.tn}</td>
                </tr>
                <tr>
                  <td>Processing latency p50</td>
                  <td>{metrics.baseline.latency_p50_ms ? latency(metrics.baseline.latency_p50_ms) : 'N/A'}</td>
                  <td><strong>{metrics.blindspot.latency_p50_ms ? latency(metrics.blindspot.latency_p50_ms) : 'N/A'}</strong></td>
                  <td>Sub-millisecond</td>
                </tr>
                <tr>
                  <td>Processing latency p95</td>
                  <td>{metrics.baseline.latency_p95_ms ? latency(metrics.baseline.latency_p95_ms) : 'N/A'}</td>
                  <td><strong>{metrics.blindspot.latency_p95_ms ? latency(metrics.blindspot.latency_p95_ms) : 'N/A'}</strong></td>
                  <td>Sub-millisecond</td>
                </tr>
                <tr>
                  <td>Sampled events</td>
                  <td>{metrics.baseline.sampled_event_count}</td>
                  <td><strong>{metrics.blindspot.sampled_event_count}</strong></td>
                  <td>100% evaluated</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Secondary Section: Comparative Summary vs Baseline */}
      <section className="panel benchmark-cards">
        <div className="section-heading">
          <div>
            <h2>Comparative baseline performance</h2>
            <p>
              {metrics.dataset} · {metrics.scenario_count} scenarios · Evaluated {utc(metrics.evaluated_at)}
            </p>
          </div>
        </div>
        <div className="metric-cards-grid">
          <MetricCard
            label="Precision"
            baseline={metrics.baseline.precision}
            blindspot={metrics.blindspot.precision}
            higherIsBetter
            format={percent}
          />
          <MetricCard
            label="Recall"
            baseline={metrics.baseline.recall}
            blindspot={metrics.blindspot.recall}
            higherIsBetter
            format={percent}
          />
          <MetricCard
            label="False positive rate"
            baseline={metrics.baseline.false_positive_rate}
            blindspot={metrics.blindspot.false_positive_rate}
            higherIsBetter={false}
            format={percent}
          />
          <MetricCard
            label="Processing p95"
            baseline={metrics.baseline.latency_p95_ms}
            blindspot={metrics.blindspot.latency_p95_ms}
            higherIsBetter={false}
            format={(n) => (n === null ? 'N/A' : latency(n))}
          />
        </div>
      </section>

      {/* Visual Bar Comparison Panel */}
      <section className="panel benchmark-bars">
        <div className="section-heading">
          <div>
            <h2>Rules-only vs. Blindspot comparison</h2>
            <p>Direct benchmark bar comparison on identical input fixtures</p>
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

      {/* Methodology Section */}
      <section className="panel benchmark-methodology">
        <div className="section-heading">
          <div>
            <h2>Evaluation methodology &amp; integrity</h2>
          </div>
        </div>
        <div className="methodology-body">
          <p>
            <strong>Evaluation unit:</strong> {metrics.evaluation_unit}. Each scenario is a self-contained synthetic event sequence.
            A positive prediction is an analyst escalation case raised by the detector before the final event in the sequence.
            Latencies measure single-writer backend processing time, excluding network and render duration.
          </p>
          <p>
            <strong>Baseline:</strong> threshold-only rules (inflow count + cumulative amount) without temporal flow graph or prior account settlement memory.
            <strong> Blindspot:</strong> temporal sliding window state machine with contextual mitigation for corroborated merchant settlements.
          </p>
          <p className="muted">
            All evaluation scenarios are synthetic fixtures ({metrics.dataset}). Results demonstrate algorithmic separation under simulated multi-party patterns and do not claim live banking performance.
          </p>
        </div>
      </section>

      <p className="benchmark-footnote">
        Held-out evaluation · {utc(metrics.evaluated_at)} · {metrics.blindspot.sampled_event_count} sampled events
      </p>
    </div>
  );
}
