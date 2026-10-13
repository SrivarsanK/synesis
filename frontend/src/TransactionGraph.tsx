import { useEffect, useRef, useState } from 'react';
import cytoscape, { type Core } from 'cytoscape';
import type { Graph } from './types';
import { money, utc } from './format';

export default function TransactionGraph({ graph, active, identity }: { graph: Graph; active?: string; identity: string }) {
  const host = useRef<HTMLDivElement>(null);
  const instance = useRef<Core | null>(null);
  const lastIdentity = useRef('');
  const [selection, setSelection] = useState('Select an account or transfer to inspect its details.');
  useEffect(() => {
    const cy = cytoscape({ container: host.current, elements: [], minZoom: 0.3, maxZoom: 3, style: [
      { selector: 'node', style: { label: 'data(label)', 'background-color': '#756859', color: '#f5f1e9', 'font-size': 11, 'text-valign': 'bottom', 'text-margin-y': 10, width: 30, height: 30, 'border-width': 2, 'border-color': '#b8aea3' } },
      { selector: 'node[role = "intermediary"]', style: { width: 44, height: 44, 'background-color': '#d6a16b', 'border-color': '#f5f1e9' } },
      { selector: 'node[risk_level = "high"]', style: { 'background-color': '#d95c59' } },
      { selector: 'edge', style: { width: 1.5, 'line-color': '#827363', 'target-arrow-color': '#827363', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'control-point-step-size': 42, 'arrow-scale': 1.1 } },
      { selector: '.active', style: { width: 4, 'line-color': '#d6a16b', 'target-arrow-color': '#d6a16b', 'z-index': 10 } },
      { selector: ':selected', style: { 'border-color': '#d6a16b', 'border-width': 4, 'line-color': '#f5f1e9', 'target-arrow-color': '#f5f1e9' } },
    ] });
    instance.current = cy;
    cy.on('tap', 'node', event => { const node = event.target.data(); setSelection(`${node.label} · ${node.role} · ${node.risk_level} risk`); });
    cy.on('tap', 'edge', event => { const edge = event.target.data(); setSelection(`${edge.transaction_id} · ${money(edge.amount_minor)} · ${utc(edge.timestamp)}`); });
    // Refitting on container resize keeps the network usable across breakpoints;
    // ordinary API polling never changes the viewport.
    const observer = new ResizeObserver(() => { cy.resize(); if (cy.nodes().length) cy.fit(undefined, 45); });
    if (host.current) observer.observe(host.current);
    return () => { observer.disconnect(); cy.destroy(); instance.current = null; };
  }, []);
  useEffect(() => {
    const cy = instance.current;
    if (!cy) return;
    const changedIdentity = identity !== lastIdentity.current;
    const wasEmpty = cy.nodes().length === 0;
    const wanted = new Set([...graph.nodes.map(n => `n:${n.id}`), ...graph.edges.map(e => `e:${e.id}`)]);
    let additions = false;
    cy.batch(() => {
      cy.elements().filter(el => !wanted.has(el.id())).remove();
      for (const node of graph.nodes) {
        const id = `n:${node.id}`;
        const old = cy.getElementById(id);
        const data = { ...node, id };
        if (old.length) old.data(data); else { cy.add({ data }); additions = true; }
      }
      for (const edge of graph.edges) {
        const id = `e:${edge.id}`;
        const data = { ...edge, id, transaction_id: edge.id, source: `n:${edge.source}`, target: `n:${edge.target}` };
        const old = cy.getElementById(id);
        if (old.length) old.data(data); else { cy.add({ data }); additions = true; }
      }
    });
    if (changedIdentity || additions) cy.layout({ name: 'breadthfirst', directed: true, padding: 45, spacingFactor: 1.4, nodeDimensionsIncludeLabels: true, animate: false, fit: changedIdentity || wasEmpty }).run();
    if (changedIdentity) { setSelection('Select an account or transfer to inspect its details.'); lastIdentity.current = identity; }
  }, [graph, identity]);
  useEffect(() => { const cy = instance.current; if (cy) { cy.edges().removeClass('active'); if (active) cy.getElementById(`e:${active}`).addClass('active'); } }, [active, graph]);
  return <div className="network"><div className="graph-toolbar"><span>{graph.nodes.length} accounts · {graph.edges.length} transfers</span><button onClick={() => instance.current?.fit(undefined, 45)}>Fit network</button></div><div ref={host} className="graph-canvas" role="img" aria-label="Directed account transfer graph. The same transfers are available in the keyboard-accessible evidence or transaction list." />{!graph.edges.length && <div className="graph-empty"><div className="empty-mark" aria-hidden="true">·</div><h3>Your evidence starts here</h3><p>Step the synthetic stream to reveal accepted transfers.</p></div>}<p className="graph-selection" aria-live="polite">{selection}</p><div className="legend"><span><i className="gold" />Selected evidence</span><span><i className="red" />High-risk subject</span><span>Arrows indicate transfer direction</span></div></div>;
}
