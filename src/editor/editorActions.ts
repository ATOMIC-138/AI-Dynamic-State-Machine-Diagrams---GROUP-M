/** Document edits the UI performs. Pure functions over the §4 contract. */
import type { Point, StateMachineDocument } from '../types/graph';
import { backend } from './backend';
import { bentMidpoint, boxCenter, boxContains, selfLoopWaypoints } from './geometry';

const NEW_NODE_SIZE = { width: 120, height: 50 };

export interface Created {
  doc: StateMachineDocument;
  id: string;
}

function unusedNumber(doc: StateMachineDocument, prefix: string): number {
  const taken = new Set([...doc.nodes, ...doc.edges, ...doc.regions].map((item) => item.id));
  let n = 1;
  while (taken.has(`${prefix}${n}`)) n++;
  return n;
}

/** Deepest region containing `point`, among those currently drawn as boxes. */
function regionAt(doc: StateMachineDocument, point: Point): string | null {
  const hits = backend.projectVisibleGraph(doc).regions.filter((region) => boxContains(region, point));
  // Child regions sit inside their parent, so the deepest hit is nobody's parent.
  return hits.find((region) => !hits.some((other) => other.parentId === region.id))?.id ?? null;
}

/** A new state centered on `center`, joining whatever region it was dropped into. */
export function createState(doc: StateMachineDocument, center: Point): Created {
  const n = unusedNumber(doc, 'user-state-');
  const id = `user-state-${n}`;
  const x = center.x - NEW_NODE_SIZE.width / 2;
  const y = center.y - NEW_NODE_SIZE.height / 2;
  const added = backend.addNode(doc, {
    id,
    label: `State ${n}`,
    x,
    y,
    ...NEW_NODE_SIZE,
    regionId: regionAt(doc, center),
  });
  // moveNode owns the "grow the region around its child" rule.
  return { id, doc: backend.moveNode(added, id, x, y) };
}

// A straight line would hide under an existing edge between the same two states,
// and a self-loop would have no length, so those start out bent.
function initialWaypoints(doc: StateMachineDocument, sourceId: string, targetId: string): Point[] {
  const source = doc.nodes.find((node) => node.id === sourceId);
  const target = doc.nodes.find((node) => node.id === targetId);
  if (!source || !target) return [];
  const existing = doc.edges.filter(
    (edge) =>
      (edge.source === sourceId && edge.target === targetId) ||
      (edge.source === targetId && edge.target === sourceId),
  ).length;
  if (sourceId === targetId) {
    return selfLoopWaypoints(source).map((point) => ({ x: point.x, y: point.y - existing * 20 }));
  }
  return existing ? [bentMidpoint(boxCenter(source), boxCenter(target), 30 * existing)] : [];
}

export function createTransition(doc: StateMachineDocument, sourceId: string, targetId: string): Created {
  const id = `user-edge-${unusedNumber(doc, 'user-edge-')}`;
  const waypoints = initialWaypoints(doc, sourceId, targetId);
  return { id, doc: backend.addEdge(doc, { id, source: sourceId, target: targetId, waypoints }) };
}

/** Move one state. Its self-loops belong to it and travel along; nothing else moves. */
export function dragNode(doc: StateMachineDocument, nodeId: string, x: number, y: number): StateMachineDocument {
  const node = doc.nodes.find((item) => item.id === nodeId);
  if (!node) return doc;
  const dx = x - node.x;
  const dy = y - node.y;
  return doc.edges
    .filter((edge) => edge.source === nodeId && edge.target === nodeId && edge.waypoints.length > 0)
    .reduce(
      (next, edge) =>
        backend.updateEdgeWaypoints(
          next,
          edge.id,
          edge.waypoints.map((point) => ({ x: point.x + dx, y: point.y + dy })),
        ),
      backend.moveNode(doc, nodeId, x, y),
    );
}

export function insertAt(points: Point[], index: number, point: Point): Point[] {
  return [...points.slice(0, index), point, ...points.slice(index)];
}

export function removeAt(points: Point[], index: number): Point[] {
  return points.filter((_, i) => i !== index);
}

export function replaceAt(points: Point[], index: number, point: Point): Point[] {
  return points.map((existing, i) => (i === index ? point : existing));
}
