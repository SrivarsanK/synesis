import sys
import re

# Generator for Blindspot Architecture Diagram (Diagram-Design spec)
def generate_architecture():
    svg_content = '''<svg viewBox="0 0 1020 520" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="arch-title arch-desc">
  <title id="arch-title">Blindspot System Architecture</title>
  <desc id="arch-desc">Architecture diagram of Blindspot showing synthetic stream ingress, Axum validation and temporal detection core, SQLite persistence, and React Cytoscape investigation console.</desc>
  <defs>
    <style>@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;display=swap');</style>
    <pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse">
      <circle cx="1" cy="1" r="0.9" fill="#2d3142" fill-opacity="0.08"/>
    </pattern>
    <marker id="arrow" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#4f5d75"/>
    </marker>
    <marker id="arrow-accent" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#eb6c36"/>
    </marker>
    <marker id="arrow-link" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#2e5aa8"/>
    </marker>
  </defs>

  <!-- Canvas Background -->
  <rect width="100%" height="100%" fill="#f5f5f5"/>
  <rect width="100%" height="100%" fill="url(#dots)" opacity="0.6"/>

  <!-- ZONE 1: INGESTION TIER -->
  <rect x="40" y="55" width="260" height="425" rx="8" fill="#2d3142" fill-opacity="0.02" stroke="#2d3142" stroke-opacity="0.10" stroke-width="0.8"/>
  <rect x="75" y="59" width="190" height="14" rx="2" fill="#f5f5f5"/>
  <text x="170" y="69" fill="#4f5d75" font-size="7.5" font-family="'Geist Mono', monospace" font-weight="500" text-anchor="middle" letter-spacing="0.14em">INGRESS &amp; STREAM REPLAY</text>

  <!-- ZONE 2: AXUM DETECTION CORE -->
  <rect x="340" y="55" width="340" height="425" rx="8" fill="#2d3142" fill-opacity="0.02" stroke="#2d3142" stroke-opacity="0.10" stroke-width="0.8"/>
  <rect x="405" y="59" width="210" height="14" rx="2" fill="#f5f5f5"/>
  <text x="510" y="69" fill="#4f5d75" font-size="7.5" font-family="'Geist Mono', monospace" font-weight="500" text-anchor="middle" letter-spacing="0.14em">RUST AXUM DETECTION CORE</text>

  <!-- ZONE 3: STORAGE & INVESTIGATION CONSOLE -->
  <rect x="720" y="55" width="260" height="425" rx="8" fill="#2d3142" fill-opacity="0.02" stroke="#2d3142" stroke-opacity="0.10" stroke-width="0.8"/>
  <rect x="755" y="59" width="190" height="14" rx="2" fill="#f5f5f5"/>
  <text x="850" y="69" fill="#4f5d75" font-size="7.5" font-family="'Geist Mono', monospace" font-weight="500" text-anchor="middle" letter-spacing="0.14em">PERSISTENCE &amp; UI CONSOLE</text>

  <!-- CONNECTORS (Drawn before boxes) -->
  <!-- Node 1 -> Node 2: Vertical stream -->
  <line x1="170" y1="160" x2="170" y2="218" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Node 3 -> Node 2: Vertical trigger -->
  <line x1="170" y1="365" x2="170" y2="307" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Node 2 -> Node 4: Ingest API to Validator (Elbow right+up) -->
  <path d="M 280,250 H 302 Q 310,250 310,242 V 148 Q 310,140 318,140 H 358" fill="none" stroke="#2e5aa8" stroke-width="1.2" marker-end="url(#arrow-link)"/>

  <!-- Node 4 -> Node 5: Validator to Window Manager -->
  <line x1="510" y1="180" x2="510" y2="223" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Node 5 -> Node 6: Window Manager to Scorer (Accent Coral) -->
  <line x1="510" y1="310" x2="510" y2="353" stroke="#eb6c36" stroke-width="1.4" marker-end="url(#arrow-accent)"/>

  <!-- Node 4 -> Node 7: Validator to SQLite -->
  <line x1="670" y1="140" x2="738" y2="140" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Node 6 -> Node 7: Scorer to SQLite Case write (Elbow right+up) -->
  <path d="M 670,390 H 692 Q 700,390 700,382 V 178 Q 700,170 708,170 H 738" fill="none" stroke="#eb6c36" stroke-width="1.4" marker-end="url(#arrow-accent)"/>

  <!-- Node 7 -> Node 8: SQLite to React Cytoscape Console -->
  <line x1="850" y1="185" x2="850" y2="228" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- Node 6 -> Node 9: Scorer to Benchmark Engine (Elbow right+down) -->
  <path d="M 670,415 H 692 Q 700,415 700,423 V 427 Q 700,435 708,435 H 738" fill="none" stroke="#4f5d75" stroke-width="1.2" marker-end="url(#arrow)"/>

  <!-- CONNECTOR LABELS (With paper mask rects and >=6px margin) -->
  <!-- Node 1 -> Node 2 Label -->
  <rect x="144" y="179" width="52" height="13" rx="2" fill="#f5f5f5"/>
  <text x="170" y="188" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">STREAM</text>

  <!-- Node 3 -> Node 2 Label -->
  <rect x="144" y="328" width="52" height="13" rx="2" fill="#f5f5f5"/>
  <text x="170" y="337" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">STEP/RESET</text>

  <!-- Node 2 -> Node 4 Label (Centered on vertical segment at X=310) -->
  <rect x="282" y="188" width="56" height="13" rx="2" fill="#f5f5f5"/>
  <text x="310" y="197" fill="#2e5aa8" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">POST JSON</text>

  <!-- Node 4 -> Node 5 Label -->
  <rect x="477" y="194" width="66" height="13" rx="2" fill="#f5f5f5"/>
  <text x="510" y="203" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">VALIDATED</text>

  <!-- Node 5 -> Node 6 Label -->
  <rect x="466" y="324" width="88" height="13" rx="2" fill="#f5f5f5"/>
  <text x="510" y="333" fill="#eb6c36" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">OUTWARD EVENT</text>

  <!-- Node 4 -> Node 7 Label -->
  <rect x="677" y="125" width="54" height="13" rx="2" fill="#f5f5f5"/>
  <text x="704" y="134" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">INSERT TX</text>

  <!-- Node 6 -> Node 7 Label (On vertical segment at X=700) -->
  <rect x="674" y="272" width="52" height="13" rx="2" fill="#f5f5f5"/>
  <text x="700" y="281" fill="#eb6c36" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">EMIT CASE</text>

  <!-- Node 7 -> Node 8 Label -->
  <rect x="822" y="199" width="56" height="13" rx="2" fill="#f5f5f5"/>
  <text x="850" y="208" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">POLL API</text>

  <!-- Node 6 -> Node 9 Label -->
  <rect x="674" y="440" width="52" height="13" rx="2" fill="#f5f5f5"/>
  <text x="700" y="449" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">EVALUATE</text>


  <!-- NODES (Painted after connectors) -->

  <!-- NODE 1: Synthetic Streams (Ingress) -->
  <rect x="60" y="95" width="220" height="65" rx="6" fill="#f5f5f5"/>
  <rect x="60" y="95" width="220" height="65" rx="6" fill="#2d3142" fill-opacity="0.03" stroke="#2d3142" stroke-opacity="0.30" stroke-width="1"/>
  <rect x="68" y="101" width="46" height="12" rx="2" fill="none" stroke="#2d3142" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="91" y="110" fill="#2d3142" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">FIXTURE</text>
  <text x="170" y="129" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Synthetic Stream Loader</text>
  <text x="170" y="146" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">fixtures/*.jsonl · 24 scenarios</text>

  <!-- NODE 2: Axum Ingest Endpoints -->
  <rect x="60" y="220" width="220" height="85" rx="6" fill="#f5f5f5"/>
  <rect x="60" y="220" width="220" height="85" rx="6" fill="#ffffff" stroke="#2d3142" stroke-width="1"/>
  <rect x="68" y="226" width="44" height="12" rx="2" fill="none" stroke="#2d3142" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="90" y="235" fill="#2d3142" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">ROUTER</text>
  <text x="170" y="254" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Axum Ingestion Layer</text>
  <text x="170" y="271" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">POST /api/transactions</text>
  <text x="170" y="286" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">POST /api/demo/next</text>

  <!-- NODE 3: Demo Replay Stepper -->
  <rect x="60" y="365" width="220" height="65" rx="6" fill="#f5f5f5"/>
  <rect x="60" y="365" width="220" height="65" rx="6" fill="#2d3142" fill-opacity="0.03" stroke="#2d3142" stroke-opacity="0.30" stroke-width="1"/>
  <rect x="68" y="371" width="44" height="12" rx="2" fill="none" stroke="#2d3142" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="90" y="380" fill="#2d3142" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">REPLAY</text>
  <text x="170" y="399" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Deterministic Demo Stepper</text>
  <text x="170" y="416" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">event-by-event cursor replay</text>

  <!-- NODE 4: Event Validation & Dedupe (Core) -->
  <rect x="360" y="100" width="300" height="80" rx="6" fill="#f5f5f5"/>
  <rect x="360" y="100" width="300" height="80" rx="6" fill="#ffffff" stroke="#2d3142" stroke-width="1"/>
  <rect x="368" y="106" width="48" height="12" rx="2" fill="none" stroke="#2d3142" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="392" y="115" fill="#2d3142" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">GATEWAY</text>
  <text x="510" y="132" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Validation &amp; Ingestion Pipeline</text>
  <text x="510" y="150" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">idempotent dedupe (409 on conflict)</text>
  <text x="510" y="165" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">strict monotonic UTC event-time (422 late)</text>

  <!-- NODE 5: Temporal Windows Engine (Core) -->
  <rect x="360" y="225" width="300" height="85" rx="6" fill="#f5f5f5"/>
  <rect x="360" y="225" width="300" height="85" rx="6" fill="#2d3142" fill-opacity="0.05" stroke="#4f5d75" stroke-width="1"/>
  <rect x="368" y="231" width="58" height="12" rx="2" fill="none" stroke="#4f5d75" stroke-opacity="0.50" stroke-width="0.8"/>
  <text x="397" y="240" fill="#4f5d75" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">STATE-SYNC</text>
  <text x="510" y="256" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Temporal Window Manager</text>
  <text x="510" y="274" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">VecDeque per-account rolling state</text>
  <text x="510" y="289" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">15m inflow (≥3 senders) · 10m outflow (≥80%)</text>
  <text x="510" y="302" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle">atomic scratch-state clone recovery</text>

  <!-- NODE 6: Contextual Risk Scorer (FOCAL ACCENT) -->
  <rect x="360" y="355" width="300" height="95" rx="6" fill="#f5f5f5"/>
  <rect x="360" y="355" width="300" height="95" rx="6" fill="#eb6c36" fill-opacity="0.08" stroke="#eb6c36" stroke-width="1.5"/>
  <rect x="368" y="361" width="46" height="12" rx="2" fill="none" stroke="#eb6c36" stroke-opacity="0.60" stroke-width="0.8"/>
  <text x="391" y="370" fill="#eb6c36" font-size="7" font-family="'Geist Mono', monospace" font-weight="600" text-anchor="middle" letter-spacing="0.08em">FOCAL</text>
  <text x="510" y="386" fill="#2d3142" font-size="12.5" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Contextual Risk &amp; Mitigation Engine</text>
  <text x="510" y="405" fill="#eb6c36" font-size="9" font-family="'Geist Mono', monospace" font-weight="500" text-anchor="middle">0-100 relative severity score</text>
  <text x="510" y="420" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">merchant settlement history: -30 pts mitigation</text>
  <text x="510" y="434" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle">escalate_for_review (≥70) · monitor_or_verify (≥35)</text>

  <!-- NODE 7: SQLite Store -->
  <rect x="740" y="100" width="220" height="85" rx="6" fill="#f5f5f5"/>
  <rect x="740" y="100" width="220" height="85" rx="6" fill="#2d3142" fill-opacity="0.05" stroke="#4f5d75" stroke-width="1"/>
  <rect x="748" y="106" width="50" height="12" rx="2" fill="none" stroke="#4f5d75" stroke-opacity="0.50" stroke-width="0.8"/>
  <text x="773" y="115" fill="#4f5d75" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">DATABASE</text>
  <text x="850" y="133" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">SQLite Embedded Store</text>
  <text x="850" y="151" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">WAL journal · rusqlite</text>
  <text x="850" y="166" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">transactions · cases · events</text>

  <!-- NODE 8: React Cytoscape Investigation Console -->
  <rect x="740" y="230" width="220" height="90" rx="6" fill="#f5f5f5"/>
  <rect x="740" y="230" width="220" height="90" rx="6" fill="#ffffff" stroke="#2d3142" stroke-width="1"/>
  <rect x="748" y="236" width="46" height="12" rx="2" fill="none" stroke="#2d3142" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="771" y="245" fill="#2d3142" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">CONSOLE</text>
  <text x="850" y="262" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">React 19 Investigation UI</text>
  <text x="850" y="280" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">Cytoscape.js directed graph</text>
  <text x="850" y="295" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">multiedges with real transaction IDs</text>
  <text x="850" y="308" fill="#4f5d75" font-size="8" font-family="'Geist Mono', monospace" text-anchor="middle">desktop-first charcoal/gold design</text>

  <!-- NODE 9: Measured Benchmark Evaluator -->
  <rect x="740" y="365" width="220" height="85" rx="6" fill="#f5f5f5"/>
  <rect x="740" y="365" width="220" height="85" rx="6" fill="#2d3142" fill-opacity="0.03" stroke="#2d3142" stroke-opacity="0.30" stroke-width="1"/>
  <rect x="748" y="371" width="58" height="12" rx="2" fill="none" stroke="#2d3142" stroke-opacity="0.40" stroke-width="0.8"/>
  <text x="777" y="380" fill="#2d3142" font-size="7" font-family="'Geist Mono', monospace" text-anchor="middle" letter-spacing="0.08em">BENCHMARK</text>
  <text x="850" y="398" fill="#2d3142" font-size="12" font-family="'Geist', sans-serif" font-weight="600" text-anchor="middle">Evaluator &amp; Baseline</text>
  <text x="850" y="416" fill="#4f5d75" font-size="9" font-family="'Geist Mono', monospace" text-anchor="middle">24 held-out synthetic scenarios</text>
  <text x="850" y="431" fill="#4f5d75" font-size="8.5" font-family="'Geist Mono', monospace" text-anchor="middle">honest measured confusion matrix</text>
</svg>'''

    html_wrapper = f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Blindspot · System Architecture</title>
  <link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&amp;family=Geist:wght@400;500;600&amp;family=Geist+Mono:wght@400;500;600&amp;display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after {{ box-sizing: border-box; margin: 0; padding: 0; }}
    :root {{
      --color-paper:   #f5f5f5;
      --color-ink:     #2d3142;
      --color-muted:   #4f5d75;
      --color-accent:  #eb6c36;
      --font-sans:     'Geist', system-ui, sans-serif;
      --font-serif:    'Instrument Serif', serif;
      --font-mono:     'Geist Mono', ui-monospace, monospace;
    }}
    body {{
      font-family: var(--font-sans);
      background: var(--color-paper);
      color: var(--color-ink);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }}
    .frame {{ max-width: 1100px; width: 100%; }}
    .eyebrow {{
      font-family: var(--font-mono);
      font-size: 0.7rem;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-muted);
      margin-bottom: 0.5rem;
    }}
    h1 {{
      font-family: var(--font-serif);
      font-size: 2rem;
      font-weight: 400;
      letter-spacing: -0.02em;
      color: var(--color-ink);
      margin-bottom: 1.5rem;
    }}
    svg {{ width: 100%; height: auto; display: block; border-radius: 8px; }}
  </style>
</head>
<body>
  <div class="frame">
    <p class="eyebrow">Architecture · Diagram Design</p>
    <h1>Blindspot Core System Topology</h1>
    {svg_content}
  </div>
</body>
</html>'''

    xml_header = '<?xml version="1.0" encoding="UTF-8"?>\n'

    with open("docs/assets/architecture.html", "w", encoding="utf-8") as f:
        f.write(html_wrapper)

    with open("docs/assets/architecture.svg", "w", encoding="utf-8") as f:
        f.write(xml_header + svg_content)

    print("Architecture files created successfully.")

if __name__ == "__main__":
    generate_architecture()
