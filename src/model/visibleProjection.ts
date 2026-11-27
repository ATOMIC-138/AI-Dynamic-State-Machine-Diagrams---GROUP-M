import type {
  RegionNode,
  StateMachineDocument,
  VisibleEdge,
  VisibleGraph,
  VisibleNode,
  VisibleRegion,
} from '../types/graph';

const DEFAULT_COLLAPSED_RADIUS = 36;

/**
 * Finds the outermost collapsed ancestor region for a given starting regionId.
 * Returns null if neither the starting region nor any ancestor is collapsed.
 */
function findOutermostCollapsedRegion(
  startRegionId: string | null,
  regionMap: Map<string, RegionNode>,
): RegionNode | null {
  let currentId = startRegionId;
  let outermostCollapsed: RegionNode | null = null;
  const visited = new Set<string>();

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const region = regionMap.get(currentId);
    if (!region) {
      break;
    }
    if (region.collapsed) {
      outermostCollapsed = region;
    }
    currentId = region.parentId;
  }

  return outermostCollapsed;
}

/**
 * Pure projection from UnderlyingGraph (StateMachineDocument) to VisibleGraph.
 *
 * - Expanded regions render as dotted boundaries with their internal nodes/edges.
 * - Collapsed regions render as standard circular proxy nodes, hiding internal
 *   nodes, sub-regions, and internal edges while redirecting cross-boundary edges
 *   to the outermost collapsed ancestor region.
 * - Does not mutate the input document.
 */
export function projectVisibleGraph(doc: StateMachineDocument): VisibleGraph {
  const regionMap = new Map<string, RegionNode>(doc.regions.map((r) => [r.id, r]));
  const nodeMap = new Map(doc.nodes.map((n) => [n.id, n]));

  const visibleRegions: VisibleRegion[] = [];
  const visibleNodes: VisibleNode[] = [];

  for (const region of doc.regions) {
    const collapsedAncestor = findOutermostCollapsedRegion(region.parentId, regionMap);
    if (collapsedAncestor) {
      // Hidden because an ancestor region is collapsed.
      continue;
    }

    if (region.collapsed) {
      const radius = region.collapsedRadius ?? DEFAULT_COLLAPSED_RADIUS;
      const center = region.collapsedPosition ?? {
        x: region.x + region.width / 2,
        y: region.y + region.height / 2,
      };
      visibleNodes.push({
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
      });
    } else {
      visibleRegions.push({
        id: region.id,
        label: region.label,
        parentId: region.parentId,
        x: region.x,
        y: region.y,
        width: region.width,
        height: region.height,
      });
    }
  }

  for (const node of doc.nodes) {
    const collapsedAncestor = findOutermostCollapsedRegion(node.regionId, regionMap);
    if (collapsedAncestor) {
      // Hidden inside a collapsed region.
      continue;
    }

    visibleNodes.push({
      id: node.id,
      label: node.label,
      kind: 'state',
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      regionId: node.regionId,
      isUserCreated: node.isUserCreated,
    });
  }

  const visibleEdges: VisibleEdge[] = [];

  for (const edge of doc.edges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) {
      continue;
    }

    const srcCollapsed = findOutermostCollapsedRegion(srcNode.regionId, regionMap);
    const tgtCollapsed = findOutermostCollapsedRegion(tgtNode.regionId, regionMap);

    const displaySource = srcCollapsed ? srcCollapsed.id : edge.source;
    const displayTarget = tgtCollapsed ? tgtCollapsed.id : edge.target;

    // Both endpoints belong to the same collapsed region -> internal edge, hide it.
    if (srcCollapsed && tgtCollapsed && srcCollapsed.id === tgtCollapsed.id) {
      continue;
    }

    const isRedirected = Boolean(srcCollapsed || tgtCollapsed);

    visibleEdges.push({
      id: edge.id,
      originalSource: edge.source,
      originalTarget: edge.target,
      displaySource,
      displayTarget,
      label: edge.label,
      // When redirected to a collapsed circular proxy, render a clean direct path
      // while leaving UnderlyingGraph's original waypoints untouched for expand().
      waypoints: isRedirected ? [] : edge.waypoints.map((p) => ({ x: p.x, y: p.y })),
      isRedirected,
      isUserCreated: edge.isUserCreated,
    });
  }

  return {
    nodes: visibleNodes,
    edges: visibleEdges,
    regions: visibleRegions,
  };
}
