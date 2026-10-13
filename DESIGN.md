# DESIGN.md — Blindspot Design System & Tokens

**Status:** Canonical Visual Direction · **Theme:** Light / High-Legibility Financial Intelligence Console · **Stack:** React, CSS, Cytoscape

---

## 1. Design Direction & Philosophy

Blindspot is a desktop-first forensic AML and money-flow investigation console. It surfaces complex causal financial graphs, mule fan-in / rapid onward pass-through patterns, and evidence timelines without cognitive overload.

- **Tone:** Precise, institutional, calm, and trustworthy — reminiscent of premier risk infrastructure (Palantir Foundry, Linear, Stripe Radar).
- **Theme:** Light Mode with crisp optical hierarchy, soft tonal surfaces, deep slate typography, and high-visibility status badges.
- **Craft Standard:** Adheres to Impeccable Craft Floor and Awwwards-level design engineering. Zero generic AI clichés, zero Inter font, zero neobrutalist costumes, zero gradient text.

---

## 2. Color Palette & Semantic Tokens

```css
:root {
  /* Canvas & Surfaces */
  --bg: #f8fafc;              /* Slate-50: Crisp, clean background */
  --bg-subtle: #f1f5f9;       /* Slate-100: Secondary canvas wash */
  --surface: #ffffff;         /* Pure white: Primary panels & cards */
  --surface-raised: #ffffff;  /* Elevated cards */
  --surface-hover: #f8fafc;   /* Subtle interactive hover */

  /* Typography */
  --text: #0f172a;             /* Slate-900: High-contrast primary headings & values */
  --text-secondary: #334155;   /* Slate-700: Body copy & table content */
  --muted: #64748b;            /* Slate-500: Auxiliary metadata (WCAG AA compliant) */

  /* Borders & Dividers */
  --border: #e2e8f0;           /* Slate-200: Subtle card & table borders */
  --border-strong: #cbd5e1;    /* Slate-300: Interactive control borders */

  /* Brand & Action */
  --accent: #2563eb;           /* Royal Blue: Primary action & selected states */
  --accent-light: #eff6ff;     /* Blue-50: Soft selection background */
  --accent-hover: #1d4ed8;     /* Blue-700: Active hover state */

  /* Risk States */
  --danger: #dc2626;           /* Red-600: High-risk alert */
  --danger-bg: #fef2f2;        /* Red-50: High-risk pill fill */
  --danger-border: #fecaca;    /* Red-200: High-risk border */
  --danger-text: #b91c1c;      /* Red-700: High-risk text */

  --warning: #d97706;          /* Amber-600: Medium risk / Intermediary */
  --warning-bg: #fffbeb;       /* Amber-50: Warning pill fill */
  --warning-border: #fde68a;   /* Amber-200: Warning border */
  --warning-text: #b45309;     /* Amber-700: Warning text */

  --success: #059669;          /* Emerald-600: API connected / Low risk */
  --success-bg: #ecfdf5;       /* Emerald-50: Low-risk pill fill */
  --success-border: #a7f3d0;   /* Emerald-200: Low-risk border */
  --success-text: #047857;     /* Emerald-700: Low-risk text */

  /* Elevation */
  --shadow-sm: 0 1px 2px 0 rgba(15, 23, 42, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(15, 23, 42, 0.06), 0 2px 4px -2px rgba(15, 23, 42, 0.04);
}
```

---

## 3. Typography Stack

- **Display & Interface:** `Outfit`, `-apple-system`, `BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`.
  - Geometric sans with subtle warmth and legible numerals.
  - Ban on generic `Inter`.
- **Data & Financial Numerics:** `ui-monospace`, `"JetBrains Mono"`, `SFMono-Regular`, `Menlo`, `monospace`.
  - Monospaced numerals for timestamps, INR monetary amounts, account masks, and transaction IDs (`tabular-nums`).

---

## 4. Component Ergonomics

### Header & Navigation
- Height: 64px minimal footprint with sticky top anchoring.
- Brand: `blindspot.` with accented dot.
- Segmented tab control for `Live monitor`, `Investigation`, `Benchmarks` with active blue indicator.
- Distinct pills for `SYNTHETIC STREAM / DEMO` and backend live connection.

### Analytical KPI Strip
- 4-column balanced bento grid.
- Pure white background cards with 1px border and soft shadow.
- Large tabular metrics with small contextual metadata labels.

### Scenario Controls & Stepper
- Unified control toolbar: scenario selector dropdown, "Reset & load scenario", live event counter progress, and high-visibility "Step next transaction" primary button.

### Network Visual Canvas (Cytoscape)
- Light canvas background (`#f8fafc`) with clean node styling:
  - Source / Destination accounts: White node with slate border (`#64748b`), bold dark label.
  - Intermediary node: Amber fill (`#fef3c7`), amber border (`#d97706`), enlarged diameter (46px).
  - High-risk node: Red fill (`#fee2e2`), red border (`#dc2626`).
  - Active transfer edge: 4px royal blue stroke with directed arrow (`#2563eb`).
  - Interactive selection bar displaying tapped node/edge details in real time.

### Investigation & Evidence Replay
- Clear two-column layout:
  - **Left:** Recommended simulated response banner, creation/update timestamps, and structured reason code cards showing observed metrics vs detection thresholds.
  - **Right:** Chronological evidence step-through timeline with interactive state and active edge sync.

### Tabular Ledger (Accepted Transactions)
- Subtle header row (`#f1f5f9`), clean horizontal dividers, hover highlight, right-aligned monetary values in Indian Rupee format (`₹`).

---

## 5. Accessibility & Motion

- **WCAG 2.1 AA:** Minimum 4.5:1 text contrast for all body copy and 3:1 for large display headers.
- **Focus States:** 2px high-visibility focus ring (`outline: 2px solid #2563eb; outline-offset: 2px`).
- **Motion:** Micro-animations on hover and state transitions. Full collapse when `prefers-reduced-motion: reduce` is detected.
- **Mobile Graceful Degradation:** Stacks vertically without horizontal scroll overflow.
