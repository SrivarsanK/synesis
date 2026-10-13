import type { CaseDetail, CaseSummary, DemoStatus, Graph, List, Metrics, NextResult, Transaction } from './types';
const base = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '');
export class ApiError extends Error { constructor(message: string, public status: number, public code: string) { super(message); this.name = 'ApiError'; } }
async function request<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  const timeout = AbortSignal.timeout(10000);
  const response = await fetch(`${base}/api${path}`, { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(payload?.error?.message ?? `API request failed (${response.status})`, response.status, payload?.error?.code ?? 'HTTP_ERROR');
  if (payload === null) throw new ApiError('API returned an empty or invalid JSON response.', response.status, 'INVALID_RESPONSE');
  return payload as T;
}
export const api = {
  transactions: (signal?: AbortSignal) => request<List<Transaction>>('/transactions?limit=50', signal),
  cases: (signal?: AbortSignal) => request<List<CaseSummary>>('/cases?limit=50', signal),
  status: (signal?: AbortSignal) => request<DemoStatus>('/demo/status', signal),
  metrics: (signal?: AbortSignal) => request<Metrics>('/metrics', signal),
  detail: (id: string, signal?: AbortSignal) => request<CaseDetail>(`/cases/${encodeURIComponent(id)}`, signal),
  graph: (id: string, signal?: AbortSignal) => request<Graph>(`/cases/${encodeURIComponent(id)}/graph`, signal),
  next: () => request<NextResult>('/demo/next', undefined, {}),
  reset: (scenario: string) => request<unknown>('/demo/reset', undefined, { scenario }),
};
