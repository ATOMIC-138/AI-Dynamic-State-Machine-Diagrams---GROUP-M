import { describe, expect, it } from 'vitest';
import type { StateMachineDocument } from '../../src/types/graph';

describe('Shared Graph Contract (Phase 0 smoke test)', () => {
  it('supports a hierarchical state machine document with collapse metadata', () => {
    const doc: StateMachineDocument = {
      schemaVersion: '1.0',
      layoutApplied: true,
      nodes: [
        {
          id: 's1',
          label: 'Idle',
          x: 100,
          y: 150,
          width: 120,
          height: 50,
          regionId: null,
        },
        {
          id: 's2',
          label: 'Active',
          x: 320,
          y: 150,
          width: 120,
          height: 50,
          regionId: 'r1',
        },
      ],
      edges: [
        {
          id: 'e1',
          source: 's1',
          target: 's2',
          waypoints: [{ x: 240, y: 175 }],
        },
      ],
      regions: [
        {
          id: 'r1',
          label: 'Working',
          parentId: null,
          x: 280,
          y: 100,
          width: 200,
          height: 150,
          collapsed: false,
          collapsedPosition: { x: 380, y: 175 },
          collapsedRadius: 36,
        },
      ],
    };

    expect(doc.schemaVersion).toBe('1.0');
    expect(doc.nodes).toHaveLength(2);
    expect(doc.edges[0].waypoints).toHaveLength(1);
    expect(doc.regions[0].collapsed).toBe(false);
  });
});
