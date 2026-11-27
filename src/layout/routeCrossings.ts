import type { Point } from '../types/graph';

const EPSILON = 1e-6;
const POSITION_EPSILON = 1e-9;

const subtract = (a: Point, b: Point): Point => ({ x: a.x - b.x, y: a.y - b.y });
const dot = (a: Point, b: Point) => a.x * b.x + a.y * b.y;
const cross = (a: Point, b: Point) => a.x * b.y - a.y * b.x;
const sideOf = (a: Point, b: Point, point: Point) =>
  (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
const opposite = (a: number, b: number) => (a > EPSILON && b < -EPSILON) || (a < -EPSILON && b > EPSILON);
const samePoint = (a: Point, b: Point) => Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON;

function insideSegment(point: Point, a: Point, b: Point, orientation: number): boolean {
  if (samePoint(point, a) || samePoint(point, b)) return false;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= EPSILON ** 2 || orientation ** 2 > EPSILON ** 2 * lengthSquared) return false;
  const fraction = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  return fraction > EPSILON && fraction < 1 - EPSILON;
}

function crossAtSharedWaypoint(point: Point, a: Point, b: Point, c: Point, d: Point): boolean {
  const angle = (end: Point) => Math.atan2(end.y - point.y, end.x - point.x);
  const [aa, ba, ca, da] = [a, b, c, d].map(angle);
  const lo = Math.min(aa, ba);
  const hi = Math.max(aa, ba);
  const overlapsRay = (value: number) => [lo, hi].some((limit) => {
    const distance = Math.abs(value - limit);
    return Math.min(distance, Math.PI * 2 - distance) <= EPSILON;
  });
  return !overlapsRay(ca) && !overlapsRay(da) && ((ca > lo && ca < hi) !== (da > lo && da < hi));
}

interface Contact {
  start: Point;
  end: Point;
  pStart: number;
  pEnd: number;
  qStart: number;
  qEnd: number;
}

function sharedSegment(a: Point, b: Point, c: Point, d: Point, i: number, j: number, sideC: number, sideD: number): Contact | undefined {
  const p = subtract(b, a);
  const pSquared = dot(p, p);
  if (pSquared <= EPSILON ** 2 || Math.max(sideC ** 2, sideD ** 2) > EPSILON ** 2 * pSquared) return undefined;
  const q = subtract(d, c);
  const qSquared = dot(q, q);
  if (qSquared <= EPSILON ** 2) return undefined;
  const t0 = dot(subtract(c, a), p) / pSquared;
  const t1 = dot(subtract(d, a), p) / pSquared;
  const first = Math.max(0, Math.min(t0, t1));
  const last = Math.min(1, Math.max(t0, t1));
  if (last <= first || (last - first) ** 2 * pSquared <= EPSILON ** 2) return undefined;

  const pointAt = (fraction: number) => ({ x: a.x + p.x * fraction, y: a.y + p.y * fraction });
  const start = pointAt(first);
  const end = pointAt(last);
  const qAt = (point: Point) => j + Math.max(0, Math.min(1, dot(subtract(point, c), q) / qSquared));
  return { start, end, pStart: i + first, pEnd: i + last, qStart: qAt(start), qEnd: qAt(end) };
}

function countSharedCrossings(p: readonly Point[], q: readonly Point[], pieces: Contact[]): number {
  const before = (position: number) => Math.ceil(position - POSITION_EPSILON) - 1;
  const after = (position: number) => Math.floor(position + POSITION_EPSILON) + 1;
  const near = (a: number, b: number) => Math.abs(a - b) < POSITION_EPSILON;
  const angle = (flow: Point, point: Point, neighbor: Point) => {
    const ray = subtract(neighbor, point);
    const value = Math.atan2(cross(flow, ray), dot(flow, ray));
    return value < 0 ? value + 2 * Math.PI : value;
  };

  let crossings = 0;
  const used = new Set<Contact>();
  pieces.sort((a, b) => a.pStart - b.pStart);
  for (const first of pieces) {
    if (used.has(first)) continue;
    used.add(first);
    const forward = first.qEnd > first.qStart;
    let last = first;
    // A contact may continue through bends. Join pieces only along both traversals.
    for (const piece of pieces) {
      if (!used.has(piece) && near(last.pEnd, piece.pStart) && near(last.qEnd, piece.qStart)
        && (piece.qEnd > piece.qStart) === forward) {
        used.add(piece);
        last = piece;
      }
    }

    const pIn = p[before(first.pStart)];
    const pOut = p[after(last.pEnd)];
    const qIn = q[(forward ? before : after)(first.qStart)];
    const qOut = q[(forward ? after : before)(last.qEnd)];
    // Contacts reaching a graph endpoint are shared branches or merges.
    if (!pIn || !pOut || !qIn || !qOut) continue;
    const entry = subtract(first.end, first.start);
    const exit = subtract(last.start, last.end);
    const entryOrder = angle(entry, first.start, pIn) - angle(entry, first.start, qIn);
    const exitOrder = angle(exit, last.end, qOut) - angle(exit, last.end, pOut);
    if (opposite(entryOrder, exitOrder)) crossings++;
  }
  return crossings;
}

export function countRouteCrossings(path: readonly Point[], others: Iterable<readonly Point[]>): number {
  let count = 0;
  for (const other of others) {
    const contacts: Contact[] = [];
    for (let i = 1; i < path.length; i++) {
      const [a, b] = [path[i - 1], path[i]];
      for (let j = 1; j < other.length; j++) {
        const [c, d] = [other[j - 1], other[j]];
        if (Math.max(a.x, b.x) < Math.min(c.x, d.x) - EPSILON || Math.max(c.x, d.x) < Math.min(a.x, b.x) - EPSILON
          || Math.max(a.y, b.y) < Math.min(c.y, d.y) - EPSILON || Math.max(c.y, d.y) < Math.min(a.y, b.y) - EPSILON) continue;
        const sideA = sideOf(c, d, a);
        const sideB = sideOf(c, d, b);
        const sideC = sideOf(a, b, c);
        const sideD = sideOf(a, b, d);
        if (opposite(sideC, sideD) && opposite(sideA, sideB)
          && !samePoint(a, c) && !samePoint(a, d) && !samePoint(b, c) && !samePoint(b, d)) {
          count++;
        } else if (i + 1 < path.length && insideSegment(b, c, d, sideB)
          && opposite(sideA, sideOf(c, d, path[i + 1]))) {
          count++;
        } else if (j + 1 < other.length && insideSegment(d, a, b, sideD)
          && opposite(sideC, sideOf(a, b, other[j + 1]))) {
          count++;
        } else if (i + 1 < path.length && j + 1 < other.length && samePoint(b, d)
          && crossAtSharedWaypoint(b, a, path[i + 1], c, other[j + 1])) {
          count++;
        } else {
          const contact = sharedSegment(a, b, c, d, i - 1, j - 1, sideC, sideD);
          if (contact) contacts.push(contact);
        }
      }
    }
    if (contacts.length) count += countSharedCrossings(path, other, contacts);
  }
  return count;
}
