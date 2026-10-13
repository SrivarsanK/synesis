import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE_URL = process.env.BLINDSPOT_URL || 'http://127.0.0.1:3001';

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  checks: [],
};

function record(name, pass, details = '') {
  if (pass) {
    results.passed++;
    results.checks.push({ name, status: 'PASS', details });
    console.log(`[PASS] ${name}`);
  } else {
    results.failed++;
    results.checks.push({ name, status: 'FAIL', details });
    console.error(`[FAIL] ${name}: ${details}`);
  }
}

async function api(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  let body = null;
  const text = await res.text();
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, ok: res.ok, body, headers: res.headers };
}

// -------------------------------------------------------------
// Suite 1: Canonical Wire Contract, Envelopes & Error Codes
// -------------------------------------------------------------
async function testWireContract() {
  console.log('\n--- SUITE 1: Wire Contract, DTOs & HTTP Status Codes ---');

  // 1.1 GET /api/health
  const health = await api('/api/health');
  record('Health returns 200 OK', health.status === 200);
  record('Health source_mode is synthetic', health.body?.source_mode === 'synthetic');
  record('Health version is mvp-1', health.body?.version === 'mvp-1');

  // 1.2 Validation errors return 400
  const badAmount = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: 'qa-bad-amount',
      timestamp: '2026-10-13T10:00:00Z',
      source_account_id: 'qa:src',
      destination_account_id: 'qa:dst',
      amount_minor: 0,
      currency: 'INR',
      channel: 'synthetic_stream',
    }),
  });
  record('POST /api/transactions amount=0 returns 400', badAmount.status === 400 && badAmount.body?.error?.code === 'INVALID_AMOUNT');

  const negativeAmount = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: 'qa-neg-amount',
      timestamp: '2026-10-13T10:00:00Z',
      source_account_id: 'qa:src',
      destination_account_id: 'qa:dst',
      amount_minor: -500,
      currency: 'INR',
      channel: 'synthetic_stream',
    }),
  });
  record('POST /api/transactions negative amount returns 400', negativeAmount.status === 400 && negativeAmount.body?.error?.code === 'INVALID_AMOUNT');

  const selfTransfer = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: 'qa-self-tx',
      timestamp: '2026-10-13T10:00:00Z',
      source_account_id: 'qa:same',
      destination_account_id: 'qa:same',
      amount_minor: 1000,
      currency: 'INR',
      channel: 'synthetic_stream',
    }),
  });
  record('POST /api/transactions self-transfer returns 400', selfTransfer.status === 400 && selfTransfer.body?.error?.code === 'SELF_TRANSFER');

  const blankId = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: '',
      timestamp: '2026-10-13T10:00:00Z',
      source_account_id: 'qa:src',
      destination_account_id: 'qa:dst',
      amount_minor: 1000,
      currency: 'INR',
      channel: 'synthetic_stream',
    }),
  });
  record('POST /api/transactions blank ID returns 400', blankId.status === 400 && blankId.body?.error?.code === 'INVALID_ID');

  const nonUtcTs = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: 'qa-non-utc',
      timestamp: '2026-10-13T10:00:00+05:30',
      source_account_id: 'qa:src',
      destination_account_id: 'qa:dst',
      amount_minor: 1000,
      currency: 'INR',
      channel: 'synthetic_stream',
    }),
  });
  record('POST /api/transactions non-UTC timestamp returns 400', nonUtcTs.status === 400 && nonUtcTs.body?.error?.code === 'INVALID_TIMESTAMP');

  const badCurrency = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: 'qa-bad-curr',
      timestamp: '2026-10-13T10:00:00Z',
      source_account_id: 'qa:src',
      destination_account_id: 'qa:dst',
      amount_minor: 1000,
      currency: 'USD',
      channel: 'synthetic_stream',
    }),
  });
  record('POST /api/transactions non-INR currency returns 400', badCurrency.status === 400 && badCurrency.body?.error?.code === 'UNSUPPORTED_CURRENCY');

  const badChannel = await api('/api/transactions', {
    method: 'POST',
    body: JSON.stringify({
      transaction_id: 'qa-bad-chan',
      timestamp: '2026-10-13T10:00:00Z',
      source_account_id: 'qa:src',
      destination_account_id: 'qa:dst',
      amount_minor: 1000,
      currency: 'INR',
      channel: 'live_bank_feed',
    }),
  });
  record('POST /api/transactions invalid channel returns 400', badChannel.status === 400 && badChannel.body?.error?.code === 'INVALID_CHANNEL');

  // 1.3 Query limit bounds on /api/transactions and /api/cases
  const limit0Tx = await api('/api/transactions?limit=0');
  record('GET /api/transactions?limit=0 returns 400', limit0Tx.status === 400 && limit0Tx.body?.error?.code === 'INVALID_LIMIT');

  const limit201Tx = await api('/api/transactions?limit=201');
  record('GET /api/transactions?limit=201 returns 400', limit201Tx.status === 400 && limit201Tx.body?.error?.code === 'INVALID_LIMIT');

  const limitAlphaTx = await api('/api/transactions?limit=foo');
  record('GET /api/transactions?limit=foo returns 400', limitAlphaTx.status === 400 && limitAlphaTx.body?.error?.code === 'INVALID_LIMIT');

  const limit0Cases = await api('/api/cases?limit=0');
  record('GET /api/cases?limit=0 returns 400', limit0Cases.status === 400 && limit0Cases.body?.error?.code === 'INVALID_LIMIT');

  const limit201Cases = await api('/api/cases?limit=201');
  record('GET /api/cases?limit=201 returns 400', limit201Cases.status === 400 && limit201Cases.body?.error?.code === 'INVALID_LIMIT');

  // 1.4 Missing case returns 404
  const missingCase = await api('/api/cases/case-nonexistent-999999');
  record('GET /api/cases/missing returns 404', missingCase.status === 404 && missingCase.body?.error?.code === 'CASE_NOT_FOUND');

  const missingGraph = await api('/api/cases/case-nonexistent-999999/graph');
  record('GET /api/cases/missing/graph returns 404', missingGraph.status === 404 && missingGraph.body?.error?.code === 'CASE_NOT_FOUND');

  // 1.5 Unknown demo scenario returns 400
  const unknownScenario = await api('/api/demo/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'unknown_scenario_xyz' }),
  });
  record('POST /api/demo/reset unknown scenario returns 400', unknownScenario.status === 400 && unknownScenario.body?.error?.code === 'UNKNOWN_SCENARIO');
}

