import { describe, expect, it } from 'vitest';
import {
  clipToOutline,
  drawEdges,
  fitViewport,
  nearestSegmentIndex,
  screenToWorld,
  zoomAt,
} from '../../src/editor/geometry';
import type { VisibleNode } from '../../src/types/graph';

const box: VisibleNode = { id: 'n', kind: 'state', x: 0, y: 0, width: 100, height: 40, regionId: null };
const circle: VisibleNode = {
  id: 'r',
  kind: 'collapsed-region',
  x: 0,
  y: 0,
  width: 72,
  height: 72,
  radius: 36,
  regionId: null,
};

describe('clipToOutline', () => {
  it('stops at the side of a rectangle that faces the target', () => {
    expect(clipToOutline(box, { x: 250, y: 20 })).toEqual({ x: 100, y: 20 });
    const below = clipToOutline(box, { x: 50, y: 200 });
    expect(below.x).toBeCloseTo(50);
    expect(below.y).toBeCloseTo(40);
  });

  it('stops at the rim of a collapsed-region circle', () => {
    expect(clipToOutline(circle, { x: 200, y: 36 })).toEqual({ x: 72, y: 36 });
  });
});

describe('viewport', () => {
  it('keeps the point under the cursor fixed while zooming, within limits', () => {
    const view = { x: 10, y: 20, scale: 1 };
    const anchor = { x: 200, y: 100 };
    const zoomed = zoomAt(view, anchor, 2);
    expect(screenToWorld(zoomed, anchor)).toEqual(screenToWorld(view, anchor));
    expect(zoomAt(view, anchor, 100).scale).toBe(4);
    expect(zoomAt(view, anchor, 0.001).scale).toBe(0.2);
  });

  it('centers content and shrinks it to fit without enlarging it', () => {
    expect(fitViewport([{ x: 0, y: 0, width: 100, height: 100 }], 500, 300)).toEqual({ x: 200, y: 100, scale: 1 });
    expect(fitViewport([{ x: 0, y: 0, width: 808, height: 100 }], 500, 300).scale).toBe(0.5);
  });
});

describe('edges', () => {
  it('finds the segment a new bend belongs to', () => {
    const line = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ];
    expect(nearestSegmentIndex(line, { x: 40, y: 5 })).toBe(0);
    expect(nearestSegmentIndex(line, { x: 98, y: 60 })).toBe(1);
  });

  it('draws opposite redirected edges apart without changing their data', () => {
    const other: VisibleNode = { ...box, id: 'm', x: 300 };
    const redirected = (id: string, from: string, to: string) => ({
      id,
      originalSource: from,
      originalTarget: to,
      displaySource: from,
      displayTarget: to,
      waypoints: [],
      isRedirected: true,
    });
    const [there, back] = drawEdges({
      nodes: [box, other],
      regions: [],
      edges: [redirected('a', 'n', 'm'), redirected('b', 'm', 'n')],
    });
    expect(there.points[1].y).not.toBe(back.points[1].y);
    expect(there.waypoints).toEqual([]);
    expect(back.waypoints).toEqual([]);
  });

  it('gives a self-loop without waypoints a visible loop', () => {
    const [drawn] = drawEdges({
      nodes: [box],
      regions: [],
      edges: [
        {
          id: 'e',
          originalSource: 'n',
          originalTarget: 'n',
          displaySource: 'n',
          displayTarget: 'n',
          waypoints: [],
          isRedirected: false,
        },
      ],
    });
    expect(drawn.waypoints).toHaveLength(2);
    expect(drawn.waypoints.every((point) => point.y < box.y)).toBe(true);
  });
});
