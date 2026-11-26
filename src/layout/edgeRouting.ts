import type { Point, TransitionEdge } from '../types/graph';
import type { LayoutBox, LayoutSettings } from './sugiyama';

const EPSILON = 1e-8;

export function center(box: LayoutBox): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function countRouteCrossings(path: readonly Point[], others: Iterable<readonly Point[]>): number {
  const side = (a: Point, b: Point, p: Point) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  const opposite = (a: number, b: number) => (a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON);
  let count = 0;
  for (const other of others) {
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      for (let j = 1; j < other.length; j++) {
        const [c, d] = [other[j - 1], other[j]];
        if (opposite(side(a, b, c), side(a, b, d)) && opposite(side(c, d, a), side(c, d, b))) count++;
      }
    }
  }
  return count;
}

function hitsBox(from: Point, to: Point, box: LayoutBox): boolean {
  let enter = 0;
  let leave = 1;
  for (const [a, b, min, max] of [
    [from.x, to.x, box.x, box.x + box.width],
    [from.y, to.y, box.y, box.y + box.height],
  ]) {
    const delta = b - a;
    if (Math.abs(delta) < EPSILON) {
      if (a <= min + EPSILON || a >= max - EPSILON) return false;
      continue;
    }
    const first = (min - a) / delta;
    const last = (max - a) / delta;
    enter = Math.max(enter, Math.min(first, last));
    leave = Math.min(leave, Math.max(first, last));
    if (leave - enter < EPSILON) return false;
  }
  return true;
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

  // Search the orthogonal grid formed by obstacle boundaries. Grid edges are
  // checked on demand, which also works when padded obstacles touch or overlap.
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap((box) => [box.x, box.x + box.width])])]
    .sort((a, b) => a - b);
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap((box) => [box.y, box.y + box.height])])]
    .sort((a, b) => a - b);
  const startId = ys.indexOf(start.y) * xs.length + xs.indexOf(start.x);
  const endId = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x);
  const pointAt = (id: number) => ({ x: xs[id % xs.length], y: ys[Math.floor(id / xs.length)] });
  const previous = new Map<number, number>([[startId, startId]]);
  const queue = [startId];
  for (let i = 0; i < queue.length && !previous.has(endId); i++) {
    const id = queue[i];
    const x = id % xs.length;
    const y = Math.floor(id / xs.length);
    const point = pointAt(id);
    const moves = [[x + Math.sign(end.x - point.x), y], [x, y + Math.sign(end.y - point.y)],
      [x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]];
    for (const [nextX, nextY] of moves) {
      if (nextX < 0 || nextX >= xs.length || nextY < 0 || nextY >= ys.length) continue;
      const next = nextY * xs.length + nextX;
      if (previous.has(next) || !clear(point, pointAt(next), obstacles)) continue;
      previous.set(next, id);
      queue.push(next);
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
  lane: { feedback: boolean; alternateSide?: boolean; parallelIndex: number; parallelCount: number },
): Point[] {
  const { source, target, guides, blockers, bounds } = geometry;
  const { feedback, alternateSide, parallelIndex, parallelCount } = lane;
  const start = center(source);
  const end = center(target);
  const horizontal = settings.direction === 'LR';
  const clearance = Math.min(5, settings.nodeSpacing / 5, settings.layerSpacing / 5, settings.regionPadding / 2);
  const obstacles = blockers.map((box) => ({
    x: box.x - clearance, y: box.y - clearance,
    width: box.width + 2 * clearance, height: box.height + 2 * clearance,
  }));

  let controls: Point[] = [...guides];
  if (edge.source === edge.target) {
    const lane = Math.min(settings.layerSpacing, settings.nodeSpacing, settings.regionPadding)
      * (parallelIndex + 1) / (parallelCount + 1);
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
    const offset = settings.regionPadding * (0.25 + 0.5 * parallelIndex / parallelCount);
    const gap = Math.min(settings.layerSpacing, settings.regionPadding) / 2;
    if (horizontal) {
      const right = source.x + source.width + gap;
      const left = target.x - gap;
      const lane = alternateSide ? bounds.y + bounds.height + offset : bounds.y - offset;
      controls = [{ x: right, y: start.y }, { x: right, y: lane }, { x: left, y: lane }, { x: left, y: end.y }];
    } else {
      const bottom = source.y + source.height + gap;
      const top = target.y - gap;
      const lane = alternateSide ? bounds.x + bounds.width + offset : bounds.x - offset;
      controls = [{ x: start.x, y: bottom }, { x: lane, y: bottom }, { x: lane, y: top }, { x: end.x, y: top }];
    }
  } else if (parallelCount > 1 && !controls.length) {
    const offset = (parallelIndex - (parallelCount - 1) / 2) * Math.min(12, settings.nodeSpacing / parallelCount);
    controls = [{ x: (start.x + end.x) / 2 + (horizontal ? 0 : offset),
      y: (start.y + end.y) / 2 + (horizontal ? offset : 0) }];
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
