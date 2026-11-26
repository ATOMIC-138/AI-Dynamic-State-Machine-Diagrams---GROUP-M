/**
 * The only place the editor touches Member A (src/model, src/metrics) and
 * Member B (src/layout). Everything else imports `backend` from here.
 *
 * Those modules are not on main yet, so it is bound to ./stubs. To switch:
 *
 *   import * as model from '../model';
 *   import * as metrics from '../metrics';
 *   import * as layout from '../layout';
 *   export const backend: Backend = { ...model, ...metrics, ...layout };
 *   export const isStubBackend: boolean = false;
 *
 * and delete stubs.ts. A and B can also be switched one at a time by spreading
 * `...stubs` first. The `Backend` annotation makes `tsc` fail here if a real
 * signature differs from implementation_plan.md §4.
 */
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
import * as stubs from './stubs';

export interface Backend {
  // src/model
  importExternalGraph: (rawJson: string | ExternalGraphInput) => StateMachineDocument;
  exportDocument: (doc: StateMachineDocument) => string;
  loadSavedDocument: (rawJson: string | unknown) => StateMachineDocument;
  projectVisibleGraph: (doc: StateMachineDocument) => VisibleGraph;
  // Given a collapsed region's id, moveNode moves its circle (Member A's implementation does this too).
  moveNode: (doc: StateMachineDocument, nodeId: string, x: number, y: number) => StateMachineDocument;
  updateEdgeWaypoints: (doc: StateMachineDocument, edgeId: string, waypoints: Point[]) => StateMachineDocument;
  addNode: (doc: StateMachineDocument, node: Omit<StateNode, 'isUserCreated'>) => StateMachineDocument;
  addEdge: (doc: StateMachineDocument, edge: Omit<TransitionEdge, 'isUserCreated'>) => StateMachineDocument;
  toggleRegionCollapse: (doc: StateMachineDocument, regionId: string, collapsed?: boolean) => StateMachineDocument;
  // src/metrics
  evaluateLayout: (doc: StateMachineDocument) => LayoutMetrics;
  compareLayouts: (baselineDoc: StateMachineDocument, optimizedDoc: StateMachineDocument) => LayoutComparison;
  // src/layout
  computeLayout: (doc: StateMachineDocument, options?: LayoutOptions) => LayoutResult;
  computeBaselineLayout: (doc: StateMachineDocument, options?: LayoutOptions) => LayoutResult;
}

export const backend: Backend = stubs;
export const isStubBackend: boolean = true;
