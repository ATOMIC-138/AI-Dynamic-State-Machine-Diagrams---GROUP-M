import type { Point, TransitionEdge } from '../types/graph';
import type { LayoutBox, LayoutSettings } from './sugiyama';

const EPSILON = 1e-8;
const FEEDBACK_LANE_SPACING = 6;

export function feedbackLaneOffset(index: number, padding: number, loopReach: number): number {
  return Math.max(0.525 * padding, loopReach + FEEDBACK_LANE_SPACING / 2) + index * FEEDBACK_LANE_SPACING;
}

export function selfLoopReach(count: number, settings: LayoutSettings): number {
  return Math.min(settings.layerSpacing, settings.nodeSpacing, settings.regionPadding) * (count / (count + 1));
}

export function center(box: LayoutBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

function hitsBox(from: Point, to: Point, box: LayoutBox): boolean {
  const right = box.x + box.width;
  const bottom = box.y + box.height;
  if (Math.max(from.x, to.x) <= box.x + EPSILON || Math.min(from.x, to.x) >= right - EPSILON
    || Math.max(from.y, to.y) <= box.y + EPSILON || Math.min(from.y, to.y) >= bottom - EPSILON) return false;
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

function padBox(box: LayoutBox, margin: number): LayoutBox {
  return { x: box.x - margin, y: box.y - margin, width: box.width + 2 * margin, height: box.height + 2 * margin };
}

function terminalPort(box: LayoutBox, toward: Point, margin: number, obstacles: readonly LayoutBox[]): Point | undefined {
  const origin = center(box);
  const dx = toward.x - origin.x;
  const dy = toward.y - origin.y;
  const distance = Math.min((box.width / 2 + margin) / Math.abs(dx), (box.height / 2 + margin) / Math.abs(dy));
  const candidates = [
    ...(Number.isFinite(distance) ? [{ x: origin.x + dx * distance, y: origin.y + dy * distance }] : []),
    { x: box.x - margin, y: origin.y }, { x: box.x + box.width + margin, y: origin.y },
    { x: origin.x, y: box.y - margin }, { x: origin.x, y: box.y + box.height + margin },
  ];
  return candidates.find((point) => clear(origin, point, obstacles));
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

function connectGuides(points: readonly Point[], padded: readonly LayoutBox[], unpadded: readonly LayoutBox[]): Point[] | undefined {
  const path = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const bends = detour(points[i - 1], points[i], padded) ?? detour(points[i - 1], points[i], unpadded);
    if (!bends) return undefined;
    path.push(...bends, points[i]);
  }
  return path;
}

function staysOutsideTerminals(path: readonly Point[], source: LayoutBox, target: LayoutBox, loop: boolean): boolean {
  const last = path.length - 1;
  if (last < 2) return !loop;
  // The renderer needs a point beyond the outline to clip each arrow to the correct side.
  if (inside(path[1], padBox(source, 2 * EPSILON)) || inside(path[last - 1], padBox(target, 2 * EPSILON))) return false;
  for (let i = 1; i <= last; i++) {
    if (i !== 1 && !(loop && i === last) && hitsBox(path[i - 1], path[i], source)) return false;
    if (!loop && i !== last && hitsBox(path[i - 1], path[i], target)) return false;
  }
  return true;
}

export function routeEdge(
  edge: TransitionEdge,
  geometry: { source: LayoutBox; target: LayoutBox; guides: readonly Point[]; blockers: readonly LayoutBox[]; bounds: LayoutBox },
  settings: LayoutSettings,
  lane: { feedback?: Lane & { loopReach: number }; alternateSide?: boolean; parallel: Lane },
): Point[] {
  const { source, target, guides, blockers, bounds } = geometry;
  const { feedback, alternateSide, parallel } = lane;
  const start = center(source);
  const end = center(target);
  const horizontal = settings.direction === 'LR';
  const clearance = Math.min(5, settings.nodeSpacing / 5, settings.layerSpacing / 5, settings.regionPadding / 2);
  const obstacles = blockers.map((box) => padBox(box, clearance));

  let controls: Point[] = [...guides];
  const crossAxis = horizontal ? 'y' : 'x';
  const mainAxis = horizontal ? 'x' : 'y';
  const depth = horizontal ? 'width' : 'height';
  const breadth = horizontal ? 'height' : 'width';
  const fraction = (item: Lane) => (item.index + 1) / (item.count + 1);
  if (edge.source === edge.target) {
    const lane = selfLoopReach(parallel.count, settings) * (parallel.index + 1) / parallel.count;
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
    const offset = feedbackLaneOffset(feedback.index, settings.regionPadding, feedback.loopReach);
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

  const loop = edge.source === edge.target;
  const availableGuides = controls.filter((point) => obstacles.every((box) => !inside(point, box)));
  const natural = connectGuides([start, ...availableGuides, end], obstacles, blockers);
  if (natural) {
    const waypoints = simplify(natural);
    if (staysOutsideTerminals([start, ...waypoints, end], source, target, loop)) return waypoints;
  }

  // Only the two center-to-port stubs may cross their own endpoint boxes.
  const margin = clearance / 2;
  const sourceWall = padBox(source, margin);
  const targetWall = loop ? sourceWall : padBox(target, margin);
  const walls = loop ? [sourceWall] : [sourceWall, targetWall];
  const padded = [...obstacles, ...walls];
  const unpadded = [...blockers, ...walls];
  const guidesOutside = availableGuides.filter((point) => walls.every((box) => !inside(point, box)));
  const exitObstacles = loop ? obstacles : [...obstacles, targetWall];
  const entryObstacles = loop ? obstacles : [...obstacles, sourceWall];
  const startDirection = guidesOutside[0] ?? (loop ? controls[0] : end);
  const endDirection = guidesOutside.at(-1) ?? (loop ? controls.at(-1)! : start);
  const exit = guidesOutside.length && clear(start, startDirection, exitObstacles) ? startDirection
    : terminalPort(source, startDirection, clearance, exitObstacles)
    ?? terminalPort(source, startDirection, clearance, loop ? blockers : [...blockers, targetWall]);
  const entry = guidesOutside.length && clear(end, endDirection, entryObstacles) ? endDirection
    : terminalPort(target, endDirection, clearance, entryObstacles)
    ?? terminalPort(target, endDirection, clearance, loop ? blockers : [...blockers, sourceWall]);
  if (!exit || !entry) throw new Error(`No open endpoint for edge ${edge.id}`);

  const path = connectGuides([exit, ...guidesOutside.filter((point) => point !== exit && point !== entry), entry], padded, unpadded);
  if (!path) throw new Error(`No route between the endpoints of edge ${edge.id}`);
  return simplify([start, ...path, end]);
}

interface Lane { index: number; count: number }
