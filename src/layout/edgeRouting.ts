import type { Point, TransitionEdge } from '../types/graph';
import type { LayoutBox, LayoutSettings } from './sugiyama';

const EPSILON = 1e-8;
const CROSSING_EPSILON = 1e-6;

export function center(box: LayoutBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const sideOf = (a: Point, b: Point, point: Point) =>
  (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
const opposite = (a: number, b: number) => (a > CROSSING_EPSILON && b < -CROSSING_EPSILON)
  || (a < -CROSSING_EPSILON && b > CROSSING_EPSILON);

function insideSegment(point: Point, a: Point, b: Point): boolean {
  return Math.abs(sideOf(a, b, point)) <= EPSILON
    && (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y) < -EPSILON;
}

function crossAtSharedWaypoint(point: Point, a: Point, b: Point, c: Point, d: Point): boolean {
  const angle = (end: Point) => Math.atan2(end.y - point.y, end.x - point.x);
  const start = Math.min(angle(a), angle(b));
  const end = Math.max(angle(a), angle(b));
  const onBoundary = (value: number) => [start, end].some((limit) => {
    const distance = Math.abs(value - limit);
    return Math.min(distance, Math.PI * 2 - distance) < EPSILON;
  });
  const ca = angle(c);
  const da = angle(d);
  return !onBoundary(ca) && !onBoundary(da) && ((ca > start && ca < end) !== (da > start && da < end));
}

export function countRouteCrossings(path: readonly Point[], others: Iterable<readonly Point[]>) {
  let segmentInteriors = 0;
  let waypoints = 0;
  for (const other of others) {
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      for (let j = 1; j < other.length; j++) {
        const [c, d] = [other[j - 1], other[j]];
        if (Math.max(a.x, b.x) < Math.min(c.x, d.x) || Math.max(c.x, d.x) < Math.min(a.x, b.x)
          || Math.max(a.y, b.y) < Math.min(c.y, d.y) || Math.max(c.y, d.y) < Math.min(a.y, b.y)) continue;
        if (opposite(sideOf(a, b, c), sideOf(a, b, d)) && opposite(sideOf(c, d, a), sideOf(c, d, b))) {
          segmentInteriors++;
        } else if (i + 1 < path.length && insideSegment(b, c, d)
          && opposite(sideOf(c, d, a), sideOf(c, d, path[i + 1]))) {
          waypoints++;
        } else if (j + 1 < other.length && insideSegment(d, a, b)
          && opposite(sideOf(a, b, c), sideOf(a, b, other[j + 1]))) {
          waypoints++;
        } else if (i + 1 < path.length && j + 1 < other.length
          && Math.abs(b.x - d.x) < EPSILON && Math.abs(b.y - d.y) < EPSILON
          && crossAtSharedWaypoint(b, a, path[i + 1], c, other[j + 1])) {
          waypoints++;
        }
      }
    }
  }
  return { total: segmentInteriors + waypoints, segmentInteriors };
}

function hitsBox(from: Point, to: Point, box: LayoutBox): boolean {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (Math.max(from.x, to.x) <= box.x || Math.min(from.x, to.x) >= right
    || Math.max(from.y, to.y) <= box.y || Math.min(from.y, to.y) >= bottom) return false;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) < EPSILON || Math.abs(dy) < EPSILON) return true;
  const x1 = (box.x - from.x) / dx;
  const x2 = (right - from.x) / dx;
  const y1 = (box.y - from.y) / dy;
  const y2 = (bottom - from.y) / dy;
  return Math.min(1, Math.max(x1, x2), Math.max(y1, y2))
    - Math.max(0, Math.min(x1, x2), Math.min(y1, y2)) > EPSILON;
}

function clear(from: Point, to: Point, obstacles: readonly LayoutBox[]): boolean {
  return obstacles.every((box) => !hitsBox(from, to, box));
}

function inside(point: Point, box: LayoutBox): boolean {
  return point.x > box.x + EPSILON && point.x < box.x + box.width - EPSILON
    && point.y > box.y + EPSILON && point.y < box.y + box.height - EPSILON;
}

