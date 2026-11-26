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
