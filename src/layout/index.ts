import type { LayoutOptions, LayoutResult, StateMachineDocument } from '../types/graph';
import { layoutHierarchy } from './hierarchicalLayout';

function spacing(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function computeLayout(doc: StateMachineDocument, options: LayoutOptions = {}): LayoutResult {
  const iterations = options.crossingSweepIterations ?? 10;
  return layoutHierarchy(doc, {
    direction: options.direction ?? 'LR',
    layerSpacing: spacing(options.layerSpacing, 100),
    nodeSpacing: spacing(options.nodeSpacing, 50),
    regionPadding: spacing(options.regionPadding, 32),
    sweepIterations: options.enableCrossingReduction === false ? 0
      : Number.isFinite(iterations) ? Math.max(0, Math.floor(iterations)) : 10,
  });
}

export function computeBaselineLayout(doc: StateMachineDocument, options: LayoutOptions = {}): LayoutResult {
  return computeLayout(doc, { ...options, enableCrossingReduction: false });
}
