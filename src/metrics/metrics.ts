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

function crossVec(u: Point, v: Point): number {
  return u.x * v.y - u.y * v.x;
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
  const dist = Math.abs(cross(a, b, p)) / len;
  if (dist > EPS) {
    return false;
  }
  const ap = { x: p.x - a.x, y: p.y - a.y };
  const ab = { x: b.x - a.x, y: b.y - a.y };
  const proj = dot(ap, ab) / (len * len);
  return proj > EPS && proj < 1 - EPS;
}

interface CollinearOverlapInfo {
  dir: 1 | -1;
  unit: Point;
  lenP: number;
  tStart: number;
  tEnd: number;
  ta: number;
  tb: number;
  startPoint: Point;
  endPoint: Point;
}

/**
 * Checks whether segment (a -> b) and segment (c -> d) are collinear and overlap
 * with strictly positive length. Aligns (c, d) in the same travel direction as (a -> b).
 */
function getCollinearOverlap(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): CollinearOverlapInfo | null {
  const lenP = segmentLength(a, b);
  const lenQ = segmentLength(c, d);
  if (lenP <= EPS || lenQ <= EPS) {
    return null;
  }

  if (Math.abs(cross(a, b, c)) / lenP > EPS || Math.abs(cross(a, b, d)) / lenP > EPS) {
    return null;
  }

  const unit = { x: (b.x - a.x) / lenP, y: (b.y - a.y) / lenP };
  const tc = (c.x - a.x) * unit.x + (c.y - a.y) * unit.y;
  const td = (d.x - a.x) * unit.x + (d.y - a.y) * unit.y;

  const dir: 1 | -1 = td > tc ? 1 : -1;
  const ta = dir === 1 ? tc : td;
  const tb = dir === 1 ? td : tc;

  const tStart = Math.max(0, ta);
  const tEnd = Math.min(lenP, tb);
  if (tEnd - tStart <= EPS) {
    return null;
  }

  return {
    dir,
    unit,
    lenP,
    tStart,
    tEnd,
    ta,
    tb,
    startPoint: { x: a.x + unit.x * tStart, y: a.y + unit.y * tStart },
    endPoint: { x: a.x + unit.x * tEnd, y: a.y + unit.y * tEnd },
  };
}

function unitVec(from: Point, to: Point): Point | null {
  const len = segmentLength(from, to);
  if (len <= EPS) {
    return null;
  }
  return { x: (to.x - from.x) / len, y: (to.y - from.y) / len };
}

function sameDirection(u: Point, v: Point): boolean {
  return Math.abs(crossVec(u, v)) <= EPS && dot(u, v) > 0;
}

/**
 * Counter-clockwise angle in [0, 2*PI) from reference unit vector `ref` to vector `vec`.
 */
function ccwAngleFrom(ref: Point, vec: Point): number {
  const angle = Math.atan2(crossVec(ref, vec), dot(ref, vec));
  return angle < 0 ? angle + Math.PI * 2 : angle;
}

/**
 * Returns true if two paths meeting at a shared interior vertex W genuinely cross
 * (their incident ray directions alternate cyclically around W and no two rays coincide).
 */
function raysAlternateAtVertex(
  w: Point,
  pPrev: Point,
  pNext: Point,
  qPrev: Point,
  qNext: Point,
): boolean {
  const up1 = unitVec(w, pPrev);
  const up2 = unitVec(w, pNext);
  const uq1 = unitVec(w, qPrev);
  const uq2 = unitVec(w, qNext);
  if (!up1 || !up2 || !uq1 || !uq2) {
    return false;
  }

  // If any ray coincides with a ray of the other polyline, collinear contact handling covers it.
  if (
    sameDirection(up1, uq1) ||
    sameDirection(up1, uq2) ||
    sameDirection(up2, uq1) ||
    sameDirection(up2, uq2)
  ) {
    return false;
  }

  const normalizeAngle = (u: Point) => {
    const a = Math.atan2(u.y, u.x);
    return a < 0 ? a + Math.PI * 2 : a;
  };
  const a1 = normalizeAngle(up1);
  const a2 = normalizeAngle(up2);
  const b1 = normalizeAngle(uq1);
  const b2 = normalizeAngle(uq2);

  const low = Math.min(a1, a2);
  const high = Math.max(a1, a2);
  const b1Between = b1 > low && b1 < high;
  const b2Between = b2 > low && b2 < high;
  return b1Between !== b2Between;
}

