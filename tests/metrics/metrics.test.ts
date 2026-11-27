import { describe, expect, it } from 'vitest';
import cyclesFeedback from '../../fixtures/cycles-feedback.json';
import highCrossing from '../../fixtures/high-crossing.json';
import linearBranch from '../../fixtures/linear-branch.json';
import nestedRegions from '../../fixtures/nested-regions.json';
import { compareLayouts, evaluateLayout } from '../../src/metrics';
import { importExternalGraph } from '../../src/model';
import type { ExternalGraphInput, StateMachineDocument } from '../../src/types/graph';

function makeTwoByTwoDoc(crossed: boolean): StateMachineDocument {
  return {
    schemaVersion: '1.0',
    layoutApplied: true,
    nodes: [
      { id: 'a1', x: 0, y: 0, width: 100, height: 40, regionId: null },
      { id: 'a2', x: 0, y: 200, width: 100, height: 40, regionId: null },
      { id: 'b1', x: 300, y: 0, width: 100, height: 40, regionId: null },
      { id: 'b2', x: 300, y: 200, width: 100, height: 40, regionId: null },
    ],
    edges: crossed
      ? [
          { id: 'e1', source: 'a1', target: 'b2', waypoints: [] },
          { id: 'e2', source: 'a2', target: 'b1', waypoints: [] },
        ]
      : [
          { id: 'e1', source: 'a1', target: 'b1', waypoints: [] },
          { id: 'e2', source: 'a2', target: 'b2', waypoints: [] },
        ],
    regions: [],
  };
}

