import { useCallback, useMemo, useState } from 'react';
import { backend, isStubBackend } from './editor/backend';
import { DiagramCanvas } from './editor/DiagramCanvas';
import { openPreset, presets } from './editor/presets';
import { openExternalGraph, openSavedDocument, runAutoLayout, type OpenedDocument } from './editor/session';
import { useDiagramInteraction } from './editor/useDiagramInteraction';
import type { LayoutComparison, StateMachineDocument } from './types/graph';
import { MetricsPanel } from './ui/MetricsPanel';
import { Toolbar } from './ui/Toolbar';

const SAVE_FILE_NAME = 'state-machine-layout.json';

export function App() {
  const [doc, setDoc] = useState<StateMachineDocument | null>(null);
  const [comparison, setComparison] = useState<LayoutComparison | null>(null);
  const [status, setStatus] = useState({ text: '載入範例或匯入 JSON 開始。', isError: false });
  const notify = useCallback((text: string) => setStatus({ text, isError: false }), []);
  const editor = useDiagramInteraction(doc, setDoc, notify);
  const metrics = useMemo(() => (doc ? backend.evaluateLayout(doc) : null), [doc]);

  const fail = (action: string, error: unknown) =>
    setStatus({ text: `${action}失敗：${error instanceof Error ? error.message : String(error)}`, isError: true });

  const open = (action: string, produce: () => OpenedDocument) => {
    try {
      const opened = produce();
      setDoc(opened.doc);
      setComparison(opened.comparison);
      editor.reset();
      editor.fitToView(opened.doc);
      notify(`${action}完成。`);
    } catch (error) {
      fail(action, error);
    }
  };

  const openFile = (action: string, file: File, parse: (text: string) => OpenedDocument) => {
    file.text().then(
      (text) => open(action, () => parse(text)),
      (error: unknown) => fail(action, error),
    );
  };

  const save = () => {
    if (!doc) return;
    const url = URL.createObjectURL(new Blob([backend.exportDocument(doc)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = SAVE_FILE_NAME;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    notify(`已匯出 ${SAVE_FILE_NAME}。`);
  };

  const modeHint =
    editor.mode === 'add-state'
      ? '點畫布放置新狀態（Esc 取消）'
      : editor.mode === 'add-transition'
        ? editor.pendingSource
          ? '再點目標節點；點同一個節點會建立自環（Esc 取消）'
          : '先點來源節點（Esc 取消）'
        : '拖曳節點或空白處、滾輪縮放；點連線後可拖轉折點，雙擊新增，右鍵或 Delete 刪除；區域按右鍵收合';

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>State Machine Diagram Layout Editor</h1>
        {isStubBackend && <span className="stub-badge">STUB 模式</span>}
      </header>
      <Toolbar
        presetNames={presets.map((preset) => preset.name)}
        hasDocument={doc !== null}
        mode={editor.mode}
        onLoadPreset={(index) => open('載入範例', () => openPreset(presets[index]))}
        onImportExternal={(file) => openFile('匯入外部 JSON', file, openExternalGraph)}
        onSave={save}
        onLoadSaved={(file) => openFile('載入儲存檔', file, openSavedDocument)}
        onAutoLayout={() => doc && open('自動排版', () => runAutoLayout(doc))}
        onFitView={() => doc && editor.fitToView(doc)}
        onModeChange={editor.setMode}
      />
      <main className="app-main">
        <section className="canvas-area">
          <DiagramCanvas
            svgRef={editor.svgRef}
            graph={editor.graph}
            viewport={editor.viewport}
            selection={editor.selection}
            mode={editor.mode}
            pendingSource={editor.pendingSource}
            handlers={editor.handlers}
          />
          {!doc && <p className="canvas-hint">載入範例或匯入外部 JSON 開始</p>}
          {editor.menu && (
            <div className="context-menu" role="menu" style={{ left: editor.menu.x, top: editor.menu.y }}>
              <button type="button" role="menuitem" onClick={editor.runMenuAction}>
                {editor.menu.collapse ? 'Collapse Region' : 'Expand Region'}
              </button>
            </div>
          )}
        </section>
        <MetricsPanel current={metrics} comparison={comparison} isStub={isStubBackend} />
      </main>
      <footer className="status-bar">
        <span role="status" className={status.isError ? 'error' : undefined}>
          {status.text}
        </span>
        <span className="mode-hint">{modeHint}</span>
      </footer>
    </div>
  );
}
