/**
 * TEMPORARY stand-ins for Members A and B. Delete once src/model, src/metrics
 * and src/layout reach main (see ./backend.ts).
 *
 * They follow implementation_plan.md §4 only far enough to drive the editor.
 * The "layout" is a plain grid with no cycle handling or crossing reduction, so
 * the numbers it produces say nothing about the real engine.
 */
import type {
  ExternalGraphInput,
  LayoutComparison,
  LayoutMetrics,
  LayoutOptions,
  LayoutResult,
  Point,
  RegionNode,
  StateMachineDocument,
  StateNode,
  TransitionEdge,
  VisibleGraph,
  VisibleNode,
} from '../types/graph';
import { bentMidpoint, boxCenter, boxContains, selfLoopWaypoints, type Box } from './geometry';

const DEFAULT_SIZE = { width: 120, height: 50 };
const DEFAULT_RADIUS = 36;
const REGION_PADDING = 24;
const REGION_TITLE = 24;

// ---- src/model ----

export function importExternalGraph(rawJson: string | ExternalGraphInput): StateMachineDocument {
  const input: ExternalGraphInput = typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;
  if (!Array.isArray(input?.nodes) || !Array.isArray(input?.edges)) {
    throw new Error('需要 nodes 與 edges 陣列');
  }
  const regionInputs = input.regions ?? [];
  // `children` may list node ids or region ids.
  const parentOf = new Map<string, string>();
  for (const region of regionInputs) {
    for (const child of region.children ?? []) parentOf.set(child, region.id);
  }

  const nodes: StateNode[] = input.nodes.map((node) => ({
    id: node.id,
    label: node.label ?? node.id,
    x: 0,
    y: 0,
    width: node.width ?? DEFAULT_SIZE.width,
    height: node.height ?? DEFAULT_SIZE.height,
    regionId: node.regionId ?? parentOf.get(node.id) ?? null,
  }));
  const nodeIds = new Set(nodes.map((node) => node.id));

  const takenEdgeIds = new Set(input.edges.map((edge) => edge.id));
  let counter = 0;
  const edges: TransitionEdge[] = input.edges.map((edge) => {
    if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) {
      throw new Error(`連線 ${edge.source} → ${edge.target} 指向不存在的節點`);
    }
    let id = edge.id;
    while (!id) {
      const candidate = `e${++counter}`;
      if (!takenEdgeIds.has(candidate)) id = candidate;
    }
    return { id, source: edge.source, target: edge.target, label: edge.label, waypoints: [] };
  });

  const regions: RegionNode[] = regionInputs.map((region) => ({
    id: region.id,
    label: region.label ?? region.id,
    parentId: region.parent ?? region.parentId ?? parentOf.get(region.id) ?? null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    collapsed: false,
  }));

  return { schemaVersion: '1.0', layoutApplied: false, nodes, edges, regions, metadata: input.metadata };
}

export function exportDocument(doc: StateMachineDocument): string {
  return JSON.stringify(doc, null, 2);
}

export function loadSavedDocument(rawJson: string | unknown): StateMachineDocument {
  const data = (typeof rawJson === 'string' ? JSON.parse(rawJson) : structuredClone(rawJson)) as StateMachineDocument;
  if (
    data?.schemaVersion !== '1.0' ||
    !Array.isArray(data.nodes) ||
    !Array.isArray(data.edges) ||
    !Array.isArray(data.regions)
  ) {
    throw new Error('不是本工具儲存的 JSON（需要 schemaVersion "1.0"、nodes、edges、regions）');
  }
  return { ...data, layoutApplied: true };
}

/** The outermost collapsed region among `regionId` and its ancestors: it hides everything inside. */
function hidingRegion(regions: Map<string, RegionNode>, regionId: string | null): RegionNode | undefined {
  let found: RegionNode | undefined;
  const seen = new Set<string>();
  for (let id = regionId; id && !seen.has(id); id = regions.get(id)?.parentId ?? null) {
    seen.add(id);
    const region = regions.get(id);
    if (region?.collapsed) found = region;
  }
  return found;
}

