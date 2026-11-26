import type {
  ExternalGraphInput,
  Point,
  RegionNode,
  StateMachineDocument,
  StateNode,
  TransitionEdge,
} from '../types/graph';

const DEFAULT_NODE_WIDTH = 120;
const DEFAULT_NODE_HEIGHT = 50;
const DEFAULT_COLLAPSED_RADIUS = 36;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePoint(raw: unknown, context: string): Point {
  if (!isRecord(raw) || !isFiniteNumber(raw.x) || !isFiniteNumber(raw.y)) {
    throw new Error(`Invalid point in ${context}`);
  }
  return { x: raw.x, y: raw.y };
}

function assertNoRegionCycles(regions: RegionNode[]): void {
  const parentMap = new Map<string, string | null>(regions.map((r) => [r.id, r.parentId]));
  for (const r of regions) {
    const seen = new Set<string>([r.id]);
    let cur = r.parentId;
    while (cur !== null) {
      if (seen.has(cur)) {
        throw new Error(`Cyclic region hierarchy detected involving region: ${r.id}`);
      }
      seen.add(cur);
      cur = parentMap.get(cur) ?? null;
    }
  }
}

/**
 * Imports an external state machine graph structure (from upstream groups) into
 * our normalized Underlying Graph. Marks layoutApplied: false so the editor
 * runs automatic layout on first open.
 */
export function importExternalGraph(
  rawJson: string | ExternalGraphInput,
): StateMachineDocument {
  const parsed: unknown =
    typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;

  if (!isRecord(parsed) || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
    throw new Error('Invalid ExternalGraphInput: must contain nodes[] and edges[]');
  }

  const rawRegions = Array.isArray(parsed.regions) ? parsed.regions : [];
  const childToRegion = new Map<string, string>();
  const regionIds = new Set<string>();

  for (const r of rawRegions) {
    if (!isRecord(r) || typeof r.id !== 'string' || !r.id) {
      throw new Error('Invalid region entry: missing string id');
    }
    if (regionIds.has(r.id)) {
      throw new Error(`Duplicate region id: ${r.id}`);
    }
    regionIds.add(r.id);

    if (Array.isArray(r.children)) {
      for (const childId of r.children) {
        if (typeof childId === 'string') {
          childToRegion.set(childId, r.id);
        }
      }
    }
  }

  const regions: RegionNode[] = rawRegions.map((r) => {
    const rec = r as Record<string, unknown>;
    const id = rec.id as string;
    const explicitParent =
      typeof rec.parentId === 'string'
        ? rec.parentId
        : typeof rec.parent === 'string'
          ? rec.parent
          : null;
    const inferredParent = childToRegion.get(id) ?? null;
    const parentId = explicitParent ?? inferredParent;

    if (parentId !== null && !regionIds.has(parentId)) {
      throw new Error(`Region ${id} references unknown parent region: ${parentId}`);
    }

    return {
      id,
      label: typeof rec.label === 'string' ? rec.label : id,
      parentId,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      collapsed: false,
      collapsedRadius: DEFAULT_COLLAPSED_RADIUS,
    };
  });

  assertNoRegionCycles(regions);

  const nodeIds = new Set<string>();
  const nodes: StateNode[] = parsed.nodes.map((n) => {
    if (!isRecord(n) || typeof n.id !== 'string' || !n.id) {
      throw new Error('Invalid node entry: missing string id');
    }
    if (nodeIds.has(n.id)) {
      throw new Error(`Duplicate node id: ${n.id}`);
    }
    if (regionIds.has(n.id)) {
      throw new Error(`Node id collides with region id: ${n.id}`);
    }
    nodeIds.add(n.id);

    const explicitRegion =
      typeof n.regionId === 'string' ? n.regionId : null;
    const inferredRegion = childToRegion.get(n.id) ?? null;
    const regionId = explicitRegion ?? inferredRegion;

    if (regionId !== null && !regionIds.has(regionId)) {
      throw new Error(`Node ${n.id} references unknown region: ${regionId}`);
    }

    return {
      id: n.id,
      label: typeof n.label === 'string' ? n.label : n.id,
      x: 0,
      y: 0,
      width: isFiniteNumber(n.width) && n.width > 0 ? n.width : DEFAULT_NODE_WIDTH,
      height: isFiniteNumber(n.height) && n.height > 0 ? n.height : DEFAULT_NODE_HEIGHT,
      regionId,
      isUserCreated: false,
    };
  });

  const explicitEdgeIds = new Set<string>();
  for (const e of parsed.edges) {
    if (isRecord(e) && typeof e.id === 'string' && e.id) {
      if (explicitEdgeIds.has(e.id)) {
        throw new Error(`Duplicate edge id: ${e.id}`);
      }
      explicitEdgeIds.add(e.id);
    }
  }

  const edgeIds = new Set<string>(explicitEdgeIds);
  let nextAutoEdgeIndex = 1;
  const edges: TransitionEdge[] = parsed.edges.map((e, index) => {
    if (!isRecord(e) || typeof e.source !== 'string' || typeof e.target !== 'string') {
      throw new Error(`Invalid edge at index ${index}: missing source or target`);
    }
    if (!nodeIds.has(e.source)) {
      throw new Error(`Edge at index ${index} references unknown source node: ${e.source}`);
    }
    if (!nodeIds.has(e.target)) {
      throw new Error(`Edge at index ${index} references unknown target node: ${e.target}`);
    }

    let id: string;
    if (typeof e.id === 'string' && e.id) {
      id = e.id;
    } else {
      do {
        id = `e_${nextAutoEdgeIndex++}`;
      } while (edgeIds.has(id));
      edgeIds.add(id);
    }

    return {
      id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      waypoints: [],
      isUserCreated: false,
    };
  });

  return {
    schemaVersion: '1.0',
    layoutApplied: false,
    nodes,
    edges,
    regions,
    metadata: isRecord(parsed.metadata) ? { ...parsed.metadata } : undefined,
  };
}