// -------------------------------------------------------------
// Suite 2: Idempotency, Duplicate Replay & Conflicting ID
// -------------------------------------------------------------
async function testIdempotencyAndConflict() {
  console.log('\n--- SUITE 2: Idempotency, Duplicates & 409 Conflict ---');

  // Reset to clean scenario
  await api('/api/demo/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'ordinary' }),
  });

  const tx = {
    transaction_id: 'qa-idempotent-test-01',
    timestamp: '2026-10-13T11:00:00Z',
    source_account_id: 'qa:userA',
    destination_account_id: 'qa:userB',
    amount_minor: 250000,
    currency: 'INR',
    channel: 'synthetic_stream',
  };

  // Ingest first time
  const r1 = await api('/api/transactions', { method: 'POST', body: JSON.stringify(tx) });
  record('First ingest accepts tx', r1.status === 200 && r1.body?.accepted === true && r1.body?.duplicate === false);

  const txListBefore = await api('/api/transactions');
  const countBefore = txListBefore.body?.count;

  // Ingest identical second time
  const r2 = await api('/api/transactions', { method: 'POST', body: JSON.stringify(tx) });
  record('Identical ingest returns duplicate=true', r2.status === 200 && r2.body?.duplicate === true);
  record('Identical duplicate does not mutate case list', Array.isArray(r2.body?.case_ids_updated) && r2.body.case_ids_updated.length === 0);

  const txListAfter = await api('/api/transactions');
  record('Duplicate ingest leaves transaction count unchanged', txListAfter.body?.count === countBefore);

  // Ingest same ID with altered amount -> 409 Conflict
  const conflictingTx = { ...tx, amount_minor: 9999999 };
  const r3 = await api('/api/transactions', { method: 'POST', body: JSON.stringify(conflictingTx) });
  record('Conflicting payload returns 409 CONFLICTING_TRANSACTION_ID', r3.status === 409 && r3.body?.error?.code === 'CONFLICTING_TRANSACTION_ID');

  // Ingest same ID with altered recipient -> 409 Conflict
  const conflictingTxDst = { ...tx, destination_account_id: 'qa:altered_dest' };
  const r4 = await api('/api/transactions', { method: 'POST', body: JSON.stringify(conflictingTxDst) });
  record('Conflicting destination returns 409', r4.status === 409 && r4.body?.error?.code === 'CONFLICTING_TRANSACTION_ID');

  // Out of order event -> 422
  const earlyTx = {
    transaction_id: 'qa-early-tx',
    timestamp: '2026-10-13T09:00:00Z', // Before 11:00:00Z
    source_account_id: 'qa:userC',
    destination_account_id: 'qa:userD',
    amount_minor: 100000,
    currency: 'INR',
    channel: 'synthetic_stream',
  };
  const r5 = await api('/api/transactions', { method: 'POST', body: JSON.stringify(earlyTx) });
  record('Out-of-order event returns 422 OUT_OF_ORDER_EVENT', r5.status === 422 && r5.body?.error?.code === 'OUT_OF_ORDER_EVENT');
}

