import { describe, expect, it } from 'vitest';
import {
  addEdge,
  addNode,
  exportDocument,
  importExternalGraph,
  loadSavedDocument,
  moveNode,
  projectVisibleGraph,
  toggleRegionCollapse,
  updateEdgeWaypoints,
} from '../../src/model';
import type { StateMachineDocument } from '../../src/types/graph';

function createNestedLaidOutDoc(): StateMachineDocument {
  return {
    schemaVersion: '1.0',
    layoutApplied: true,
    nodes: [
      { id: 'ext_in', label: 'Start', x: 20, y: 100, width: 120, height: 50, regionId: null },
      { id: 'r1_a', label: 'OuterA', x: 220, y: 80, width: 120, height: 50, regionId: 'r_outer' },
      { id: 'r2_x', label: 'InnerX', x: 400, y: 80, width: 120, height: 50, regionId: 'r_inner' },
      { id: 'r2_y', label: 'InnerY', x: 560, y: 80, width: 120, height: 50, regionId: 'r_inner' },
      { id: 'ext_out', label: 'End', x: 780, y: 100, width: 120, height: 50, regionId: null },
    ],
    edges: [
      {
        id: 'e_in',
        source: 'ext_in',
        target: 'r1_a',
        waypoints: [{ x: 180, y: 115 }],
      },
      {
        id: 'e_enter_inner',
        source: 'r1_a',
        target: 'r2_x',
        waypoints: [{ x: 370, y: 105 }],
      },
      {
        id: 'e_inside_inner',
        source: 'r2_x',
        target: 'r2_y',
        waypoints: [{ x: 540, y: 60 }],
      },
      {
        id: 'e_out',
        source: 'r2_y',
        target: 'ext_out',
        waypoints: [{ x: 730, y: 125 }],
      },
    ],
    regions: [
      {
        id: 'r_outer',
        label: 'OuterRegion',
        parentId: null,
        x: 200,
        y: 40,
        width: 520,
        height: 160,
        collapsed: false,
      },
      {
        id: 'r_inner',
        label: 'InnerRegion',
        parentId: 'r_outer',
        x: 380,
        y: 60,
        width: 320,
        height: 110,
        collapsed: false,
      },
    ],
  };
}

describe('Graph Model & Interactive Editing Invariants', () => {
  it('moves a single node without moving any other node', () => {
    const doc = createNestedLaidOutDoc();
    const moved = moveNode(doc, 'ext_in', 50, 220);

    expect(moved.nodes.find((n) => n.id === 'ext_in')).toMatchObject({ x: 50, y: 220 });
    // All other nodes must stay strictly unchanged
    for (const orig of doc.nodes.filter((n) => n.id !== 'ext_in')) {
      const curr = moved.nodes.find((n) => n.id === orig.id);
      expect(curr).toMatchObject({ x: orig.x, y: orig.y });
    }
  });

  it('updates edge waypoints without changing semantic source or target', () => {
    const doc = createNestedLaidOutDoc();
    const updated = updateEdgeWaypoints(doc, 'e_in', [
      { x: 160, y: 80 },
      { x: 195, y: 140 },
    ]);

    const edge = updated.edges.find((e) => e.id === 'e_in')!;
    expect(edge.source).toBe('ext_in');
    expect(edge.target).toBe('r1_a');
    expect(edge.waypoints).toEqual([
      { x: 160, y: 80 },
      { x: 195, y: 140 },
    ]);
  });

  it('adds user-created nodes and edges and marks isUserCreated', () => {
    const doc = createNestedLaidOutDoc();
    const withNode = addNode(doc, {
      id: 'user_s1',
      label: 'CustomState',
      x: 400,
      y: 260,
      width: 120,
      height: 50,
      regionId: null,
    });
    const withEdge = addEdge(withNode, {
      id: 'user_e1',
      source: 'ext_in',
      target: 'user_s1',
      waypoints: [{ x: 200, y: 260 }],
    });

    expect(withEdge.nodes.find((n) => n.id === 'user_s1')?.isUserCreated).toBe(true);
    expect(withEdge.edges.find((e) => e.id === 'user_e1')?.isUserCreated).toBe(true);
  });
});

