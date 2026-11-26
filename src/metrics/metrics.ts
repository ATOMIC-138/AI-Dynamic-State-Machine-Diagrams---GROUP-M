import { projectVisibleGraph } from '../model/visibleProjection';
import type {
  LayoutComparison,
  LayoutMetrics,
  Point,
  StateMachineDocument,
  VisibleNode,
} from '../types/graph';

const EPS = 1e-6;

interface EdgeSegment {
  edgeId: string;
  p1: Point;
  p2: Point;
}

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

/**
 * Returns true if open segments (a, b) and (c, d) strictly intersect at an interior point.
 * Shared endpoints are NOT counted as crossings.
 */
function segmentsProperlyIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  if (pointsEqual(a, c) || pointsEqual(a, d) || pointsEqual(b, c) || pointsEqual(b, d)) {
    return false;
  }

  // Quick AABB rejection
  if (
    Math.max(a.x, b.x) < Math.min(c.x, d.x) - EPS ||
    Math.max(c.x, d.x) < Math.min(a.x, b.x) - EPS ||
    Math.max(a.y, b.y) < Math.min(c.y, d.y) - EPS ||
    Math.max(c.y, d.y) < Math.min(a.y, b.y) - EPS
  ) {
    return false;
  }

  const o1 = cross(a, b, c);
  const o2 = cross(a, b, d);
  const o3 = cross(c, d, a);
  const o4 = cross(c, d, b);

  return (
    ((o1 > EPS && o2 < -EPS) || (o1 < -EPS && o2 > EPS)) &&
    ((o3 > EPS && o4 < -EPS) || (o3 < -EPS && o4 > EPS))
  );
}

function nodeCenter(node: VisibleNode): Point {
  return {
    x: node.x + node.width / 2,
    y: node.y + node.height / 2,
  };
}

function segmentLength(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function isNonCollinearBend(prev: Point, curr: Point, next: Point): boolean {
  const len1 = segmentLength(prev, curr);
  const len2 = segmentLength(curr, next);
  if (len1 <= EPS || len2 <= EPS) {
    return false;
  }
  const sinAngle = Math.abs(cross(prev, curr, next)) / (len1 * len2);
  return sinAngle > 1e-3;
}

function nodesOverlap(a: VisibleNode, b: VisibleNode): boolean {
  return (
    a.x < b.x + b.width - EPS &&
    a.x + a.width > b.x + EPS &&
    a.y < b.y + b.height - EPS &&
    a.y + a.height > b.y + EPS
  );
}

/**
 * Independently evaluates a laid-out StateMachineDocument using objective geometric metrics.
 * Evaluates the VisibleGraph projection so both expanded and collapsed views are supported.
 */
export function evaluateLayout(doc: StateMachineDocument): LayoutMetrics {
  const visible = projectVisibleGraph(doc);
  const nodeMap = new Map<string, VisibleNode>(visible.nodes.map((n) => [n.id, n]));

  // 1. Node overlaps
  let nodeOverlaps = 0;
  for (let i = 0; i < visible.nodes.length; i++) {
    for (let j = i + 1; j < visible.nodes.length; j++) {
      if (nodesOverlap(visible.nodes[i], visible.nodes[j])) {
        nodeOverlaps++;
      }
    }
  }

  // 2. Build edge polylines, compute totalEdgeLength, totalBends, and collect segments
  const segments: EdgeSegment[] = [];
  let totalEdgeLength = 0;
  let totalBends = 0;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  const includeRect = (x: number, y: number, w: number, h: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  };

  const includePoint = (p: Point) => {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  };

  for (const n of visible.nodes) {
    includeRect(n.x, n.y, n.width, n.height);
  }
  for (const r of visible.regions) {
    includeRect(r.x, r.y, r.width, r.height);
  }

  for (const edge of visible.edges) {
    const src = nodeMap.get(edge.displaySource);
    const tgt = nodeMap.get(edge.displayTarget);
    if (!src || !tgt) {
      continue;
    }

    const polyline: Point[] = [
      nodeCenter(src),
      ...edge.waypoints,
      nodeCenter(tgt),
    ];

    for (const wp of edge.waypoints) {
      includePoint(wp);
    }

    for (let i = 0; i < polyline.length - 1; i++) {
      const p1 = polyline[i];
      const p2 = polyline[i + 1];
      const len = segmentLength(p1, p2);
      totalEdgeLength += len;
      if (len > EPS) {
        segments.push({ edgeId: edge.id, p1, p2 });
      }
    }

    for (let i = 1; i < polyline.length - 1; i++) {
      if (isNonCollinearBend(polyline[i - 1], polyline[i], polyline[i + 1])) {
        totalBends++;
      }
    }
  }

  // 3. Edge crossings (only between segments of distinct edges)
  let edgeCrossings = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].edgeId === segments[j].edgeId) {
        continue;
      }
      if (
        segmentsProperlyIntersect(
          segments[i].p1,
          segments[i].p2,
          segments[j].p1,
          segments[j].p2,
        )
      ) {
        edgeCrossings++;
      }
    }
  }

  const hasBounds = Number.isFinite(minX) && Number.isFinite(minY);
  const boundingWidth = hasBounds ? Math.max(0, maxX - minX) : 0;
  const boundingHeight = hasBounds ? Math.max(0, maxY - minY) : 0;
  const boundingArea = boundingWidth * boundingHeight;
  const aspectRatio =
    boundingHeight > EPS ? boundingWidth / boundingHeight : boundingWidth > EPS ? boundingWidth : 0;

  return {
    edgeCrossings,
    nodeOverlaps,
    totalEdgeLength: Number(totalEdgeLength.toFixed(2)),
    totalBends,
    boundingWidth: Number(boundingWidth.toFixed(2)),
    boundingHeight: Number(boundingHeight.toFixed(2)),
    boundingArea: Number(boundingArea.toFixed(2)),
    aspectRatio: Number(aspectRatio.toFixed(3)),
  };
}

/**
 * Compares baseline (unoptimized) vs. optimized layout results objectively.
 */
export function compareLayouts(
  baselineDoc: StateMachineDocument,
  optimizedDoc: StateMachineDocument,
): LayoutComparison {
  const baseline = evaluateLayout(baselineDoc);
  const optimized = evaluateLayout(optimizedDoc);
  const crossingReductionCount = baseline.edgeCrossings - optimized.edgeCrossings;
  const crossingReductionPercent =
    baseline.edgeCrossings > 0
      ? Number(((crossingReductionCount / baseline.edgeCrossings) * 100).toFixed(2))
      : 0;

  return {
    baseline,
    optimized,
    crossingReductionCount,
    crossingReductionPercent,
  };
}
