import { useRef, useState } from 'react';
import type { Mode } from '../editor/useDiagramInteraction';

export interface ToolbarProps {
  presetNames: string[];
  hasDocument: boolean;
  mode: Mode;
  onLoadPreset: (index: number) => void;
  onImportExternal: (file: File) => void;
  onSave: () => void;
  onLoadSaved: (file: File) => void;
  onAutoLayout: () => void;
  onFitView: () => void;
  onModeChange: (mode: Mode) => void;
}

function FileButton({ label, onFile }: { label: string; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => input.current?.click()}>
        {label}
      </button>
      <input
        ref={input}
        type="file"
        accept=".json,application/json"
        aria-label={label}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = ''; // so that picking the same file again still fires
          if (file) onFile(file);
        }}
      />
    </>
  );
}

export function Toolbar(props: ToolbarProps) {
  const [preset, setPreset] = useState(0);
  const toggle = (mode: Mode) => props.onModeChange(props.mode === mode ? 'select' : mode);

  return (
    <nav className="toolbar" aria-label="工具列">
      <div className="toolbar-group">
        <select aria-label="範例" value={preset} onChange={(event) => setPreset(Number(event.target.value))}>
          {props.presetNames.map((name, index) => (
            <option key={name} value={index}>
              {name}
            </option>
          ))}
        </select>
        <button type="button" onClick={() => props.onLoadPreset(preset)}>
          Load Preset
        </button>
        <FileButton label="Import External JSON" onFile={props.onImportExternal} />
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={props.onSave} disabled={!props.hasDocument}>
          Save JSON
        </button>
        <FileButton label="Load Saved JSON" onFile={props.onLoadSaved} />
      </div>
      <div className="toolbar-group">
        <button type="button" onClick={props.onAutoLayout} disabled={!props.hasDocument}>
          Auto Layout / Reset Layout
        </button>
      </div>
      <div className="toolbar-group">
        <button
          type="button"
          aria-pressed={props.mode === 'add-state'}
          onClick={() => toggle('add-state')}
          disabled={!props.hasDocument}
        >
          新增狀態節點
        </button>
        <button
          type="button"
          aria-pressed={props.mode === 'add-transition'}
          onClick={() => toggle('add-transition')}
          disabled={!props.hasDocument}
        >
          建立 Transition
        </button>
      </div>
      <button type="button" onClick={props.onFitView} disabled={!props.hasDocument}>
        符合畫面
      </button>
    </nav>
  );
}
