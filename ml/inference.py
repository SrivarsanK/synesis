"""
inference.py — Offline Scoring and Real-Time Transaction Prediction Interface.

Demonstrates inference pipeline: takes transaction events, computes dynamic features,
scores with the Blindspot model, and outputs structured risk assessment with explainability.
"""

from typing import Dict, Any, List
from pathlib import Path
import sys

sys.path.append(str(Path(__file__).parent))

from features import FeatureExtractor
from model import BlindspotFlowClassifier
from gnn_detector import FlowGATNetwork


class BlindspotPredictor:
    """Production-ready inference wrapper for AML Risk Scoring."""

    def __init__(self, threshold: int = 500):
        self.extractor = FeatureExtractor()
        self.classifier = BlindspotFlowClassifier(threshold_score=threshold)
        self.gnn = FlowGATNetwork()

    def feed_history(self, historical_transactions: List[Dict[str, Any]]):
        """Pre-populate customer account historical state."""
        for tx in historical_transactions:
            self.extractor.update_history(tx)

    def predict(self, trigger_transaction: Dict[str, Any]) -> Dict[str, Any]:
        """
        Evaluate risk of a newly observed transaction.
        Returns score (0-1000), severity, decision, and SHAP-style reasons.
        """
        self.extractor.update_history(trigger_transaction)
        features = self.extractor.extract_features_at_event(trigger_transaction)
        score = self.classifier.score(features)
        probability = self.classifier.predict_proba(features)
        explanations = self.classifier.explain(features)

        # Severity mapping matching Rust engine thresholds
        if score >= 700:
            severity = "HIGH"
            action = "ESCALATE_FOR_REVIEW"
        elif score >= 400:
            severity = "MEDIUM"
            action = "MONITOR_OR_VERIFY"
        else:
            severity = "LOW"
            action = "ALLOW_AND_MONITOR"

        return {
            "transaction_id": trigger_transaction.get("transaction_id"),
            "risk_score": score,
            "calibrated_probability": round(probability, 4),
            "severity": severity,
            "recommended_action": action,
            "feature_contributions": explanations,
            "raw_features": features,
        }


# Quick test demonstration
if __name__ == "__main__":
    predictor = BlindspotPredictor()

    # 1. Simulate 3 rapid inbound fan-in transfers to Kaaviya R
    sample_inflow = [
        {"transaction_id": "tx-1", "timestamp": "2026-10-13T10:00:00Z", "source_account_id": "acc-A", "destination_account_id": "kaaviya_r", "amount_minor": 2500000},
        {"transaction_id": "tx-2", "timestamp": "2026-10-13T10:05:00Z", "source_account_id": "acc-B", "destination_account_id": "kaaviya_r", "amount_minor": 2400000},
        {"transaction_id": "tx-3", "timestamp": "2026-10-13T10:12:00Z", "source_account_id": "acc-C", "destination_account_id": "kaaviya_r", "amount_minor": 2450000},
    ]
    predictor.feed_history(sample_inflow)

    # 2. Simulate rapid onward outward pass-through transfer to new recipient
    outward_tx = {
        "transaction_id": "tx-out-trigger",
        "timestamp": "2026-10-13T10:18:00Z",
        "source_account_id": "kaaviya_r",
        "destination_account_id": "unknown_sink_dest",
        "amount_minor": 7100000,
    }

    result = predictor.predict(outward_tx)
    print("--- AML INFERENCE RESULT ---")
    print(f"Risk Score:    {result['risk_score']} / 1000")
    print(f"Severity:      {result['severity']}")
    print(f"Action:        {result['recommended_action']}")
    print("Key Signals:")
    for sig in result['feature_contributions']:
        print(f"  • {sig['feature']}: {sig['narrative']} ({sig['impact']})")
