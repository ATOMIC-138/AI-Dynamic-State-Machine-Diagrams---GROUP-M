/**
 * Shared Graph, Layout, Metrics, and Serialization contracts.
 *
 * Strictly separates semantic graph structure from layout coordinates so that:
 * - UnderlyingGraph holds complete original hierarchy, coordinates, and waypoints.
 * - VisibleGraph is a pure projection derived from UnderlyingGraph + collapsed states.
 */

export interface Point {
  x: number;
  y: number;
}

export interface StateNode {
  id: string;
  label?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  regionId: string | null;
  isUserCreated?: boolean;
}

export interface TransitionEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  waypoints: Point[];
  isUserCreated?: boolean;
}

export interface RegionNode {
  id: string;
  label?: string;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  collapsed: boolean;
  /** Position of the circular proxy node when collapsed; defaults to region center. */
  collapsedPosition?: Point;
  /** Radius of the circular proxy node when collapsed. */
  collapsedRadius?: number;
}

export interface StateMachineDocument {
  schemaVersion: '1.0';
  /** True when coordinates are finalized/saved; Load must NEVER auto-relayout if true. */
  layoutApplied: boolean;
  nodes: StateNode[];
  edges: TransitionEdge[];
  regions: RegionNode[];
  metadata?: Record<string, unknown>;
}

/** Standard external input format (from upstream groups, before initial layout). */
export interface ExternalNodeInput {
  id: string;
  label?: string;
  regionId?: string | null;
  width?: number;
  height?: number;
}

export interface ExternalEdgeInput {
  id?: string;
  source: string;
  target: string;
  label?: string;
}

export interface ExternalRegionInput {
  id: string;
  label?: string;
  parent?: string | null;
  parentId?: string | null;
  children?: string[];
}

export interface ExternalGraphInput {
  nodes: ExternalNodeInput[];
  edges: ExternalEdgeInput[];
  regions?: ExternalRegionInput[];
  metadata?: Record<string, unknown>;
}

/** Visible projection types rendered by the Interactive Editor. */
export interface VisibleNode {
  id: string;
  label?: string;
  kind: 'state' | 'collapsed-region';
  x: number;
  y: number;
  width: number;
  height: number;
  radius?: number;
  regionId: string | null;
  sourceRegionId?: string;
  isUserCreated?: boolean;
}

export interface VisibleEdge {
  id: string;
  /** Semantic source/target in UnderlyingGraph (never mutated by collapse). */
  originalSource: string;
  originalTarget: string;
  /** Currently rendered endpoints (redirected to collapsed region proxy if needed). */
  displaySource: string;
  displayTarget: string;
  label?: string;
  waypoints: Point[];
  isRedirected: boolean;
  isUserCreated?: boolean;
}

export interface VisibleRegion {
  id: string;
  label?: string;
  parentId: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisibleGraph {
  nodes: VisibleNode[];
  edges: VisibleEdge[];
  regions: VisibleRegion[];
}

/** Layout Engine options & result contracts (Member B). */
export type LayoutDirection = 'LR' | 'TB';

export interface LayoutOptions {
  direction?: LayoutDirection;
  layerSpacing?: number;
  nodeSpacing?: number;
  regionPadding?: number;
  enableCrossingReduction?: boolean;
  crossingSweepIterations?: number;
}

export interface LayoutResult {
  document: StateMachineDocument;
  stats?: {
    reversedEdgeIds: string[];
    dummyNodeCount: number;
    iterationsRun: number;
  };
}

/** Independent objective evaluation metrics (Member A). */
export interface LayoutMetrics {
  edgeCrossings: number;
  nodeOverlaps: number;
  totalEdgeLength: number;
  totalBends: number;
  boundingWidth: number;
  boundingHeight: number;
  boundingArea: number;
  aspectRatio: number;
}

export interface LayoutComparison {
  baseline: LayoutMetrics;
  optimized: LayoutMetrics;
  crossingReductionCount: number;
  crossingReductionPercent: number;
}
