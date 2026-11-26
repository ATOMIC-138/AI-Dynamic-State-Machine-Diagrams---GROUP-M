/** Pure drawing geometry: no React, no document mutation. */
import type { Point, VisibleEdge, VisibleGraph, VisibleNode } from '../types/graph';

/** screen = world * scale + (x, y) */
export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawnEdge {
  edge: VisibleEdge;
  /** Bend points as drawn (a self-loop without any gets a default loop). */
  waypoints: Point[];
  /** Full polyline: source outline, bends, target outline. */
  points: Point[];
}

const MIN_SCALE = 0.2;
const MAX_SCALE = 4;
const SELF_LOOP_HEIGHT = 36;

// (x, y) is the top-left corner for states and regions, and for a collapsed
// circle the top-left of its bounding box. The shared types do not say so;
// Member A's model uses this convention.
export function boxCenter(box: Box): Point {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export function boxContains(box: Box, point: Point): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

export function screenToWorld(view: Viewport, point: Point): Point {
  return { x: (point.x - view.x) / view.scale, y: (point.y - view.y) / view.scale };
}

/** Zoom while the world point under `anchor` (screen coordinates) stays put. */
export function zoomAt(view: Viewport, anchor: Point, factor: number): Viewport {
  const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
  const world = screenToWorld(view, anchor);
  return { scale, x: anchor.x - world.x * scale, y: anchor.y - world.y * scale };
}

/** Center the boxes in a width × height canvas, shrinking (never enlarging) to fit. */
export function fitViewport(boxes: Box[], width: number, height: number, padding = 48): Viewport {
  if (boxes.length === 0 || width <= 0 || height <= 0) return { x: 0, y: 0, scale: 1 };
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const contentWidth = Math.max(1, Math.max(...boxes.map((box) => box.x + box.width)) - left);
  const contentHeight = Math.max(1, Math.max(...boxes.map((box) => box.y + box.height)) - top);
  const scale = Math.max(
    MIN_SCALE,
    Math.min(1, (width - padding * 2) / contentWidth, (height - padding * 2) / contentHeight),
  );
  return {
    scale,
    x: (width - contentWidth * scale) / 2 - left * scale,
    y: (height - contentHeight * scale) / 2 - top * scale,
  };
}

/** Where the line from the node's center towards `toward` leaves the node's outline. */
export function clipToOutline(node: VisibleNode, toward: Point): Point {
  const center = boxCenter(node);
  const dx = toward.x - center.x;
  const dy = toward.y - center.y;
  if (dx === 0 && dy === 0) return center;
  const ratio =
    node.kind === 'collapsed-region'
      ? (node.radius ?? node.width / 2) / Math.hypot(dx, dy)
      : Math.min(node.width / 2 / Math.abs(dx), node.height / 2 / Math.abs(dy));
  // ratio >= 1: `toward` is inside the node, so there is no outline to stop at.
  return ratio >= 1 ? center : { x: center.x + dx * ratio, y: center.y + dy * ratio };
}

export function selfLoopWaypoints(node: Box): Point[] {
  const y = node.y - SELF_LOOP_HEIGHT;
  return [
    { x: node.x + node.width * 0.2, y },
    { x: node.x + node.width * 0.8, y },
  ];
}

/** Midpoint of a–b pushed sideways. Swapping a and b pushes to the other side. */
export function bentMidpoint(a: Point, b: Point, offset: number): Point {
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return {
    x: (a.x + b.x) / 2 - ((b.y - a.y) / length) * offset,
    y: (a.y + b.y) / 2 + ((b.x - a.x) / length) * offset,
  };
}

const LANE_SPACING = 28;

// Collapsing can put several straight edges on the same two shapes, hiding all
// but one. Give each a bend that is drawn only: the data is left alone.
function fanOutRedirected(edges: VisibleEdge[], nodes: Map<string, VisibleNode>): Map<string, Point> {
  const groups = new Map<string, VisibleEdge[]>();
  for (const edge of edges) {
    if (!edge.isRedirected || edge.waypoints.length > 0) continue;
    const key = JSON.stringify([edge.displaySource, edge.displayTarget].sort());
    groups.set(key, [...(groups.get(key) ?? []), edge]);
  }
  const bends = new Map<string, Point>();
  for (const [key, group] of groups) {
    // Measure from the same end for every edge, whichever way each one points.
    const [a, b] = (JSON.parse(key) as string[]).map((id) => nodes.get(id));
    if (group.length < 2 || !a || !b) continue;
    group.forEach((edge, i) => {
      const offset = (i - (group.length - 1) / 2) * LANE_SPACING;
      bends.set(edge.id, bentMidpoint(boxCenter(a), boxCenter(b), offset));
    });
  }
  return bends;
}

export function drawEdges(graph: VisibleGraph): DrawnEdge[] {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const laneBends = fanOutRedirected(graph.edges, nodes);
  return graph.edges.flatMap((edge) => {
    const source = nodes.get(edge.displaySource);
    const target = nodes.get(edge.displayTarget);
    if (!source || !target) return [];
    const waypoints =
      edge.waypoints.length === 0 && source === target ? selfLoopWaypoints(source) : edge.waypoints;
    const laneBend = laneBends.get(edge.id);
    const path = laneBend ? [laneBend] : waypoints;
    const start = clipToOutline(source, path[0] ?? boxCenter(target));
    const end = clipToOutline(target, path[path.length - 1] ?? boxCenter(source));
    return [{ edge, waypoints, points: [start, ...path, end] }];
  });
}

export function polylinePath(points: Point[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ');
}

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/**
 * Index of the polyline segment closest to `point`. For an edge polyline this is
 * also the position in `waypoints` where a new bend at `point` belongs.
 */
export function nearestSegmentIndex(points: Point[], point: Point): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i + 1 < points.length; i++) {
    const distance = distanceToSegment(point, points[i], points[i + 1]);
    if (distance < bestDistance) {
      best = i;
      bestDistance = distance;
    }
  }
  return best;
}
