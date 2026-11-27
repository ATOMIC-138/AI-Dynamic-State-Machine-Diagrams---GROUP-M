import type { LayoutResult, Point, RegionNode, StateMachineDocument, TransitionEdge } from '../types/graph';
import { center, feedbackLaneOffset, routeEdge, selfLoopReach } from './edgeRouting';
import { countRouteCrossings } from './routeCrossings';
import { layoutLayers, type LayoutBox, type LayoutSettings } from './sugiyama';

type Scope = string | null;

interface Level {
  sizes: Map<string, { width: number; height: number }>;
  edges: TransitionEdge[];
  children: RegionNode[];
}

function newLevel(): Level {
  return { sizes: new Map(), edges: [], children: [] };
}

const nodeKey = (id: string) => `node:${id}`;
const regionKey = (id: string) => `region:${id}`;

function position(box: LayoutBox, offset: Point): LayoutBox {
  return { ...box, x: box.x + offset.x, y: box.y + offset.y };
}

export function layoutHierarchy(doc: StateMachineDocument, settings: LayoutSettings): LayoutResult {
  const levels = new Map<Scope, Level>([[null, newLevel()]]);
  const regions = new Map(doc.regions.map((region) => [region.id, region]));
  for (const region of doc.regions) levels.set(region.id, newLevel());
  const knownScope = (id: Scope): Scope => levels.has(id) ? id : null;
  for (const region of doc.regions) levels.get(knownScope(region.parentId))!.children.push(region);
  for (const node of doc.nodes) levels.get(knownScope(node.regionId))!.sizes.set(nodeKey(node.id), node);

  const chains = new Map<Scope, Scope[]>([[null, [null]]]);
  function chain(scope: Scope): Scope[] {
    const cached = chains.get(scope);
    if (cached) return cached;
    const ancestors: Scope[] = [];
    const seen = new Set<Scope>();
    let cursor = scope;
    while (!chains.has(cursor)) {
      if (seen.has(cursor)) throw new Error(`Cyclic region hierarchy at ${cursor}`);
      ancestors.push(cursor);
      seen.add(cursor);
      cursor = knownScope(regions.get(cursor!)!.parentId);
    }
    const resolved = [...ancestors, ...chains.get(cursor)!];
    chains.set(scope, resolved);
    return resolved;
  }
  for (const region of doc.regions) chain(region.id);

  const nodeChains = new Map(doc.nodes.map((node) => [node.id, chain(knownScope(node.regionId))]));
  const edgeScopes = new Map<string, Scope>();
  const parallels = new Map<string, string[]>();
  const pairKey = (edge: TransitionEdge) => JSON.stringify([edge.source, edge.target]);
  for (const edge of doc.edges) {
    const source = nodeChains.get(edge.source);
    const target = nodeChains.get(edge.target);
    if (!source || !target) continue;
    // Lift each endpoint to the child region visible in the lowest common scope.
    const scope = source.find((id) => target.includes(id))!;
    edgeScopes.set(edge.id, scope);
    const lift = (id: string, ancestors: Scope[]) => {
      const child = ancestors[ancestors.indexOf(scope) - 1];
      return child === undefined || child === null ? nodeKey(id) : regionKey(child);
    };
    levels.get(scope)!.edges.push({ ...edge, source: lift(edge.source, source), target: lift(edge.target, target) });
    const key = pairKey(edge);
    const pair = parallels.get(key) ?? [];
    pair.push(edge.id);
    parallels.set(key, pair);
  }

  const parallelLanes = new Map<string, { index: number; count: number }>();
  for (const group of parallels.values()) {
    group.forEach((id, index) => parallelLanes.set(id, { index, count: group.length }));
  }

  const loopReaches = new Map<Scope, number>();
  for (const edge of doc.edges) {
    const scope = edgeScopes.get(edge.id);
    if (edge.source !== edge.target || scope === undefined) continue;
    const reach = selfLoopReach(parallelLanes.get(edge.id)!.count, settings);
    loopReaches.set(scope, Math.max(loopReaches.get(scope) ?? 0, reach));
  }

  const layouts = new Map<Scope, ReturnType<typeof layoutLayers>>();
  const insets = new Map<string, Point>();
  const regionPadding = settings.regionPadding;
  function arrange(scope: Scope) {
    const level = levels.get(scope)!;
    for (const region of level.children) {
      arrange(region.id);
      const inner = layouts.get(region.id)!;
      const diameter = region.collapsed ? 2 * (region.collapsedRadius ?? 36) : 0;
      const crossPadding = inner.feedback.size ? Math.max(regionPadding,
        feedbackLaneOffset(inner.feedback.size - 1, regionPadding, loopReaches.get(region.id) ?? 0)
          + Math.min(5, regionPadding / 2)) : regionPadding;
      const inset = settings.direction === 'LR' ? { x: regionPadding, y: crossPadding } : { x: crossPadding, y: regionPadding };
      insets.set(region.id, inset);
      level.sizes.set(regionKey(region.id), {
        width: Math.max(diameter, Math.max(1, inner.width) + 2 * inset.x),
        height: Math.max(diameter, Math.max(1, inner.height) + 2 * inset.y),
      });
    }
    layouts.set(scope, layoutLayers(level.sizes, level.edges, settings));
  }
  arrange(null);

  const absolute = new Map<string, LayoutBox>();
  const offsets = new Map<Scope, Point>();
  function flatten(scope: Scope, offset: Point) {
    offsets.set(scope, offset);
    for (const [key, box] of layouts.get(scope)!.boxes) absolute.set(key, position(box, offset));
    for (const child of levels.get(scope)!.children) {
      const box = absolute.get(regionKey(child.id))!;
      const inset = insets.get(child.id)!;
      flatten(child.id, { x: box.x + inset.x, y: box.y + inset.y });
    }
  }
  flatten(null, { x: 0, y: 0 });

  const feedbackLanes = new Map<string, { index: number; count: number; loopReach: number }>();
  for (const [scope, layout] of layouts) {
    [...layout.feedback].forEach((id, index) => feedbackLanes.set(id, {
      index, count: layout.feedback.size, loopReach: loopReaches.get(scope) ?? 0,
    }));
  }
  const reversedEdgeIds: string[] = [];
  const paths = new Map<string, Point[]>();
  const alternateRoutes = new Map<string, () => Point[]>();
  const edges = doc.edges.map((edge): TransitionEdge => {
    const scope = edgeScopes.get(edge.id);
    if (scope === undefined) return { ...edge, waypoints: edge.waypoints.map((point) => ({ ...point })) };
    const layout = layouts.get(scope)!;
    const offset = offsets.get(scope)!;
    const feedback = layout.feedback.has(edge.id);
    if (feedback) reversedEdgeIds.push(edge.id);
    const guides = (layout.guides.get(edge.id) ?? []).map(({ x, y }) => ({ x: x + offset.x, y: y + offset.y }));
    const ancestors = new Set([...nodeChains.get(edge.source)!, ...nodeChains.get(edge.target)!]);
    const source = absolute.get(nodeKey(edge.source))!;
    const target = absolute.get(nodeKey(edge.target))!;
    const blockers = [
      ...doc.nodes.filter((node) => node.id !== edge.source && node.id !== edge.target)
        .map((node) => absolute.get(nodeKey(node.id))!),
      ...doc.regions.filter((region) => !ancestors.has(region.id)).map((region) => absolute.get(regionKey(region.id))!),
    ];
    const geometry = { source, target, guides, blockers, bounds: { ...offset, width: layout.width, height: layout.height } };
    const lane = { feedback: feedbackLanes.get(edge.id), parallel: parallelLanes.get(edge.id)! };
    const waypoints = routeEdge(edge, geometry, settings, lane);
    paths.set(edge.id, [center(source), ...waypoints, center(target)]);
    if (feedback && settings.sweepIterations > 0) {
      alternateRoutes.set(edge.id, () => routeEdge(edge, geometry, settings, { ...lane, alternateSide: true }));
    }
    return { ...edge, waypoints };
  });

  // A return lane may cross a forward route lifted out of a region. Compare
  // the two sides after routing all edges, keeping a change only if it helps.
  for (const edge of edges) {
    const alternate = alternateRoutes.get(edge.id);
    if (!alternate) continue;
    const original = paths.get(edge.id)!;
    const others = [...paths].filter(([id]) => id !== edge.id).map(([, path]) => path);
    const before = countRouteCrossings(original, others);
    if (!before) continue;
    const waypoints = alternate();
    const candidate = [original[0], ...waypoints, original[original.length - 1]];
    const after = countRouteCrossings(candidate, others);
    if (after < before) {
      paths.set(edge.id, candidate);
      edge.waypoints = waypoints;
    }
  }

  return {
    document: {
      ...doc,
      layoutApplied: true,
      nodes: doc.nodes.map((node) => ({ ...node, ...absolute.get(nodeKey(node.id))! })),
      // An explicit re-layout restores the proxy to the center of its new box.
      regions: doc.regions.map((region) => ({
        ...region,
        ...absolute.get(regionKey(region.id))!,
        collapsedPosition: undefined,
      })),
      edges,
    },
    stats: {
      reversedEdgeIds,
      dummyNodeCount: [...layouts.values()].reduce((sum, layout) => sum + layout.dummyNodeCount, 0),
      iterationsRun: [...layouts.values()].reduce((max, layout) => Math.max(max, layout.iterationsRun), 0),
    },
  };
}
