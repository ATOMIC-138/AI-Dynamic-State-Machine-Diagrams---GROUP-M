/**
 * Opening documents. This is where "new input is laid out once, saved files are
 * never re-laid out" is decided.
 */
import type { ExternalGraphInput, LayoutComparison, StateMachineDocument } from '../types/graph';
import { backend } from './backend';

export interface OpenedDocument {
  doc: StateMachineDocument;
  /** null when no layout ran, so there is nothing to compare. */
  comparison: LayoutComparison | null;
}

/** Runs the layout engine: only for new external input or an explicit Auto Layout. */
export function runAutoLayout(doc: StateMachineDocument): OpenedDocument {
  const baseline = backend.computeBaselineLayout(doc).document;
  const optimized = backend.computeLayout(doc).document;
  return { doc: optimized, comparison: backend.compareLayouts(baseline, optimized) };
}

export function openExternalGraph(raw: string | ExternalGraphInput): OpenedDocument {
  const imported = backend.importExternalGraph(raw);
  return imported.layoutApplied ? { doc: imported, comparison: null } : runAutoLayout(imported);
}

export function openSavedDocument(raw: string): OpenedDocument {
  return { doc: backend.loadSavedDocument(raw), comparison: null };
}

/**
 * Files are read asynchronously and can finish in any order. Call the returned
 * function once per open request; its check stays true only until a newer one.
 */
export function trackLatestRequest() {
  let latest = 0;
  return () => {
    const request = ++latest;
    return () => request === latest;
  };
}
