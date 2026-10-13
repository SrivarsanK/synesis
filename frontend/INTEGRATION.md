# Blindspot frontend

Run `npm install`, then `npm run dev` from `frontend/`. The Vite server is at http://127.0.0.1:5173 and proxies `/api` to http://127.0.0.1:3001. `npm run build` checks TypeScript and produces `dist/`. Set `VITE_API_BASE_URL` to an origin (without `/api`) when using a separately hosted API. The preview server requires that environment variable at build time or a reverse proxy.

The frontend matches `docs/API_AND_DATABASE.md` MVP v1 in `src/types.ts`. It polls transaction/case lists and demo status every 1.5 seconds. Detail and graph requests run on case selection or `updated_at` changes. Metrics load initially and when the benchmark tab opens or Refresh is pressed. No optional evaluate endpoint is assumed; run evaluation through the backend CLI.

Integration assumptions and limitations:

- Processed demo events uses `demo/status.next_index`, explicitly excluding restored history. There is no global processed-event summary endpoint. High-risk count is calculated from returned cases and labeled as loaded cases if the response is truncated.
- Scenario names are entered as fixture keys. Suggestions are `mule_fan_in_pass_through` and `merchant_legitimate`, matching actual backend fixtures; Reset sends the entered value, and API validation errors are displayed.
- The canonical API has no low-score assessment endpoint. A merchant with no case can be inspected in the feed/network, but its mitigation reasons cannot be fetched. Case reasons are displayed whenever a case exists. An empty queue is never described as proof of safety.
- Recent graph is bounded to 50 accounts from the latest 50 accepted transactions. Case graphs use the canonical bounded case projection. Repeated transfer edges retain transaction IDs.
- Browser JSON numbers cannot exactly represent the entire i64 range. Amounts outside JavaScript's safe integer range show an explicit precision message rather than a rounded currency claim. Synthetic fixture values should remain within the safe range.
- Canvas interaction has equivalent textual transaction/evidence lists. Evidence controls are keyboard accessible. Replay only changes a highlight and never calls ingestion.
- 21st context initialization succeeded, but inspiration search returned HTTP 401; the UI uses the product's charcoal/champagne/gold tokens without copied catalog components.

## Verification

- `npm run build`: passed (TypeScript and Vite production bundle).
- `npx playwright test`: two browser tests passed, covering two complete reset/replay cycles, absence of a case before the fixture's outward event, separate multiedges, evidence replay without ingestion calls, not-measured benchmark state, API disconnection, mobile overflow, and no captured runtime page errors. These are isolated HTTP contract-fixture tests, not detector benchmarks or live backend integration results.
- Desktop (1440px) and mobile (390px) screenshots inspected. Layout uses the pinned product palette; breakpoint resizing refits the network. No additional review worker was spawned, per assignment.
- `21st review frontend/src`: passed with informational hardcoded-color notices for the canonical palette; the placeholder-link accessibility error was fixed.
- Backend health on port 3001 is now verified: `status=ok`, `source_mode=synthetic`, `version=mvp-1`. Live checks use the running Vite proxy and real API, with no HTTP interception.

## Live integration — 2026-10-13

Run the opt-in browser check in PowerShell from `frontend/`: `$env:BLINDSPOT_LIVE='1'; npx playwright test tests/live.spec.ts`. This resets and steps the running synthetic demo; coordinate with anyone using the dashboard. The test leaves the merchant scenario complete. Default browser tests skip this mutation unless explicitly enabled.

- Both UI suggestion values match actual fixture files: `mule_fan_in_pass_through`, `merchant_legitimate`.
- Suspicious replay completed twice after clean reset: four events each, case counts after each event `[0,0,0,1]`, one high-severity case scoring 100 with four evidence transfers. The case appears only after the causal outward event.
- Merchant replay completed: four new events, case counts `[0,0,0,1]`, one medium-severity case scoring 35, `monitor_or_verify`, ten evidence transfers including six prior settlements. Its reasons include `ESTABLISHED_SETTLEMENT` (30 mitigation points) and `REPEATED_PAYMENT_PATTERN`. No high-risk escalation occurred.
- Live case graph edge IDs, direction, amount and timestamps match accepted backend transfers and case transaction IDs. Evidence replay does not change the backend cursor. No browser page errors were captured.
- Benchmark UI values were compared directly with `/api/metrics`; the test reads already-persisted evaluation output rather than generating a benchmark itself.
- Antigravity independent QA subsequently completed on Gemini Flash High: 57 wire-harness checks, 15 Rust tests, both builds, two browser contract tests, and one live browser test passed. See `../qa/REPORT.md` for executed checks and coverage limits.

Persisted evaluation inspected: `held_out_synthetic_v1`, unit=scenario, 24 scenarios, evaluated `2026-10-13T05:48:17.231Z`, 358 sampled events per detector.

| Detector | TP | FP | FN | TN | Precision | Recall | FPR | p50 ms | p95 ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Rules-only baseline | 6 | 10 | 2 | 6 | 37.5% | 75% | 62.5% | 0.0414 | 0.0874 |
| Blindspot | 8 | 0 | 0 | 16 | 100% | 100% | 0% | 0.0375 | 0.1094 |

These are measured results from 24 hand-designed synthetic networks with related templates, not real-world accuracy claims. Timing covers accepted-event validation, decision and in-memory SQLite commit; it excludes HTTP, UI and fixture loading. The UI displays latency rounded to two decimals.
