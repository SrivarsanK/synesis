"""
features.py — Temporal & Topological Feature Engineering for Blindspot AML Detection.

Extracts dynamic transaction window features and ego-graph metrics directly from
chronological transaction events and historical customer account profiles.
"""

from typing import List, Dict, Any, Optional
from datetime import datetime
import math
from collections import defaultdict, deque


class FeatureExtractor:
    """
    Extracts 14 temporal and topological money laundering detection features.
    Designed to detect fan-in / pass-through mule patterns while isolating legitimate
    merchant settlements.
    """

    def __init__(self, inflow_window_seconds: int = 14400, pass_through_window_seconds: int = 7200):
        self.inflow_window_seconds = inflow_window_seconds
        self.pass_through_window_seconds = pass_through_window_seconds
        
        # In-memory account state tracking
        self.account_history: Dict[str, Dict[str, Any]] = defaultdict(lambda: {
            "historical_inflow_sum": 0,
            "historical_outflow_sum": 0,
            "historical_inflow_count": 0,
            "historical_outflow_count": 0,
            "frequent_counterparties": defaultdict(int),
            "recent_transactions": deque()  # (timestamp, tx_dict)
        })

    def parse_iso(self, ts_str: str) -> float:
        """Parse ISO-8601 UTC string to unix timestamp in seconds."""
        clean = ts_str.replace("Z", "+00:00")
        return datetime.fromisoformat(clean).timestamp()

    def update_history(self, tx: Dict[str, Any]):
        """Warm up account state with pre-event historical baseline transactions."""
        src = tx["source_account_id"]
        dst = tx["destination_account_id"]
        amount = tx.get("amount_minor", 0)
        t = self.parse_iso(tx["timestamp"])

        # Update sender
        src_state = self.account_history[src]
        src_state["historical_outflow_sum"] += amount
        src_state["historical_outflow_count"] += 1
        src_state["frequent_counterparties"][dst] += 1
        src_state["recent_transactions"].append((t, tx))

        # Update recipient
        dst_state = self.account_history[dst]
        dst_state["historical_inflow_sum"] += amount
        dst_state["historical_inflow_count"] += 1
        dst_state["frequent_counterparties"][src] += 1
        dst_state["recent_transactions"].append((t, tx))

    def extract_features_at_event(self, trigger_tx: Dict[str, Any]) -> Dict[str, float]:
        """
        Extract feature vector at the causal outward transfer event (trigger_tx).
        Returns normalized feature dict for model scoring.
        """
        subject = trigger_tx["source_account_id"]
        destination = trigger_tx["destination_account_id"]
        amount_minor = trigger_tx.get("amount_minor", 0)
        event_time = self.parse_iso(trigger_tx["timestamp"])

        sub_state = self.account_history[subject]
        recent = sub_state["recent_transactions"]

        # 1. Filter qualifying inbound transfers within inflow window
        inflow_cutoff = event_time - self.inflow_window_seconds
        inbound_txs = [
            tx for (t, tx) in recent
            if tx["destination_account_id"] == subject and inflow_cutoff <= t <= event_time
        ]

        distinct_senders = len(set(tx["source_account_id"] for tx in inbound_txs))
        inbound_volume = sum(tx["amount_minor"] for tx in inbound_txs)

        # 2. Filter qualifying outbound transfers within pass-through window
        outbound_cutoff = event_time - self.pass_through_window_seconds
        outbound_txs = [
            tx for (t, tx) in recent
            if tx["source_account_id"] == subject and outbound_cutoff <= t <= event_time
        ]
        outbound_volume = sum(tx["amount_minor"] for tx in outbound_txs)

        # 3. Flow-through ratio (Pass-through percentage)
        pass_through_ratio = (outbound_volume / inbound_volume) if inbound_volume > 0 else 0.0

        # 4. Temporal delay between average incoming transfer and current trigger transfer
        if inbound_txs:
            avg_in_time = sum(self.parse_iso(tx["timestamp"]) for tx in inbound_txs) / len(inbound_txs)
            forwarding_delay_sec = max(0.0, event_time - avg_in_time)
        else:
            forwarding_delay_sec = 86400.0  # Max default 24h

        # 5. Counterparty novelty & Recurrent settlement mitigation
        prior_dst_count = sub_state["frequent_counterparties"].get(destination, 0)
        is_new_recipient = 1.0 if prior_dst_count == 0 else 0.0
        recurrent_settlement_strength = min(1.0, prior_dst_count / 5.0)

        # 6. Baseline velocity deviation (Z-score proxy)
        hist_count = sub_state["historical_outflow_count"]
        hist_sum = sub_state["historical_outflow_sum"]
        hist_mean_amount = (hist_sum / hist_count) if hist_count > 0 else amount_minor
        relative_size_surge = (amount_minor / hist_mean_amount) if hist_mean_amount > 0 else 1.0

        # 7. Entropy / Dispersion of inbound sources (Herfindahl-Hirschman index proxy)
        if inbound_volume > 0:
            sender_shares = defaultdict(int)
            for tx in inbound_txs:
                sender_shares[tx["source_account_id"]] += tx["amount_minor"]
            hhi = sum((val / inbound_volume) ** 2 for val in sender_shares.values())
        else:
            hhi = 1.0

        # Compile 14 features
        return {
            "distinct_senders_count": float(distinct_senders),
            "inbound_transfer_count": float(len(inbound_txs)),
            "inbound_volume_log": math.log1p(inbound_volume / 100.0),
            "outbound_volume_log": math.log1p(outbound_volume / 100.0),
            "pass_through_ratio": min(2.0, float(pass_through_ratio)),
            "forwarding_delay_seconds": float(forwarding_delay_sec),
            "is_new_recipient": float(is_new_recipient),
            "recurrent_settlement_strength": float(recurrent_settlement_strength),
            "relative_size_surge": min(20.0, float(relative_size_surge)),
            "source_hhi_dispersion": float(hhi),
            "historical_inflow_count": float(sub_state["historical_inflow_count"]),
            "historical_outflow_count": float(sub_state["historical_outflow_count"]),
            "amount_minor_scaled": float(amount_minor / 100000.0),
            "fan_in_velocity": float(distinct_senders) / max(1.0, forwarding_delay_sec / 3600.0),
        }
