import { describe, expect, it } from 'vitest';
import { computeBaselineLayout, computeLayout } from '../../src/layout';
import type { Point, RegionNode, StateMachineDocument, StateNode, TransitionEdge } from '../../src/types/graph';

function node(id: string, regionId: string | null = null, width = 100, height = 50): StateNode {
  return { id, regionId, x: 0, y: 0, width, height };
}

function region(id: string, parentId: string | null): RegionNode {
  return { id, parentId, x: 0, y: 0, width: 0, height: 0, collapsed: false };
}

function edge(id: string, source: string, target: string): TransitionEdge {
  return { id, source, target, waypoints: [] };
}

function document(nodes: StateNode[], edges: TransitionEdge[], regions: RegionNode[] = []): StateMachineDocument {
  return { schemaVersion: '1.0', layoutApplied: false, nodes, edges, regions };
}

function center(node: StateNode): Point {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

function countCrossings(doc: StateMachineDocument): number {
  const centers = new Map(doc.nodes.map((item) => [item.id, center(item)]));
  const paths = doc.edges.map((item) => [centers.get(item.source)!, ...item.waypoints, centers.get(item.target)!]);
  const side = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  let crossings = 0;
  for (const [i, left] of paths.entries()) {
    for (const right of paths.slice(i + 1)) {
      for (let l = 1; l < left.length; l++) {
        for (let r = 1; r < right.length; r++) {
          if (side(left[l - 1], left[l], right[r - 1]) * side(left[l - 1], left[l], right[r]) < 0
            && side(right[r - 1], right[r], left[l - 1]) * side(right[r - 1], right[r], left[l]) < 0) crossings++;
        }
      }
    }
  }
  return crossings;
}

function expectNoOverlap(nodes: StateNode[]) {
  for (const [i, a] of nodes.entries()) {
    for (const b of nodes.slice(i + 1)) {
      expect(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y,
        `${a.id} and ${b.id} overlap`).toBe(true);
    }
  }
}

function expectInside(outer: RegionNode, inner: StateNode | RegionNode, padding: number) {
  expect(inner.x).toBeGreaterThanOrEqual(outer.x + padding);
  expect(inner.y).toBeGreaterThanOrEqual(outer.y + padding);
  expect(inner.x + inner.width).toBeLessThanOrEqual(outer.x + outer.width - padding);
  expect(inner.y + inner.height).toBeLessThanOrEqual(outer.y + outer.height - padding);
}

describe('Member B layout engine', () => {
  it.each(['LR', 'TB'] as const)('layers a branching graph without overlaps in %s', (direction) => {
    const input = document([node('start'), node('wide', null, 220, 75), node('small'), node('finish')],
      [edge('a', 'start', 'wide'), edge('b', 'start', 'small'), edge('c', 'wide', 'finish'),
        edge('d', 'small', 'finish'), edge('long', 'start', 'finish')]);
    const original = structuredClone(input);
    const result = computeLayout(input, { direction, layerSpacing: 60, nodeSpacing: 30 });
    const [start, wide, small, finish] = result.document.nodes;
    const axis = direction === 'LR' ? 'x' : 'y';
    const size = direction === 'LR' ? 'width' : 'height';
    expect(Math.min(wide[axis], small[axis]) - start[axis] - start[size]).toBeGreaterThanOrEqual(60);
    expect(finish[axis] - Math.max(wide[axis] + wide[size], small[axis] + small[size])).toBeGreaterThanOrEqual(60);
    expect(result.stats?.dummyNodeCount).toBe(1);
    expect(result.document.layoutApplied).toBe(true);
    expectNoOverlap(result.document.nodes);
    expect(input).toEqual(original);
    expect(computeLayout(input, { direction, layerSpacing: 60, nodeSpacing: 30 })).toEqual(result);
  });

  it('strictly reduces actual segment crossings on a dense layered fixture', () => {
    const nodes = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4', 'c1', 'c2', 'c3', 'c4'].map((id) => node(id));
    const input = document(nodes, [edge('ab1', 'a1', 'b4'), edge('ab2', 'a2', 'b3'), edge('ab3', 'a3', 'b2'),
      edge('ab4', 'a4', 'b1'), edge('ab5', 'a1', 'b3'), edge('ab6', 'a4', 'b2'), edge('bc1', 'b1', 'c4'),
      edge('bc2', 'b2', 'c3'), edge('bc3', 'b3', 'c2'), edge('bc4', 'b4', 'c1'), edge('bc5', 'b1', 'c3')]);
    const baseline = computeBaselineLayout(input, { enableCrossingReduction: true });
    const optimized = computeLayout(input);
    const before = countCrossings(baseline.document);
    const after = countCrossings(optimized.document);
    expect(before).toBeGreaterThanOrEqual(10);
    expect(after).toBeLessThanOrEqual(before / 2);
    expect(baseline.stats?.iterationsRun).toBe(0);
    expect(optimized.stats?.iterationsRun).toBeGreaterThan(0);
    expectNoOverlap(optimized.document.nodes);
  });

  it('preserves edge directions and routes parallel edges, a feedback edge and a self-loop', () => {
    const input = document([node('a'), node('b'), node('c')], [edge('first', 'a', 'b'), edge('parallel', 'a', 'b'),
      edge('forward', 'b', 'c'), edge('return', 'c', 'a'), edge('opposite', 'b', 'a'), edge('self', 'b', 'b')]);
    const { document: result, stats } = computeLayout(input);
    expect(stats?.reversedEdgeIds).toEqual(expect.arrayContaining(['return', 'opposite']));
    expect(result.edges.map(({ waypoints: _waypoints, ...item }) => item))
      .toEqual(input.edges.map(({ waypoints: _waypoints, ...item }) => item));
    const [first, parallel, , returning, opposite, self] = result.edges;
    expect(first.waypoints).not.toEqual(parallel.waypoints);
    expect(returning.waypoints).not.toEqual(opposite.waypoints);
    expect(self.waypoints.length).toBeGreaterThanOrEqual(3);
    const b = result.nodes[1];
    expect(returning.waypoints.some((point) => point.y < b.y || point.y > b.y + b.height)).toBe(true);
    expect(countCrossings(result)).toBeLessThanOrEqual(countCrossings(computeBaselineLayout(input).document));
    expect(self.waypoints.some((point) => point.x > b.x + b.width && point.y < b.y)).toBe(true);
    expectNoOverlap(result.nodes);
  });

  it('packs nested and empty regions, translates internal routes and keeps cross-region endpoints', () => {
    const collapsed = { ...region('inner', 'middle'), x: 8, y: 10, collapsed: true,
      collapsedPosition: { x: 11, y: 14 }, collapsedRadius: 24 };
    const input = document([node('outer-state'), node('inside-a', 'inner'), node('inside-b', 'inner'),
      node('middle-state', 'middle'), node('in-sibling', 'other')], [edge('within', 'inside-a', 'inside-b'),
      edge('back', 'inside-b', 'inside-a'), edge('mixed', 'inside-b', 'middle-state'),
      edge('cross', 'middle-state', 'in-sibling'), edge('exit', 'in-sibling', 'outer-state')],
      [region('outer', null), region('middle', 'outer'), collapsed, region('other', null), region('empty', 'middle')]);
    const result = computeLayout(input, { direction: 'TB', regionPadding: 25 }).document;
    const [outer, middle, inner, other, empty] = result.regions;
    expectInside(outer, middle, 25);
    expectInside(middle, inner, 25);
    expectInside(middle, empty, 25);
    expectInside(inner, result.nodes[1], 25);
    expectInside(inner, result.nodes[2], 25);
    expectInside(other, result.nodes[4], 25);
    expect(inner.collapsed).toBe(true);
    expect(inner.collapsedRadius).toBe(24);
    expect(inner.collapsedPosition).toBeUndefined();
    expect(result.edges[3]).toMatchObject({ source: 'middle-state', target: 'in-sibling' });
    for (const point of result.edges[1].waypoints) {
      expect(point.x).toBeGreaterThanOrEqual(inner.x);
      expect(point.y).toBeGreaterThanOrEqual(inner.y);
      expect(point.x).toBeLessThanOrEqual(inner.x + inner.width);
      expect(point.y).toBeLessThanOrEqual(inner.y + inner.height);
    }
    expectNoOverlap(result.nodes);
  });

  it.each(['LR', 'TB'] as const)('gives different feedback edges their own outer rails in %s', (direction) => {
    const input = document(['a', 'b', 'c'].map((id) => node(id)), [edge('ca', 'c', 'a'), edge('ab', 'a', 'b'),
      edge('ba', 'b', 'a'), edge('bc', 'b', 'c'), edge('cb', 'c', 'b'), edge('ac', 'a', 'c')]);
    const { document: result, stats } = computeLayout(input, { direction });
    const axis = direction === 'LR' ? 'y' : 'x';
    const extent = direction === 'LR' ? 'height' : 'width';
    const min = Math.min(...result.nodes.map((item) => item[axis]));
    const max = Math.max(...result.nodes.map((item) => item[axis] + item[extent]));
    const rails = result.edges.filter((item) => stats?.reversedEdgeIds.includes(item.id)).map(({ waypoints }) => {
      const outside = waypoints.find((point, i) => Math.abs(point[axis] - (waypoints[i + 1]?.[axis] ?? NaN)) < 1e-7
        && (point[axis] < min || point[axis] > max));
      expect(outside).toBeDefined();
      return outside![axis];
    });
    expect(rails.length).toBeGreaterThan(1);
    expect(new Set(rails).size).toBe(rails.length);
  });

  it.each(['LR', 'TB'] as const)('does not increase routed crossings on the reviewed cycle in %s', (direction) => {
    const input = document(['n0', 'n1', 'n2', 'n3'].map((id) => node(id, null, 120)),
      [edge('23', 'n2', 'n3'), edge('20', 'n2', 'n0'), edge('12', 'n1', 'n2'), edge('03', 'n0', 'n3'),
        edge('10', 'n1', 'n0'), edge('02', 'n0', 'n2')]);
    const baseline = computeBaselineLayout(input, { direction }).document;
    expect(countCrossings(computeLayout(input, { direction }).document)).toBeLessThanOrEqual(countCrossings(baseline));
  });

  it('resets a manually moved collapsed circle inside its own and its parent region on explicit re-layout', () => {
    const input = document([node('outside'), node('inside', 'child', 30, 25)], [edge('in', 'outside', 'inside')],
      [region('parent', null), { ...region('child', 'parent'), collapsed: true,
        collapsedPosition: { x: -900, y: -900 }, collapsedRadius: 48 }]);
    const result = computeLayout(input, { regionPadding: 12 }).document;
    const [parent, child] = result.regions;
    expect(child.collapsedPosition).toBeUndefined();
    const radius = child.collapsedRadius!;
    expectInside(child, { ...child, x: child.x + child.width / 2 - radius,
      y: child.y + child.height / 2 - radius, width: radius * 2, height: radius * 2 }, 0);
    expectInside(parent, child, 12);
    expect(input.regions[1].collapsedPosition).toEqual({ x: -900, y: -900 });
  });

  it.each(['LR', 'TB'] as const)('keeps parallel routes distinct when a detour is needed in %s', (direction) => {
    const input = document(Array.from({ length: 7 }, (_, i) => node(`n${i}`, null, 120)),
      [edge('a', 'n0', 'n5'), edge('b', 'n0', 'n2'), edge('c', 'n3', 'n5'), edge('d', 'n0', 'n5')]);
    const result = computeLayout(input, { direction }).document;
    expect(result.edges[0].waypoints[0]).not.toEqual(result.edges[3].waypoints[0]);
    expect(result.edges[0].waypoints.at(-1)).not.toEqual(result.edges[3].waypoints.at(-1));
  });

  it('handles empty and isolated graphs without changing optional data', () => {
    const input = { ...document([], []), metadata: { title: 'empty' } };
    expect(computeLayout(input).document).toEqual({ ...input, layoutApplied: true });
    const isolated = document([{ ...node('a'), label: 'Start', isUserCreated: true }, node('b')], []);
    const result = computeLayout(isolated).document;
    expect(result.nodes[0]).toMatchObject({ id: 'a', label: 'Start', isUserCreated: true });
    expectNoOverlap(result.nodes);
  });
});
