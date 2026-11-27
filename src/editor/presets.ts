/// <reference types="vite/client" />
/** "Load Preset" choices: Member A's fixtures/*.json. */
import type { ExternalGraphInput } from '../types/graph';
import { openExternalGraph, type OpenedDocument } from './session';

export interface Preset {
  name: string;
  data: unknown;
}

const fixtureModules = import.meta.glob('../../fixtures/*.json', { eager: true, import: 'default' });
export const presets: Preset[] = Object.entries(fixtureModules).map(([path, data]) => ({
  name: path.slice(path.lastIndexOf('/') + 1),
  data,
}));

export function openPreset(preset: Preset): OpenedDocument {
  // A fixture that already carries a finished layout is restored, not re-laid out.
  return openExternalGraph(preset.data as ExternalGraphInput);
}
