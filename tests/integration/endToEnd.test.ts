import { describe, expect, it } from 'vitest';
import cyclesFeedback from '../../fixtures/cycles-feedback.json';
import highCrossing from '../../fixtures/high-crossing.json';
import linearBranch from '../../fixtures/linear-branch.json';
import nestedRegions from '../../fixtures/nested-regions.json';
import { backend, isStubBackend } from '../../src/editor/backend';
import { openPreset, presets } from '../../src/editor/presets';
import { openExternalGraph, openSavedDocument } from '../../src/editor/session';
import type { ExternalGraphInput } from '../../src/types/graph';

describe('Full A + B + C End-to-End Integration', () => {
  it('uses the real integrated Member A + Member B backend (not stubs)', () => {
    expect(isStubBackend).toBe(false);
    expect(presets.map((p) => p.name).sort()).toEqual([
      'cycles-feedback.json',
      'high-crossing.json',
      'linear-branch.json',
      'nested-regions.json',
    ]);
  });

  it('auto-layouts all 4 benchmark fixtures with 0 node overlaps and crossing reduction on high-crossing', () => {
    const cases: Array<[string, ExternalGraphInput]> = [
      ['linear-branch.json', linearBranch as ExternalGraphInput],
      ['cycles-feedback.json', cyclesFeedback as ExternalGraphInput],
      ['high-crossing.json', highCrossing as ExternalGraphInput],
      ['nested-regions.json', nestedRegions as ExternalGraphInput],
    ];

    for (const [name, raw] of cases) {
      const opened = openExternalGraph(raw);
      expect(opened.doc.layoutApplied, name).toBe(true);
      expect(opened.comparison, name).not.toBeNull();
      expect(opened.comparison!.optimized.nodeOverlaps, name).toBe(0);
      expect(opened.comparison!.optimized.edgeCrossings, name).toBeLessThanOrEqual(
        opened.comparison!.baseline.edgeCrossings,
      );

      if (name === 'high-crossing.json') {
        expect(opened.comparison!.baseline.edgeCrossings).toBeGreaterThanOrEqual(29);
        expect(opened.comparison!.optimized.edgeCrossings).toBeLessThanOrEqual(1);
        expect(opened.comparison!.crossingReductionPercent).toBeGreaterThan(90);
      }
    }
  });

  it('executes the complete 10-step Demo workflow across Model, Layout, Metrics, and Editor session', () => {
    // Steps 1-3: Load nested-regions preset -> auto layout + baseline comparison
    const nestedPreset = presets.find((p) => p.name === 'nested-regions.json')!;
    const initial = openPreset(nestedPreset);
    expect(initial.doc.layoutApplied).toBe(true);
    expect(initial.comparison).not.toBeNull();
    expect(backend.evaluateLayout(initial.doc).nodeOverlaps).toBe(0);

    // Step 4: Drag a node (other nodes unchanged) and adjust edge waypoints (semantic source/target preserved)
    const bootBefore = initial.doc.nodes.find((n) => n.id === 'boot')!;
    const doneBefore = initial.doc.nodes.find((n) => n.id === 'done')!;
    let doc = backend.moveNode(initial.doc, 'boot', bootBefore.x + 15, bootBefore.y + 45);
    expect(doc.nodes.find((n) => n.id === 'done')).toMatchObject({ x: doneBefore.x, y: doneBefore.y });

    const manualWaypoints = [{ x: 320, y: 12 }, { x: 480, y: 12 }];
    doc = backend.updateEdgeWaypoints(doc, 'e6', manualWaypoints);
    expect(doc.edges.find((e) => e.id === 'e6')).toMatchObject({
      source: 'parse',
      target: 'exec',
      waypoints: manualWaypoints,
    });

    // Step 5: Add user-created node & transition
    doc = backend.addNode(doc, {
      id: 'user_audit',
      label: 'Audit',
      x: 820,
      y: 420,
      width: 120,
      height: 50,
      regionId: null,
    });
    doc = backend.addEdge(doc, {
      id: 'user_e_audit',
      source: 'done',
      target: 'user_audit',
      waypoints: [{ x: 780, y: 360 }],
    });

    // Steps 6-7: Collapse nested region r_processing -> circular proxy, external nodes strictly unchanged
    const parsePosBeforeCollapse = { ...doc.nodes.find((n) => n.id === 'parse')! };
    const extPositionsBefore = doc.nodes
      .filter((n) => n.regionId !== 'r_processing')
      .map((n) => [n.id, n.x, n.y]);

    const collapsedInner = backend.toggleRegionCollapse(doc, 'r_processing', true);
    const visCollapsed = backend.projectVisibleGraph(collapsedInner);
    expect(visCollapsed.nodes.find((n) => n.id === 'r_processing')?.kind).toBe('collapsed-region');
    expect(visCollapsed.nodes.find((n) => n.id === 'parse')).toBeUndefined();
    expect(
      collapsedInner.nodes
        .filter((n) => n.regionId !== 'r_processing')
        .map((n) => [n.id, n.x, n.y]),
    ).toEqual(extPositionsBefore);

    // Nested collapse: collapse outer r_active too
    const collapsedOuter = backend.toggleRegionCollapse(collapsedInner, 'r_active', true);
    const visOuter = backend.projectVisibleGraph(collapsedOuter);
    expect(visOuter.nodes.find((n) => n.id === 'r_active')?.kind).toBe('collapsed-region');
    expect(visOuter.nodes.find((n) => n.id === 'r_processing')).toBeUndefined();

    // Step 8: Expand back -> internal coordinates and manual waypoints 100% restored
    const expandedOuter = backend.toggleRegionCollapse(collapsedOuter, 'r_active', false);
    const expandedAll = backend.toggleRegionCollapse(expandedOuter, 'r_processing', false);
    const visExpanded = backend.projectVisibleGraph(expandedAll);
    expect(visExpanded.nodes.find((n) => n.id === 'parse')).toMatchObject({
      x: parsePosBeforeCollapse.x,
      y: parsePosBeforeCollapse.y,
    });
    expect(visExpanded.edges.find((e) => e.id === 'e6')?.waypoints).toEqual(manualWaypoints);

    // Steps 9-10: Save JSON & Load Saved JSON -> exact state restored, NO auto-relayout
    const withOneCollapsed = backend.toggleRegionCollapse(expandedAll, 'r_auth', true);
    const savedJson = backend.exportDocument(withOneCollapsed);
    const reloaded = openSavedDocument(savedJson);

    expect(reloaded.comparison).toBeNull();
    expect(reloaded.doc.layoutApplied).toBe(true);
    expect(reloaded.doc.nodes).toEqual(withOneCollapsed.nodes);
    expect(reloaded.doc.edges).toEqual(withOneCollapsed.edges);
    expect(reloaded.doc.regions).toEqual(withOneCollapsed.regions);
  });
});
