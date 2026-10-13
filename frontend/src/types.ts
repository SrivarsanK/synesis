// Explicit mirror of docs/API_AND_DATABASE.md, MVP v1. No detector rules live here.
export type Severity = 'low' | 'medium' | 'high';
export type Action = 'allow_and_monitor' | 'monitor_or_verify' | 'escalate_for_review';
export interface Transaction { transaction_id: string; timestamp: string; source_account_id: string; destination_account_id: string; amount_minor: number; currency: 'INR'; channel: 'synthetic_stream'; scenario_id?: string | null }
export interface List<T> { items: T[]; count: number }
export interface CaseSummary { case_id: string; subject_account_id: string; title: string; status: 'open'; risk_score: number; severity: Severity; recommended_action: Action; created_at: string; updated_at: string; transaction_count: number; data_source: 'synthetic' }
export interface Reason { code: string; transaction_ids: string[]; [key: string]: unknown }
export interface CaseDetail extends Omit<CaseSummary, 'transaction_count'> { transaction_count?: number; reason_codes: Reason[]; transaction_ids: string[]; account_ids: string[] }
export interface GraphNode { id: string; label: string; role: 'source' | 'intermediary' | 'destination'; risk_level: Severity | 'unknown' }
export interface GraphEdge { id: string; source: string; target: string; amount_minor: number; currency: 'INR'; timestamp: string }
export interface Graph { case_id?: string; nodes: GraphNode[]; edges: GraphEdge[] }
export interface DemoStatus { scenario: string; source_mode: 'synthetic'; next_index: number; total_events: number; complete: boolean; running: boolean }
export interface IngestResult { transaction_id: string; accepted: boolean; duplicate: boolean; processing_latency_ms: number; updated_account_ids: string[]; case_ids_updated: string[] }
export interface NextResult { ingestion: IngestResult | null; next_index: number; complete: boolean }
export interface MetricsRow { tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null; false_positive_rate: number | null; sampled_event_count: number; latency_p50_ms: number | null; latency_p95_ms: number | null }
export type Metrics = { available: false; reason: string } | { available: true; dataset: string; evaluation_unit: 'scenario'; scenario_count: number; evaluated_at: string; baseline: MetricsRow; blindspot: MetricsRow };
