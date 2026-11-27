/**
 * Pointer, keyboard and menu behaviour of the canvas. All document changes go
 * through `backend` or ./editorActions; nothing here ever runs a layout.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Point, StateMachineDocument, VisibleGraph } from '../types/graph';
import { backend } from './backend';
import type { CanvasHandlers } from './DiagramCanvas';
import { createState, createTransition, dragNode, insertAt, removeAt, replaceAt } from './editorActions';
import {
  contentBoxes,
  drawEdges,
  fitViewport,
  nearestSegmentIndex,
  screenToWorld,
  zoomAt,
  type Viewport,
} from './geometry';

export type Mode = 'select' | 'add-state' | 'add-transition';

export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string; waypoint: number | null };

export interface ContextMenu {
  /** Canvas-relative screen position. */
  x: number;
  y: number;
  regionId: string;
  collapse: boolean;
}

// `start` is in client coordinates. Edits are applied to the document captured
// when the drag began, so intermediate positions leave no trace.
type Drag = { start: Point; view: Viewport; moved: boolean } & (
  | { kind: 'pan' }
  | { kind: 'node'; id: string; origin: Point; doc: StateMachineDocument }
  | { kind: 'region-circle'; id: string; origin: Point; doc: StateMachineDocument }
  | { kind: 'waypoint'; edgeId: string; index: number; waypoints: Point[]; doc: StateMachineDocument }
);

const DRAG_THRESHOLD = 3;
const EMPTY_GRAPH: VisibleGraph = { nodes: [], edges: [], regions: [] };

