/// <reference types="vite/client" />
/**
 * "Load Preset" choices. Member A's fixtures/*.json are picked up automatically
 * once they are merged; until then the built-in samples below are offered.
 */
import type { ExternalGraphInput } from '../types/graph';
import { openExternalGraph, openSavedDocument, type OpenedDocument } from './session';

export interface Preset {
  name: string;
  data: unknown;
}

const fixtureModules = import.meta.glob('../../fixtures/*.json', { eager: true, import: 'default' });
const fixtures: Preset[] = Object.entries(fixtureModules).map(([path, data]) => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  data,
}));

const samples: Preset[] = [
  {
    name: '內建範例：三層巢狀區域',
    data: {
      nodes: [
        { id: 'idle', label: 'Idle' },
        { id: 'connect', label: 'Connecting', regionId: 'session' },
        { id: 'auth', label: 'Auth', regionId: 'session' },
        { id: 'ready', label: 'Ready', regionId: 'active' },
        { id: 'read', label: 'Reading', regionId: 'io' },
        { id: 'write', label: 'Writing', regionId: 'io' },
        { id: 'failed', label: 'Failed' },
      ],
      edges: [
        { source: 'idle', target: 'connect' },
        { source: 'connect', target: 'auth' },
        { source: 'connect', target: 'connect', label: 'retry' },
        { source: 'auth', target: 'ready' },
        { source: 'ready', target: 'read' },
        { source: 'read', target: 'write' },
        { source: 'write', target: 'read' },
        { source: 'write', target: 'ready' },
        { source: 'read', target: 'failed' },
        { source: 'failed', target: 'idle' },
      ],
      regions: [
        { id: 'session', label: 'Session' },
        { id: 'active', label: 'Active', parentId: 'session' },
        { id: 'io', label: 'I/O', parentId: 'active' },
      ],
    } satisfies ExternalGraphInput,
  },
  {
    name: '內建範例：循環與自環',
    data: {
      nodes: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
      edges: [
        { source: 'A', target: 'B' },
        { source: 'B', target: 'A' },
        { source: 'B', target: 'C' },
        { source: 'C', target: 'C' },
        { source: 'C', target: 'D' },
        { source: 'D', target: 'A' },
        { source: 'D', target: 'B' },
      ],
    } satisfies ExternalGraphInput,
  },
];

export const presets: Preset[] = fixtures.length > 0 ? fixtures : samples;

export function openPreset(preset: Preset): OpenedDocument {
  const data = preset.data as { schemaVersion?: string; layoutApplied?: boolean };
  // A fixture that already carries a finished layout is restored, not re-laid out.
  return data.schemaVersion && data.layoutApplied
    ? openSavedDocument(JSON.stringify(data))
    : openExternalGraph(preset.data as ExternalGraphInput);
}