export function projectVisibleGraph(doc: StateMachineDocument): VisibleGraph {
  const regions = new Map(doc.regions.map((region) => [region.id, region]));
  const nodesById = new Map(doc.nodes.map((node) => [node.id, node]));
  const unhidden = doc.regions.filter((region) => !hidingRegion(regions, region.parentId));

  const proxies: VisibleNode[] = unhidden
    .filter((region) => region.collapsed)
    .map((region) => {
      const center = region.collapsedPosition ?? boxCenter(region);
      const radius = region.collapsedRadius ?? DEFAULT_RADIUS;
      return {
        id: region.id,
        label: region.label,
        kind: 'collapsed-region',
        x: center.x - radius,
        y: center.y - radius,
        width: radius * 2,
        height: radius * 2,
        radius,
        regionId: region.parentId,
        sourceRegionId: region.id,
      };
    });
  const states: VisibleNode[] = doc.nodes
    .filter((node) => !hidingRegion(regions, node.regionId))
    .map((node) => ({ ...node, kind: 'state' }));

  const endpoint = (nodeId: string) => {
    const hiddenBy = hidingRegion(regions, nodesById.get(nodeId)?.regionId ?? null);
    return { id: hiddenBy?.id ?? nodeId, hiddenBy };
  };

  const edges = doc.edges.flatMap((edge) => {
    const source = endpoint(edge.source);
    const target = endpoint(edge.target);
    const isRedirected = Boolean(source.hiddenBy || target.hiddenBy);
    if (isRedirected && source.id === target.id) return []; // entirely inside one collapsed region
    const buried = [source.hiddenBy, target.hiddenBy].filter((region) => region !== undefined);
    return [
      {
        id: edge.id,
        originalSource: edge.source,
        originalTarget: edge.target,
        displaySource: source.id,
        displayTarget: target.id,
        label: edge.label,
        waypoints: edge.waypoints.filter((point) => !buried.some((region) => boxContains(region, point))),
        isRedirected,
        isUserCreated: edge.isUserCreated,
      },
    ];
  });

  return {
    nodes: [...states, ...proxies],
    edges,
    regions: unhidden
      .filter((region) => !region.collapsed)
      .map(({ id, label, parentId, x, y, width, height }) => ({ id, label, parentId, x, y, width, height })),
  };
}

export function moveNode(doc: StateMachineDocument, nodeId: string, x: number, y: number): StateMachineDocument {
  const nodes = doc.nodes.map((node) => (node.id === nodeId ? { ...node, x, y } : node));
  const moved = nodes.find((node) => node.id === nodeId);
  if (!moved) {
    // As Member A does it: a collapsed region's id moves its circle, (x, y) being the circle's top-left.
    return {
      ...doc,
      regions: doc.regions.map((region) => {
        const radius = region.collapsedRadius ?? DEFAULT_RADIUS;
        return region.id === nodeId && region.collapsed
          ? { ...region, collapsedPosition: { x: x + radius, y: y + radius } }
          : region;
      }),
    };
  }

  // Grow (never shrink) the enclosing regions so they still wrap the node.
  const regions = new Map(doc.regions.map((region) => [region.id, region]));
  let inner: Box = moved;
  let parentId = moved.regionId;
  for (let depth = 0; parentId && depth < doc.regions.length; depth++) {
    const region = regions.get(parentId);
    if (!region) break;
    const left = Math.min(region.x, inner.x - REGION_PADDING);
    const top = Math.min(region.y, inner.y - REGION_PADDING - REGION_TITLE);
    const grown = {
      ...region,
      x: left,
      y: top,
      width: Math.max(region.x + region.width, inner.x + inner.width + REGION_PADDING) - left,
      height: Math.max(region.y + region.height, inner.y + inner.height + REGION_PADDING) - top,
    };
    regions.set(region.id, grown);
    inner = grown;
    parentId = region.parentId;
  }
  return { ...doc, nodes, regions: doc.regions.map((region) => regions.get(region.id) ?? region) };
}

