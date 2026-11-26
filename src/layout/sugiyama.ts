import type { LayoutDirection, Point, TransitionEdge } from '../types/graph';
import { findFeedbackEdges } from './cycleRemoval';

export interface LayoutBox extends Point {
  width: number;
  height: number;
}

export interface LayoutSettings {
  direction: LayoutDirection;
  layerSpacing: number;
  nodeSpacing: number;
  regionPadding: number;
  sweepIterations: number;
}

interface Vertex {
  width: number;
  height: number;
  order: number;
  rank: number;
  before: Vertex[];
  after: Vertex[];
  box: LayoutBox;
}

function vertex(width: number, height: number): Vertex {
  return { width, height, order: 0, rank: 0, before: [], after: [], box: { x: 0, y: 0, width, height } };
}

function link(source: Vertex, target: Vertex) {
  source.after.push(target);
  target.before.push(source);
}

function updateOrder(layer: Vertex[]) {
  layer.forEach((item, index) => { item.order = index; });
}

function crossings(layers: Vertex[][]): number {
  let count = 0;
  for (let index = 0; index + 1 < layers.length; index++) {
    const counts = new Array<number>(layers[index + 1].length + 1).fill(0);
    let seen = 0;
    for (const source of layers[index]) {
      for (const target of source.after) {
        let smallerOrEqual = 0;
        for (let i = target.order + 1; i > 0; i -= i & -i) smallerOrEqual += counts[i];
        count += seen - smallerOrEqual;
      }
      // Insert this vertex's edges together so a shared endpoint never contributes a crossing.
      for (const target of source.after) {
        for (let i = target.order + 1; i < counts.length; i += i & -i) counts[i]++;
        seen++;
      }
    }
  }
  return count;
}

function swapGain(left: Vertex, right: Vertex): number {
  let gain = 0;
  for (const side of ['before', 'after'] as const) {
    for (const a of left[side]) {
      for (const b of right[side]) gain += Math.sign(a.order - b.order);
    }
  }
  return gain;
}

function reduceCrossings(layers: Vertex[][], limit: number): number {
  let bestScore = crossings(layers);
  let best = layers.map((layer) => [...layer]);
  let iterations = 0;
  for (; iterations < limit && bestScore > 0; iterations++) {
    const forward = iterations % 2 === 0;
    const side = forward ? 'before' : 'after';
    const sweep = forward ? layers.slice(1) : layers.slice(0, -1).reverse();
    for (const layer of sweep) {
      const barycenters = new Map(layer.map((item) => [item, item[side].length
        ? item[side].reduce((sum, neighbor) => sum + neighbor.order, 0) / item[side].length
        : item.order]));
      layer.sort((a, b) => barycenters.get(a)! - barycenters.get(b)! || a.order - b.order);
      updateOrder(layer);
    }
    for (const layer of layers) {
      for (let i = 0; i + 1 < layer.length; i++) {
        if (swapGain(layer[i], layer[i + 1]) > 0) {
          [layer[i], layer[i + 1]] = [layer[i + 1], layer[i]];
          layer[i].order = i;
          layer[i + 1].order = i + 1;
        }
      }
    }
    const score = crossings(layers);
    if (score < bestScore) {
      bestScore = score;
      best = layers.map((layer) => [...layer]);
    }
  }
  best.forEach((layer, index) => { layers[index] = layer; });
  return iterations;
}

export function layoutLayers(
  sizes: ReadonlyMap<string, { width: number; height: number }>,
  edges: readonly TransitionEdge[],
  settings: LayoutSettings,
) {
  const nodes = new Map([...sizes].map(([id, size]) => [id, vertex(size.width, size.height)]));
  const feedback = findFeedbackEdges([...nodes.keys()], edges);
  const oriented = edges.filter(({ source, target }) => source !== target).map((edge) => {
    const reverse = feedback.has(edge.id);
    return { edge, source: nodes.get(reverse ? edge.target : edge.source)!,
      target: nodes.get(reverse ? edge.source : edge.target)! };
  });
  const successors = new Map([...nodes.values()].map((item) => [item, [] as Vertex[]]));
  const incoming = new Map([...nodes.values()].map((item) => [item, 0]));
  for (const { source, target } of oriented) {
    successors.get(source)!.push(target);
    incoming.set(target, incoming.get(target)! + 1);
  }
  const queue = [...nodes.values()].filter((item) => incoming.get(item) === 0);
  for (let i = 0; i < queue.length; i++) {
    const source = queue[i];
    for (const target of successors.get(source)!) {
      target.rank = Math.max(target.rank, source.rank + 1);
      const remaining = incoming.get(target)! - 1;
      incoming.set(target, remaining);
      if (remaining === 0) queue.push(target);
    }
  }

  const layers: Vertex[][] = [];
  for (const item of nodes.values()) (layers[item.rank] ??= []).push(item);
  const dummyPaths = new Map<string, Vertex[]>();
  let dummyNodeCount = 0;
  for (const { edge, source, target } of oriented) {
    const path: Vertex[] = [];
    let previous = source;
    for (let rank = source.rank + 1; rank < target.rank; rank++) {
      const dummy = vertex(0, 0);
      layers[rank].push(dummy);
      path.push(dummy);
      link(previous, dummy);
      previous = dummy;
      dummyNodeCount++;
    }
    link(previous, target);
    if (feedback.has(edge.id)) path.reverse();
    dummyPaths.set(edge.id, path);
  }
  layers.forEach(updateOrder);
  const iterationsRun = settings.sweepIterations ? reduceCrossings(layers, settings.sweepIterations) : 0;

  const horizontal = settings.direction === 'LR';
  const depth = (item: Vertex) => horizontal ? item.width : item.height;
  const breadth = (item: Vertex) => horizontal ? item.height : item.width;
  const layerBreadths = layers.map((layer) => layer.reduce((sum, item) => sum + breadth(item),
    Math.max(0, layer.length - 1) * settings.nodeSpacing));
  const widest = layerBreadths.reduce((max, size) => Math.max(max, size), 0);
  let primary = 0;
  layers.forEach((layer, index) => {
    const thickness = layer.reduce((max, item) => Math.max(max, depth(item)), 0);
    let secondary = (widest - layerBreadths[index]) / 2;
    for (const item of layer) {
      const start = primary + (thickness - depth(item)) / 2;
      item.box.x = horizontal ? start : secondary;
      item.box.y = horizontal ? secondary : start;
      secondary += breadth(item) + settings.nodeSpacing;
    }
    primary += thickness + settings.layerSpacing;
  });
  return {
    boxes: new Map([...nodes].map(([id, item]) => [id, item.box])),
    guides: new Map([...dummyPaths].map(([id, path]) => [id, path.map(({ box }) => ({ x: box.x, y: box.y }))])),
    feedback,
    dummyNodeCount,
    iterationsRun,
    width: horizontal ? Math.max(0, primary - settings.layerSpacing) : widest,
    height: horizontal ? widest : Math.max(0, primary - settings.layerSpacing),
  };
}