/**
 * Serializes the complete StateMachineDocument (including layout positions,
 * sizes, manual waypoints, region hierarchy, collapsed states, and user-created elements).
 */
export function exportDocument(doc: StateMachineDocument): string {
  const payload: StateMachineDocument = {
    schemaVersion: '1.0',
    layoutApplied: true,
    nodes: doc.nodes.map((n) => ({ ...n })),
    edges: doc.edges.map((e) => ({
      ...e,
      waypoints: e.waypoints.map((p) => ({ x: p.x, y: p.y })),
    })),
    regions: doc.regions.map((r) => ({
      ...r,
      collapsedPosition: r.collapsedPosition
        ? { x: r.collapsedPosition.x, y: r.collapsedPosition.y }
        : undefined,
    })),
    metadata: doc.metadata ? { ...doc.metadata } : undefined,
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Loads and validates a previously saved StateMachineDocument JSON.
 *
 * CRITICAL REQUIREMENT: Restores exact coordinates, waypoints, collapsed states,
 * and user-created elements WITHOUT invoking automatic layout.
 */
export function loadSavedDocument(rawJson: string | unknown): StateMachineDocument {
  const parsed: unknown =
    typeof rawJson === 'string' ? JSON.parse(rawJson) : rawJson;

  if (!isRecord(parsed)) {
    throw new Error('Invalid saved document: expected JSON object');
  }
  if (parsed.schemaVersion !== '1.0') {
    throw new Error(`Unsupported schemaVersion: ${String(parsed.schemaVersion)}`);
  }
  if (
    !Array.isArray(parsed.nodes) ||
    !Array.isArray(parsed.edges) ||
    !Array.isArray(parsed.regions)
  ) {
    throw new Error('Invalid saved document: nodes, edges, and regions must be arrays');
  }

  const regionIds = new Set<string>();
  const regions: RegionNode[] = parsed.regions.map((r, idx) => {
    if (!isRecord(r) || typeof r.id !== 'string' || !r.id) {
      throw new Error(`Invalid region at index ${idx}`);
    }
    if (regionIds.has(r.id)) {
      throw new Error(`Duplicate region id: ${r.id}`);
    }
    regionIds.add(r.id);

    if (
      !isFiniteNumber(r.x) ||
      !isFiniteNumber(r.y) ||
      !isFiniteNumber(r.width) ||
      !isFiniteNumber(r.height) ||
      r.width < 0 ||
      r.height < 0 ||
      typeof r.collapsed !== 'boolean'
    ) {
      throw new Error(`Invalid geometry or collapsed flag on region ${r.id}`);
    }
    if (r.collapsedRadius !== undefined && (!isFiniteNumber(r.collapsedRadius) || r.collapsedRadius <= 0)) {
      throw new Error(`Invalid collapsedRadius on region ${r.id}`);
    }

    const parentId = typeof r.parentId === 'string' ? r.parentId : null;
    return {
      id: r.id,
      label: typeof r.label === 'string' ? r.label : undefined,
      parentId,
      x: r.x,
      y: r.y,
      width: r.width,
      height: r.height,
      collapsed: r.collapsed,
      collapsedPosition: r.collapsedPosition
        ? parsePoint(r.collapsedPosition, `region ${r.id}.collapsedPosition`)
        : undefined,
      collapsedRadius: isFiniteNumber(r.collapsedRadius)
        ? r.collapsedRadius
        : DEFAULT_COLLAPSED_RADIUS,
    };
  });

  for (const r of regions) {
    if (r.parentId !== null && !regionIds.has(r.parentId)) {
      throw new Error(`Region ${r.id} references unknown parentId: ${r.parentId}`);
    }
  }

  assertNoRegionCycles(regions);

  const nodeIds = new Set<string>();
  const nodes: StateNode[] = parsed.nodes.map((n, idx) => {
    if (!isRecord(n) || typeof n.id !== 'string' || !n.id) {
      throw new Error(`Invalid node at index ${idx}`);
    }
    if (nodeIds.has(n.id)) {
      throw new Error(`Duplicate node id: ${n.id}`);
    }
    if (regionIds.has(n.id)) {
      throw new Error(`Node id collides with region id: ${n.id}`);
    }
    nodeIds.add(n.id);

    if (
      !isFiniteNumber(n.x) ||
      !isFiniteNumber(n.y) ||
      !isFiniteNumber(n.width) ||
      !isFiniteNumber(n.height) ||
      n.width <= 0 ||
      n.height <= 0
    ) {
      throw new Error(`Invalid geometry on node ${n.id}`);
    }

    const regionId = typeof n.regionId === 'string' ? n.regionId : null;
    if (regionId !== null && !regionIds.has(regionId)) {
      throw new Error(`Node ${n.id} references unknown regionId: ${regionId}`);
    }

    return {
      id: n.id,
      label: typeof n.label === 'string' ? n.label : undefined,
      x: n.x,
      y: n.y,
      width: n.width,
      height: n.height,
      regionId,
      isUserCreated: Boolean(n.isUserCreated),
    };
  });

  const edgeIds = new Set<string>();
  const edges: TransitionEdge[] = parsed.edges.map((e, idx) => {
    if (
      !isRecord(e) ||
      typeof e.id !== 'string' ||
      !e.id ||
      typeof e.source !== 'string' ||
      typeof e.target !== 'string' ||
      !Array.isArray(e.waypoints)
    ) {
      throw new Error(`Invalid edge at index ${idx}`);
    }
    if (edgeIds.has(e.id)) {
      throw new Error(`Duplicate edge id: ${e.id}`);
    }
    edgeIds.add(e.id);
    if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
      throw new Error(`Edge ${e.id} references unknown source/target node`);
    }

    return {
      id: e.id,
      source: e.source,
      target: e.target,
      label: typeof e.label === 'string' ? e.label : undefined,
      waypoints: e.waypoints.map((wp, wIdx) =>
        parsePoint(wp, `edge ${e.id}.waypoints[${wIdx}]`),
      ),
      isUserCreated: Boolean(e.isUserCreated),
    };
  });

  return {
    schemaVersion: '1.0',
    layoutApplied: true,
    nodes,
    edges,
    regions,
    metadata: isRecord(parsed.metadata) ? { ...parsed.metadata } : undefined,
  };
}
