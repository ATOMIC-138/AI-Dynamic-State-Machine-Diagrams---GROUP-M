import type { TransitionEdge } from '../types/graph';

export function findFeedbackEdges(nodeIds: readonly string[], edges: readonly TransitionEdge[]): Set<string> {
  const outgoing = new Map(nodeIds.map((id) => [id, [] as TransitionEdge[]]));
  for (const edge of edges) {
    if (edge.source !== edge.target) outgoing.get(edge.source)?.push(edge);
  }

  const visited = new Set<string>();
  const active = new Set<string>();
  const feedback = new Set<string>();
  for (const start of nodeIds) {
    if (visited.has(start)) continue;
    visited.add(start);
    active.add(start);
    const stack = [{ id: start, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const edge = outgoing.get(frame.id)![frame.next++];
      if (!edge) {
        active.delete(frame.id);
        stack.pop();
      } else if (active.has(edge.target)) {
        feedback.add(edge.id);
      } else if (!visited.has(edge.target) && outgoing.has(edge.target)) {
        visited.add(edge.target);
        active.add(edge.target);
        stack.push({ id: edge.target, next: 0 });
      }
    }
  }
  return feedback;
}