describe('Underlying vs. Visible Graph (Collapse / Expand & Nesting)', () => {
  it('collapses inner region into circular node without moving external nodes and restores on expand', () => {
    const orig = createNestedLaidOutDoc();
    const collapsed = toggleRegionCollapse(orig, 'r_inner', true);

    // UnderlyingGraph still holds all nodes and original waypoints untouched
    expect(collapsed.nodes).toHaveLength(orig.nodes.length);
    expect(collapsed.edges.find((e) => e.id === 'e_out')?.waypoints).toEqual([{ x: 730, y: 125 }]);

    // External nodes must NOT move
    expect(collapsed.nodes.find((n) => n.id === 'ext_in')).toMatchObject({ x: 20, y: 100 });
    expect(collapsed.nodes.find((n) => n.id === 'r1_a')).toMatchObject({ x: 220, y: 80 });
    expect(collapsed.nodes.find((n) => n.id === 'ext_out')).toMatchObject({ x: 780, y: 100 });

    const visible = projectVisibleGraph(collapsed);
    // r_inner is now a circular node, r_outer remains an expanded region
    expect(visible.regions.map((r) => r.id)).toEqual(['r_outer']);
    expect(visible.nodes.find((n) => n.id === 'r_inner')?.kind).toBe('collapsed-region');
    expect(visible.nodes.find((n) => n.id === 'r2_x')).toBeUndefined();
    expect(visible.nodes.find((n) => n.id === 'r2_y')).toBeUndefined();

    // Internal edge e_inside_inner is hidden; boundary edges redirect to r_inner
    expect(visible.edges.find((e) => e.id === 'e_inside_inner')).toBeUndefined();
    expect(visible.edges.find((e) => e.id === 'e_enter_inner')).toMatchObject({
      originalSource: 'r1_a',
      originalTarget: 'r2_x',
      displaySource: 'r1_a',
      displayTarget: 'r_inner',
      isRedirected: true,
    });
    expect(visible.edges.find((e) => e.id === 'e_out')).toMatchObject({
      originalSource: 'r2_y',
      originalTarget: 'ext_out',
      displaySource: 'r_inner',
      displayTarget: 'ext_out',
      isRedirected: true,
    });

    // Re-expand restores exact internal nodes, dotted boundary, and manual waypoints
    const expanded = toggleRegionCollapse(collapsed, 'r_inner', false);
    const visibleAfterExpand = projectVisibleGraph(expanded);
    expect(visibleAfterExpand.regions.map((r) => r.id).sort()).toEqual(['r_inner', 'r_outer']);
    expect(visibleAfterExpand.nodes.find((n) => n.id === 'r2_x')).toMatchObject({ x: 400, y: 80 });
    expect(visibleAfterExpand.edges.find((e) => e.id === 'e_inside_inner')?.waypoints).toEqual([
      { x: 540, y: 60 },
    ]);
    expect(visibleAfterExpand.edges.find((e) => e.id === 'e_out')?.waypoints).toEqual([
      { x: 730, y: 125 },
    ]);
  });

  it('supports nested collapse when outer region collapses over an inner region', () => {
    const orig = createNestedLaidOutDoc();
    const collapsedOuter = toggleRegionCollapse(orig, 'r_outer', true);
    const visible = projectVisibleGraph(collapsedOuter);

    expect(visible.regions).toHaveLength(0);
    expect(visible.nodes.map((n) => n.id).sort()).toEqual(['ext_in', 'ext_out', 'r_outer']);
    expect(visible.edges.map((e) => e.id).sort()).toEqual(['e_in', 'e_out']);
    expect(visible.edges.find((e) => e.id === 'e_in')?.displayTarget).toBe('r_outer');
    expect(visible.edges.find((e) => e.id === 'e_out')?.displaySource).toBe('r_outer');
  });
});

describe('Serialization (Import External & Save/Load without Auto-Relayout)', () => {
  it('imports external graph with region children and marks layoutApplied: false', () => {
    const doc = importExternalGraph({
      nodes: [{ id: 's1' }, { id: 's2' }],
      edges: [{ source: 's1', target: 's2' }],
      regions: [{ id: 'r1', parent: null, children: ['s2'] }],
    });

    expect(doc.layoutApplied).toBe(false);
    expect(doc.nodes.find((n) => n.id === 's2')?.regionId).toBe('r1');
    expect(doc.edges[0].id).toBe('e_1');
  });

  it('round-trips Save -> Load preserving exact coordinates, waypoints, collapsed state, and user-created items', () => {
    let doc = createNestedLaidOutDoc();
    doc = moveNode(doc, 'ext_in', 77, 188);
    doc = addNode(doc, {
      id: 'u1',
      label: 'Added',
      x: 500,
      y: 300,
      width: 130,
      height: 55,
      regionId: null,
    });
    doc = addEdge(doc, {
      id: 'ue1',
      source: 'ext_in',
      target: 'u1',
      waypoints: [{ x: 250, y: 290 }],
    });
    doc = toggleRegionCollapse(doc, 'r_inner', true);

    const json = exportDocument(doc);
    const restored = loadSavedDocument(json);

    expect(restored.layoutApplied).toBe(true);
    expect(restored.nodes.find((n) => n.id === 'ext_in')).toMatchObject({ x: 77, y: 188 });
    expect(restored.nodes.find((n) => n.id === 'u1')).toMatchObject({
      x: 500,
      y: 300,
      width: 130,
      height: 55,
      isUserCreated: true,
    });
    expect(restored.edges.find((e) => e.id === 'ue1')).toMatchObject({
      source: 'ext_in',
      target: 'u1',
      waypoints: [{ x: 250, y: 290 }],
      isUserCreated: true,
    });
    expect(restored.regions.find((r) => r.id === 'r_inner')?.collapsed).toBe(true);
  });
});