// -------------------------------------------------------------
// Suite 3: Core Money-Flow Behavioral Detection
// -------------------------------------------------------------
async function testMoneyFlowDetection() {
  console.log('\n--- SUITE 3: Money Flow Detection Semantics (S4, S3, S7) ---');

  // 3.1 S7: Fan-in without outward pass-through produces NO case
  await api('/api/demo/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'incomplete_fan_in' }),
  });

  const s7Status = await api('/api/demo/status');
  const s7Total = s7Status.body?.total_events || 0;
  for (let i = 0; i < s7Total; i++) {
    await api('/api/demo/next', { method: 'POST', body: '{}' });
  }
  const s7Cases = await api('/api/cases');
  record('S7: Incomplete fan-in produces 0 cases', s7Cases.body?.count === 0);

  // 3.2 S4: Suspicious Mule Fan-in + Rapid Pass-through
  await api('/api/demo/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'mule_fan_in_pass_through' }),
  });

  const s4Status = await api('/api/demo/status');
  const s4Total = s4Status.body?.total_events || 0;
  const casesOverSteps = [];

  for (let i = 0; i < s4Total; i++) {
    const nextRes = await api('/api/demo/next', { method: 'POST', body: '{}' });
    const currentCases = await api('/api/cases');
    casesOverSteps.push(currentCases.body?.count || 0);
  }

  // Pre-outflow events (first 3) must NOT create case
  const fanInStepsNoCase = casesOverSteps.slice(0, 3).every(count => count === 0);
  record('S4: No case created before outward pass-through event', fanInStepsNoCase);

  // Final event (outward transfer) triggers the case
  const outwardTriggersCase = casesOverSteps[3] === 1;
  record('S4: Outward transfer creates case at causal event', outwardTriggersCase);

  const s4CaseList = await api('/api/cases');
  const muleCase = s4CaseList.body?.items?.[0];
  record('S4 case severity is high', muleCase?.severity === 'high');
  record('S4 recommended_action is escalate_for_review', muleCase?.recommended_action === 'escalate_for_review');
  record('S4 risk score >= 70', muleCase?.risk_score >= 70);

  // Check case detail & reason codes
  if (muleCase) {
    const detail = await api(`/api/cases/${muleCase.case_id}`);
    const reasonCodes = detail.body?.reason_codes?.map(r => r.code) || [];
    record('S4 includes MULTI_SOURCE_INFLOW reason', reasonCodes.includes('MULTI_SOURCE_INFLOW'));
    record('S4 includes RAPID_OUTFLOW reason', reasonCodes.includes('RAPID_OUTFLOW'));
    record('S4 includes HIGH_FLOW_THROUGH reason', reasonCodes.includes('HIGH_FLOW_THROUGH'));
    record('S4 reason codes have real transaction_ids', detail.body?.reason_codes?.every(r => Array.isArray(r.transaction_ids) && r.transaction_ids.length > 0));

    // Directed graph check
    const graph = await api(`/api/cases/${muleCase.case_id}/graph`);
    record('S4 graph has nodes and edges', Array.isArray(graph.body?.nodes) && Array.isArray(graph.body?.edges));
    const intermediaryNode = graph.body?.nodes?.find(n => n.role === 'intermediary');
    record('S4 intermediary role identified', intermediaryNode?.id === muleCase.subject_account_id);
    record('S4 graph edge count equals case transaction count', graph.body?.edges?.length === detail.body?.transaction_ids?.length);
    record('S4 graph edges have real transaction IDs as IDs', graph.body?.edges?.every(e => detail.body?.transaction_ids?.includes(e.id)));
  }

  // 3.3 S3: Merchant Legitimate Lookalike Mitigation
  await api('/api/demo/reset', {
    method: 'POST',
    body: JSON.stringify({ scenario: 'merchant_legitimate' }),
  });

  const s3Status = await api('/api/demo/status');
  const s3Total = s3Status.body?.total_events || 0;
  for (let i = 0; i < s3Total; i++) {
    await api('/api/demo/next', { method: 'POST', body: '{}' });
  }

  const s3CaseList = await api('/api/cases');
  const merchantCase = s3CaseList.body?.items?.[0];
  record('S3 merchant is NOT high severity', merchantCase?.severity !== 'high');
  record('S3 merchant is medium severity', merchantCase?.severity === 'medium');
  record('S3 merchant recommended_action is monitor_or_verify', merchantCase?.recommended_action === 'monitor_or_verify');

  if (merchantCase) {
    const merchantDetail = await api(`/api/cases/${merchantCase.case_id}`);
    const merchantReasons = merchantDetail.body?.reason_codes?.map(r => r.code) || [];
    record('S3 includes ESTABLISHED_SETTLEMENT mitigation', merchantReasons.includes('ESTABLISHED_SETTLEMENT'));
    record('S3 includes REPEATED_PAYMENT_PATTERN', merchantReasons.includes('REPEATED_PAYMENT_PATTERN'));
  }
}