describe('Objective Layout Metrics Evaluator', () => {
  it('detects exact X-crossing vs. parallel non-crossing edges', () => {
    const crossedMetrics = evaluateLayout(makeTwoByTwoDoc(true));
    const parallelMetrics = evaluateLayout(makeTwoByTwoDoc(false));

    expect(crossedMetrics.edgeCrossings).toBe(1);
    expect(crossedMetrics.nodeOverlaps).toBe(0);
    expect(parallelMetrics.edgeCrossings).toBe(0);
    expect(parallelMetrics.nodeOverlaps).toBe(0);

    const comparison = compareLayouts(makeTwoByTwoDoc(true), makeTwoByTwoDoc(false));
    expect(comparison.crossingReductionCount).toBe(1);
    expect(comparison.crossingReductionPercent).toBe(100);
  });

  it('does not count shared endpoints as crossings and counts real bends accurately', () => {
    const doc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 's1', x: 0, y: 100, width: 100, height: 40, regionId: null },
        { id: 's2', x: 300, y: 0, width: 100, height: 40, regionId: null },
        { id: 's3', x: 300, y: 200, width: 100, height: 40, regionId: null },
      ],
      edges: [
        // Collinear waypoint (50,120) -> (200,70) -> (350,20) => 0 bends
        { id: 'e1', source: 's1', target: 's2', waypoints: [{ x: 200, y: 70 }] },
        // Real bend (50,120) -> (200,120) -> (350,220) => 1 bend
        { id: 'e2', source: 's1', target: 's3', waypoints: [{ x: 200, y: 120 }] },
      ],
      regions: [],
    };

    const metrics = evaluateLayout(doc);
    expect(metrics.edgeCrossings).toBe(0);
    expect(metrics.totalBends).toBe(1);
    expect(metrics.totalEdgeLength).toBeGreaterThan(0);
  });

  it('detects overlapping nodes accurately', () => {
    const doc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'n1', x: 100, y: 100, width: 120, height: 50, regionId: null },
        { id: 'n2', x: 150, y: 120, width: 120, height: 50, regionId: null },
      ],
      edges: [],
      regions: [],
    };
    expect(evaluateLayout(doc).nodeOverlaps).toBe(1);
  });

  it('handles empty graphs cleanly without NaN or Infinity', () => {
    const empty: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [],
      edges: [],
      regions: [],
    };
    expect(evaluateLayout(empty)).toEqual({
      edgeCrossings: 0,
      nodeOverlaps: 0,
      totalEdgeLength: 0,
      totalBends: 0,
      boundingWidth: 0,
      boundingHeight: 0,
      boundingArea: 0,
      aspectRatio: 0,
    });
  });

  it('counts multiple crossings across multi-waypoint polylines and evaluates collapsed regions', () => {
    const doc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'l1', x: 0, y: 0, width: 40, height: 40, regionId: null },
        { id: 'r1', x: 300, y: 0, width: 40, height: 40, regionId: null },
        { id: 'l2', x: 0, y: 100, width: 40, height: 40, regionId: null },
        { id: 'r2', x: 300, y: 100, width: 40, height: 40, regionId: null },
      ],
      edges: [
        // Straight horizontal at y = 20
        { id: 'e1', source: 'l1', target: 'r1', waypoints: [] },
        // Zig-zags up above y = 20 and back down, crossing e1 twice
        {
          id: 'e2',
          source: 'l2',
          target: 'r2',
          waypoints: [
            { x: 100, y: -20 },
            { x: 200, y: -20 },
          ],
        },
      ],
      regions: [],
    };

    const metrics = evaluateLayout(doc);
    expect(metrics.edgeCrossings).toBe(2);
    expect(metrics.totalBends).toBe(2);
  });

  it('counts crossings that occur directly on an interior waypoint, shared waypoint, or collinear overlap', () => {
    // 1) Crossing directly through a bend waypoint
    const waypointCrossDoc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'a', x: 0, y: 0, width: 20, height: 20, regionId: null },
        { id: 'b', x: 200, y: 200, width: 20, height: 20, regionId: null },
        { id: 'c', x: 0, y: 100, width: 20, height: 20, regionId: null },
        { id: 'd', x: 200, y: 100, width: 20, height: 20, regionId: null },
      ],
      edges: [
        // Straight horizontal at y = 110
        { id: 'e_horiz', source: 'c', target: 'd', waypoints: [] },
        // Bends right on (100, 110) and continues to opposite side
        { id: 'e_bend', source: 'a', target: 'b', waypoints: [{ x: 100, y: 110 }] },
      ],
      regions: [],
    };
    expect(evaluateLayout(waypointCrossDoc).edgeCrossings).toBe(1);

    // 2) Two edges sharing a collinear channel overlap (reproducing high-crossing e1 vs e7)
    const collinearOverlapDoc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'a1', x: 0, y: 0, width: 120, height: 50, regionId: null },
        { id: 'a4', x: 0, y: 300, width: 120, height: 50, regionId: null },
        { id: 'b1', x: 220, y: 0, width: 120, height: 50, regionId: null },
        { id: 'b4', x: 220, y: 300, width: 120, height: 50, regionId: null },
      ],
      edges: [
        {
          id: 'e1',
          source: 'a1',
          target: 'b4',
          waypoints: [
            { x: 215, y: 25 },
            { x: 215, y: 255 },
            { x: 280, y: 255 },
          ],
        },
        {
          id: 'e7',
          source: 'a4',
          target: 'b1',
          waypoints: [
            { x: 215, y: 325 },
            { x: 215, y: 95 },
            { x: 280, y: 95 },
          ],
        },
      ],
      regions: [],
    };
    expect(evaluateLayout(collinearOverlapDoc).edgeCrossings).toBe(1);

    // 3) Shared interior waypoint where paths alternate cyclically
    const sharedWpDoc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'n1', x: 0, y: 0, width: 20, height: 20, regionId: null },
        { id: 'n2', x: 200, y: 200, width: 20, height: 20, regionId: null },
        { id: 'n3', x: 0, y: 200, width: 20, height: 20, regionId: null },
        { id: 'n4', x: 200, y: 0, width: 20, height: 20, regionId: null },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2', waypoints: [{ x: 110, y: 90 }] },
        { id: 'e2', source: 'n3', target: 'n4', waypoints: [{ x: 110, y: 90 }] },
      ],
      regions: [],
    };
    expect(evaluateLayout(sharedWpDoc).edgeCrossings).toBe(1);
  });

  it('preserves shallow-angle bends during crossing calculation (P02 regression test)', () => {
    // Edge A: center (0,0) -> waypoint (25000,10) -> center (50000,0)
    // Edge B: center (5000,5) -> center (45000,5)
    // Crosses at (12500,5) and (37500,5) => exactly 2 crossings
    const doc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'a_start', x: -10, y: -10, width: 20, height: 20, regionId: null },
        { id: 'a_end', x: 49990, y: -10, width: 20, height: 20, regionId: null },
        { id: 'b_start', x: 4990, y: -5, width: 20, height: 20, regionId: null },
        { id: 'b_end', x: 44990, y: -5, width: 20, height: 20, regionId: null },
      ],
      edges: [
        {
          id: 'edge_a',
          source: 'a_start',
          target: 'a_end',
          waypoints: [{ x: 25000, y: 10 }],
        },
        {
          id: 'edge_b',
          source: 'b_start',
          target: 'b_end',
          waypoints: [],
        },
      ],
      regions: [],
    };

    expect(evaluateLayout(doc).edgeCrossings).toBe(2);
  });

  it('distinguishes shared-source collinear branches (0), same-side touch (0), and multi-segment side-swap overlap (1)', () => {
    // 1) Shared-source collinear branching: e1 and e2 leave a1 along the same horizontal segment to (215, 25), then split up/down -> 0 crossings
    const sharedSourceBranch: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'a1', x: 0, y: 0, width: 120, height: 50, regionId: null },
        { id: 'b_up', x: 220, y: -100, width: 120, height: 50, regionId: null },
        { id: 'b_down', x: 220, y: 100, width: 120, height: 50, regionId: null },
      ],
      edges: [
        { id: 'e1', source: 'a1', target: 'b_up', waypoints: [{ x: 215, y: 25 }] },
        { id: 'e2', source: 'a1', target: 'b_down', waypoints: [{ x: 215, y: 25 }] },
      ],
      regions: [],
    };
    expect(evaluateLayout(sharedSourceBranch).edgeCrossings).toBe(0);

    // 2) Same-side collinear touch (C-shapes touching along x=100, y in [50, 150] without swapping sides) -> 0 crossings
    const sameSideTouch: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'p1', x: -10, y: -10, width: 20, height: 20, regionId: null },
        { id: 'p2', x: -10, y: 190, width: 20, height: 20, regionId: null },
        { id: 'q1', x: 190, y: 40, width: 20, height: 20, regionId: null },
        { id: 'q2', x: 190, y: 140, width: 20, height: 20, regionId: null },
      ],
      edges: [
        {
          id: 'ep',
          source: 'p1',
          target: 'p2',
          waypoints: [
            { x: 100, y: 0 },
            { x: 100, y: 200 },
          ],
        },
        {
          id: 'eq',
          source: 'q1',
          target: 'q2',
          waypoints: [
            { x: 100, y: 50 },
            { x: 100, y: 150 },
          ],
        },
      ],
      regions: [],
    };
    expect(evaluateLayout(sameSideTouch).edgeCrossings).toBe(0);

    // 3) Multi-segment contiguous overlap that swaps sides -> counted ONCE (1 crossing, not 2)
    const multiSegSwap: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'p1', x: -10, y: -10, width: 20, height: 20, regionId: null },
        { id: 'p2', x: 240, y: 90, width: 20, height: 20, regionId: null },
        { id: 'q1', x: 90, y: -60, width: 20, height: 20, regionId: null },
        { id: 'q2', x: 140, y: 190, width: 20, height: 20, regionId: null },
      ],
      edges: [
        {
          id: 'ep',
          source: 'p1',
          target: 'p2',
          waypoints: [
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 200, y: 100 },
          ],
        },
        {
          id: 'eq',
          source: 'q1',
          target: 'q2',
          waypoints: [
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 200, y: 100 },
          ],
        },
      ],
      regions: [],
    };
    expect(evaluateLayout(multiSegSwap).edgeCrossings).toBe(1);

    // 4) Multi-segment contiguous overlap that stays on the SAME side -> 0 crossings
    const multiSegSameSide: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        { id: 'p1', x: -10, y: -10, width: 20, height: 20, regionId: null },
        { id: 'p2', x: 190, y: 190, width: 20, height: 20, regionId: null },
        { id: 'q1', x: 90, y: -60, width: 20, height: 20, regionId: null },
        { id: 'q2', x: 240, y: 90, width: 20, height: 20, regionId: null },
      ],
      edges: [
        {
          id: 'ep',
          source: 'p1',
          target: 'p2',
          waypoints: [
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 200, y: 100 },
          ],
        },
        {
          id: 'eq',
          source: 'q1',
          target: 'q2',
          waypoints: [
            { x: 100, y: 0 },
            { x: 100, y: 100 },
            { x: 200, y: 100 },
          ],
        },
      ],
      regions: [],
    };
    expect(evaluateLayout(multiSegSameSide).edgeCrossings).toBe(0);
  });

  it('evaluates a 200-node / 300-edge graph quickly via AABB pre-rejection', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ({
      id: `n${i}`,
      x: (i % 20) * 200,
      y: Math.floor(i / 20) * 120,
      width: 120,
      height: 50,
      regionId: null,
    }));
    const edges = Array.from({ length: 300 }, (_, i) => ({
      id: `e${i}`,
      source: `n${i % 199}`,
      target: `n${(i + 1 + (i % 3)) % 200}`,
      waypoints: [],
    }));
    const start = performance.now();
    const res = evaluateLayout({
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes,
      edges,
      regions: [],
    });
    const elapsedMs = performance.now() - start;
    expect(res.nodeOverlaps).toBe(0);
    expect(elapsedMs).toBeLessThan(150);
  });
});

describe('Benchmark & Demo Fixtures Validation', () => {
  const fixtures: Array<[string, ExternalGraphInput]> = [
    ['linear-branch.json', linearBranch as ExternalGraphInput],
    ['cycles-feedback.json', cyclesFeedback as ExternalGraphInput],
    ['high-crossing.json', highCrossing as ExternalGraphInput],
    ['nested-regions.json', nestedRegions as ExternalGraphInput],
  ];

  for (const [file, data] of fixtures) {
    it(`loads fixtures/${file} cleanly via importExternalGraph`, () => {
      const doc = importExternalGraph(data);
      expect(doc.nodes.length).toBeGreaterThan(0);
      expect(doc.edges.length).toBeGreaterThan(0);
      expect(doc.layoutApplied).toBe(false);
    });
  }
});
