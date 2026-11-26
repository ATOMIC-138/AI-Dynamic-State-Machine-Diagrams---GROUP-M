import type { StateMachineDocument } from '../../src/types/graph';

/** idle ⇄ [Working: load → save], plus a self-loop on idle. */
export function sampleDoc(): StateMachineDocument {
  return {
    schemaVersion: '1.0',
    layoutApplied: true,
    nodes: [
      { id: 'idle', label: 'Idle', x: 0, y: 100, width: 120, height: 50, regionId: null },
      { id: 'load', label: 'Load', x: 240, y: 100, width: 120, height: 50, regionId: 'work' },
      { id: 'save', label: 'Save', x: 420, y: 100, width: 120, height: 50, regionId: 'work' },
    ],
    edges: [
      { id: 'enter', source: 'idle', target: 'load', waypoints: [] },
      { id: 'inner', source: 'load', target: 'save', waypoints: [{ x: 390, y: 90 }] },
      { id: 'leave', source: 'save', target: 'idle', waypoints: [{ x: 300, y: 260 }] },
      { id: 'loop', source: 'idle', target: 'idle', waypoints: [{ x: 24, y: 64 }, { x: 96, y: 64 }] },
    ],
    regions: [
      { id: 'work', label: 'Working', parentId: null, x: 200, y: 40, width: 380, height: 150, collapsed: false },
    ],
  };
}