export function updateEdgeWaypoints(
  doc: StateMachineDocument,
  edgeId: string,
  waypoints: Point[],
): StateMachineDocument {
  return {
    ...doc,
    edges: doc.edges.map((edge) =>
      edge.id === edgeId ? { ...edge, waypoints: waypoints.map((point) => ({ ...point })) } : edge,
    ),
  };
}

export function addNode(doc: StateMachineDocument, node: Omit<StateNode, 'isUserCreated'>): StateMachineDocument {
  if (doc.nodes.some((existing) => existing.id === node.id)) throw new Error(`節點 id 重複：${node.id}`);
  return { ...doc, nodes: [...doc.nodes, { ...node, isUserCreated: true }] };
}

export function addEdge(
  doc: StateMachineDocument,
  edge: Omit<TransitionEdge, 'isUserCreated'>,
): StateMachineDocument {
  const nodeIds = new Set(doc.nodes.map((node) => node.id));
  if (!nodeIds.has(edge.source) || !nodeIds.has(edge.target)) throw new Error('連線端點必須是既有節點');
  if (doc.edges.some((existing) => existing.id === edge.id)) throw new Error(`連線 id 重複：${edge.id}`);
  return { ...doc, edges: [...doc.edges, { ...edge, isUserCreated: true }] };
}

export function toggleRegionCollapse(
  doc: StateMachineDocument,
  regionId: string,
  collapsed?: boolean,
): StateMachineDocument {
  return {
    ...doc,
    regions: doc.regions.map((region) =>
      region.id === regionId ? { ...region, collapsed: collapsed ?? !region.collapsed } : region,
    ),
  };
}

// ---- src/metrics ----

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
const segmentsCross = (a: Point, b: Point, c: Point, d: Point) =>
  cross(c, d, a) * cross(c, d, b) < 0 && cross(a, b, c) * cross(a, b, d) < 0;

export function evaluateLayout(doc: StateMachineDocument): LayoutMetrics {
  const centers = new Map(doc.nodes.map((node) => [node.id, boxCenter(node)]));
  const lines = doc.edges.flatMap((edge) => {
    const source = centers.get(edge.source);
    const target = centers.get(edge.target);
    return source && target ? [[source, ...edge.waypoints, target]] : [];
  });

  let edgeCrossings = 0;
  let totalEdgeLength = 0;
  lines.forEach((line, i) => {
    for (let a = 1; a < line.length; a++) {
      totalEdgeLength += Math.hypot(line[a].x - line[a - 1].x, line[a].y - line[a - 1].y);
      for (const other of lines.slice(i + 1)) {
        for (let b = 1; b < other.length; b++) {
          if (segmentsCross(line[a - 1], line[a], other[b - 1], other[b])) edgeCrossings++;
        }
      }
    }
  });

  let nodeOverlaps = 0;
  doc.nodes.forEach((a, i) => {
    for (const b of doc.nodes.slice(i + 1)) {
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
        nodeOverlaps++;
      }
    }
  });

  const points = [
    ...doc.nodes.flatMap((node) => [node, { x: node.x + node.width, y: node.y + node.height }]),
    ...doc.edges.flatMap((edge) => edge.waypoints),
  ];
  const span = (values: number[]) => (values.length ? Math.max(...values) - Math.min(...values) : 0);
  const boundingWidth = span(points.map((point) => point.x));
  const boundingHeight = span(points.map((point) => point.y));

  return {
    edgeCrossings,
    nodeOverlaps,
    totalEdgeLength,
    totalBends: doc.edges.reduce((sum, edge) => sum + edge.waypoints.length, 0),
    boundingWidth,
    boundingHeight,
    boundingArea: boundingWidth * boundingHeight,
    aspectRatio: boundingHeight ? boundingWidth / boundingHeight : 0,
  };
}

