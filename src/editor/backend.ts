/**
 * The single integration boundary connecting the Interactive Editor (Member C)
 * to Graph Model & Metrics (Member A) and the Sugiyama Layout Engine (Member B).
 */
import * as layout from '../layout';
import * as metrics from '../metrics';
import * as model from '../model';
import type {
  ExternalGraphInput,
  LayoutComparison,
  LayoutMetrics,
  LayoutOptions,
  LayoutResult,
  Point,
  StateMachineDocument,
  StateNode,
  TransitionEdge,
  VisibleGraph,
} from '../types/graph';

export interface Backend {
  // src/model (Member A)
  importExternalGraph: (rawJson: string | ExternalGraphInput) => StateMachineDocument;
  exportDocument: (doc: StateMachineDocument) => string;
  loadSavedDocument: (rawJson: string | unknown) => StateMachineDocument;
  projectVisibleGraph: (doc: StateMachineDocument) => VisibleGraph;
  moveNode: (doc: StateMachineDocument, nodeId: string, x: number, y: number) => StateMachineDocument;
  updateEdgeWaypoints: (doc: StateMachineDocument, edgeId: string, waypoints: Point[]) => StateMachineDocument;
  addNode: (doc: StateMachineDocument, node: Omit<StateNode, 'isUserCreated'>) => StateMachineDocument;
  addEdge: (doc: StateMachineDocument, edge: Omit<TransitionEdge, 'isUserCreated'>) => StateMachineDocument;
  toggleRegionCollapse: (doc: StateMachineDocument, regionId: string, collapsed?: boolean) => StateMachineDocument;
  // src/metrics (Member A)
  evaluateLayout: (doc: StateMachineDocument) => LayoutMetrics;
  compareLayouts: (baselineDoc: StateMachineDocument, optimizedDoc: StateMachineDocument) => LayoutComparison;
  // src/layout (Member B)
  computeLayout: (doc: StateMachineDocument, options?: LayoutOptions) => LayoutResult;
  computeBaselineLayout: (doc: StateMachineDocument, options?: LayoutOptions) => LayoutResult;
}

export const backend: Backend = {
  ...model,
  ...metrics,
  ...layout,
};

export const isStubBackend: boolean = false;