function detour(start: Point, end: Point, obstacles: readonly LayoutBox[]): Point[] | undefined {
  if (clear(start, end, obstacles)) return [];
  const elbows = [{ x: start.x, y: end.y }, { x: end.x, y: start.y }];
  for (const elbow of elbows) {
    if (clear(start, elbow, obstacles) && clear(elbow, end, obstacles)) return [elbow];
  }

  const margin = 32;
  const left = Math.min(start.x, end.x) - margin;
  const right = Math.max(start.x, end.x) + margin;
  const top = Math.min(start.y, end.y) - margin;
  const bottom = Math.max(start.y, end.y) + margin;
  const nearby = obstacles.filter((box) => box.x <= right && box.x + box.width >= left
    && box.y <= bottom && box.y + box.height >= top);
  if (nearby.length < obstacles.length) {
    const local = gridRoute(start, end, nearby);
    if (local && [...local, end].every((point, index) => clear(index ? local[index - 1] : start, point, obstacles))) {
      return local;
    }
  }
  return gridRoute(start, end, obstacles);
}

interface GridVisit { id: number; distance: number; priority: number }

function gridRoute(start: Point, end: Point, obstacles: readonly LayoutBox[]): Point[] | undefined {
  // Search the orthogonal grid formed by obstacle boundaries. Grid edges are
  // checked on demand, which also works when padded obstacles touch or overlap.
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((box) => [box.x, box.x + box.width])])]
    .sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap((box) => [box.y, box.y + box.height])])]
    .sort((a, b) => a - b);
  const startId = ys.indexOf(start.y) * xs.length + xs.indexOf(start.x);
  const endId = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x);
  const pointAt = (id: number) => ({ x: xs[id % xs.length], y: ys[Math.floor(id / xs.length)] });
  const remaining = (point: Point) => Math.abs(end.x - point.x) + Math.abs(end.y - point.y);
  const previous = new Map<number, number>([[startId, startId]]);
  const distances = new Map<number, number>([[startId, 0]]);
  const queue: GridVisit[] = [{ id: startId, distance: 0, priority: remaining(start) }];
  while (queue.length) {
    const { id, distance } = queue[0];
    const last = queue.pop()!;
    if (queue.length) {
      let index = 0;
      for (let child = 1; child < queue.length; child = 2 * index + 1) {
        if (child + 1 < queue.length && queue[child + 1].priority < queue[child].priority) child++;
        if (queue[child].priority >= last.priority) break;
        queue[index] = queue[child];
        index = child;
      }
      queue[index] = last;
    }
    if (id === endId) break;
    if (distance !== distances.get(id)) continue;
    const x = id % xs.length;
    const y = Math.floor(id / xs.length);
    const point = pointAt(id);
    const moves = [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nextX, nextY] of moves) {
      if (nextX < 0 || nextX >= xs.length || nextY < 0 || nextY >= ys.length) continue;
      const next = nextY * xs.length + nextX;
      const nextPoint = pointAt(next);
      const cost = distance + Math.abs(point.x - nextPoint.x) + Math.abs(point.y - nextPoint.y);
      if (cost >= (distances.get(next) ?? Infinity) || !clear(point, nextPoint, obstacles)) continue;
      previous.set(next, id);
      distances.set(next, cost);
      // A slightly higher weight favors moving toward the destination on broad grids.
      const visit = { id: next, distance: cost, priority: cost + 1.1 * remaining(nextPoint) };
      let index = queue.length;
      queue.push(visit);
      while (index > 0) {
        const parent = (index - 1) >> 1;
        if (queue[parent].priority <= visit.priority) break;
        queue[index] = queue[parent];
        index = parent;
      }
      queue[index] = visit;
    }
  }

  if (!previous.has(endId)) return undefined;
  const result: Point[] = [];
  for (let id = previous.get(endId)!; id !== startId; id = previous.get(id)!) result.push(pointAt(id));
  return result.reverse();
}

function simplify(points: Point[]): Point[] {
  const kept: Point[] = [];
  for (const point of points) {
    const last = kept.at(-1);
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < EPSILON) continue;
    while (kept.length >= 2) {
      const a = kept[kept.length - 2];
      const b = kept[kept.length - 1];
      const u = { x: b.x - a.x, y: b.y - a.y };
      const v = { x: point.x - b.x, y: point.y - b.y };
      if (Math.abs(u.x * v.y - u.y * v.x) > EPSILON || u.x * v.x + u.y * v.y < 0) break;
      kept.pop();
    }
    kept.push(point);
  }
  return kept.slice(1, -1);
}

