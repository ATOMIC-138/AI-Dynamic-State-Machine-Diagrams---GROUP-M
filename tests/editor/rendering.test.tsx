/** Static markup checks; the test environment is plain node (no DOM). */
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { backend } from '../../src/editor/backend';
import { DiagramCanvas, type CanvasHandlers } from '../../src/editor/DiagramCanvas';
import type { Selection } from '../../src/editor/useDiagramInteraction';
import type { LayoutComparison, LayoutMetrics, StateMachineDocument } from '../../src/types/graph';
import { MetricsPanel } from '../../src/ui/MetricsPanel';
import { sampleDoc } from './sampleDoc';

const noop = () => {};
const handlers: CanvasHandlers = {
  onBackgroundPointerDown: noop,
  onBackgroundContextMenu: noop,
  onRegionContextMenu: noop,
  onNodePointerDown: noop,
  onNodeContextMenu: noop,
  onEdgePointerDown: noop,
  onEdgeDoubleClick: noop,
  onWaypointPointerDown: noop,
  onWaypointContextMenu: noop,
};

const draw = (doc: StateMachineDocument, selection: Selection | null = null) =>
  renderToStaticMarkup(
    <DiagramCanvas
      graph={backend.projectVisibleGraph(doc)}
      viewport={{ x: 0, y: 0, scale: 1 }}
      selection={selection}
      mode="select"
      pendingSource={null}
      handlers={handlers}
    />,
  );

const collapsedDoc = () => backend.toggleRegionCollapse(sampleDoc(), 'work', true);

describe('DiagramCanvas', () => {
  it('draws expanded regions dashed, states as rectangles and edges with arrows', () => {
    const html = draw(sampleDoc());
    expect(html).toContain('stroke-dasharray="6 4"');
    expect(html).toContain('data-node-id="load"');
    expect(html).toContain('marker-end="url(#arrow)"');
    expect(html).not.toContain('<circle');
  });

  it('draws a collapsed region as a circle and hides its contents', () => {
    const html = draw(collapsedDoc());
    expect(html).toContain('<circle');
    expect(html).not.toContain('data-node-id="load"');
    expect(html).not.toContain('stroke-dasharray');
  });

  it('offers bend handles for a selected edge, but not for a redirected one', () => {
    const selection: Selection = { type: 'edge', id: 'leave', waypoint: null };
    expect(draw(sampleDoc(), selection)).toContain('class="waypoint"');
    expect(draw(collapsedDoc(), selection)).not.toContain('class="waypoint"');
  });
});

describe('MetricsPanel', () => {
  const metrics: LayoutMetrics = {
    edgeCrossings: 2,
    nodeOverlaps: 0,
    totalEdgeLength: 100.4,
    totalBends: 3,
    boundingWidth: 10,
    boundingHeight: 10,
    boundingArea: 100,
    aspectRatio: 1,
  };

  it('shows the crossing reduction as a count and a percentage', () => {
    const comparison: LayoutComparison = {
      baseline: { ...metrics, edgeCrossings: 8 },
      optimized: metrics,
      crossingReductionCount: 6,
      crossingReductionPercent: 75,
    };
    const html = renderToStaticMarkup(<MetricsPanel current={metrics} comparison={comparison} />);
    expect(html).toContain('交叉減少 6（75.0%）');
  });

  it('explains why there is no comparison after loading a saved file', () => {
    const html = renderToStaticMarkup(<MetricsPanel current={metrics} comparison={null} />);
    expect(html).toContain('載入儲存檔不會執行排版');
  });
});
