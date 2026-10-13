import { expect, test } from '@playwright/test';

// Isolated browser contract fixtures, never bundled into the application or represented as measured results.
test('causal UI, repeated edge identity, visual replay, reset twice and mobile layout', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  let cursor = 0;
  let ingestCalls = 0;
  const events = [
    ['in-a', 'A', 'M'], ['in-b', 'B', 'M'], ['in-c', 'C', 'M'], ['out-a', 'M', 'D'], ['out-b', 'M', 'D'],
  ].map(([id, source, target], index) => ({ transaction_id: id, source_account_id: source, destination_account_id: target, amount_minor: 10000, currency: 'INR', channel: 'synthetic_stream', timestamp: `2026-10-13T10:0${index}:00Z` }));
  const summary = { case_id: 'test-case', subject_account_id: 'M', title: 'Potential rapid pass-through network', status: 'open', risk_score: 70, severity: 'high', recommended_action: 'escalate_for_review', created_at: events[3].timestamp, updated_at: events[4].timestamp, transaction_count: 5, data_source: 'synthetic' };
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let payload: unknown;
    if (path === '/api/demo/next') { ingestCalls++; cursor = Math.min(cursor + 1, events.length); payload = { ingestion: { transaction_id: events[cursor - 1].transaction_id, accepted: true, duplicate: false }, next_index: cursor, complete: cursor === events.length }; }
    else if (path === '/api/demo/reset') { cursor = 0; payload = {}; }
    else if (path === '/api/demo/status') payload = { scenario: 'mule_fan_in_pass_through', next_index: cursor, total_events: events.length, complete: cursor === events.length, running: false, source_mode: 'synthetic' };
    else if (path === '/api/transactions') payload = { items: events.slice(0, cursor).reverse(), count: cursor };
    else if (path === '/api/cases') payload = { items: cursor >= 4 ? [summary] : [], count: cursor >= 4 ? 1 : 0 };
    else if (path.endsWith('/graph')) payload = { case_id: 'test-case', nodes: ['A', 'B', 'C', 'M', 'D'].map(id => ({ id, label: `Account ${id}`, role: id === 'M' ? 'intermediary' : 'source', risk_level: id === 'M' ? 'high' : 'unknown' })), edges: events.slice(0, cursor).map(tx => ({ id: tx.transaction_id, source: tx.source_account_id, target: tx.destination_account_id, amount_minor: tx.amount_minor, currency: tx.currency, timestamp: tx.timestamp })) };
    else if (path === '/api/cases/test-case') payload = { ...summary, transaction_ids: events.map(tx => tx.transaction_id), account_ids: ['A', 'B', 'C', 'M', 'D'], reason_codes: [{ code: 'MULTI_SOURCE_INFLOW', observed: 3, threshold: 3, transaction_ids: ['in-a', 'in-b', 'in-c'] }] };
    else if (path === '/api/metrics') payload = { available: false, reason: 'Not yet measured' };
    else throw new Error(`Unexpected request ${path}`);
    await route.fulfill({ json: payload });
  });
  await page.goto('/');
  await expect(page.getByText('SYNTHETIC STREAM / DEMO')).toBeVisible();
  for (let run = 0; run < 2; run++) {
    await expect(page.getByText('No suspicious network cases yet.')).toBeVisible();
    for (let n = 0; n < 3; n++) { await page.getByRole('button', { name: 'Step next transaction' }).click(); await expect(page.getByText(`${n + 1} / 5 events`)).toBeVisible(); await expect(page.getByText('No suspicious network cases yet.')).toBeVisible(); }
    await page.getByRole('button', { name: 'Step next transaction' }).click();
    await expect(page.getByRole('button', { name: 'Investigate test-case' })).toBeVisible();
    await page.getByRole('button', { name: 'Step next transaction' }).click();
    await page.getByRole('button', { name: 'Investigate test-case' }).click();
    await expect(page.getByText('5 accounts · 5 transfers')).toBeVisible();
    const beforeReplay = ingestCalls;
    await page.getByRole('button', { name: 'Next evidence' }).click();
    await expect(page.locator('.timeline button[aria-pressed=true]')).toContainText('in-a');
    await page.getByRole('button', { name: 'Next evidence' }).click();
    await expect(page.locator('.timeline button[aria-pressed=true]')).toContainText('in-b');
    expect(ingestCalls).toBe(beforeReplay);
    if (run === 0) {
      await page.screenshot({ path: 'test-results/desktop-investigation.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: 'test-results/mobile-investigation.png', fullPage: true });
      await page.setViewportSize({ width: 1440, height: 900 });
    }
    await page.getByRole('button', { name: 'Reset & load scenario' }).click();
    await expect(page.getByText('0 / 5 events')).toBeVisible();
  }
  await page.getByRole('button', { name: 'Benchmarks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Not yet measured' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('disconnection remains visible and stepping stays disabled', async ({ page }) => {
  await page.route('**/api/**', route => route.fulfill({ status: 503, json: { error: { code: 'OFFLINE', message: 'Backend unavailable' } } }));
  await page.goto('/');
  await expect(page.getByText('API disconnected', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Step next transaction' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Retry connection' })).toBeVisible();
});