/**
 * Counts crossings from maximal contiguous collinear overlap runs between P and Q.
 *
 * Rules:
 * - A contiguous shared contact interval [S, E] (possibly spanning multiple shared segments)
 *   is evaluated ONCE as a whole.
 * - If [S, E] touches the start or end graph endpoint of EITHER P or Q (e.g. shared-source
 *   branching or shared-target merging), it is NOT a crossing (0).
 * - Otherwise, compare which side of P the polyline Q occupies immediately before S vs
 *   immediately after E; count +1 ONLY if they genuinely swap sides.
 */
function countCollinearContactCrossings(P: Point[], Q: Point[]): number {
  const pSegCount = P.length - 1;
  const qSegCount = Q.length - 1;
  const visited = new Set<string>();
  let crossings = 0;

  const keyOf = (i: number, j: number, dir: 1 | -1) => `${i}:${j}:${dir}`;

  const alignedQSeg = (j: number, dir: 1 | -1): [Point, Point] =>
    dir === 1 ? [Q[j], Q[j + 1]] : [Q[j + 1], Q[j]];

  for (let i = 0; i < pSegCount; i++) {
    for (let j = 0; j < qSegCount; j++) {
      const base = getCollinearOverlap(P[i], P[i + 1], Q[j], Q[j + 1]);
      if (!base) {
        continue;
      }
      const dir = base.dir;
      if (visited.has(keyOf(i, j, dir))) {
        continue;
      }

      // Walk backwards to the beginning of this maximal contiguous shared contact run.
      let i0 = i;
      let j0 = j;
      let startInfo = base;
      while (
        startInfo.tStart <= EPS &&
        Math.abs(startInfo.ta) <= EPS &&
        i0 > 0 &&
        j0 - dir >= 0 &&
        j0 - dir < qSegCount
      ) {
        const prevI = i0 - 1;
        const prevJ = j0 - dir;
        const prevInfo = getCollinearOverlap(P[prevI], P[prevI + 1], Q[prevJ], Q[prevJ + 1]);
        if (
          !prevInfo ||
          prevInfo.dir !== dir ||
          Math.abs(prevInfo.tEnd - prevInfo.lenP) > EPS ||
          Math.abs(prevInfo.tb - prevInfo.lenP) > EPS
        ) {
          break;
        }
        i0 = prevI;
        j0 = prevJ;
        startInfo = prevInfo;
      }

      // Walk forwards to the end of this maximal contiguous shared contact run, marking all visited.
      let i1 = i0;
      let j1 = j0;
      let endInfo = startInfo;
      visited.add(keyOf(i1, j1, dir));
      while (
        Math.abs(endInfo.tEnd - endInfo.lenP) <= EPS &&
        Math.abs(endInfo.tb - endInfo.lenP) <= EPS &&
        i1 + 1 < pSegCount &&
        j1 + dir >= 0 &&
        j1 + dir < qSegCount
      ) {
        const nextI = i1 + 1;
        const nextJ = j1 + dir;
        const nextInfo = getCollinearOverlap(P[nextI], P[nextI + 1], Q[nextJ], Q[nextJ + 1]);
        if (
          !nextInfo ||
          nextInfo.dir !== dir ||
          nextInfo.tStart > EPS ||
          Math.abs(nextInfo.ta) > EPS
        ) {
          break;
        }
        i1 = nextI;
        j1 = nextJ;
        endInfo = nextInfo;
        visited.add(keyOf(i1, j1, dir));
      }

      const S = startInfo.startPoint;
      const E = endInfo.endPoint;
      const [qa0] = alignedQSeg(j0, dir);
      const [, qb1] = alignedQSeg(j1, dir);

      // 1. If contact touches either endpoint of P or Q, it is a branch/merge, not a crossing.
      const touchesPEndpoint =
        (i0 === 0 && pointsEqual(S, P[0])) ||
        (i1 === pSegCount - 1 && pointsEqual(E, P[P.length - 1]));
      const touchesQEndpoint =
        (dir === 1 && j0 === 0 && pointsEqual(S, Q[0])) ||
        (dir === -1 && j0 === qSegCount - 1 && pointsEqual(S, Q[Q.length - 1])) ||
        (dir === 1 && j1 === qSegCount - 1 && pointsEqual(E, Q[Q.length - 1])) ||
        (dir === -1 && j1 === 0 && pointsEqual(E, Q[0]));

      if (touchesPEndpoint || touchesQEndpoint) {
        continue;
      }

      // 2. Determine incoming points immediately before S along P and aligned Q.
      const pPrev = pointsEqual(S, P[i0]) ? P[i0 - 1] : P[i0];
      const qPrev = pointsEqual(S, qa0)
        ? dir === 1
          ? Q[j0 - 1]
          : Q[j0 + 2]
        : qa0;

      // 3. Determine outgoing points immediately after E along P and aligned Q.
      const pNext = pointsEqual(E, P[i1 + 1]) ? P[i1 + 2] : P[i1 + 1];
      const qNext = pointsEqual(E, qb1)
        ? dir === 1
          ? Q[j1 + 2]
          : Q[j1 - 1]
        : qb1;

      const vpIn = unitVec(S, pPrev);
      const vqIn = unitVec(S, qPrev);
      const vpOut = unitVec(E, pNext);
      const vqOut = unitVec(E, qNext);
      if (!vpIn || !vqIn || !vpOut || !vqOut) {
        continue;
      }

      // Angle measured CCW from forward entry direction (+u_entry):
      // angle(vpIn) > angle(vqIn) => Q is on +1 side of P before S; < => -1 side.
      const anglePBefore = ccwAngleFrom(startInfo.unit, vpIn);
      const angleQBefore = ccwAngleFrom(startInfo.unit, vqIn);
      const diffBefore = anglePBefore - angleQBefore;

      // Angle measured CCW from backward exit direction (-u_exit):
      // angle(vqOut) > angle(vpOut) => Q is on +1 side of P after E; < => -1 side.
      const negExitUnit = { x: -endInfo.unit.x, y: -endInfo.unit.y };
      const anglePAfter = ccwAngleFrom(negExitUnit, vpOut);
      const angleQAfter = ccwAngleFrom(negExitUnit, vqOut);
      const diffAfter = angleQAfter - anglePAfter;

      if (
        (diffBefore > EPS && diffAfter < -EPS) ||
        (diffBefore < -EPS && diffAfter > EPS)
      ) {
        crossings++;
      }
    }
  }

  return crossings;
}

