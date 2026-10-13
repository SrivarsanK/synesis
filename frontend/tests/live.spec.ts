import { test, expect } from '@playwright/test';
import { readFileSync, readdirSync } from 'node:fs';
import type { CaseDetail, CaseSummary, Graph, List, Metrics, Transaction } from '../src/types';

// Opt-in: mutates the running localhost synthetic demo. No HTTP mocks.
test('live suspicious and merchant replay, evidence, metrics and deterministic reset', async ({ page, request }) => {
  test.skip(process.env.BLINDSPOT_LIVE !== '1', 'Set BLINDSPOT_LIVE=1 with the real API running.');
  test.setTimeout(90000);
  const api = 'http://127.0.0.1:3001/api';
  const get = async <T,>(path: string): Promise<T> => { const response = await request.get(`${api}${path}`); expect(response.ok()).toBeTruthy(); return response.json(); };
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByText('API connected', { exact: true })).toBeVisible();
  const fixtureNames = readdirSync('../fixtures').filter(name => name.endsWith('.jsonl') && !name.endsWith('.history.jsonl')).map(name => name.replace('.jsonl', ''));
  const suggestions = await page.locator('#scenarios option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value));
  for (const suggestion of suggestions) expect(fixtureNames).toContain(suggestion);
  expect(suggestions).toContain('merchant_legitimate');
  const outcomes: unknown[] = [];
  for (const scenario of ['mule_fan_in_pass_through', 'mule_fan_in_pass_through', 'merchant_legitimate']) {
    const events: Transaction[] = readFileSync(`../fixtures/${scenario}.jsonl`, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
    await page.getByRole('button', { name: 'Live monitor', exact: true }).click();
    await page.getByLabel('Synthetic scenario', { exact: true }).fill(scenario);
    await page.getByRole('button', { name: 'Reset & load scenario' }).click();
    await expect(page.getByText(`0 / ${events.length} events`, { exact: true })).toBeVisible();
    expect((await get<List<CaseSummary>>('/cases')).count).toBe(0);
    const beforeCounts: number[] = [];
    for (let i = 0; i < events.length; i++) {
      const before = await get<List<Transaction>>('/transactions?limit=200');
      await page.getByRole('button', { name: 'Step next transaction', exact: true }).click();
      await expect(page.getByText(`${i + 1} / ${events.length} events`, { exact: true })).toBeVisible();
      const after = await get<List<Transaction>>('/transactions?limit=200');
      expect(after.items.length).toBe(before.items.length + 1);
      expect(after.items.find(tx => tx.transaction_id === events[i].transaction_id)).toEqual(events[i]);
      beforeCounts.push((await get<List<CaseSummary>>('/cases')).count);
    }
    const cases = await get<List<CaseSummary>>('/cases');
    if (scenario === 'mule_fan_in_pass_through') {
      expect(beforeCounts.slice(0, -1).every(count => count === 0)).toBe(true);
      expect(cases.count).toBe(1);
      expect(cases.items[0].severity).toBe('high');
      const id = cases.items[0].case_id;
      await page.getByRole('button', { name: `Investigate ${id}`, exact: true }).click();
      const detail = await get<CaseDetail>(`/cases/${id}`);
      const graph = await get<Graph>(`/cases/${id}/graph`);
      expect(graph.edges.map(edge => edge.id).sort()).toEqual([...detail.transaction_ids].sort());
      for (const edge of graph.edges) {
        const tx = events.find(event => event.transaction_id === edge.id);
        expect(tx).toBeDefined();
        expect([edge.source, edge.target, edge.amount_minor, edge.timestamp]).toEqual([tx!.source_account_id, tx!.destination_account_id, tx!.amount_minor, tx!.timestamp]);
      }
      await expect(page.locator('.timeline li')).toHaveCount(graph.edges.length);
      for (const reason of detail.reason_codes) await expect(page.locator('.reasons')).toContainText(reason.code.replaceAll('_', ' '));
      const beforeReplay = await get('/demo/status');
      await page.getByRole('button', { name: 'Next evidence', exact: true }).click();
      await expect(page.locator('.timeline button[aria-pressed=true]')).toHaveCount(1);
      expect(await get('/demo/status')).toEqual(beforeReplay);
      await page.screenshot({ path: 'test-results/live-investigation.png', fullPage: true });
    } else {
      expect(cases.items.filter(item => item.severity === 'high')).toHaveLength(0);
      expect(cases.count).toBe(1);
      const merchant = cases.items[0];
      expect(merchant.recommended_action).toBe('monitor_or_verify');
      await page.getByRole('button', { name: `Investigate ${merchant.case_id}`, exact: true }).click();
      const detail = await get<CaseDetail>(`/cases/${merchant.case_id}`);
      const graph = await get<Graph>(`/cases/${merchant.case_id}/graph`);
      const accepted = await get<List<Transaction>>('/transactions?limit=200');
      expect(graph.edges.map(edge => edge.id).sort()).toEqual([...detail.transaction_ids].sort());
      for (const edge of graph.edges) {
        const tx = accepted.items.find(event => event.transaction_id === edge.id);
        expect(tx).toBeDefined();
        expect([edge.source, edge.target, edge.amount_minor, edge.timestamp]).toEqual([tx!.source_account_id, tx!.destination_account_id, tx!.amount_minor, tx!.timestamp]);
      }
      await expect(page.locator('.timeline li')).toHaveCount(graph.edges.length);
      await expect(page.locator('.reasons')).toContainText('ESTABLISHED SETTLEMENT');
      await expect(page.locator('.reasons')).toContainText('REPEATED PAYMENT PATTERN');
      await expect(page.locator('.recommendation')).toHaveText('Monitor or request verification');
      await page.screenshot({ path: 'test-results/live-merchant.png', fullPage: true });
    }
    outcomes.push({ scenario, events: events.length, caseCountsAfterEachEvent: beforeCounts, cases: cases.items.map(c => ({ risk_score: c.risk_score, severity: c.severity, transaction_count: c.transaction_count })) });
  }
  expect(outcomes[0]).toEqual(outcomes[1]);
  const metrics = await get<Metrics>('/metrics');
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  if (metrics.available) {
    await expect(page.getByRole('heading', { name: 'Measured comparison' })).toBeVisible();
    await expect(page.locator('.benchmark')).toContainText(metrics.dataset);
    for (const [name, row] of [['Rules-only baseline', metrics.baseline], ['Blindspot', metrics.blindspot]] as const) {
      const rendered = page.locator('.benchmark tbody tr').filter({ hasText: name });
      const values = await rendered.locator('td').allTextContents();
      expect(values.slice(0, 4)).toEqual([row.tp, row.fp, row.fn, row.tn].map(String));
      expect(values.slice(4, 7)).toEqual([row.precision, row.recall, row.false_positive_rate].map(value => value === null ? 'Not defined' : `${(value * 100).toFixed(1)}%`));
      expect(values.slice(7)).toEqual([String(row.sampled_event_count), ...[row.latency_p50_ms, row.latency_p95_ms].map(value => value === null ? 'Not measured' : `${value.toFixed(2)} ms`)]);
      expect(row.tp + row.fp + row.fn + row.tn).toBe(metrics.scenario_count);
    }
  } else await expect(page.getByRole('heading', { name: 'Not yet measured' })).toBeVisible();
  console.log(JSON.stringify({ outcomes, metrics: metrics.available ? { dataset: metrics.dataset, scenario_count: metrics.scenario_count, evaluated_at: metrics.evaluated_at, baseline: metrics.baseline, blindspot: metrics.blindspot } : metrics, pageErrors: errors }));
  expect(errors).toEqual([]);
});
