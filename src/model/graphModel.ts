import type {
  Point,
  RegionNode,
  StateMachineDocument,
  StateNode,
  TransitionEdge,
} from '../types/graph';

const REGION_EXPAND_MARGIN = 24;
const DEFAULT_COLLAPSED_RADIUS = 36;

function clonePoint(p: Point): Point {
  return { x: p.x, y: p.y };
}

function cloneDocument(doc: StateMachineDocument): StateMachineDocument {
  return {
    schemaVersion: doc.schemaVersion,
    layoutApplied: doc.layoutApplied,
    nodes: doc.nodes.map((n) => ({ ...n })),
    edges: doc.edges.map((e) => ({
      ...e,
      waypoints: e.waypoints.map(clonePoint),
    })),
    regions: doc.regions.map((r) => ({
      ...r,
      collapsedPosition: r.collapsedPosition ? clonePoint(r.collapsedPosition) : undefined,
    })),
    metadata: doc.metadata ? { ...doc.metadata } : undefined,
  };
}

/**
 * Expands ancestor regions just enough to keep a moved node inside them,
 * without touching any other node's coordinates.
 */
function ensureEnclosingRegions(doc: StateMachineDocument, node: StateNode): void {
  const regionMap = new Map<string, RegionNode>(doc.regions.map((r) => [r.id, r]));
  let currentId = node.regionId;
  let childMinX = node.x;
  let childMinY = node.y;
  let childMaxX = node.x + node.width;
  let childMaxY = node.y + node.height;

  const visited = new Set<string>();
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const region = regionMap.get(currentId);
    if (!region || region.collapsed) {
      break;
    }

    const reqMinX = childMinX - REGION_EXPAND_MARGIN;
    const reqMinY = childMinY - REGION_EXPAND_MARGIN;
    const reqMaxX = childMaxX + REGION_EXPAND_MARGIN;
    const reqMaxY = childMaxY + REGION_EXPAND_MARGIN;

    const curMaxX = region.x + region.width;
    const curMaxY = region.y + region.height;

    const nextMinX = Math.min(region.x, reqMinX);
    const nextMinY = Math.min(region.y, reqMinY);
    const nextMaxX = Math.max(curMaxX, reqMaxX);
    const nextMaxY = Math.max(curMaxY, reqMaxY);

    region.x = nextMinX;
    region.y = nextMinY;
    region.width = nextMaxX - nextMinX;
    region.height = nextMaxY - nextMinY;

    childMinX = region.x;
    childMinY = region.y;
    childMaxX = region.x + region.width;
    childMaxY = region.y + region.height;
    currentId = region.parentId;
  }
}

/**
 * Moves a single node to (x, y). Never moves other nodes or triggers global relayout.
 */
export function moveNode(
  doc: StateMachineDocument,
  nodeId: string,
  x: number,
  y: number,
): StateMachineDocument {
  const next = cloneDocument(doc);
  const target = next.nodes.find((n) => n.id === nodeId);
  if (!target) {
    throw new Error(`Node not found: ${nodeId}`);
  }
  target.x = x;
  target.y = y;
  ensureEnclosingRegions(next, target);
  return next;
}

/**
 * Updates waypoints for an edge without altering its semantic source or target.
 */
export function updateEdgeWaypoints(
  doc: StateMachineDocument,
  edgeId: string,
  waypoints: Point[],
): StateMachineDocument {
  const next = cloneDocument(doc);
  const edge = next.edges.find((e) => e.id === edgeId);
  if (!edge) {
    throw new Error(`Edge not found: ${edgeId}`);
  }
  edge.waypoints = waypoints.map(clonePoint);
  return next;
}

/**
 * Adds a user-created state node to the Underlying Graph.
 */
export function addNode(
  doc: StateMachineDocument,
  node: Omit<StateNode, 'isUserCreated'>,
): StateMachineDocument {
  if (doc.nodes.some((n) => n.id === node.id)) {
    throw new Error(`Duplicate node id: ${node.id}`);
  }
  if (node.regionId !== null && !doc.regions.some((r) => r.id === node.regionId)) {
    throw new Error(`Region not found for node ${node.id}: ${node.regionId}`);
  }
  const next = cloneDocument(doc);
  const created: StateNode = {
    ...node,
    isUserCreated: true,
  };
  next.nodes.push(created);
  ensureEnclosingRegions(next, created);
  return next;
}

/**
 * Adds a user-created transition edge between two existing nodes.
 */
export function addEdge(
  doc: StateMachineDocument,
  edge: Omit<TransitionEdge, 'isUserCreated'>,
): StateMachineDocument {
  if (doc.edges.some((e) => e.id === edge.id)) {
    throw new Error(`Duplicate edge id: ${edge.id}`);
  }
  if (!doc.nodes.some((n) => n.id === edge.source)) {
    throw new Error(`Edge source node not found: ${edge.source}`);
  }
  if (!doc.nodes.some((n) => n.id === edge.target)) {
    throw new Error(`Edge target node not found: ${edge.target}`);
  }
  const next = cloneDocument(doc);
  next.edges.push({
    ...edge,
    waypoints: edge.waypoints.map(clonePoint),
    isUserCreated: true,
  });
  return next;
}

/**
 * Toggles collapse/expand state for a region.
 *
 * CRITICAL INVARIANTS:
 * - Never deletes internal nodes, sub-regions, or internal edges from UnderlyingGraph.
 * - Never modifies any other node's coordinates.
 * - Never overwrites original edge source/target or waypoints.
 */
export function toggleRegionCollapse(
  doc: StateMachineDocument,
  regionId: string,
  collapsed?: boolean,
): StateMachineDocument {
  const next = cloneDocument(doc);
  const region = next.regions.find((r) => r.id === regionId);
  if (!region) {
    throw new Error(`Region not found: ${regionId}`);
  }

  const targetState = collapsed !== undefined ? collapsed : !region.collapsed;
  region.collapsed = targetState;

  if (targetState) {
    if (!region.collapsedPosition) {
      region.collapsedPosition = {
        x: region.x + region.width / 2,
        y: region.y + region.height / 2,
      };
    }
    if (region.collapsedRadius === undefined) {
      region.collapsedRadius = DEFAULT_COLLAPSED_RADIUS;
    }
  }

  return next;
}
