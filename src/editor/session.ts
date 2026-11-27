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
  /** Status line to show instead of the usual "done", when something unexpected was done. */
  notice?: string;
}

/** Runs the layout engine: only for new external input or an explicit Auto Layout. */
export function runAutoLayout(doc: StateMachineDocument): OpenedDocument {
  const baseline = backend.computeBaselineLayout(doc).document;
  const optimized = backend.computeLayout(doc).document;
  return { doc: optimized, comparison: backend.compareLayouts(baseline, optimized) };
}

/** Written by Save JSON, so it already carries a finished layout. */
function isSavedDocument(raw: string | ExternalGraphInput): boolean {
  try {
    const data: { schemaVersion?: unknown; layoutApplied?: unknown } | null =
      typeof raw === 'string' ? JSON.parse(raw) : raw;
    return data?.schemaVersion === '1.0' && data.layoutApplied === true;
  } catch {
    return false; // not JSON: let the import report it
  }
}

export function openExternalGraph(raw: string | ExternalGraphInput): OpenedDocument {
  // Laying a saved file out again would lose its positions and collapsed state.
  if (isSavedDocument(raw)) {
    return {
      doc: backend.loadSavedDocument(raw),
      comparison: null,
      notice: '這是本工具儲存的檔案，已原樣還原，沒有重新排版。',
    };
  }
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
