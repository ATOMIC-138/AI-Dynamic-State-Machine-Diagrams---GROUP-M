/** Written against `backend`, so these double as integration checks of Members A and B. */
import { describe, expect, it } from 'vitest';
import { backend } from '../../src/editor/backend';
import { createState } from '../../src/editor/editorActions';
import { openPreset, presets } from '../../src/editor/presets';
import { openExternalGraph, openSavedDocument } from '../../src/editor/session';
import type { StateMachineDocument } from '../../src/types/graph';
import { sampleDoc } from './sampleDoc';

// What a save has to bring back. Loading may fill in defaults, so compare only these.
const saved = (doc: StateMachineDocument) => ({
  nodes: doc.nodes.map((n) => [n.id, n.x, n.y, n.width, n.height, n.regionId, Boolean(n.isUserCreated)]),
  edges: doc.edges.map((e) => [e.id, e.source, e.target, e.waypoints, Boolean(e.isUserCreated)]),
  regions: doc.regions.map((r) => [r.id, r.parentId, r.x, r.y, r.width, r.height, r.collapsed, r.collapsedPosition]),
});

describe('opening documents', () => {
  it('lays out external input once and reports a comparison', () => {
    const { doc, comparison } = openExternalGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c', regionId: 'r' }],
      edges: [
        { source: 'a', target: 'b' },
        { source: 'b', target: 'c' },
      ],
      regions: [{ id: 'r' }],
    });
    expect(doc.layoutApplied).toBe(true);
    expect(comparison).not.toBeNull();
    expect(new Set(doc.nodes.map((node) => `${node.x},${node.y}`)).size).toBe(3);
    expect(doc.regions[0].width).toBeGreaterThan(0);
  });

  it('restores a saved file as it was, without running a layout', () => {
    const added = createState(sampleDoc(), { x: 60, y: 300 }).doc;
    const edited = backend.moveNode(backend.toggleRegionCollapse(added, 'work', true), 'work', 7, 9);
    const reopened = openSavedDocument(backend.exportDocument(edited));
    expect(saved(reopened.doc)).toEqual(saved(edited));
    expect(reopened.doc.layoutApplied).toBe(true);
    expect(reopened.comparison).toBeNull();
  });

  it('rejects JSON that is not a saved document', () => {
    expect(() => openSavedDocument('{"nodes":[]}')).toThrow();
  });

  it('restores a saved file even when it is opened as external input, and says so', () => {
    const edited = backend.moveNode(backend.toggleRegionCollapse(sampleDoc(), 'work', true), 'work', 7, 9);
    const opened = openExternalGraph(backend.exportDocument(edited));
    expect(saved(opened.doc)).toEqual(saved(edited));
    expect(opened.comparison).toBeNull();
    expect(opened.notice).toContain('原樣還原');
  });

  it('still lays out external input that only mentions a schema version', () => {
    const opened = openExternalGraph('{"schemaVersion":"1.0","nodes":[{"id":"a"}],"edges":[]}');
    expect(opened.comparison).not.toBeNull();
    expect(opened.notice).toBeUndefined();
  });

  it('can open every preset', () => {
    for (const preset of presets) {
      expect(openPreset(preset).doc.nodes.length, preset.name).toBeGreaterThan(0);
    }
  });
});

describe('collapse and expand', () => {
  const original = sampleDoc();
  const collapsed = backend.toggleRegionCollapse(original, 'work', true);
  const graph = backend.projectVisibleGraph(collapsed);

  it('replaces the region with a circle and redirects crossing edges to it', () => {
    const circle = graph.nodes.find((node) => node.kind === 'collapsed-region')!;
    expect(graph.nodes.map((node) => node.id).sort()).toEqual([circle.id, 'idle'].sort());
    expect(graph.regions).toEqual([]);
    expect(graph.edges.map((edge) => edge.id).sort()).toEqual(['enter', 'leave', 'loop']);
    expect(graph.edges.find((edge) => edge.id === 'enter')).toMatchObject({
      isRedirected: true,
      originalTarget: 'load',
      displayTarget: circle.id,
    });
  });

  it('keeps every state and path, so that Expand restores the picture', () => {
    expect(collapsed.nodes).toEqual(original.nodes);
    expect(collapsed.edges).toEqual(original.edges);
    const expanded = backend.toggleRegionCollapse(collapsed, 'work', false);
    expect(backend.projectVisibleGraph(expanded)).toEqual(backend.projectVisibleGraph(original));
  });
});
