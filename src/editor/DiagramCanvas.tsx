/** SVG rendering of a VisibleGraph. Stateless: all behaviour comes in through `handlers`. */
import type { MouseEvent, PointerEvent, Ref } from 'react';
import type { Point, VisibleEdge, VisibleGraph, VisibleNode, VisibleRegion } from '../types/graph';
import { boxCenter, drawEdges, polylinePath, type Viewport } from './geometry';
import type { Mode, Selection } from './useDiagramInteraction';

export interface CanvasHandlers {
  onBackgroundPointerDown(event: PointerEvent): void;
  onBackgroundContextMenu(event: MouseEvent): void;
  onRegionContextMenu(event: MouseEvent, regionId: string): void;
  onNodePointerDown(event: PointerEvent, node: VisibleNode): void;
  onNodeContextMenu(event: MouseEvent, node: VisibleNode): void;
  onEdgePointerDown(event: PointerEvent, edge: VisibleEdge): void;
  onEdgeDoubleClick(event: MouseEvent, edge: VisibleEdge): void;
  onWaypointPointerDown(event: PointerEvent, edge: VisibleEdge, waypoints: Point[], index: number): void;
  onWaypointContextMenu(event: MouseEvent, edge: VisibleEdge, index: number): void;
}

export interface DiagramCanvasProps {
  graph: VisibleGraph;
  viewport: Viewport;
  selection: Selection | null;
  mode: Mode;
  pendingSource: string | null;
  handlers: CanvasHandlers;
  svgRef?: Ref<SVGSVGElement>;
}

const classes = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

/** Parents first, so that nested regions are painted (and right-clicked) on top. */
function outermostFirst(regions: VisibleRegion[]): VisibleRegion[] {
  const byId = new Map(regions.map((region) => [region.id, region]));
  const depth = (region: VisibleRegion) => {
    let count = 0;
    for (let id = region.parentId; id && count < regions.length; id = byId.get(id)?.parentId ?? null) count++;
    return count;
  };
  return [...regions].sort((a, b) => depth(a) - depth(b));
}

function ArrowHead({ id }: { id: string }) {
  return (
    <marker
      id={id}
      viewBox="0 0 10 10"
      refX="10"
      refY="5"
      markerWidth="10"
      markerHeight="10"
      markerUnits="userSpaceOnUse"
      orient="auto"
    >
      <path d="M0 0 L10 5 L0 10 Z" />
    </marker>
  );
}

export function DiagramCanvas({
  graph,
  viewport,
  selection,
  mode,
  pendingSource,
  handlers,
  svgRef,
}: DiagramCanvasProps) {
  const edges = drawEdges(graph);
  const selectedEdge = selection?.type === 'edge' ? edges.find((item) => item.edge.id === selection.id) : undefined;
  const showHandles = mode === 'select' && selectedEdge && !selectedEdge.edge.isRedirected;

  return (
    <svg
      ref={svgRef}
      className={`diagram-canvas mode-${mode}`}
      onPointerDown={handlers.onBackgroundPointerDown}
      onContextMenu={handlers.onBackgroundContextMenu}
    >
      <defs>
        <ArrowHead id="arrow" />
        <ArrowHead id="arrow-selected" />
      </defs>
      <g transform={`translate(${viewport.x} ${viewport.y}) scale(${viewport.scale})`}>
        {outermostFirst(graph.regions).map((region) => (
          <g
            key={region.id}
            className="region"
            data-region-id={region.id}
            onContextMenu={(event) => handlers.onRegionContextMenu(event, region.id)}
          >
            <rect
              x={region.x}
              y={region.y}
              width={region.width}
              height={region.height}
              rx={10}
              strokeDasharray="6 4"
            />
            <text x={region.x + 10} y={region.y + 18}>
              {region.label ?? region.id}
            </text>
          </g>
        ))}

        {edges.map(({ edge, points }) => {
          const selected = edge.id === selectedEdge?.edge.id;
          const path = polylinePath(points);
          return (
            <g
              key={edge.id}
              className={classes('edge', selected && 'selected', edge.isRedirected && 'redirected')}
              data-edge-id={edge.id}
              onPointerDown={(event) => handlers.onEdgePointerDown(event, edge)}
              onDoubleClick={(event) => handlers.onEdgeDoubleClick(event, edge)}
            >
              <title>{`${edge.originalSource} → ${edge.originalTarget}${edge.label ? `：${edge.label}` : ''}`}</title>
              <path className="edge-line" d={path} markerEnd={`url(#${selected ? 'arrow-selected' : 'arrow'})`} />
              {/* Wide invisible stroke so thin lines are easy to hit at any zoom. */}
              <path className="edge-hit" d={path} strokeWidth={14 / viewport.scale} />
            </g>
          );
        })}

        {graph.nodes.map((node) => {
          const center = boxCenter(node);
          const label = node.label ?? node.id;
          return (
            <g
              key={node.id}
              className={classes(
                'node',
                node.kind === 'state' ? 'state' : 'collapsed',
                node.isUserCreated && 'user-created',
                selection?.type === 'node' && selection.id === node.id && 'selected',
                pendingSource === node.id && 'pending',
              )}
              data-node-id={node.id}
              onPointerDown={(event) => handlers.onNodePointerDown(event, node)}
              onContextMenu={(event) => handlers.onNodeContextMenu(event, node)}
            >
              <title>{`${label} (${Math.round(node.x)}, ${Math.round(node.y)})`}</title>
              {node.kind === 'collapsed-region' ? (
                <>
                  <circle cx={center.x} cy={center.y} r={node.radius ?? node.width / 2} />
                  <text className="expand-icon" x={center.x} y={center.y - 12}>
                    ⊕
                  </text>
                  <text x={center.x} y={center.y + 8}>
                    {label}
                  </text>
                </>
              ) : (
                <>
                  <rect x={node.x} y={node.y} width={node.width} height={node.height} rx={8} />
                  <text x={center.x} y={center.y}>
                    {label}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {showHandles &&
          selectedEdge.waypoints.map((point, index) => (
            <circle
              key={index}
              className={classes('waypoint', selection?.type === 'edge' && selection.waypoint === index && 'active')}
              cx={point.x}
              cy={point.y}
              r={6 / viewport.scale}
              onPointerDown={(event) =>
                handlers.onWaypointPointerDown(event, selectedEdge.edge, selectedEdge.waypoints, index)
              }
              onContextMenu={(event) => handlers.onWaypointContextMenu(event, selectedEdge.edge, index)}
            />
          ))}
      </g>
    </svg>
  );
}