/**
 * Counts crossings between two distinct edge polylines.
 * Handles:
 * 1. Proper interior-to-interior segment intersections.
 * 2. One edge crossing directly through an interior bend waypoint of the other.
 * 3. Two edges crossing through a shared interior waypoint.
 * 4. Maximal contiguous collinear contact intervals that genuinely swap sides
 *    (excluding shared-endpoint branches/merges and same-side touches).
 */
function countPolylineCrossings(rawP: Point[], rawQ: Point[]): number {
  const P = simplifyPolyline(rawP);
  const Q = simplifyPolyline(rawQ);
  if (P.length < 2 || Q.length < 2) {
    return 0;
  }

  let count = 0;

  // 1. Segment-pair proper intersections
  for (let i = 0; i < P.length - 1; i++) {
    for (let j = 0; j < Q.length - 1; j++) {
      if (segmentsProperlyIntersect(P[i], P[i + 1], Q[j], Q[j + 1])) {
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

  // 3. Shared interior waypoint between P and Q (no coincident rays)
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

  // 4. Contiguous collinear contact intervals that swap sides
  count += countCollinearContactCrossings(P, Q);

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
  interface BoundedPolyline {
    points: Point[];
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  }
  const polylines: BoundedPolyline[] = [];
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

    const simplified = simplifyPolyline(polyline);
    let pMinX = Number.POSITIVE_INFINITY;
    let pMinY = Number.POSITIVE_INFINITY;
    let pMaxX = Number.NEGATIVE_INFINITY;
    let pMaxY = Number.NEGATIVE_INFINITY;
    for (const p of simplified) {
      if (p.x < pMinX) pMinX = p.x;
      if (p.y < pMinY) pMinY = p.y;
      if (p.x > pMaxX) pMaxX = p.x;
      if (p.y > pMaxY) pMaxY = p.y;
    }
    polylines.push({ points: simplified, minX: pMinX, minY: pMinY, maxX: pMaxX, maxY: pMaxY });
  }

  // 3. Edge crossings across all distinct edge pairs (with O(1) AABB pre-rejection)
  let edgeCrossings = 0;
  for (let i = 0; i < polylines.length; i++) {
    const a = polylines[i];
    for (let j = i + 1; j < polylines.length; j++) {
      const b = polylines[j];
      if (
        a.maxX < b.minX - EPS ||
        b.maxX < a.minX - EPS ||
        a.maxY < b.minY - EPS ||
        b.maxY < a.minY - EPS
      ) {
        continue;
      }
      edgeCrossings += countPolylineCrossings(a.points, b.points);
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