export function routeEdge(
  edge: TransitionEdge,
  geometry: { source: LayoutBox; target: LayoutBox; guides: readonly Point[]; blockers: readonly LayoutBox[]; bounds: LayoutBox },
  settings: LayoutSettings,
  lane: { feedback?: Lane; alternateSide?: boolean; parallel: Lane },
): Point[] {
  const { source, target, guides, blockers, bounds } = geometry;
  const { feedback, alternateSide, parallel } = lane;
  const start = center(source);
  const end = center(target);
  const horizontal = settings.direction === 'LR';
  const clearance = Math.min(5, settings.nodeSpacing / 5, settings.layerSpacing / 5, settings.regionPadding / 2);
  const obstacles = blockers.map((box) => ({
    x: box.x - clearance, y: box.y - clearance,
    width: box.width + 2 * clearance, height: box.height + 2 * clearance,
  }));

  let controls: Point[] = [...guides];
  const crossAxis = horizontal ? 'y' : 'x';
  const mainAxis = horizontal ? 'x' : 'y';
  const depth = horizontal ? 'width' : 'height';
  const breadth = horizontal ? 'height' : 'width';
  const fraction = (item: Lane) => (item.index + 1) / (item.count + 1);
  if (edge.source === edge.target) {
    const lane = Math.min(settings.layerSpacing, settings.nodeSpacing, settings.regionPadding)
      * fraction(parallel);
    if (horizontal) {
      const right = source.x + source.width + lane;
      const top = source.y - lane;
      controls = [{ x: right, y: start.y }, { x: right, y: top }, { x: start.x, y: top }];
    } else {
      const bottom = source.y + source.height + lane;
      const left = source.x - lane;
      controls = [{ x: start.x, y: bottom }, { x: left, y: bottom }, { x: left, y: start.y }];
    }
  } else if (feedback) {
    const share = fraction(feedback);
    const offset = settings.regionPadding * (0.2 + 0.65 * share);
    const gap = Math.min(settings.layerSpacing, settings.regionPadding) * (0.2 + 0.6 * share);
    const rail = alternateSide ? bounds[crossAxis] + bounds[breadth] + offset : bounds[crossAxis] - offset;
    const leave = { ...start, [mainAxis]: source[mainAxis] + source[depth] + gap,
      [crossAxis]: start[crossAxis] + source[breadth] * (share - 0.5) * 0.6 };
    const arrive = { ...end, [mainAxis]: target[mainAxis] - gap,
      [crossAxis]: end[crossAxis] + target[breadth] * (share - 0.5) * 0.6 };
    controls = [leave, { ...leave, [crossAxis]: rail }, { ...arrive, [crossAxis]: rail }, arrive];
  } else if (parallel.count > 1) {
    // Distinct ports keep parallel routes identifiable even if their middle detour is shared.
    const share = fraction(parallel) - 0.5;
    const direction = Math.sign(end[mainAxis] - start[mainAxis]) || 1;
    const gap = Math.min(settings.layerSpacing, settings.nodeSpacing, settings.regionPadding) / 10;
    const port = (box: LayoutBox, point: Point, side: number): Point => ({
      ...point,
      [mainAxis]: point[mainAxis] + side * (box[depth] / 2 + gap),
      [crossAxis]: point[crossAxis] + box[breadth] * share * 0.8,
    });
    controls = [port(source, start, direction), ...controls, port(target, end, -direction)];
  }

  const points = [start, ...controls.filter((point) => obstacles.every((box) => !inside(point, box))), end];
  const path = [start];
  for (let i = 1; i < points.length; i++) {
    const from = points[i - 1];
    const to = points[i];
    const bends = detour(from, to, obstacles) ?? detour(from, to, blockers);
    if (!bends) throw new Error(`No route between the endpoints of edge ${edge.id}`);
    path.push(...bends, to);
  }
  return simplify(path);
}

interface Lane { index: number; count: number }
