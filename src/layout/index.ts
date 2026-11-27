import type { LayoutOptions, LayoutResult, StateMachineDocument } from '../types/graph';
import { center, countRouteCrossings } from './edgeRouting';
import { layoutHierarchy } from './hierarchicalLayout';
import type { LayoutSettings } from './sugiyama';

function spacing(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function measureCrossings({ nodes, edges }: StateMachineDocument) {
  const centers = new Map(nodes.map((node) => [node.id, center(node)]));
  const routes = edges.flatMap((edge) => {
    const start = centers.get(edge.source);
    const end = centers.get(edge.target);
    return start && end ? [[start, ...edge.waypoints, end]] : [];
  });
  let total = 0;
  let segmentInteriors = 0;
  let possibleContacts = 0;
  routes.forEach((path, index) => {
    const crossings = countRouteCrossings(path, routes.slice(index + 1));
    total += crossings.total;
    segmentInteriors += crossings.segmentInteriors;
    possibleContacts += crossings.possibleContacts;
  });
  return { total, segmentInteriors, possibleContacts };
}

export function computeLayout(doc: StateMachineDocument, options: LayoutOptions = {}): LayoutResult {
  const iterations = options.crossingSweepIterations ?? 10;
  const settings: LayoutSettings = {
    direction: options.direction ?? 'LR',
    layerSpacing: spacing(options.layerSpacing, 100),
    nodeSpacing: spacing(options.nodeSpacing, 50),
    regionPadding: spacing(options.regionPadding, 32),
    sweepIterations: options.enableCrossingReduction === false ? 0
      : Number.isFinite(iterations) ? Math.max(0, Math.floor(iterations)) : 10,
  };
  const optimized = layoutHierarchy(doc, settings);
  if (!settings.sweepIterations) return optimized;

  // Layer-order scores cannot see detours or lifted endpoints. Compare the actual routed edges.
  const optimizedCrossings = measureCrossings(optimized.document);
  const upperBound = optimizedCrossings.total + optimizedCrossings.possibleContacts;
  if (!upperBound) return optimized;
  const baseline = layoutHierarchy(doc, { ...settings, sweepIterations: 0 });
  const baselineCrossings = measureCrossings(baseline.document);
  // The independent metrics can classify a coincident run as a side swap. Only accept
  // the candidate when even its conservative upper bound beats or ties the baseline.
  return upperBound > baselineCrossings.total
    || optimizedCrossings.segmentInteriors > baselineCrossings.segmentInteriors ? baseline : optimized;
}

export function computeBaselineLayout(doc: StateMachineDocument, options: LayoutOptions = {}): LayoutResult {
  return computeLayout(doc, { ...options, enableCrossingReduction: false });
}
