import { projectVisibleGraph } from '../model/visibleProjection';
import type {
  LayoutComparison,
  LayoutMetrics,
  Point,
  StateMachineDocument,
  VisibleNode,
} from '../types/graph';

const EPS = 1e-6;

function pointsEqual(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) <= EPS && Math.abs(a.y - b.y) <= EPS;
}

function cross(o: Point, a: Point, b: Point): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function dot(a: Point, b: Point): number {
  return a.x * b.x + a.y * b.y;
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

/**
 * Returns true if point curr is strictly collinear with prev -> next within EPS
 * perpendicular distance and advances in the same direction (not a 180-degree reversal).
 */
function isStrictlyCollinearForward(prev: Point, curr: Point, next: Point): boolean {
  const chordLen = segmentLength(prev, next);
  if (chordLen <= EPS) {
    return false;
  }
  const perpDist = Math.abs(cross(prev, next, curr)) / chordLen;
  if (perpDist > EPS) {
    return false;
  }
  const v1 = { x: curr.x - prev.x, y: curr.y - prev.y };
  const v2 = { x: next.x - curr.x, y: next.y - curr.y };
  return dot(v1, v2) > EPS;
}

/**
 * Simplifies a polyline by removing duplicate adjacent points and strictly collinear
 * intermediate points (using perpendicular distance <= EPS, NOT the bend-angle threshold),
 * so shallow-angle bends that deviate from a straight line are preserved for crossing detection.
 */
function simplifyPolyline(points: Point[]): Point[] {
  const deduped: Point[] = [];
  for (const p of points) {
    if (deduped.length === 0 || !pointsEqual(deduped[deduped.length - 1], p)) {
      deduped.push(p);
    }
  }
  if (deduped.length <= 2) {
    return deduped;
  }

  const simplified: Point[] = [deduped[0]];
  for (let i = 1; i < deduped.length - 1; i++) {
    const prev = simplified[simplified.length - 1];
    const curr = deduped[i];
    const next = deduped[i + 1];
    if (!isStrictlyCollinearForward(prev, curr, next)) {
      simplified.push(curr);
    }
  }
  simplified.push(deduped[deduped.length - 1]);
  return simplified;
}

/**
 * Returns true if open segments (a, b) and (c, d) strictly intersect at an interior point.
 */
function segmentsProperlyIntersect(a: Point, b: Point, c: Point, d: Point): boolean {
  if (pointsEqual(a, c) || pointsEqual(a, d) || pointsEqual(b, c) || pointsEqual(b, d)) {
    return false;
  }

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

/**
 * Returns true if point p lies strictly inside open segment (a, b).
 */
function pointStrictlyOnSegment(p: Point, a: Point, b: Point): boolean {
  if (pointsEqual(p, a) || pointsEqual(p, b)) {
    return false;
  }
  const len = segmentLength(a, b);
  if (len <= EPS) {
    return false;
  }
  // Perpendicular distance from p to line (a, b)
  const dist = Math.abs(cross(a, b, p)) / len;
  if (dist > EPS) {
    return false;
  }
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const proj = dot(ap, ab) / (len * len);
  return proj > EPS && proj < 1 - EPS;
}

/**
 * Returns true if segments (a, b) and (c, d) are collinear and overlap with positive length.
 */
function segmentsCollinearOverlap(a: Point, b: Point, c: Point, d: Point): boolean {
  const lenAB = segmentLength(a, b);
  const lenCD = segmentLength(c, d);
  if (lenAB <= EPS || lenCD <= EPS) {
    return false;
  }

  if (Math.abs(cross(a, b, c)) / lenAB > EPS || Math.abs(cross(a, b, d)) / lenAB > EPS) {
    return false;
  }

  // Project onto unit direction of AB
  const ux = (b.x - a.x) / lenAB;
  const uy = (b.y - a.y) / lenAB;
  const tc = (c.x - a.x) * ux + (c.y - a.y) * uy;
  const td = (d.x - a.x) * ux + (d.y - a.y) * uy;

  const overlapStart = Math.max(0, Math.min(tc, td));
  const overlapEnd = Math.min(lenAB, Math.max(tc, td));
  return overlapEnd - overlapStart > EPS;
}

/**
 * Returns true if two paths meeting at a shared interior vertex W genuinely cross
 * (their incident ray directions alternate cyclically around W).
 */
function raysAlternateAtVertex(
  w: Point,
  pPrev: Point,
  pNext: Point,
  qPrev: Point,
  qNext: Point,
): boolean {
  const normalizeAngle = (from: Point, to: Point) => {
    const a = Math.atan2(to.y - from.y, to.x - from.x);
    return a < 0 ? a + Math.PI * 2 : a;
  };
  const a1 = normalizeAngle(w, pPrev);
  const a2 = normalizeAngle(w, pNext);
  const b1 = normalizeAngle(w, qPrev);
  const b2 = normalizeAngle(w, qNext);

  // If any ray coincides with another ray from the other polyline, collinear overlap handles it
  const angleClose = (x: number, y: number) => {
    const diff = Math.abs(x - y);
    return Math.min(diff, Math.PI * 2 - diff) < 1e-3;
  };
  if (
    angleClose(a1, b1) ||
    angleClose(a1, b2) ||
    angleClose(a2, b1) ||
    angleClose(a2, b2)
  ) {
    return false;
  }

  const low = Math.min(a1, a2);
  const high = Math.max(a1, a2);
  const b1Between = b1 > low && b1 < high;
  const b2Between = b2 > low && b2 < high;
  return b1Between !== b2Between;
}

/**
 * Counts crossings and collinear segment overlaps between two distinct edge polylines.
 * Handles:
 * 1. Proper interior-to-interior segment intersections.
 * 2. One edge crossing directly through an interior bend waypoint of the other.
 * 3. Two edges crossing through a shared interior waypoint.
 * 4. Positive-length collinear overlapping segments between distinct edges.
 */
function countPolylineCrossings(rawP: Point[], rawQ: Point[]): number {
  const P = simplifyPolyline(rawP);
  const Q = simplifyPolyline(rawQ);
  if (P.length < 2 || Q.length < 2) {
    return 0;
  }

  let count = 0;

  // 1 & 4. Segment-pair proper intersections and positive-length collinear overlaps
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < Q.length - 1; j++) {
      if (
        segmentsProperlyIntersect(P[i], P[i + 1], Q[j], Q[j + 1]) ||
        segmentsCollinearOverlap(P[i], P[i + 1], Q[j], Q[j + 1])
      ) {
        count++;
      }
    }
  }

  // 2a. Interior waypoint of P strictly on a segment of Q (crossing to opposite side)
  for (let i = 1; i < P.length - 1; i++) {
    for (let j = 0; j < Q.length - 1; j++) {
      if (pointStrictlyOnSegment(P[i], Q[j], Q[j + 1])) {
        const oPrev = cross(Q[j], Q[j + 1], P[i - 1]);
        const oNext = cross(Q[j], Q[j + 1], P[i + 1]);
        if ((oPrev > EPS && oNext < -EPS) || (oPrev < -EPS && oNext > EPS)) {
          count++;
        }
      }
    }
  }

  // 2b. Interior waypoint of Q strictly on a segment of P (crossing to opposite side)
  for (let j = 1; j < Q.length - 1; j++) {
    for (let i = 0; i < P.length - 1; i++) {
      if (pointStrictlyOnSegment(Q[j], P[i], P[i + 1])) {
        const oPrev = cross(P[i], P[i + 1], Q[j - 1]);
        const oNext = cross(P[i], P[i + 1], Q[j + 1]);
        if ((oPrev > EPS && oNext < -EPS) || (oPrev < -EPS && oNext > EPS)) {
          count++;
        }
      }
    }
  }

  // 3. Shared interior waypoint between P and Q
  for (let i = 1; i < P.length - 1; i++) {
    for (let j = 1; j < Q.length - 1; j++) {
      if (
        pointsEqual(P[i], Q[j]) &&
        raysAlternateAtVertex(P[i], P[i - 1], P[i + 1], Q[j - 1], Q[j + 1])
      ) {
        count++;
      }
    }
  }

  return count;
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
 *
 * Note on `nodeOverlaps`: intentionally counts overlaps between visible node entities
 * (`StateNode` boxes and collapsed region circular proxies), excluding expanded dotted
 * region container frames (which naturally enclose their descendant nodes).
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

  // 2. Build edge polylines, compute totalEdgeLength and totalBends
  const polylines: Point[][] = [];
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
      totalEdgeLength += segmentLength(polyline[i], polyline[i + 1]);
    }

    for (let i = 1; i < polyline.length - 1; i++) {
      if (isNonCollinearBend(polyline[i - 1], polyline[i], polyline[i + 1])) {
        totalBends++;
      }
    }

    polylines.push(polyline);
  }

  // 3. Edge crossings across all distinct edge pairs
  let edgeCrossings = 0;
  for (let i = 0; i < polylines.length; i++) {
    for (let j = i + 1; j < polylines.length; j++) {
      edgeCrossings += countPolylineCrossings(polylines[i], polylines[j]);
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
