import { useEffect, useRef, useState, useMemo } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import type { Graph, GraphNode, GraphEdge, EntityType, LinkFlowType } from './types';
import { money, inr, utc } from './format';

/* --- SVG Data URIs for Cytoscape Nodes (Matching Unit21/Siron AML Enterprise Style) --- */
const personSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`
);
const merchantSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M3 10h18M5 10v11M19 10v11M9 10v11M15 10v11M12 2l10 5H2l10-5z"/></svg>`
);
const cardSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`
);
const addressSvg = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>`
);

type GroupingType = 'none' | 'status' | 'entity_type' | 'entity_subtype' | 'links';

export default function TransactionGraph({
  graph,
  active,
  identity,
  title = 'Network Analysis',
}: {
  graph: Graph;
  active?: string;
  identity: string;
  title?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Core | null>(null);
  const lastIdentity = useRef('');

  // Interactive Toolbar States
  const [amountFilter, setAmountFilter] = useState<string>('none');
  const [visibleFilter, setVisibleFilter] = useState<string>('all');
  const [grouping, setGrouping] = useState<GroupingType>('none');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [panMode, setPanMode] = useState<'pan' | 'select'>('pan');
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  // Inspector Selection Details
  const [selectedEntity, setSelectedEntity] = useState<{
    type: 'node' | 'edge';
    title: string;
    subtitle?: string;
    meta?: string;
    risk?: string;
    amount?: string;
  } | null>(null);

  // Filter nodes & edges based on amount and visibility filters
  const filteredGraph = useMemo(() => {
    let edges = [...graph.edges];
    let nodes = [...graph.nodes];

    // 1. Amount threshold filter
    if (amountFilter === 'gt10k') {
      edges = edges.filter(e => e.amount_minor >= 1000000);
    } else if (amountFilter === 'gt50k') {
      edges = edges.filter(e => e.amount_minor >= 5000000);
    } else if (amountFilter === 'gt100k') {
      edges = edges.filter(e => e.amount_minor >= 10000000);
    } else if (amountFilter === 'gt500k') {
      edges = edges.filter(e => e.amount_minor >= 50000000);
    }

    // 2. Visible objects filter
    if (visibleFilter === 'high_risk') {
      const highRiskNodeIds = new Set(nodes.filter(n => n.risk_level === 'high' || n.role === 'intermediary').map(n => n.id));
      edges = edges.filter(e => highRiskNodeIds.has(e.source) || highRiskNodeIds.has(e.target));
      const connected = new Set(edges.flatMap(e => [e.source, e.target]));
      nodes = nodes.filter(n => highRiskNodeIds.has(n.id) || connected.has(n.id));
    } else if (visibleFilter === 'accounts_only') {
      nodes = nodes.filter(n => n.entity_type === 'account' || n.label.startsWith('Account') || n.label.match(/\d{5,}/));
      const ids = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => ids.has(e.source) && ids.has(e.target));
    } else if (visibleFilter === 'merchants_only') {
      nodes = nodes.filter(n => n.entity_type === 'merchant' || n.label.toLowerCase().includes('solids') || n.label.toLowerCase().includes('corp') || n.label.toLowerCase().includes('ltd'));
      const ids = new Set(nodes.map(n => n.id));
      edges = edges.filter(e => ids.has(e.source) || ids.has(e.target));
    }

    return { nodes, edges };
  }, [graph, amountFilter, visibleFilter]);

  // Initialize Cytoscape with Enterprise AML Styles
  useEffect(() => {
    if (!host.current) return;

    const cy = cytoscape({
      container: host.current,
      elements: [],
      minZoom: 0.2,
      maxZoom: 3.5,
      wheelSensitivity: 0.25,
      boxSelectionEnabled: false,
      style: [
        /* Base Node Style */
        {
          selector: 'node',
          style: {
            label: 'data(label)',
            'background-color': '#3b82f6',
            'background-image': `data:image/svg+xml;utf8,${personSvg}`,
            'background-fit': 'contain',
            'background-clip': 'none',
            'background-width': '58%',
            'background-height': '58%',
            width: 34,
            height: 34,
            'border-width': 2.5,
            'border-color': '#ffffff',
            'font-family': 'Outfit, -apple-system, sans-serif',
            'font-size': 10.5,
            'font-weight': 600,
            color: '#1e293b',
            'text-valign': 'bottom',
            'text-margin-y': 7,
            'text-background-opacity': 0.85,
            'text-background-color': '#ffffff',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
          },
        },
        /* Central Investigated Entity (Red Subject Node - Nick Miller / Kaaviya R) */
        {
          selector: 'node[entity_type = "subject"], node[role = "intermediary"][risk_level = "high"], node[is_subject = "true"]',
          style: {
            width: 44,
            height: 44,
            'background-color': '#ef4444',
            'background-image': `data:image/svg+xml;utf8,${personSvg}`,
            'border-color': '#ffffff',
            'border-width': 3,
            color: '#0f172a',
            'font-size': 11.5,
            'font-weight': 700,
            'text-margin-y': 8,
            'z-index': 20,
          },
        },
        /* Merchant / Corporate Node (Blue Storefront - Global Solids LLC, Amazon, etc.) */
        {
          selector: 'node[entity_type = "merchant"]',
          style: {
            width: 36,
            height: 36,
            'background-color': '#1d4ed8',
            'background-image': `data:image/svg+xml;utf8,${merchantSvg}`,
            'border-color': '#ffffff',
            'border-width': 2.5,
            color: '#1e293b',
          },
        },
        /* Account / Card Node (Teal Card - 102289330, 117303985, etc.) */
        {
          selector: 'node[entity_type = "account"]',
          style: {
            width: 32,
            height: 32,
            'background-color': '#0891b2',
            'background-image': `data:image/svg+xml;utf8,${cardSvg}`,
            'border-color': '#ffffff',
            'border-width': 2,
            'font-family': 'JetBrains Mono, monospace',
            'font-size': 10,
            color: '#334155',
          },
        },
        /* Location / Address Node (Gray House - Peachtree Place B...) */
        {
          selector: 'node[entity_type = "address"]',
          style: {
            width: 30,
            height: 30,
            'background-color': '#64748b',
            'background-image': `data:image/svg+xml;utf8,${addressSvg}`,
            'border-color': '#ffffff',
            'border-width': 2,
            'font-size': 9.5,
            color: '#475569',
          },
        },
        /* Base Directed Edge Style */
        {
          selector: 'edge',
          style: {
            width: 1.8,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.15,
            label: 'data(formatted_amount)',
            'font-family': 'JetBrains Mono, monospace',
            'font-size': 9.5,
            'font-weight': 600,
            color: '#334155',
            'text-rotation': 'autorotate',
            'text-background-opacity': 0.9,
            'text-background-color': '#ffffff',
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
          },
        },
        /* High-Risk Outward Transfer Edge (Red Dashed Line with Arrow) */
        {
          selector: 'edge[flow_type = "high_risk"], edge.high-risk',
          style: {
            width: 2.2,
            'line-style': 'dashed',
            'line-dash-pattern': [5, 4],
            'line-color': '#ef4444',
            'target-arrow-color': '#ef4444',
            color: '#b91c1c',
            'z-index': 10,
          },
        },
        /* Inward Flow Edge (Green Dashed Line with Arrow) */
        {
          selector: 'edge[flow_type = "normal"], edge.normal-flow',
          style: {
            width: 2.0,
            'line-style': 'dashed',
            'line-dash-pattern': [5, 4],
            'line-color': '#22c55e',
            'target-arrow-color': '#22c55e',
            color: '#15803d',
          },
        },
        /* Association / Account Link (Solid Gray Line without Arrow) */
        {
          selector: 'edge[flow_type = "association"], edge.association-link',
          style: {
            width: 1.5,
            'line-style': 'solid',
            'line-color': '#cbd5e1',
            'target-arrow-shape': 'none',
            label: '',
          },
        },
        /* Active / Selected Hover State */
        {
          selector: ':selected',
          style: {
            'border-color': '#2563eb',
            'border-width': 3.5,
            'line-color': '#2563eb',
            'target-arrow-color': '#2563eb',
            'z-index': 30,
          },
        },
        {
          selector: '.active',
          style: {
            width: 3.5,
            'line-color': '#2563eb',
            'target-arrow-color': '#2563eb',
            'z-index': 25,
          },
        },
      ],
    });

    instance.current = cy;

    // Tap node handler
    cy.on('tap', 'node', event => {
      const node = event.target.data();
      setSelectedEntity({
        type: 'node',
        title: node.label,
        subtitle: node.entity_type ? `${node.entity_type.toUpperCase()} ENTITY` : `${node.role.toUpperCase()} NODE`,
        risk: node.risk_level || 'standard',
        meta: `ID: ${node.id.replace('n:', '')} · Role: ${node.role}`,
      });
    });

    // Tap edge handler
    cy.on('tap', 'edge', event => {
      const edge = event.target.data();
      setSelectedEntity({
        type: 'edge',
        title: edge.transaction_id || edge.id.replace('e:', ''),
        subtitle: `TRANSFER LINK (${edge.source.replace('n:', '')} → ${edge.target.replace('n:', '')})`,
        amount: edge.formatted_amount || (edge.amount_minor ? money(edge.amount_minor) : 'Association link'),
        meta: edge.timestamp ? `Time: ${utc(edge.timestamp)}` : undefined,
      });
    });

    // Track zoom updates
    cy.on('zoom', () => {
      setZoomLevel(Math.round(cy.zoom() * 100) / 100);
    });

    // Resize observer
    const observer = new ResizeObserver(() => {
      cy.resize();
    });
    observer.observe(host.current);

    return () => {
      observer.disconnect();
      cy.destroy();
      instance.current = null;
    };
  }, []);

  // Update Cytoscape Graph Elements and Layout
  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;

    const changedIdentity = identity !== lastIdentity.current;
    const wasEmpty = cy.nodes().length === 0;

    // Infer entity types and amounts for each node & edge
    const wanted = new Set([
      ...filteredGraph.nodes.map(n => `n:${n.id}`),
      ...filteredGraph.edges.map(e => `e:${e.id}`),
    ]);

    let additions = false;

    cy.batch(() => {
      cy.elements().filter(el => !wanted.has(el.id())).remove();

      // Process Nodes
      for (const node of filteredGraph.nodes) {
        const id = `n:${node.id}`;
        let entity_type: EntityType = node.entity_type || 'person';

        // Auto-infer if not provided
        if (!node.entity_type) {
          if (node.role === 'intermediary' || node.risk_level === 'high') {
            entity_type = 'subject';
          } else if (node.label.toLowerCase().includes('solids') || node.label.toLowerCase().includes('corp') || node.label.toLowerCase().includes('ltd') || node.label.toLowerCase().includes('amazon') || node.label.toLowerCase().includes('merchant')) {
            entity_type = 'merchant';
          } else if (node.label.startsWith('Account •') || node.label.match(/^\d{6,}/)) {
            entity_type = 'account';
          } else if (node.label.includes('Place') || node.label.includes('Street') || node.label.includes('Ave')) {
            entity_type = 'address';
          } else {
            entity_type = 'person';
          }
        }

        const data = {
          ...node,
          id,
          entity_type,
          is_subject: entity_type === 'subject' ? 'true' : 'false',
        };

        const existing = cy.getElementById(id);
        if (existing.length) {
          existing.data(data);
        } else {
          cy.add({ data });
          additions = true;
        }
      }

      // Process Edges
      for (const edge of filteredGraph.edges) {
        const id = `e:${edge.id}`;
        let flow_type: LinkFlowType = edge.flow_type || 'normal';

        if (!edge.flow_type) {
          if (edge.amount_minor >= 2000000) {
            flow_type = 'high_risk';
          } else if (edge.amount_minor === 0) {
            flow_type = 'association';
          } else {
            flow_type = 'normal';
          }
        }

        const formatted_amount = edge.amount_minor > 0 ? (edge.currency === 'INR' ? inr(edge.amount_minor) : money(edge.amount_minor)) : '';

        const data = {
          ...edge,
          id,
          transaction_id: edge.id,
          source: `n:${edge.source}`,
          target: `n:${edge.target}`,
          flow_type,
          formatted_amount,
        };

        const existing = cy.getElementById(id);
        if (existing.length) {
          existing.data(data);
        } else {
          cy.add({ data });
          additions = true;
        }
      }
    });

    // Run Organic Clustering Layout (COSE, Concentric, or Breadthfirst)
    if (changedIdentity || additions || wasEmpty) {
      runLayout(grouping);
    }

    if (changedIdentity) {
      setSelectedEntity(null);
      lastIdentity.current = identity;
    }
  }, [filteredGraph, identity]);

  // Layout runner supporting Grouping options
  const runLayout = (grp: GroupingType) => {
    const cy = instance.current;
    if (!cy || cy.nodes().length === 0) return;

    if (grp === 'status') {
      // Concentric layout grouping by risk level
      cy.layout({
        name: 'concentric',
        concentric: (node: any) => {
          if (node.data('entity_type') === 'subject') return 10;
          if (node.data('risk_level') === 'high') return 7;
          if (node.data('entity_type') === 'merchant') return 4;
          return 1;
        },
        levelWidth: () => 2,
        padding: 50,
        animate: true,
        animationDuration: 400,
      }).run();
    } else if (grp === 'links') {
      // Breadthfirst directed tree layout
      cy.layout({
        name: 'breadthfirst',
        directed: true,
        padding: 40,
        spacingFactor: 1.5,
        animate: true,
        animationDuration: 400,
      }).run();
    } else {
      // Default: High-fidelity organic physics clustering (COSE)
      cy.layout({
        name: 'cose',
        idealEdgeLength: 125,
        nodeOverlap: 25,
        refresh: 20,
        fit: true,
        padding: 55,
        randomize: false,
        componentSpacing: 120,
        nodeRepulsion: 750000,
        edgeElasticity: 100,
        nestingFactor: 5,
        gravity: 65,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
        animate: false,
      }).run();
    }
  };

  const handleGroupingChange = (g: GroupingType) => {
    setGrouping(g);
    runLayout(g);
  };

  // Canvas Pan Controls (Compass Rosette)
  const panByDelta = (dx: number, dy: number) => {
    instance.current?.panBy({ x: dx, y: dy });
  };

  const handleZoom = (direction: 'in' | 'out') => {
    const cy = instance.current;
    if (!cy) return;
    const factor = direction === 'in' ? 1.3 : 0.77;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const handleResetFit = () => {
    instance.current?.fit(undefined, 45);
  };

  const togglePanMode = () => {
    const next = panMode === 'pan' ? 'select' : 'pan';
    setPanMode(next);
    if (instance.current) {
      instance.current.boxSelectionEnabled(next === 'select');
    }
  };

  // Edge active highlight
  useEffect(() => {
    const cy = instance.current;
    if (cy) {
      cy.edges().removeClass('active');
      if (active) cy.getElementById(`e:${active}`).addClass('active');
    }
  }, [active, filteredGraph]);

  return (
    <div className={`aml-network-card ${isFullscreen ? 'network-fullscreen' : ''}`}>
      {/* 1. Network Analysis Header */}
      <div className="aml-network-header">
        <div className="header-titles">
          <h2>{title}</h2>
          <div className="status-meta-row">
            <span>Link Analysis report is</span>
            <span className="status-completed-pill">COMPLETED</span>
            <span className="timestamp-text">relevant as of Oct 12, 2026 4:52:26 PM</span>
          </div>
        </div>
        <button
          type="button"
          className="run-analysis-btn"
          onClick={() => {
            runLayout(grouping);
            handleResetFit();
          }}
        >
          Run New Analysis
        </button>
      </div>

      {/* 2. Interactive Filter & Grouping Toolbar */}
      <div className="aml-network-toolbar">
        <div className="toolbar-left-filters">
          <div className="filter-select-group">
            <label htmlFor="amount-filter">Amount:</label>
            <select
              id="amount-filter"
              value={amountFilter}
              onChange={e => setAmountFilter(e.target.value)}
            >
              <option value="none">No filter on amounts</option>
              <option value="gt10k">&gt; ₹10,000</option>
              <option value="gt50k">&gt; ₹50,000</option>
              <option value="gt100k">&gt; ₹1,00,000</option>
              <option value="gt500k">&gt; ₹5,00,000</option>
            </select>
          </div>

          <div className="filter-select-group">
            <label htmlFor="visible-filter">Visible objects:</label>
            <select
              id="visible-filter"
              value={visibleFilter}
              onChange={e => setVisibleFilter(e.target.value)}
            >
              <option value="all">All visible ({filteredGraph.nodes.length} nodes)</option>
              <option value="high_risk">High risk only</option>
              <option value="accounts_only">Accounts only</option>
              <option value="merchants_only">Merchants only</option>
            </select>
          </div>
        </div>

        <div className="toolbar-grouping-cluster">
          <span className="grouping-label">Grouping:</span>
          <div className="grouping-pills-bar">
            {(['none', 'status', 'entity_type', 'entity_subtype', 'links'] as const).map(g => (
              <button
                key={g}
                type="button"
                className={`grouping-pill-btn ${grouping === g ? 'active' : ''}`}
                onClick={() => handleGroupingChange(g)}
              >
                {g === 'none'
                  ? 'None'
                  : g === 'status'
                  ? 'Status'
                  : g === 'entity_type'
                  ? 'Entity type'
                  : g === 'entity_subtype'
                  ? 'Entity subtype'
                  : 'Links'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Graph Canvas Frame with Floating Rosette & Zoom Controls */}
      <div className="aml-canvas-container">
        {/* Floating Top-Left Navigation Overlay */}
        <div className="canvas-nav-overlay">
          {/* Compass Rosette D-pad */}
          <div className="compass-rosette" title="Pan canvas">
            <button type="button" className="rosette-btn up" onClick={() => panByDelta(0, 70)} aria-label="Pan Up">
              ▲
            </button>
            <div className="rosette-mid-row">
              <button type="button" className="rosette-btn left" onClick={() => panByDelta(70, 0)} aria-label="Pan Left">
                ◀
              </button>
              <button type="button" className="rosette-btn center" onClick={handleResetFit} title="Center & Fit">
                ●
              </button>
              <button type="button" className="rosette-btn right" onClick={() => panByDelta(-70, 0)} aria-label="Pan Right">
                ▶
              </button>
            </div>
            <button type="button" className="rosette-btn down" onClick={() => panByDelta(0, -70)} aria-label="Pan Down">
              ▼
            </button>
          </div>

          {/* Select vs Pan Tool Toggle */}
          <button
            type="button"
            className={`canvas-tool-btn ${panMode === 'select' ? 'active' : ''}`}
            onClick={togglePanMode}
            title={panMode === 'pan' ? 'Switch to Selection Box' : 'Switch to Pan Drag'}
          >
            {panMode === 'pan' ? '✋' : '⛶'}
          </button>

          {/* Vertical Zoom Slider Bar */}
          <div className="vertical-zoom-bar">
            <button type="button" className="zoom-step-btn" onClick={() => handleZoom('in')} title="Zoom in">
              +
            </button>
            <div className="zoom-slider-rail" onClick={() => handleZoom('in')}>
              <div className="zoom-slider-thumb" style={{ top: `${Math.max(10, Math.min(80, 100 - (zoomLevel * 30)))}%` }} />
            </div>
            <button type="button" className="zoom-step-btn" onClick={() => handleZoom('out')} title="Zoom out">
              −
            </button>
          </div>
        </div>

        {/* Floating Bottom-Right Expand / Fullscreen Button */}
        <button
          type="button"
          className="canvas-fullscreen-btn"
          onClick={() => {
            setIsFullscreen(!isFullscreen);
            setTimeout(() => {
              instance.current?.resize();
              instance.current?.fit(undefined, 45);
            }, 100);
          }}
          title={isFullscreen ? 'Exit Fullscreen' : 'Expand Network Fullscreen'}
        >
          {isFullscreen ? '✕' : '⤢'}
        </button>

        {/* Actual Cytoscape Container */}
        <div ref={host} className="cytoscape-mount" role="img" aria-label="AML Link Analysis Graph" />

        {/* Empty Evidence State */}
        {!filteredGraph.edges.length && (
          <div className="graph-empty-overlay">
            <div className="empty-dot" />
            <h3>No link relationships matching active criteria</h3>
            <p>Adjust the amount or visibility filters to reveal network transfers.</p>
          </div>
        )}

        {/* Inspector Detail Overlay Card when an element is selected */}
        {selectedEntity && (
          <div className="canvas-inspector-card">
            <div className="inspector-top">
              <span className={`inspector-badge ${selectedEntity.risk || 'standard'}`}>
                {selectedEntity.subtitle}
              </span>
              <button
                type="button"
                className="inspector-close"
                onClick={() => setSelectedEntity(null)}
              >
                ✕
              </button>
            </div>
            <strong className="inspector-title">{selectedEntity.title}</strong>
            {selectedEntity.amount && <div className="inspector-amount">{selectedEntity.amount}</div>}
            {selectedEntity.meta && <small className="inspector-meta">{selectedEntity.meta}</small>}
          </div>
        )}
      </div>

      {/* 4. Enterprise Legend & Summary Strip */}
      <div className="aml-network-legend">
        <div className="legend-items-cluster">
          <div className="legend-entry">
            <span className="legend-chip subject" />
            <span>Target / Investigated Subject (Red)</span>
          </div>
          <div className="legend-entry">
            <span className="legend-chip merchant" />
            <span>Merchant / Corporate Entity (Blue)</span>
          </div>
          <div className="legend-entry">
            <span className="legend-chip account" />
            <span>Bank Account / Card (Teal)</span>
          </div>
          <div className="legend-entry">
            <span className="legend-chip person" />
            <span>Associate Individual (Blue)</span>
          </div>
          <div className="legend-entry">
            <span className="legend-chip address" />
            <span>Address / Location (Gray)</span>
          </div>
          <div className="legend-entry">
            <span className="legend-line high-risk" />
            <span>High-Risk Outflow (Dashed Red)</span>
          </div>
          <div className="legend-entry">
            <span className="legend-line normal-flow" />
            <span>Inward Flow (Dashed Green)</span>
          </div>
        </div>

        <div className="legend-summary-meta">
          <span>{filteredGraph.nodes.length} entities</span>
          <span>·</span>
          <span>{filteredGraph.edges.length} relationships</span>
        </div>
      </div>
    </div>
  );
}
