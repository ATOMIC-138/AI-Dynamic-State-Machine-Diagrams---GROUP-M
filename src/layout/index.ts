import type { LayoutOptions, LayoutResult, StateMachineDocument } from '../types/graph';
import { center } from './edgeRouting';
import { layoutHierarchy } from './hierarchicalLayout';
import { countRouteCrossings } from './routeCrossings';
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
  return routes.reduce((total, path, index) => total + countRouteCrossings(path, routes.slice(index + 1)), 0);
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
  if (!optimizedCrossings) return optimized;
  const baseline = layoutHierarchy(doc, { ...settings, sweepIterations: 0 });
  const baselineCrossings = measureCrossings(baseline.document);
  return optimizedCrossings > baselineCrossings ? baseline : optimized;
}

export function computeBaselineLayout(doc: StateMachineDocument, options: LayoutOptions = {}): LayoutResult {
  return computeLayout(doc, { ...options, enableCrossingReduction: false });
}
