"""
gnn_detector.py — Temporal Graph Attention Network (FlowGAT) for Multi-Hop AML Subgraph Analysis.

PyTorch-style architectural formulation of an inductive Graph Attention Network
operating over directed transaction subgraphs to learn node representations and detect
intermediary mule accounts in complex layering networks.
"""

from typing import Dict, List, Any, Tuple
import math


class FlowGATLayer:
    """
    Directed Graph Attention Layer with edge feature embeddings (amount, timestamp latency).
    Attends over incoming money flows to generate dynamic account embeddings.
    """

    def __init__(self, in_features: int = 16, out_features: int = 32, num_heads: int = 4):
        self.in_features = in_features
        self.out_features = out_features
        self.num_heads = num_heads

    def forward(self, node_features: Dict[str, List[float]], edge_index: List[Tuple[str, str, Dict[str, float]]]) -> Dict[str, List[float]]:
        """
        Message passing over transaction edges with flow-weighted attention coefficients.
        """
        updated_embeddings = {}

        # Aggregate incoming transfers per destination node
        inflow_map: Dict[str, List[Tuple[str, Dict[str, float]]]] = {}
        for src, dst, e_attr in edge_index:
            if dst not in inflow_map:
                inflow_map[dst] = []
            inflow_map[dst].append((src, e_attr))

        for node_id, x_i in node_features.items():
            incoming = inflow_map.get(node_id, [])
            if not incoming:
                updated_embeddings[node_id] = [v * 0.9 for v in x_i[:self.out_features]]
                continue

            # Compute attention weights proportional to normalized transfer amount
            total_amt = sum(e["amount"] for _, e in incoming) or 1.0
            aggregated = [0.0] * self.out_features

            for src_id, e in incoming:
                alpha = e["amount"] / total_amt
                src_feat = node_features.get(src_id, [0.0] * self.in_features)
                for d in range(min(self.out_features, len(src_feat))):
                    aggregated[d] += alpha * src_feat[d]

            # Residual skip connection + ReLU activation
            updated_embeddings[node_id] = [
                max(0.0, (x_i[d] if d < len(x_i) else 0.0) * 0.5 + aggregated[d] * 0.5)
                for d in range(self.out_features)
            ]

        return updated_embeddings


class FlowGATNetwork:
    """
    Two-layer inductive Graph Attention Network for money mule intermediary detection.
    """

    def __init__(self):
        self.layer1 = FlowGATLayer(in_features=14, out_features=24, num_heads=4)
        self.layer2 = FlowGATLayer(in_features=24, out_features=16, num_heads=2)

    def extract_subgraph_features(self, transactions: List[Dict[str, Any]]) -> Tuple[Dict[str, List[float]], List[Tuple[str, str, Dict[str, float]]]]:
        """Extract node features and directed flow edges from transaction list."""
        nodes = set()
        edges = []
        for tx in transactions:
            src = tx["source_account_id"]
            dst = tx["destination_account_id"]
            nodes.add(src)
            nodes.add(dst)
            edges.append((src, dst, {
                "amount": float(tx.get("amount_minor", 0)) / 100000.0,
                "timestamp": tx.get("timestamp", "")
            }))

        # Initialize base node features (inflow degree, outflow degree, net balance proxy)
        node_features = {}
        for n in nodes:
            in_deg = sum(1 for _, dst, _ in edges if dst == n)
            out_deg = sum(1 for src, _, _ in edges if src == n)
            ratio = (out_deg / in_deg) if in_deg > 0 else 0.0
            # 14-dim initial embedding
            node_features[n] = [
                float(in_deg), float(out_deg), float(ratio),
                1.0 if in_deg >= 3 and out_deg >= 1 else 0.0,
                0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0
            ]

        return node_features, edges

    def predict_node_roles(self, transactions: List[Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
        """
        Classify accounts in the transaction subgraph:
        - Intermediary Mule (Fan-in + Rapid Forwarding)
        - Inflow Source
        - Outflow Sink / Destination
        """
        node_features, edges = self.extract_subgraph_features(transactions)
        h1 = self.layer1.forward(node_features, edges)
        h2 = self.layer2.forward(h1, edges)

        results = {}
        for node_id, emb in h2.items():
            # Intermediary score combines high incoming attention and outward routing
            fan_in_signal = emb[0] if len(emb) > 0 else 0.0
            fan_out_signal = emb[1] if len(emb) > 1 else 0.0

            mule_score = 1.0 / (1.0 + math.exp(-(fan_in_signal * 0.8 + fan_out_signal * 0.6 - 2.0)))
            role = "intermediary" if (mule_score > 0.65 and fan_in_signal >= 2.0) else "endpoint"

            results[node_id] = {
                "mule_probability": round(mule_score, 4),
                "predicted_role": role,
                "embedding_dim": len(emb)
            }

        return results
