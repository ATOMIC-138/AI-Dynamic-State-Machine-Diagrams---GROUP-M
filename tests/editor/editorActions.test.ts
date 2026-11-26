import { describe, expect, it } from 'vitest';
import { backend } from '../../src/editor/backend';
import { createState, createTransition, dragNode, insertAt, removeAt, replaceAt } from '../../src/editor/editorActions';
import { boxCenter } from '../../src/editor/geometry';
import type { StateMachineDocument } from '../../src/types/graph';
import { sampleDoc } from './sampleDoc';

const node = (doc: StateMachineDocument, id: string) => doc.nodes.find((item) => item.id === id)!;
const edge = (doc: StateMachineDocument, id: string) => doc.edges.find((item) => item.id === id)!;

describe('createState', () => {
  it('centers the state on the click, inside the region it was dropped into', () => {
    const { doc, id } = createState(sampleDoc(), { x: 400, y: 160 });
    expect(node(doc, id)).toMatchObject({ x: 340, y: 135, regionId: 'work', isUserCreated: true });
  });

  it('stays top-level outside every region and never reuses an id', () => {
    const first = createState(sampleDoc(), { x: 60, y: 300 });
    const second = createState(first.doc, { x: 60, y: 400 });
    expect(node(second.doc, first.id).regionId).toBeNull();
    expect(second.id).not.toBe(first.id);
  });
});

describe('createTransition', () => {
  it('draws the first link between two states straight', () => {
    const { doc, id } = createTransition({ ...sampleDoc(), edges: [] }, 'idle', 'load');
    expect(edge(doc, id)).toMatchObject({ source: 'idle', target: 'load', waypoints: [], isUserCreated: true });
  });

  it('bends a reverse link so it does not hide behind the original', () => {
    const { doc, id } = createTransition(sampleDoc(), 'load', 'idle');
    const [bend] = edge(doc, id).waypoints;
    expect(bend.y).not.toBe(boxCenter(node(doc, 'idle')).y);
  });

  it('starts a self-loop as a loop above its state', () => {
    const { doc, id } = createTransition(sampleDoc(), 'load', 'load');
    const { waypoints } = edge(doc, id);
    expect(waypoints).toHaveLength(2);
    expect(waypoints.every((point) => point.y < node(doc, 'load').y)).toBe(true);
  });
});

describe('dragNode', () => {
  it('moves only that state and its own self-loop: no re-layout', () => {
    const before = sampleDoc();
    const after = dragNode(before, 'idle', 10, 130);
    expect(node(after, 'idle')).toMatchObject({ x: 10, y: 130 });
    expect(node(after, 'load')).toEqual(node(before, 'load'));
    expect(node(after, 'save')).toEqual(node(before, 'save'));
    expect(edge(after, 'loop').waypoints).toEqual([
      { x: 34, y: 94 },
      { x: 106, y: 94 },
    ]);
    expect(edge(after, 'leave')).toEqual(edge(before, 'leave'));
  });

  it('grows the enclosing region around a state dragged past its border', () => {
    const after = dragNode(sampleDoc(), 'save', 600, 100);
    const [region] = after.regions;
    expect(region.x + region.width).toBeGreaterThanOrEqual(720);
    expect(node(after, 'load')).toEqual(node(sampleDoc(), 'load'));
  });
});

describe('moving a collapsed region', () => {
  it('moves the circle and leaves every state where it was', () => {
    const collapsed = backend.toggleRegionCollapse(sampleDoc(), 'work', true);
    const moved = backend.moveNode(collapsed, 'work', 464, 264);
    const circle = backend.projectVisibleGraph(moved).nodes.find((item) => item.kind === 'collapsed-region')!;
    expect(circle).toMatchObject({ x: 464, y: 264 });
    expect(moved.nodes).toEqual(sampleDoc().nodes);
  });
});

describe('waypoint lists', () => {
  const points = [
    { x: 1, y: 1 },
    { x: 2, y: 2 },
  ];

  it('inserts, replaces and removes without touching the original', () => {
    const added = { x: 9, y: 9 };
    expect(insertAt(points, 1, added)).toEqual([points[0], added, points[1]]);
    expect(replaceAt(points, 0, added)).toEqual([added, points[1]]);
    expect(removeAt(points, 0)).toEqual([points[1]]);
    expect(points).toHaveLength(2);
  });
});