// -------------------------------------------------------------
// Suite 4: Determinism, Reset & Replay
// -------------------------------------------------------------
async function testResetReplayDeterminism() {
  console.log('\n--- SUITE 4: Replay & Reset Determinism (Twice) ---');

  async function runMuleScenario() {
    await api('/api/demo/reset', { method: 'POST', body: JSON.stringify({ scenario: 'mule_fan_in_pass_through' }) });
    const status = await api('/api/demo/status');
    for (let i = 0; i < status.body?.total_events; i++) {
      await api('/api/demo/next', { method: 'POST', body: '{}' });
    }
    const cases = await api('/api/cases');
    const graph = cases.body?.items?.[0] ? await api(`/api/cases/${cases.body.items[0].case_id}/graph`) : null;
    return {
      cases: cases.body,
      graph: graph?.body,
    };
  }

  const run1 = await runMuleScenario();
  const run2 = await runMuleScenario();

  record('Run 1 and Run 2 case counts match', run1.cases.count === run2.cases.count);
  record('Run 1 and Run 2 risk scores match', run1.cases.items[0]?.risk_score === run2.cases.items[0]?.risk_score);
  record('Run 1 and Run 2 severities match', run1.cases.items[0]?.severity === run2.cases.items[0]?.severity);
  record('Run 1 and Run 2 graph edge count match', run1.graph?.edges?.length === run2.graph?.edges?.length);
}

// -------------------------------------------------------------
// Suite 5: Benchmark & Held-Out Scenarios Verification
// -------------------------------------------------------------
async function testBenchmarkVerification() {
  console.log('\n--- SUITE 5: Benchmark Evaluation & Metrics ---');

  const evalRes = await api('/api/evaluate', { method: 'POST', body: '{}' });
  record('POST /api/evaluate returns 200', evalRes.status === 200);

  const metrics = await api('/api/metrics');
  record('GET /api/metrics available=true after evaluation', metrics.body?.available === true);
  record('Dataset is held_out_synthetic_v1', metrics.body?.dataset === 'held_out_synthetic_v1');
  record('Scenario count is 24', metrics.body?.scenario_count === 24);

  const { baseline, blindspot } = metrics.body || {};
  record('Baseline TP+FP+FN+TN == 24', baseline && (baseline.tp + baseline.fp + baseline.fn + baseline.tn) === 24);
  record('Blindspot TP+FP+FN+TN == 24', blindspot && (blindspot.tp + blindspot.fp + blindspot.fn + blindspot.tn) === 24);
  record('Blindspot FPR <= Baseline FPR', blindspot?.false_positive_rate <= baseline?.false_positive_rate);
  record('Sampled event counts > 0', baseline?.sampled_event_count > 0 && blindspot?.sampled_event_count > 0);
  record('Measured latencies present (p50, p95)', typeof blindspot?.latency_p50_ms === 'number' && typeof blindspot?.latency_p95_ms === 'number');
}

// -------------------------------------------------------------
// Main Runner
// -------------------------------------------------------------
async function main() {
  console.log(`Starting Blindspot Independent QA Test Harness at ${BASE_URL}...\n`);
  try {
    await testWireContract();
    await testIdempotencyAndConflict();
    await testMoneyFlowDetection();
    await testResetReplayDeterminism();
    await testBenchmarkVerification();
  } catch (err) {
    console.error('Unexpected test harness error:', err);
    record('Test suite executed to completion without unhandled exception', false, err.message);
  }

  console.log('\n=============================================================');
  console.log(`QA SUMMARY: ${results.passed} PASSED, ${results.failed} FAILED, ${results.skipped} SKIPPED`);
  console.log('=============================================================');

  process.exit(results.failed > 0 ? 1 : 0);
}

main();