export function useDiagramInteraction(
  doc: StateMachineDocument | null,
  setDoc: (doc: StateMachineDocument) => void,
  notify: (message: string) => void,
) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const draggingDocRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [mode, setModeState] = useState<Mode>('select');
  const [pendingSource, setPendingSource] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [menu, setMenu] = useState<ContextMenu | null>(null);
  const graph = useMemo(() => (doc ? backend.projectVisibleGraph(doc) : EMPTY_GRAPH), [doc]);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    setPendingSource(null);
    setMenu(null);
  }, []);

  const reset = useCallback(() => {
    drag.current = null;
    draggingDocRef.current = false;
    setIsDragging(false);
    setMode('select');
    setSelection(null);
  }, [setMode]);

  const fitToView = useCallback((target: StateMachineDocument) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    setViewport(fitViewport(contentBoxes(backend.projectVisibleGraph(target)), rect.width, rect.height));
  }, []);

  const deleteWaypoint = useCallback(
    (edgeId: string, index: number) => {
      const drawn = drawEdges(graph).find((item) => item.edge.id === edgeId);
      if (!doc || !drawn || drawn.edge.isRedirected) return;
      setDoc(backend.updateEdgeWaypoints(doc, edgeId, removeAt(drawn.waypoints, index)));
      setSelection({ type: 'edge', id: edgeId, waypoint: null });
    },
    [doc, graph, setDoc],
  );

  // Drags are tracked on window so they continue outside the canvas. (Pointer
  // capture would retarget the click/dblclick events that edges rely on.)
  useEffect(() => {
    const apply = (event: PointerEvent) => {
      const current = drag.current;
      if (!current) return;
      const dx = event.clientX - current.start.x;
      const dy = event.clientY - current.start.y;
      if (!current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      current.moved = true;
      if (current.kind === 'pan') {
        setViewport({ ...current.view, x: current.view.x + dx, y: current.view.y + dy });
        return;
      }
      if (!draggingDocRef.current) {
        draggingDocRef.current = true;
        setIsDragging(true);
      }
      const moved = (point: Point) => ({
        x: point.x + dx / current.view.scale,
        y: point.y + dy / current.view.scale,
      });
      if (current.kind === 'node') {
        const to = moved(current.origin);
        setDoc(dragNode(current.doc, current.id, to.x, to.y));
      } else if (current.kind === 'region-circle') {
        const to = moved(current.origin);
        setDoc(backend.moveNode(current.doc, current.id, to.x, to.y));
      } else {
        const waypoints = replaceAt(current.waypoints, current.index, moved(current.waypoints[current.index]));
        setDoc(backend.updateEdgeWaypoints(current.doc, current.edgeId, waypoints));
      }
    };
    const finish = (event: PointerEvent) => {
      apply(event);
      drag.current = null;
      if (draggingDocRef.current) {
        draggingDocRef.current = false;
        setIsDragging(false);
      }
    };
    const abort = () => {
      drag.current = null;
      if (draggingDocRef.current) {
        draggingDocRef.current = false;
        setIsDragging(false);
      }
    };
    window.addEventListener('pointermove', apply);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', abort);
    return () => {
      window.removeEventListener('pointermove', apply);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', abort);
    };
  }, [setDoc]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLSelectElement || event.target instanceof HTMLInputElement) return;
      if (event.key === 'Escape') {
        reset();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selection?.type === 'edge' &&
        selection.waypoint !== null
      ) {
        event.preventDefault();
        deleteWaypoint(selection.id, selection.waypoint);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selection, deleteWaypoint, reset]);

  // React registers wheel listeners as passive, which cannot stop page scroll/zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      setMenu(null);
      setViewport((view) => zoomAt(view, anchor, Math.exp(-event.deltaY * 0.0015)));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  }, []);

  const canvasPoint = (event: { clientX: number; clientY: number }): Point => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const dragStart = (event: { clientX: number; clientY: number }) => ({
    start: { x: event.clientX, y: event.clientY },
    view: viewport,
    moved: false,
  });

  const handlers: CanvasHandlers = {
    onBackgroundPointerDown(event) {
      if (event.button !== 0) return;
      setMenu(null);
      if (mode === 'add-state' && doc) {
        const created = createState(doc, screenToWorld(viewport, canvasPoint(event)));
        setDoc(created.doc);
        setSelection({ type: 'node', id: created.id });
        setMode('select');
        return;
      }
      setSelection(null);
      drag.current = { kind: 'pan', ...dragStart(event) };
    },

    onBackgroundContextMenu(event) {
      event.preventDefault();
      setMenu(null);
    },

    onRegionContextMenu(event, regionId) {
      event.preventDefault();
      event.stopPropagation();
      setMenu({ ...canvasPoint(event), regionId, collapse: true });
    },

    onNodePointerDown(event, node) {
      if (event.button !== 0 || !doc) return;
      event.stopPropagation();
      setMenu(null);
      if (mode === 'add-state') return;
      if (mode === 'add-transition') {
        if (node.kind === 'collapsed-region') {
          notify('收合的區域不能當連線端點，請先展開再點內部節點。');
        } else if (!pendingSource) {
          setPendingSource(node.id);
        } else {
          const created = createTransition(doc, pendingSource, node.id);
          setDoc(created.doc);
          setSelection({ type: 'edge', id: created.id, waypoint: null });
          setMode('select');
        }
        return;
      }
      setSelection({ type: 'node', id: node.id });
      drag.current =
        node.kind === 'state'
          ? { kind: 'node', id: node.id, origin: { x: node.x, y: node.y }, doc, ...dragStart(event) }
          : {
              kind: 'region-circle',
              id: node.sourceRegionId ?? node.id,
              origin: { x: node.x, y: node.y },
              doc,
              ...dragStart(event),
            };
    },

    onNodeContextMenu(event, node) {
      event.preventDefault();
      event.stopPropagation();
      setMenu(
        node.kind === 'collapsed-region'
          ? { ...canvasPoint(event), regionId: node.sourceRegionId ?? node.id, collapse: false }
          : null,
      );
    },

    onEdgePointerDown(event, edge) {
      // In the "add" modes the click falls through to the canvas.
      if (event.button !== 0 || mode !== 'select') return;
      event.stopPropagation();
      setMenu(null);
      setSelection({ type: 'edge', id: edge.id, waypoint: null });
      if (edge.isRedirected) notify('這是收合後改接的連線，展開區域後才能編輯路徑。');
    },

    onEdgeDoubleClick(event, edge) {
      event.stopPropagation();
      const drawn = drawEdges(graph).find((item) => item.edge.id === edge.id);
      // Editing a redirected edge would overwrite the path Expand has to restore.
      if (!doc || !drawn || mode !== 'select' || edge.isRedirected) return;
      const point = screenToWorld(viewport, canvasPoint(event));
      const index = nearestSegmentIndex(drawn.points, point);
      setDoc(backend.updateEdgeWaypoints(doc, edge.id, insertAt(drawn.waypoints, index, point)));
      setSelection({ type: 'edge', id: edge.id, waypoint: index });
    },

    onWaypointPointerDown(event, edge, waypoints, index) {
      if (event.button !== 0 || !doc) return;
      event.stopPropagation();
      setMenu(null);
      setSelection({ type: 'edge', id: edge.id, waypoint: index });
      drag.current = { kind: 'waypoint', edgeId: edge.id, index, waypoints, doc, ...dragStart(event) };
    },

    onWaypointContextMenu(event, edge, index) {
      event.preventDefault();
      event.stopPropagation();
      deleteWaypoint(edge.id, index);
    },
  };

  const runMenuAction = () => {
    if (!doc || !menu) return;
    setDoc(backend.toggleRegionCollapse(doc, menu.regionId, menu.collapse));
    setSelection(null);
    setMode('select');
  };

  return {
    svgRef,
    graph,
    viewport,
    isDragging,
    mode,
    setMode,
    pendingSource,
    selection,
    menu,
    runMenuAction,
    handlers,
    fitToView,
    reset,
  };
}
