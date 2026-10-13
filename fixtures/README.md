# Synthetic fixture library

All events are synthetic INR transfers. Demo `.history.jsonl` files are seeded on reset; corresponding `.jsonl` files are stepped. Labels are separate and read only by the evaluator.

Deterministic version: synthetic_v1; arithmetic generation has no random dependency. Validation uses the seven named demo scenarios. Held-out scenarios have independent account IDs, 3–5 sources, staggered outward transfers, and varying amounts/timing. Twenty-four held-out networks include eight suspicious and sixteen benign scenarios. These are related hand-designed templates, not independent real-world samples; results do not establish generalization.

Configuration is frozen before evaluation: amount-only baseline >=8,000,000 minor units OR six account events in 900 seconds. Blindspot uses the documented 900/600-second windows and 0.8 ratio. Settlement mitigation is 30 points after three prior similarly sized payments to the recipient; baseline history excludes the current 900-second window. Volume deviation saturates when mean current eligible inflow reaches twice prior mean transaction amount.

Primary positive: high-severity analyst escalation. Medium monitoring is reported separately. Benchmark timing includes ingestion and SQLite commit for both methods using isolated in-memory SQLite databases, excludes fixture loading, and measures every accepted event. It is not disk durability or HTTP/UI latency.