export function compareLayouts(
  baselineDoc: StateMachineDocument,
  optimizedDoc: StateMachineDocument,
): LayoutComparison {
  const baseline = evaluateLayout(baselineDoc);
  const optimized = evaluateLayout(optimizedDoc);
  const crossingReductionCount = baseline.edgeCrossings - optimized.edgeCrossings;
  return {
    baseline,
    optimized,
    crossingReductionCount,
    crossingReductionPercent: baseline.edgeCrossings ? (crossingReductionCount / baseline.edgeCrossings) * 100 : 0,
  };
}

// ---- src/layout ----

interface Block {
  width: number;
  height: number;
  place: (x: number, y: number) => void;
}

export function computeLayout(doc: StateMachineDocument, options: LayoutOptions = {}): LayoutResult {
  const gapX = options.layerSpacing ?? 90;
  const gapY = options.nodeSpacing ?? 60;
  const padding = options.regionPadding ?? REGION_PADDING;
  const nodes = new Map<string, StateNode>(doc.nodes.map((node) => [node.id, { ...node }]));
  // A fresh layout moves regions, so a remembered circle position is stale.
  const regions = new Map<string, RegionNode>(
    doc.regions.map((region) => [region.id, { ...region, collapsedPosition: undefined }]),
  );

  // Grid of the direct children of `parentId`; nested regions are laid out first to learn their size.
  const arrange = (parentId: string | null): Block => {
    const children: Block[] = [
      ...doc.nodes
        .filter((node) => node.regionId === parentId)
        .map((node) => ({
          width: node.width,
          height: node.height,
          place: (x: number, y: number) => {
            Object.assign(nodes.get(node.id)!, { x, y });
          },
        })),
      ...doc.regions
        .filter((region) => region.parentId === parentId)
        .map((region) => {
          const inner = arrange(region.id);
          const width = inner.width + padding * 2;
          const height = inner.height + padding * 2 + REGION_TITLE;
          return {
            width,
            height,
            place: (x: number, y: number) => {
              Object.assign(regions.get(region.id)!, { x, y, width, height });
              inner.place(x + padding, y + padding + REGION_TITLE);
            },
          };
        }),
    ];

    const columns = Math.ceil(Math.sqrt(children.length));
    const offsets: Point[] = [];
    let x = 0;
    let y = 0;
    let width = 0;
    let rowHeight = 0;
    children.forEach((child, index) => {
      if (index > 0 && index % columns === 0) {
        x = 0;
        y += rowHeight + gapY;
        rowHeight = 0;
      }
      offsets.push({ x, y });
      width = Math.max(width, x + child.width);
      x += child.width + gapX;
      rowHeight = Math.max(rowHeight, child.height);
    });
    return {
      width,
      height: y + rowHeight,
      place: (left, top) => children.forEach((child, i) => child.place(left + offsets[i].x, top + offsets[i].y)),
    };
  };
  arrange(null).place(40, 40);

  const edges = doc.edges.map((edge) => {
    const source = nodes.get(edge.source)!;
    if (edge.source === edge.target) return { ...edge, waypoints: selfLoopWaypoints(source) };
    // Bend an edge away from its reverse so both arrows stay clickable.
    const hasReverse = doc.edges.some((other) => other.source === edge.target && other.target === edge.source);
    if (!hasReverse) return { ...edge, waypoints: [] };
    const target = nodes.get(edge.target)!;
    return { ...edge, waypoints: [bentMidpoint(boxCenter(source), boxCenter(target), 24)] };
  });

  return {
    document: {
      ...doc,
      layoutApplied: true,
      nodes: doc.nodes.map((node) => nodes.get(node.id)!),
      edges,
      regions: doc.regions.map((region) => regions.get(region.id)!),
    },
    stats: { reversedEdgeIds: [], dummyNodeCount: 0, iterationsRun: 0 },
  };
}

export function computeBaselineLayout(doc: StateMachineDocument, options?: LayoutOptions): LayoutResult {
  return computeLayout(doc, { ...options, enableCrossingReduction: false });
}
