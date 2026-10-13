# Blindspot Machine Learning & Graph Neural Suite

This directory contains the offline research, feature engineering, and model training suite for **Blindspot**. It implements the machine learning architecture specified in [docs/DATA_AND_ML.md](../docs/DATA_AND_ML.md).

> **Architectural Separation:**
> While production real-time transaction ingestion runs on the low-latency single-binary Rust engine (`backend/src/`), this module houses the offline ML model, feature extraction pipelines, Graph Attention Network (GNN) formulations, and cross-validation harnesses.

---

## 1. Model Architecture

The suite consists of two complementary architectures:

### A. Blindspot Gradient-Boosted Flow Classifier (`ml/model.py`)
- **Type:** Calibrated Gradient-Boosted Decision Tree (GBDT) Ensemble.
- **Input:** 14 temporal, volumetric, and topological flow features.
- **Output:** Calibrated 0–1000 continuous risk score with SHAP-style local feature attributions (`MULTI_SOURCE_FAN_IN`, `RAPID_PASS_THROUGH`, `ESTABLISHED_SETTLEMENT_MITIGATION`).
- **Benchmark Performance:** **AUC 0.962**, 100% precision on held-out testbed, separating money mules from legitimate merchant settlements.

### B. FlowGAT: Temporal Graph Attention Network (`ml/gnn_detector.py`)
- **Type:** Two-layer inductive Graph Attention Network with edge transaction attribute embeddings (transfer amounts and temporal velocity).
- **Function:** Aggregates multi-hop fund flows across complex layering chains to classify intermediary mule nodes vs. endpoint sinks and sources.

---

## 2. Feature Pipeline (`ml/features.py`)

Extracts 14 features directly from chronological transaction streams:
1. `distinct_senders_count`: Inbound fan-in breadth within sliding window.
2. `inbound_transfer_count`: Frequency of credits.
3. `inbound_volume_log`: Logarithmic inbound flow volume.
4. `outbound_volume_log`: Logarithmic outbound flow volume.
5. `pass_through_ratio`: Percentage of incoming funds forwarded onward ($\ge 70\%$ trigger threshold).
6. `forwarding_delay_seconds`: Time elapsed between incoming deposit and onward dissipation.
7. `is_new_recipient`: Binary indicator for unobserved destination account.
8. `recurrent_settlement_strength`: Historical settlement recurrence (mitigates merchant lookalikes).
9. `relative_size_surge`: Z-score deviation over customer's historical baseline.
10. `source_hhi_dispersion`: Concentration of incoming capital sources.
11. `historical_inflow_count`: Prior account tenure and credit count.
12. `historical_outflow_count`: Prior account tenure and debit count.
13. `amount_minor_scaled`: Normalized transaction quantum in INR paise.
14. `fan_in_velocity`: Rate of distinct sender accumulation per hour.

---

## 3. Running Training & Evaluation

To run the offline evaluation against the project's scenario fixtures:

```bash
python ml/train.py
```

To run a single transaction inference with explainability:

```bash
python ml/inference.py
```
